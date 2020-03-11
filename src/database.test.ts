import chai, { assert } from 'chai';
import chaiDateTime from 'chai-datetime';
import fetchMock from 'fetch-mock';
import sinon from 'sinon';

import { DownloadError, DownloadErrorCode } from './download';
import { DatabaseState, KanjiDatabase } from './database';
import { stripFields } from './utils';

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
    '2': {
      major: 2,
      minor: 0,
      patch: 0,
      snapshot: 0,
      dateOfCreation: '2019-09-06',
    },
  },
};

describe('database', function() {
  let db: KanjiDatabase;

  // We seem to be timing out on Chrome recently
  this.timeout(15000);

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

  it('should initially be initializing', async () => {
    assert.equal(db.state, DatabaseState.Initializing);
  });

  it('should resolve to being empty', async () => {
    await db.ready;
    assert.equal(db.state, DatabaseState.Empty);
  });

  it('should resolve the version after updating', async () => {
    await db.ready;
    assert.isNull(db.dbVersions.kanjidb);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    await db.update();

    assert.deepEqual(
      stripFields(db.dbVersions.kanjidb!, ['lang']),
      stripFields(VERSION_1_0_0.kanjidb['1'], ['snapshot'])
    );
    assert.equal(db.state, DatabaseState.Ok);
  });

  it('should update the update state after updating', async () => {
    await db.ready;
    assert.deepEqual(db.updateState, { state: 'idle', lastCheck: null });

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const updateStart = new Date();
    await db.update();
    const updateEnd = new Date();

    assert.deepEqual(db.updateState.state, 'idle');
    assert.isNotNull(db.updateState.lastCheck);
    assert.withinTime(db.updateState.lastCheck!, updateStart, updateEnd);
  });

  it('should ignore redundant calls to update', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const firstUpdate = db.update();
    const secondUpdate = db.update();

    await Promise.all([firstUpdate, secondUpdate]);

    assert.equal(
      fetchMock.calls('end:kanjidb-rc-en-1.0.0-full.ljson').length,
      1,
      'Should only fetch things once'
    );
  });

  it('should handle error actions', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', 404);

    let exception;
    try {
      await db.update();
    } catch (e) {
      exception = e;
    }

    const isVersionFileNotFoundError = (e?: Error) =>
      e &&
      e instanceof DownloadError &&
      e.code === DownloadErrorCode.VersionFileNotFound;

    // Check exception
    assert.isTrue(
      isVersionFileNotFoundError(exception),
      `Should have thrown a VersionFileNotFound exception. Got: ${exception}`
    );

    // Check update state
    assert.equal(db.updateState.state, 'idle');
  });

  it('should allow canceling the update', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const update = db.update();
    db.cancelUpdate();

    let exception;
    try {
      await update;
    } catch (e) {
      exception = e;
    }

    assert.isDefined(exception);
    assert.equal(exception.name, 'AbortError');

    assert.deepEqual(db.updateState, { state: 'idle', lastCheck: null });

    // Also check that a redundant call to cancelUpdate doesn't break anything.
    db.cancelUpdate();
  });

  it('should allow canceling the update mid-stream', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', {
      kanjidb: {
        '1': {
          ...VERSION_1_0_0.kanjidb['1'],
          patch: 1,
        },
      },
    });
    // (We need to cancel from this second request, otherwise we don't seem to
    // exercise the code path where we actually cancel the reader.)
    fetchMock.mock('end:kanjidb-rc-en-1.0.0-full.ljson', () => {
      db.cancelUpdate();
      return '';
    });

    const update = db.update();

    let exception;
    try {
      await update;
    } catch (e) {
      exception = e;
    }

    assert.isDefined(exception);
    assert.equal(exception.name, 'AbortError');

    assert.deepEqual(db.updateState, { state: 'idle', lastCheck: null });

    assert.isFalse(
      fetchMock.called('end:kanjidb-rc-en-1.0.1-patch.ljson'),
      'Should not download next data file'
    );
  });

  it('should update the last check time if we wrote something', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', {
      kanjidb: {
        '1': {
          ...VERSION_1_0_0.kanjidb['1'],
          patch: 1,
        },
      },
    });
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `
{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"2019-173","dateOfCreation":"2019-06-22"},"records":1}
{"c":"㐂","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
`
    );
    fetchMock.mock('end:kanjidb-rc-en-1.0.1-patch.ljson', () => {
      db.cancelUpdate();
      return '';
    });

    const update = db.update();

    let exception;
    try {
      await update;
    } catch (e) {
      exception = e;
    }

    assert.isDefined(exception);
    assert.equal(exception.name, 'AbortError');

    assert.equal(db.updateState.state, 'idle');
    assert.isDefined(db.updateState.lastCheck);
  });

  it('should not update the database version if the update failed', async () => {
    await db.ready;
    assert.isNull(db.dbVersions.kanjidb);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":0}
`
    );

    const constraintError = new Error('Constraint error');
    constraintError.name = 'ConstraintError';

    const stub = sinon.stub(db.store, 'bulkUpdateTable');
    stub.throws(constraintError);

    try {
      await db.update();
    } catch (e) {
      // Ignore
    }

    assert.strictEqual(db.dbVersions.kanjidb, null);
    assert.equal(db.state, DatabaseState.Empty);
  });

  it('should fetch kanji', async () => {
    await db.ready;
    assert.isNull(db.dbVersions.kanjidb);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1}
{"c":"引","r":{"on":["イン"],"kun":["ひ.く","ひ.ける"],"na":["いな","ひき","ひけ","びき"]},"m":["pull","tug","jerk","admit","install","quote","refer to"],"rad":{"x":57,"var":"hen"},"refs":{"nelson_c":1562,"nelson_n":1681,"halpern_njecd":181,"halpern_kkld":133,"halpern_kkld_2ed":160,"heisig":1232,"heisig6":1318,"henshall":77,"sh_kk":216,"sh_kk2":216,"kanji_in_context":257,"busy_people":"3.2","kodansha_compact":605,"skip":"1-3-1","sh_desc":"3h1.1","conning":422},"misc":{"sc":4,"gr":2,"freq":218,"jlpt":3,"kk":9},"comp":"⼁⼸"}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":3}
{"id":"002","r":2,"b":"⼁","k":"｜","s":1,"na":["たてぼう","ぼう"],"m":["stick"]}
{"id":"057","r":57,"b":"⼸","k":"弓","s":3,"na":["ゆみ"],"m":["bow","bow (archery, violin)"]}
{"id":"057-hen","r":57,"b":"⼸","k":"弓","pua":59218,"s":3,"na":["ゆみへん"],"m":["bow","bow (archery, violin)"],"posn":"hen"}
`
    );

    await db.update();

    assert.equal(db.state, DatabaseState.Ok);

    const result = await db.getKanji(['引']);
    const expected = [
      {
        c: '引',
        r: {
          on: ['イン'],
          kun: ['ひ.く', 'ひ.ける'],
          na: ['いな', 'ひき', 'ひけ', 'びき'],
        },
        m: ['pull', 'tug', 'jerk', 'admit', 'install', 'quote', 'refer to'],
        rad: {
          x: 57,
          b: '⼸',
          k: '弓',
          na: ['ゆみへん'],
          m: ['bow', 'bow (archery, violin)'],
          m_lang: 'en',
          base: {
            b: '⼸',
            k: '弓',
            na: ['ゆみ'],
            m: ['bow', 'bow (archery, violin)'],
            m_lang: 'en',
          },
        },
        refs: {
          nelson_c: 1562,
          nelson_n: 1681,
          halpern_njecd: 181,
          halpern_kkld: 133,
          halpern_kkld_2ed: 160,
          heisig: 1232,
          heisig6: 1318,
          henshall: 77,
          sh_kk: 216,
          sh_kk2: 216,
          kanji_in_context: 257,
          busy_people: '3.2',
          kodansha_compact: 605,
          skip: '1-3-1',
          sh_desc: '3h1.1',
          conning: 422,
        },
        misc: { sc: 4, gr: 2, freq: 218, jlpt: 3, kk: 9 },
        comp: [
          { c: '⼁', na: ['たてぼう', 'ぼう'], m: ['stick'], m_lang: 'en' },
          {
            c: '⼸',
            na: ['ゆみへん'],
            m: ['bow', 'bow (archery, violin)'],
            m_lang: 'en',
          },
        ],
        m_lang: 'en',
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fill in katakana component descriptions', async () => {
    await db.ready;
    assert.isNull(db.dbVersions.kanjidb);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1}
{"c":"通","r":{"on":["ツウ","ツ"],"kun":["とお.る","とお.り","-とお.り","-どお.り","とお.す","とお.し","-どお.し","かよ.う"],"na":["とん","どうし","どおり","みち"]},"m":["traffic","pass through","avenue","commute","counter for letters, notes, documents, etc."],"rad":{"x":162,"var":"nyou"},"refs":{"nelson_c":4703,"nelson_n":6063,"halpern_njecd":3109,"halpern_kkld":1982,"halpern_kkld_2ed":2678,"heisig":1408,"heisig6":1511,"henshall":176,"sh_kk":150,"sh_kk2":150,"kanji_in_context":204,"busy_people":"3.11","kodansha_compact":695,"skip":"3-3-7","sh_desc":"2q7.18","conning":159},"misc":{"sc":9,"gr":2,"freq":80,"jlpt":3,"kk":9},"comp":"マ⽤⻌"}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":4}
{"id":"101","r":101,"b":"⽤","k":"用","s":5,"na":["もちいる"],"m":["utilize","business","service","use","employ"]}
{"id":"162","r":162,"b":"⾡","k":"辵","s":3,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"]}
{"id":"162-nyou","r":162,"b":"⻌","k":"辶","s":3,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"],"posn":"nyou"}
{"id":"162-nyou-2","r":162,"b":"⻍","k":"辶","s":4,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"],"posn":"nyou"}
`
    );

    await db.update();

    assert.equal(db.state, DatabaseState.Ok);

    const result = await db.getKanji(['通']);
    assert.deepEqual(result[0].comp, [
      {
        c: 'マ',
        na: ['マ'],
        m: ['katakana ma'],
        m_lang: 'en',
      },
      {
        c: '⽤',
        na: ['もちいる'],
        m: ['utilize', 'business', 'service', 'use', 'employ'],
        m_lang: 'en',
      },
      {
        c: '⻌',
        na: ['しんにょう', 'しんにゅう'],
        m: ['road', 'walk', 'to advance', 'move ahead'],
        m_lang: 'en',
      },
    ]);
  });

  it('should match radical variants', async () => {
    await db.ready;
    assert.isNull(db.dbVersions.kanjidb);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":2}
{"c":"凶","r":{"on":["キョウ"]},"m":["villain","evil","bad luck","disaster"],"rad":{"x":17},"refs":{"nelson_c":663,"nelson_n":442,"halpern_njecd":2961,"halpern_kkld":1877,"halpern_kkld_2ed":2557,"heisig":1490,"heisig6":1603,"henshall":1159,"sh_kk":1280,"sh_kk2":1354,"kanji_in_context":1812,"kodansha_compact":172,"skip":"3-2-2","sh_desc":"0a4.19","conning":296},"misc":{"sc":4,"gr":8,"freq":1673,"jlpt":1,"kk":4},"comp":"⼂⼃⼐"}
{"c":"胸","r":{"on":["キョウ"],"kun":["むね","むな-"]},"m":["bosom","breast","chest","heart","feelings"],"rad":{"x":130,"var":"2"},"refs":{"nelson_c":3768,"nelson_n":4811,"halpern_njecd":951,"halpern_kkld":647,"halpern_kkld_2ed":858,"heisig":1491,"heisig6":1604,"henshall":840,"sh_kk":1283,"sh_kk2":1357,"kanji_in_context":1086,"kodansha_compact":1030,"skip":"1-4-6","sh_desc":"4b6.9","conning":1971},"misc":{"sc":10,"gr":6,"freq":1144,"jlpt":2,"kk":5},"comp":"⽉⼓凶"}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":5}
{"id":"020","r":20,"b":"⼓","k":"勹","s":2,"na":["つつみがまえ","くがまえ"],"m":["wrapping"],"posn":"kamae"}
{"id":"074","r":74,"b":"⽉","k":"月","s":4,"na":["つき"],"m":["month","moon"]}
{"id":"074-hen","r":74,"b":"⺝","s":4,"na":["つきへん"],"m":["month","moon"],"posn":"hen"}
{"id":"130","r":130,"b":"⾁","k":"肉","s":6,"na":["にく"],"m":["meat"]}
{"id":"130-2","r":130,"b":"⽉","k":"月","pua":59224,"s":4,"na":["にくづき"],"m":["meat"]}
`
    );

    await db.update();

    assert.equal(db.state, DatabaseState.Ok);

    const result = await db.getKanji(['胸']);
    const expected = [
      {
        c: '胸',
        r: { on: ['キョウ'], kun: ['むね', 'むな-'] },
        m: ['bosom', 'breast', 'chest', 'heart', 'feelings'],
        rad: {
          x: 130,
          b: '⽉',
          k: '月',
          na: ['にくづき'],
          m: ['meat'],
          m_lang: 'en',
          base: { b: '⾁', k: '肉', na: ['にく'], m: ['meat'], m_lang: 'en' },
        },
        refs: {
          nelson_c: 3768,
          nelson_n: 4811,
          halpern_njecd: 951,
          halpern_kkld: 647,
          halpern_kkld_2ed: 858,
          heisig: 1491,
          heisig6: 1604,
          henshall: 840,
          sh_kk: 1283,
          sh_kk2: 1357,
          kanji_in_context: 1086,
          kodansha_compact: 1030,
          skip: '1-4-6',
          sh_desc: '4b6.9',
          conning: 1971,
        },
        misc: { sc: 10, gr: 6, freq: 1144, jlpt: 2, kk: 5 },
        comp: [
          { c: '⽉', na: ['にくづき'], m: ['meat'], m_lang: 'en' },
          {
            c: '⼓',
            na: ['つつみがまえ', 'くがまえ'],
            m: ['wrapping'],
            m_lang: 'en',
          },
          {
            c: '凶',
            na: ['キョウ'],
            m: ['villain', 'evil', 'bad luck', 'disaster'],
            m_lang: 'en',
          },
        ],
        m_lang: 'en',
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should match component variants', async () => {
    await db.ready;
    assert.isNull(db.dbVersions.kanjidb);

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_1_0_0);
    fetchMock.mock(
      'end:kanjidb-rc-en-1.0.0-full.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1}
{"c":"筋","r":{"on":["キン"],"kun":["すじ"]},"m":["muscle","sinew","tendon","fiber","plot","plan","descent"],"rad":{"x":118,"var":"kanmuri"},"refs":{"nelson_c":3395,"nelson_n":4286,"halpern_njecd":2678,"halpern_kkld":1719,"halpern_kkld_2ed":2337,"heisig":941,"heisig6":1012,"henshall":843,"sh_kk":1090,"sh_kk2":1141,"kanji_in_context":1059,"kodansha_compact":1476,"skip":"2-6-6","sh_desc":"6f6.4","conning":392},"misc":{"sc":12,"gr":6,"freq":744,"jlpt":1,"kk":5},"comp":"⺮⽉⼒","compvar":["130-2"]}
`
    );
    fetchMock.mock(
      'end:bushudb-rc-en-2.0.0-full.ljson',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":7}
{"id":"019","r":19,"b":"⼒","k":"力","s":2,"na":["ちから"],"m":["power","strength","strong","strain","bear up","exert"]}
{"id":"074","r":74,"b":"⽉","k":"月","s":4,"na":["つき"],"m":["month","moon"]}
{"id":"074-hen","r":74,"b":"⺝","s":4,"na":["つきへん"],"m":["month","moon"],"posn":"hen"}
{"id":"118","r":118,"b":"⽵","k":"竹","s":6,"na":["たけ"],"m":["bamboo"]}
{"id":"118-kanmuri","r":118,"b":"⺮","s":6,"na":["たけかんむり"],"m":["bamboo"],"posn":"kanmuri"}
{"id":"130","r":130,"b":"⾁","k":"肉","s":6,"na":["にく"],"m":["meat"]}
{"id":"130-2","r":130,"b":"⽉","k":"月","pua":59224,"s":4,"na":["にくづき"],"m":["meat"]}
`
    );

    await db.update();

    assert.equal(db.state, DatabaseState.Ok);

    const result = await db.getKanji(['筋']);
    const expected = [
      {
        c: '筋',
        r: { on: ['キン'], kun: ['すじ'] },
        m: ['muscle', 'sinew', 'tendon', 'fiber', 'plot', 'plan', 'descent'],
        rad: {
          x: 118,
          b: '⺮',
          k: undefined,
          na: ['たけかんむり'],
          m: ['bamboo'],
          m_lang: 'en',
          base: { b: '⽵', k: '竹', na: ['たけ'], m: ['bamboo'], m_lang: 'en' },
        },
        refs: {
          nelson_c: 3395,
          nelson_n: 4286,
          halpern_njecd: 2678,
          halpern_kkld: 1719,
          halpern_kkld_2ed: 2337,
          heisig: 941,
          heisig6: 1012,
          henshall: 843,
          sh_kk: 1090,
          sh_kk2: 1141,
          kanji_in_context: 1059,
          kodansha_compact: 1476,
          skip: '2-6-6',
          sh_desc: '6f6.4',
          conning: 392,
        },
        misc: { sc: 12, gr: 6, freq: 744, jlpt: 1, kk: 5 },
        comp: [
          { c: '⺮', na: ['たけかんむり'], m: ['bamboo'], m_lang: 'en' },
          { c: '⽉', na: ['にくづき'], m: ['meat'], m_lang: 'en' },
          {
            c: '⼒',
            na: ['ちから'],
            m: ['power', 'strength', 'strong', 'strain', 'bear up', 'exert'],
            m_lang: 'en',
          },
        ],
        compvar: ['130-2'],
        m_lang: 'en',
      },
    ];

    assert.deepEqual(result, expected);
  });
});
