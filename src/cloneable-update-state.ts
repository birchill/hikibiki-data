import { DownloadError } from './download';
import {
  CheckingUpdateState,
  DownloadingUpdateState,
  IdleUpdateState,
  UpdatingDbUpdateState,
  UpdateState,
} from './update-state';

// Error objects can't be cloned so we provide a variation that is suitable for
// postMessaging since many client apps end up doing that.

export type CloneableErrorUpdateState = {
  state: 'error';
  dbName: 'kanjidb' | 'bushudb';
  error: {
    name: string;
    message: string;
    code?: number;
  };
  lastCheck: Date | null;
  nextRetry?: Date;
  retryIntervalMs?: number;
};

export type CloneableUpdateState =
  | CheckingUpdateState
  | DownloadingUpdateState
  | IdleUpdateState
  | UpdatingDbUpdateState
  | CloneableErrorUpdateState;

// Turn the object into something we can postMessage
export const toCloneableUpdateState = (
  state: UpdateState
): CloneableUpdateState => {
  if (state.state === 'error') {
    return {
      ...state,
      error: {
        name: state.error.name,
        message: state.error.message,
        code:
          state.error instanceof DownloadError ? state.error.code : undefined,
      },
    };
  }

  return state;
};
