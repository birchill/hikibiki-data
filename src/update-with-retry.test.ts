import chai, { assert } from 'chai';
import chaiDateTime from 'chai-datetime';
import fetchMock from 'fetch-mock';
import sinon from 'sinon';

import { KanjiDatabase } from './database';
import { cancelUpdateWithRetry, updateWithRetry } from './update-with-retry';

mocha.setup('bdd');
chai.use(chaiDateTime);

const VERSION_1_0_0 = {
  kanjidb: {
    '1': {
      major: 1,
      minor: 0,
      patch: 0,
      snapshot: 0,
      databaseVersion: '175',
      dateOfCreation: '2019-07-09',
    },
  },
  bushudb: {
    '1': {
      major: 1,
      minor: 0,
      patch: 0,
      snapshot: 0,
      dateOfCreation: '2019-09-06',
    },
  },
};

describe('updateWithRetry', function() {
  let db: KanjiDatabase;

  beforeEach(() => {
    db = new KanjiDatabase();
  });

  afterEach(async () => {
    fetchMock.restore();
    sinon.restore();
    if (db) {
      await db.destroy();
    }
  });

  it('should call the onUpdateComplete callback easy success', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    await new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        onUpdateComplete: resolve,
        onUpdateError: reject,
      });
    });
  });

  it('should call the onUpdateError callback on complete failure', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    // Force an error to occur
    sinon.replace(db, 'update', () => {
      throw new Error('Forced error');
    });

    try {
      await new Promise((resolve, reject) => {
        updateWithRetry({
          db,
          onUpdateComplete: resolve,
          onUpdateError: reject,
        });
      });
      assert.fail('Should have thrown');
    } catch (e) {
      // TODO: Introduce chai-as-promised so we don't need to do this
      if (e.name === 'AssertionError') {
        throw e;
      }
    }
  });

  it('should retry a network error', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.once('end:.ljson', 404);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });

    const errors: Array<{
      e: Error;
      nextRetry?: Date;
      retryCount?: number;
    }> = [];
    const updateStart = new Date();

    await new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        onUpdateComplete: resolve,
        onUpdateError: (e, info) => {
          errors.push({
            e,
            nextRetry: info.nextRetry,
            retryCount: info.retryCount,
          });
          clock.next();
        },
      });
    });

    clock.restore();

    assert.lengthOf(errors, 1);
    assert.equal(errors[0].e.name, 'DownloadError');

    const { nextRetry, retryCount } = errors[0];
    assert.instanceOf(nextRetry, Date);
    // If this turns out to be flaky, we shoud work out how to use sinon fake
    // timers properly.
    assert.withinTime(
      nextRetry!,
      new Date(updateStart.getTime() + 1000),
      new Date(updateStart.getTime() + 10 * 1000)
    );
    assert.strictEqual(retryCount, 0);
  });

  it('should wait until it is online', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    let isOnline: boolean = false;

    sinon.replaceGetter(
      navigator,
      'onLine',
      sinon.fake(() => isOnline)
    );

    let gotOfflineError: boolean = false;

    await new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        onUpdateComplete: resolve,
        onUpdateError: e => {
          assert.equal(e.name, 'OfflineError');
          gotOfflineError = true;
          isOnline = true;
          window.dispatchEvent(new Event('online'));
        },
      });
    });

    assert.isTrue(gotOfflineError);
  });

  it('should wait until it is online even when re-trying a network error', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock('end:.ljson', 404, { repeat: 2 });
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });

    let isOnline: boolean = true;
    sinon.replaceGetter(
      navigator,
      'onLine',
      sinon.fake(() => isOnline)
    );

    const errors: Array<{
      e: Error;
      nextRetry?: Date;
      retryCount?: number;
    }> = [];

    await new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        onUpdateComplete: resolve,
        onUpdateError: (e, info) => {
          errors.push({
            e,
            nextRetry: info.nextRetry,
            retryCount: info.retryCount,
          });

          if (e.name === 'OfflineError') {
            isOnline = true;
            window.dispatchEvent(new Event('online'));
            return;
          }

          if (info.retryCount && info.retryCount >= 1) {
            isOnline = false;
          }

          clock.next();
        },
      });
    });

    clock.restore();

    assert.lengthOf(errors, 3);

    assert.equal(errors[0].e.name, 'DownloadError');
    assert.strictEqual(errors[0].retryCount, 0);

    assert.equal(errors[1].e.name, 'DownloadError');
    assert.strictEqual(errors[1].retryCount, 1);

    assert.equal(errors[2].e.name, 'OfflineError');
    assert.strictEqual(errors[2].retryCount, undefined);
  });

  it('should coalesce overlapping requests', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.once('end:.ljson', 404);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });

    const firstInvocation = new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        onUpdateComplete: resolve,
        onUpdateError: () => {
          clock.next();
        },
      });
    });

    let secondCompletionCallbackCalled = false;
    const secondInvocation = new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        onUpdateComplete: () => {
          secondCompletionCallbackCalled = true;
          resolve();
        },
        onUpdateError: reject,
      });
    });

    await Promise.race([firstInvocation, secondInvocation]);

    clock.restore();

    assert.isFalse(secondCompletionCallbackCalled);
  });

  it('should NOT coalesce overlapping requests when the forceUpdate flag is set', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.once('end:.ljson', 404);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    // Wait for the first invocation to error

    let firstInvocation;
    const firstError = new Promise(firstErrorResolve => {
      firstInvocation = new Promise((_, reject) => {
        updateWithRetry({
          db,
          onUpdateComplete: reject,
          onUpdateError: firstErrorResolve,
        });
      });
    });

    await firstError;

    // Then try again while it is waiting

    const secondInvocation = new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        forceUpdate: true,
        onUpdateComplete: resolve,
        onUpdateError: reject,
      });
    });

    await Promise.race([firstInvocation, secondInvocation]);
  });

  it('should allow canceling the retries', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.once('end:.ljson', 404);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    // Wait for first error

    const clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    });

    let completeCalled = false;
    await new Promise(resolve => {
      updateWithRetry({
        db,
        onUpdateComplete: () => {
          completeCalled = true;
        },
        onUpdateError: resolve,
      });
    });

    // Then cancel

    await cancelUpdateWithRetry(db);

    // Then make sure that the completion doesn't happen

    clock.next();
    clock.restore();

    // It turns out we need to wait quiet a few frames to be sure the completion
    // would happen if we hadn't canceled things.
    await waitForAnimationFrames(8);

    assert.isFalse(completeCalled);
  });

  it('should cancel the retries when the database is deleted', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.once('end:.ljson', 404);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    // Wait for first error

    const clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    });

    let completeCalled = false;
    await new Promise(resolve => {
      updateWithRetry({
        db,
        onUpdateComplete: () => {
          completeCalled = true;
        },
        onUpdateError: resolve,
      });
    });

    // Then destroy database

    await db.destroy();

    // Then make sure that the completion doesn't happen

    clock.next();
    clock.restore();
    await waitForAnimationFrames(15); // We seem to need at least ~15

    assert.isFalse(completeCalled);
  });

  /*
  it('should reset the timeout after each successful download', async () => {
  });
  */
});

function waitForAnimationFrames(frameCount: number): Promise<void> {
  return new Promise(resolve => {
    function handleFrame() {
      if (--frameCount <= 0) {
        resolve();
      } else {
        requestAnimationFrame(handleFrame);
      }
    }
    requestAnimationFrame(handleFrame);
  });
}
