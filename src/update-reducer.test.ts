import { assert } from 'chai';

import { DatabaseVersion } from './common';
import { DownloadError, DownloadErrorCode } from './download';
import { reducer } from './update-reducer';
import {
  DownloadingUpdateState,
  ErrorUpdateState,
  UpdateState,
  UpdatingDbUpdateState,
} from './update-state';

mocha.setup('bdd');

describe('update-reducer', function() {
  it('clears the retry timeout on a finishdownload event', () => {
    const version: DatabaseVersion = {
      major: 1,
      minor: 0,
      patch: 0,
      dateOfCreation: 'today',
      lang: 'en',
    };

    // Error flow
    let state: UpdateState = { state: 'idle', lastCheck: null };
    state = reducer(state, { type: 'start', dbName: 'kanjidb' });
    state = reducer(state, {
      type: 'startdownload',
      dbName: 'kanjidb',
      version,
    });
    state = reducer(state, {
      type: 'error',
      dbName: 'kanjidb',
      error: new DownloadError(
        { code: DownloadErrorCode.DatabaseFileNotAccessible, url: 'yer' },
        'Yer'
      ),
    });

    // Check we set the interval at all
    assert.isNumber((state as ErrorUpdateState).retryIntervalMs);
    assert.isAbove((state as ErrorUpdateState).retryIntervalMs as number, 0);
    assert.instanceOf((state as ErrorUpdateState).nextRetry, Date);

    // Retry
    state = reducer(state, { type: 'start', dbName: 'kanjidb' });
    state = reducer(state, {
      type: 'startdownload',
      dbName: 'kanjidb',
      version,
    });

    // So far we should still have a retry interval
    assert.isNumber((state as DownloadingUpdateState).retryIntervalMs);

    // Finish downloading
    state = reducer(state, {
      type: 'finishdownload',
      version,
    });
    assert.isUndefined((state as UpdatingDbUpdateState).retryIntervalMs);
  });
});
