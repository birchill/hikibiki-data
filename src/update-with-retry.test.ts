import chai, { assert } from 'chai';
import chaiDateTime from 'chai-datetime';
import fetchMock from 'fetch-mock';
import sinon from 'sinon';

import { KanjiDatabase } from './database';
import { updateWithRetry } from './update-with-retry';

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

    const clock = sinon.useFakeTimers({
      toFake: ['setTimeout'],
      shouldAdvanceTime: true,
    });

    const errors: Array<{ e: Error; nextRetry?: Date }> = [];
    const updateStart = new Date();

    await new Promise((resolve, reject) => {
      updateWithRetry({
        db,
        onUpdateComplete: resolve,
        onUpdateError: (e, info) => {
          errors.push({ e, nextRetry: info.nextRetry });
          clock.next();
        },
      });
    });

    clock.restore();

    assert.lengthOf(errors, 1);
    assert.equal(errors[0].e.name, 'DownloadError');

    const { nextRetry } = errors[0];
    assert.instanceOf(nextRetry, Date);
    // If this turns out to be flaky, we shoud work out how to use sinon fake
    // timers properly.
    assert.withinTime(
      nextRetry!,
      new Date(updateStart.getTime() + 1000),
      new Date(updateStart.getTime() + 10 * 1000)
    );
  });

  /*
  it('should wait until it is online', async () => {
    sinon.replace(navigator, 'onLine', false);
  });

  it('should wait until it is online even when re-trying a network error', async () => {
  });

  it('should coalesce overlapping requests', async () => {
  });

  it('should allow canceling the retries', async () => {
  });

  it('should cancel the retries when the database is deleted', async () => {
  });

  it('should reset the timeout after each successful download', async () => {
  });
  */

  // XXX Test forced updates
});
