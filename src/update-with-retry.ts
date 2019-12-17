import { ChangeCallback, ChangeTopic, KanjiDatabase } from './database';
import { DownloadError } from './download';

interface RetryStatus {
  onlineCallback?: () => any;
  changeCallback: ChangeCallback;
  setTimeoutHandle?: number;
  retryIntervalMs?: number;
  retryCount?: number;
}

const inProgressUpdates: Map<KanjiDatabase, RetryStatus> = new Map();

export class OfflineError extends Error {
  constructor(...params: any[]) {
    super(...params);
    Object.setPrototypeOf(this, OfflineError.prototype);

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, OfflineError);
    }

    this.name = 'OfflineError';
  }
}

export type UpdateCompleteCallback = () => void;
export type UpdateErrorCallback = (
  e: Error,
  info: { nextRetry?: Date; retryCount?: number }
) => void;

// Updates the passed-in database and retries in the case of failure due to
// network failures or being offline.
//
// Note that if there is an existing calling to this function in action
// (including waiting to retry) the existing call will be re-used.
// As a result, if the passed-in callback functions differ between invocations,
// only the originally passed-in callback functions will be called.
//
// (This is fixable but it introduces complexity and currently all clients
// have a single point where they call into this so it is not necessary to try
// and store a list of callback functions.)
//
// If the `forceUpdate` parameter is set then an existing call to this function
// will be canceled first UNLESS it is already running or blocked due to being
// offline. That is, the `forceUpdate` flag is purely meant to say, "Update now
// if you are not already."
//
// Furthermore, note that if an invocation is canceled there is no abort
// callback or AbortError or anything of the sort. (Again, this is fixable but
// it requires store the callbacks passed-in, and currently no client needs
// this.)
export async function updateWithRetry({
  db,
  forceUpdate = false,
  onUpdateComplete,
  onUpdateError,
}: {
  db: KanjiDatabase;
  forceUpdate?: boolean;
  onUpdateComplete?: UpdateCompleteCallback;
  onUpdateError?: UpdateErrorCallback;
}) {
  // Check if we have an in-progress update we can use.
  {
    const currentRetryStatus = inProgressUpdates.get(db);
    if (currentRetryStatus) {
      // If we are not trying to force an update then just use the existing
      // in-progress update.
      if (!forceUpdate) {
        if (db.verbose) {
          console.info(
            'Overlapping calls to updateWithRetry. Re-using existing invocation. This could be problematic if different callback functions were passed on each invocation.'
          );
        }
        return;
      }

      // If we're offline, then we're not even going to try updating until we
      // are online (at which point we will retry immediately).
      if (currentRetryStatus.onlineCallback) {
        if (db.verbose) {
          console.info('Deferring forced update. Currently offline.');
        }
        return;
      }

      // Even if we are trying to force the update, if we just started an update
      // (or are retrying rapidly) then use the existing update.
      if (!currentRetryStatus.retryIntervalMs) {
        if (db.verbose) {
          console.info('Ignoring forced update. Already retrying presently.');
        }
        return;
      }

      // And even if we have a timeout, if we are currently running the update,
      // just let it run but reset the timeout.
      if (db.updateState.state !== 'idle') {
        inProgressUpdates.set(db, {
          ...currentRetryStatus,
          retryIntervalMs: undefined,
          retryCount: undefined,
        });
        if (db.verbose) {
          console.info('Skipping forced update. Already updating.');
        }
        return;
      }

      // Otherwise, cancel the in-progress update.
      if (db.verbose) {
        console.log('Canceling existing queued retry.');
      }
      await cancelUpdateWithRetry(db);
    }
  }

  // If we have a in-progress update here, it means we got an overlapping
  // call to this method while we were waiting to cancel the previous
  // in-progress update.
  if (inProgressUpdates.has(db)) {
    if (db.verbose) {
      console.log('Skipping overlapping auto-retry request.');
    }
    return;
  }

  await doUpdate({ db, onUpdateComplete, onUpdateError });
}

async function doUpdate({
  db,
  onUpdateComplete,
  onUpdateError,
}: {
  db: KanjiDatabase;
  onUpdateComplete?: UpdateCompleteCallback;
  onUpdateError?: UpdateErrorCallback;
}) {
  // If we are offline, wait until we are online.
  if (!navigator.onLine) {
    const onlineCallback = async () => {
      try {
        if (db.verbose) {
          console.log('Retrying now that we are online.');
        }

        await doUpdate({
          db,
          onUpdateComplete,
          onUpdateError,
        });
      } catch (e) {
        if (onUpdateError) {
          console.log(
            'Error while scheduling update retry after coming online'
          );
          const error = e instanceof Error ? e : new Error(String(e));
          onUpdateError(error, {});
        }
      }
    };
    addEventListener('online', onlineCallback, { once: true });

    setInProgressUpdate(db, { onlineCallback });

    if (onUpdateError) {
      onUpdateError(new OfflineError(), {});
    }

    return;
  }

  // If needed, create a new (empty) in-progress update record so we can skip
  // overlapping calls.
  if (!inProgressUpdates.has(db)) {
    setInProgressUpdate(db, {});
  }

  try {
    await db.update();

    deleteInProgressUpdate(db);

    if (db.verbose) {
      console.log('Successfully completed update.');
    }

    if (onUpdateComplete) {
      onUpdateComplete();
    }
  } catch (e) {
    if (db.verbose) {
      console.log('Got error while updating');
      console.log(e);
    }

    const isNetworkError = e instanceof DownloadError;
    const wasCanceled = !inProgressUpdates.has(db);

    let retryIntervalMs: number | undefined;
    let retryCount: number | undefined;
    let nextRetry: Date | undefined;

    if (isNetworkError && !wasCanceled) {
      // We read/store the retryIntervalMs in the retry status so we can reset
      // it when we get a forced request.
      const currentRetryStatus = inProgressUpdates.get(db);
      if (currentRetryStatus) {
        retryIntervalMs = currentRetryStatus.retryIntervalMs;
        retryCount = currentRetryStatus.retryCount;
      }

      if (retryIntervalMs) {
        // Don't let the interval become longer than 12 hours
        retryIntervalMs = Math.min(retryIntervalMs * 2, 12 * 60 * 60 * 1000);
      } else {
        // Randomize the initial interval to somewhere between 3s ~ 6s.
        retryIntervalMs = 3000 + Math.random() * 3000;
      }
      retryCount = typeof retryCount === 'number' ? retryCount + 1 : 0;

      if (db.verbose) {
        console.log(`Scheduling retry of update in ${retryIntervalMs}ms`);
      }

      const setTimeoutHandle = (setTimeout(() => {
        if (db.verbose) {
          console.log('Running automatic retry of update...');
        }

        doUpdate({
          db,
          onUpdateComplete,
          onUpdateError,
        });
      }, retryIntervalMs) as unknown) as number;

      nextRetry = new Date(Date.now() + retryIntervalMs);

      setInProgressUpdate(db, {
        setTimeoutHandle,
        retryIntervalMs,
        retryCount,
      });
    } else {
      deleteInProgressUpdate(db);
    }

    if (onUpdateError) {
      onUpdateError(e, { nextRetry, retryCount });
    }
  }
}

function setInProgressUpdate(
  db: KanjiDatabase,
  {
    onlineCallback,
    setTimeoutHandle,
    retryIntervalMs,
    retryCount,
  }: Omit<RetryStatus, 'changeCallback'>
) {
  let changeCallback: ChangeCallback;

  const currentRetryStatus = inProgressUpdates.get(db);
  if (currentRetryStatus) {
    changeCallback = currentRetryStatus.changeCallback;
  } else {
    changeCallback = (topic: ChangeTopic) => onDatabaseChange(db, topic);
    db.addChangeListener(changeCallback);
  }

  inProgressUpdates.set(db, {
    onlineCallback,
    changeCallback,
    setTimeoutHandle,
    retryIntervalMs,
    retryCount,
  });
}

function deleteInProgressUpdate(db: KanjiDatabase) {
  const currentRetryStatus = inProgressUpdates.get(db);
  if (!currentRetryStatus) {
    return;
  }

  db.removeChangeListener(currentRetryStatus.changeCallback);

  inProgressUpdates.delete(db);
}

function onDatabaseChange(db: KanjiDatabase, topic: ChangeTopic) {
  // If the database was deleted, cancel any scheduled retries.
  if (topic === 'deleted') {
    // This is async, but no-one's waiting for us, so don't bother waiting on it
    // either.
    cancelUpdateWithRetry(db);
    return;
  }

  // If we successfully downloaded *something*, reset the retry interval.
  const currentRetryStatus = inProgressUpdates.get(db);
  if (currentRetryStatus && db.updateState.state === 'updatingdb') {
    inProgressUpdates.set(db, {
      ...currentRetryStatus,
      retryIntervalMs: undefined,
      retryCount: undefined,
    });
  }
}

export async function cancelUpdateWithRetry(db: KanjiDatabase) {
  const currentRetryStatus = inProgressUpdates.get(db);
  if (!currentRetryStatus) {
    return;
  }

  const { setTimeoutHandle, onlineCallback } = currentRetryStatus;

  if (setTimeoutHandle) {
    clearTimeout(setTimeoutHandle);
  }
  if (onlineCallback) {
    removeEventListener('online', onlineCallback);
  }

  deleteInProgressUpdate(db);

  await db.cancelUpdate();

  // We _could_ take an updateAborted callback and call it here, but currently
  // no client needs it.
}