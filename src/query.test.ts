import { assert } from 'chai';
import fetchMock from 'fetch-mock';

import { JpdictFullTextDatabase } from './database-fulltext';
import {
  getKanji,
  getNames,
  getWordsByCrossReference,
  getWords,
  getWordsWithGloss,
  getWordsWithKanji,
  NameResult,
} from './query';
import { WordResult } from './word-result';
import { GlossType } from './words';

mocha.setup('bdd');

const VERSION_INFO = {
  kanji: {
    '4': {
      major: 4,
      minor: 0,
      patch: 0,
      databaseVersion: '175',
      dateOfCreation: '2019-07-09',
    },
  },
  radicals: {
    '4': {
      major: 4,
      minor: 0,
      patch: 0,
      dateOfCreation: '2019-09-06',
    },
  },
  names: {
    '3': {
      major: 3,
      minor: 0,
      patch: 0,
      dateOfCreation: '2020-08-22',
    },
  },
  words: {
    '1': {
      major: 1,
      minor: 0,
      patch: 0,
      dateOfCreation: '2020-10-12',
    },
  },
};

describe('query', function () {
  let db: JpdictFullTextDatabase;

  this.timeout(15000);

  beforeEach(() => {
    db = new JpdictFullTextDatabase();
  });

  afterEach(async () => {
    fetchMock.restore();
    if (db) {
      await db.destroy();
    }
  });

  it('should fetch nothing when there is no database', async () => {
    const result = await getKanji({ kanji: ['引'], lang: 'en' });
    assert.deepEqual(result, []);
  });

  it('should fetch kanji', async () => {
    await db.ready;

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1}
{"c":"引","r":{"on":["イン"],"kun":["ひ.く","ひ.ける"],"na":["いな","ひき","ひけ","びき"]},"m":["pull","tug","jerk","admit","install","quote","refer to"],"rad":{"x":57},"refs":{"nelson_c":1562,"nelson_n":1681,"halpern_njecd":181,"halpern_kkld":133,"halpern_kkld_2ed":160,"heisig":1232,"heisig6":1318,"henshall":77,"sh_kk":216,"sh_kk2":216,"kanji_in_context":257,"busy_people":"3.2","kodansha_compact":605,"skip":"1-3-1","sh_desc":"3h1.1","conning":422},"misc":{"sc":4,"gr":2,"freq":218,"jlpt":3,"kk":9},"comp":"⼁⼸","var":["057-hen"]}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":3}
{"id":"002","r":2,"b":"⼁","k":"｜","s":1,"na":["たてぼう","ぼう"],"m":["stick"]}
{"id":"057","r":57,"b":"⼸","k":"弓","s":3,"na":["ゆみ"],"m":["bow","bow (archery, violin)"]}
{"id":"057-hen","r":57,"b":"⼸","k":"弓","pua":59218,"s":3,"na":["ゆみへん"],"m":["bow","bow (archery, violin)"],"posn":"hen"}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['引'], lang: 'en' });
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
          {
            c: '⼁',
            k: '｜',
            na: ['たてぼう', 'ぼう'],
            m: ['stick'],
            m_lang: 'en',
          },
          {
            c: '⼸',
            k: '弓',
            na: ['ゆみへん'],
            m: ['bow', 'bow (archery, violin)'],
            m_lang: 'en',
          },
        ],
        m_lang: 'en',
        cf: [],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fill in katakana component descriptions', async () => {
    await db.ready;

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1}
{"c":"通","r":{"on":["ツウ","ツ"],"kun":["とお.る","とお.り","-とお.り","-どお.り","とお.す","とお.し","-どお.し","かよ.う"],"na":["とん","どうし","どおり","みち"]},"m":["traffic","pass through","avenue","commute","counter for letters, notes, documents, etc."],"rad":{"x":162},"refs":{"nelson_c":4703,"nelson_n":6063,"halpern_njecd":3109,"halpern_kkld":1982,"halpern_kkld_2ed":2678,"heisig":1408,"heisig6":1511,"henshall":176,"sh_kk":150,"sh_kk2":150,"kanji_in_context":204,"busy_people":"3.11","kodansha_compact":695,"skip":"3-3-7","sh_desc":"2q7.18","conning":159},"misc":{"sc":9,"gr":2,"freq":80,"jlpt":3,"kk":9},"comp":"マ⽤⻌","var":["162-nyou"]}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":4}
{"id":"101","r":101,"b":"⽤","k":"用","s":5,"na":["もちいる"],"m":["utilize","business","service","use","employ"]}
{"id":"162","r":162,"b":"⾡","k":"辵","s":3,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"]}
{"id":"162-nyou","r":162,"b":"⻌","k":"辶","s":3,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"],"posn":"nyou"}
{"id":"162-nyou-2","r":162,"b":"⻍","k":"辶","s":4,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"],"posn":"nyou"}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['通'], lang: 'en' });
    assert.deepEqual(result[0].comp, [
      {
        c: 'マ',
        na: ['マ'],
        m: ['katakana ma'],
        m_lang: 'en',
      },
      {
        c: '⽤',
        k: '用',
        na: ['もちいる'],
        m: ['utilize', 'business', 'service', 'use', 'employ'],
        m_lang: 'en',
      },
      {
        c: '⻌',
        k: '辵',
        na: ['しんにょう', 'しんにゅう'],
        m: ['road', 'walk', 'to advance', 'move ahead'],
        m_lang: 'en',
      },
    ]);
  });

  it('should match radical variants', async () => {
    await db.ready;

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":2}
{"c":"凶","r":{"on":["キョウ"]},"m":["villain","evil","bad luck","disaster"],"rad":{"x":17},"refs":{"nelson_c":663,"nelson_n":442,"halpern_njecd":2961,"halpern_kkld":1877,"halpern_kkld_2ed":2557,"heisig":1490,"heisig6":1603,"henshall":1159,"sh_kk":1280,"sh_kk2":1354,"kanji_in_context":1812,"kodansha_compact":172,"skip":"3-2-2","sh_desc":"0a4.19","conning":296},"misc":{"sc":4,"gr":8,"freq":1673,"jlpt":1,"kk":4},"comp":"⼂⼃⼐"}
{"c":"胸","r":{"on":["キョウ"],"kun":["むね","むな-"]},"m":["bosom","breast","chest","heart","feelings"],"rad":{"x":130},"refs":{"nelson_c":3768,"nelson_n":4811,"halpern_njecd":951,"halpern_kkld":647,"halpern_kkld_2ed":858,"heisig":1491,"heisig6":1604,"henshall":840,"sh_kk":1283,"sh_kk2":1357,"kanji_in_context":1086,"kodansha_compact":1030,"skip":"1-4-6","sh_desc":"4b6.9","conning":1971},"misc":{"sc":10,"gr":6,"freq":1144,"jlpt":2,"kk":5},"comp":"⽉⼓凶","var":["130-2"]}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":5}
{"id":"020","r":20,"b":"⼓","k":"勹","s":2,"na":["つつみがまえ","くがまえ"],"m":["wrapping"],"posn":"kamae"}
{"id":"074","r":74,"b":"⽉","k":"月","s":4,"na":["つき"],"m":["month","moon"]}
{"id":"074-hen","r":74,"b":"⺝","s":4,"na":["つきへん"],"m":["month","moon"],"posn":"hen"}
{"id":"130","r":130,"b":"⾁","k":"肉","s":6,"na":["にく"],"m":["meat"]}
{"id":"130-2","r":130,"b":"⽉","k":"月","pua":59224,"s":4,"na":["にくづき"],"m":["meat"]}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['胸'], lang: 'en' });
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
          { c: '⽉', k: '肉', na: ['にくづき'], m: ['meat'], m_lang: 'en' },
          {
            c: '⼓',
            k: '勹',
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
        cf: [],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should match component variants', async () => {
    await db.ready;

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1}
{"c":"筋","r":{"on":["キン"],"kun":["すじ"]},"m":["muscle","sinew","tendon","fiber","plot","plan","descent"],"rad":{"x":118},"refs":{"nelson_c":3395,"nelson_n":4286,"halpern_njecd":2678,"halpern_kkld":1719,"halpern_kkld_2ed":2337,"heisig":941,"heisig6":1012,"henshall":843,"sh_kk":1090,"sh_kk2":1141,"kanji_in_context":1059,"kodansha_compact":1476,"skip":"2-6-6","sh_desc":"6f6.4","conning":392},"misc":{"sc":12,"gr":6,"freq":744,"jlpt":1,"kk":5},"comp":"⺮⽉⼒","var":["118-kanmuri","130-2"]}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":7}
{"id":"019","r":19,"b":"⼒","k":"力","s":2,"na":["ちから"],"m":["power","strength","strong","strain","bear up","exert"]}
{"id":"074","r":74,"b":"⽉","k":"月","s":4,"na":["つき"],"m":["month","moon"]}
{"id":"074-hen","r":74,"b":"⺝","s":4,"na":["つきへん"],"m":["month","moon"],"posn":"hen"}
{"id":"118","r":118,"b":"⽵","k":"竹","s":6,"na":["たけ"],"m":["bamboo"]}
{"id":"118-kanmuri","r":118,"b":"⺮","s":6,"na":["たけかんむり"],"m":["bamboo"],"posn":"kanmuri"}
{"id":"130","r":130,"b":"⾁","k":"肉","s":6,"na":["にく"],"m":["meat"]}
{"id":"130-2","r":130,"b":"⽉","k":"月","pua":59224,"s":4,"na":["にくづき"],"m":["meat"]}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['筋'], lang: 'en' });
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
          {
            c: '⺮',
            k: '竹',
            na: ['たけかんむり'],
            m: ['bamboo'],
            m_lang: 'en',
          },
          { c: '⽉', k: '肉', na: ['にくづき'], m: ['meat'], m_lang: 'en' },
          {
            c: '⼒',
            k: '力',
            na: ['ちから'],
            m: ['power', 'strength', 'strong', 'strain', 'bear up', 'exert'],
            m_lang: 'en',
          },
        ],
        m_lang: 'en',
        cf: [],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch related kanji', async () => {
    await db.ready;

    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:kanji-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":6}
{"c":"構","r":{"py":["gou4"],"on":["コウ"],"kun":["かま.える","かま.う"],"na":["とち"]},"m":["posture","build","pretend"],"rad":{"x":75},"refs":{"nelson_c":2343,"nelson_n":2823,"halpern_njecd":1049,"halpern_kkld_2ed":962,"heisig6":1959,"henshall":675,"sh_kk2":1048,"kanji_in_context":991,"kodansha_compact":1108,"skip":"1-4-10","sh_desc":"4a10.10","conning":917},"misc":{"sc":14,"gr":5,"freq":316,"jlpt":2,"kk":6},"comp":"⽊冓","var":["075-hen"],"cf":"講"}
{"c":"留","r":{"py":["liu2"],"on":["リュウ","ル"],"kun":["と.める","と.まる","とど.める","とど.まる","るうぶる"],"na":["とめ"]},"m":["detain","fasten","halt","stop"],"rad":{"x":102},"refs":{"nelson_c":3003,"nelson_n":3750,"halpern_njecd":2580,"halpern_kkld_2ed":2235,"heisig6":1527,"henshall":805,"sh_kk2":774,"kanji_in_context":432,"kodansha_compact":1341,"skip":"2-5-5","sh_desc":"5f5.4","conning":1170},"misc":{"sc":10,"gr":5,"freq":731,"jlpt":2,"kk":6},"comp":"⼛⼑⽥","cf":"貿溜"}
{"c":"冓","r":{"py":["gou4"],"on":["コウ"],"kun":["かま.える"]},"m":["put together","inner palace"],"rad":{"x":13},"refs":{"nelson_n":396,"skip":"2-5-5","sh_desc":"0a10.14"},"misc":{"sc":10,"kk":1},"comp":"井再⼌"}
{"c":"講","r":{"py":["jiang3"],"on":["コウ"]},"m":["lecture","club","association"],"rad":{"x":149},"refs":{"nelson_c":4425,"nelson_n":5689,"halpern_njecd":1619,"halpern_kkld_2ed":1463,"heisig6":1957,"henshall":676,"sh_kk2":797,"kanji_in_context":495,"kodansha_compact":1707,"skip":"1-7-10","sh_desc":"7a10.3","conning":918},"misc":{"sc":17,"gr":5,"freq":653,"jlpt":2,"kk":6},"comp":"訁冓井再⼌","var":["149-hen"],"cf":"構"}
{"c":"貿","r":{"py":["mao4"],"on":["ボウ"]},"m":["trade","exchange"],"rad":{"x":154},"refs":{"nelson_c":4499,"nelson_n":5788,"halpern_njecd":2601,"halpern_kkld_2ed":2255,"heisig6":1529,"henshall":792,"sh_kk2":773,"kanji_in_context":433,"kodansha_compact":1733,"skip":"2-5-7","sh_desc":"7b5.8","conning":1169},"misc":{"sc":12,"gr":5,"freq":652,"jlpt":2,"kk":6},"comp":"⼛⼑⾙","cf":"留"}
{"c":"溜","r":{"py":["liu1","liu4"],"on":["リュウ"],"kun":["た.まる","たま.る","た.める","したた.る","たまり","ため"]},"m":["collect","gather","be in arrears"],"rad":{"x":85},"refs":{"nelson_c":2658,"nelson_n":3276,"halpern_njecd":662,"halpern_kkld_2ed":608,"heisig6":2415,"skip":"1-3-10","sh_desc":"3a10.11","conning":1171},"misc":{"sc":13,"gr":9,"freq":2451,"kk":15},"comp":"⺡留⼛⼑⽥","var":["085-hen"]}
`
    );
    fetchMock.mock(
      'end:radicals-rc-en-4.0.0.ljson',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":6}
{"id":"018","r":18,"b":"⼑","k":"刀","s":2,"na":["かたな"],"m":["sword","saber","knife"]}
{"id":"028","r":28,"b":"⼛","k":"厶","s":2,"na":["む"],"m":["myself"]}
{"id":"075","r":75,"b":"⽊","k":"木","s":4,"na":["き"],"m":["tree","wood"]}
{"id":"075-2","r":75,"k":"朩","s":4,"na":["き"],"m":["tree","wood"]}
{"id":"075-hen","r":75,"b":"⽊","k":"木","pua":59168,"s":4,"na":["きへん"],"m":["tree","wood"],"posn":"hen"}
{"id":"102","r":102,"b":"⽥","k":"田","s":5,"na":["た"],"m":["rice field","rice paddy"]}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['構', '留'], lang: 'en' });

    assert.deepEqual(result[0].cf, [
      {
        c: '講',
        r: { py: ['jiang3'], on: ['コウ'] },
        m: ['lecture', 'club', 'association'],
        m_lang: 'en',
        misc: { sc: 17, gr: 5, freq: 653, jlpt: 2, kk: 6 },
      },
    ]);
    assert.deepEqual(result[1].cf, [
      {
        c: '貿',
        r: { py: ['mao4'], on: ['ボウ'] },
        m: ['trade', 'exchange'],
        m_lang: 'en',
        misc: { sc: 12, gr: 5, freq: 652, jlpt: 2, kk: 6 },
      },
      {
        c: '溜',
        r: {
          py: ['liu1', 'liu4'],
          on: ['リュウ'],
          kun: ['た.まる', 'たま.る', 'た.める', 'したた.る', 'たまり', 'ため'],
        },
        m: ['collect', 'gather', 'be in arrears'],
        m_lang: 'en',
        misc: { sc: 13, gr: 9, freq: 2451, kk: 15 },
      },
    ]);
  });

  it('should fetch names by kanji', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:names-rc-en-3.0.0.ljson',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1}
{"r":["こくろう"],"k":["国労"],"id":1657560,"tr":[{"type":["org"],"det":["National Railway Workers' Union"]}]}
`
    );

    await db.update({ series: 'names', lang: 'en' });

    const result = await getNames('国労');
    const expected: Array<NameResult> = [
      {
        r: ['こくろう'],
        k: ['国労'],
        id: 1657560,
        tr: [{ type: ['org'], det: ["National Railway Workers' Union"] }],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch names by reading', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:names-rc-en-3.0.0.ljson',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1}
{"r":["こくろう"],"k":["国労"],"id":1657560,"tr":[{"type":["org"],"det":["National Railway Workers' Union"]}]}
`
    );

    await db.update({ series: 'names', lang: 'en' });

    const result = await getNames('こくろう');
    const expected: Array<NameResult> = [
      {
        r: ['こくろう'],
        k: ['国労'],
        id: 1657560,
        tr: [{ type: ['org'], det: ["National Railway Workers' Union"] }],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch names by kana-equivalence', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:names-rc-en-3.0.0.ljson',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":3}
{"r":["マルタ"],"id":5082405,"tr":[{"type":["place"],"det":["Malta"]},{"type":["fem"],"det":["Marta","Martha"]}]}
{"r":["まるた"],"k":["円田"],"id":5143227,"tr":[{"type":["surname"],"det":["Maruta"]}]}
{"r":["まるた"],"k":["丸太"],"id":5193528,"tr":[{"type":["place","surname"],"det":["Maruta"]}]}
`
    );

    await db.update({ series: 'names', lang: 'en' });

    // The katakana result should come last
    let result = await getNames('まるた');
    let expectedIds: Array<number> = [5143227, 5193528, 5082405];

    assert.deepEqual(
      result.map((result) => result.id),
      expectedIds
    );

    // If we repeat the search using katakana, however, it should come first
    result = await getNames('マルタ');
    expectedIds = [5082405, 5143227, 5193528];

    assert.deepEqual(
      result.map((result) => result.id),
      expectedIds
    );
  });

  it('should fetch words by kanji', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1}
{"r":["このあいだ","このかん"],"s":[{"pos":["n-t","n-adv"],"g":["the other day","lately","recently","during this period"]},{"rapp":2,"g":["meanwhile","in the meantime"]}],"k":["この間","此の間"],"id":1004690,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0},{"a":3}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('この間');
    const expected: Array<WordResult> = [
      {
        id: 1004690,
        k: [
          { ent: 'この間', match: true, matchRange: [0, 3], p: ['i1'] },
          { ent: '此の間', match: false },
        ],
        r: [
          { ent: 'このあいだ', match: true, p: ['i1'], a: 0 },
          { ent: 'このかん', match: true, a: 3 },
        ],
        s: [
          {
            pos: ['n-t', 'n-adv'],
            g: [
              { str: 'the other day' },
              { str: 'lately' },
              { str: 'recently' },
              { str: 'during this period' },
            ],
            match: true,
          },
          {
            g: [{ str: 'meanwhile' }, { str: 'in the meantime' }],
            rapp: 2,
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch words by kana', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1}
{"r":["このあいだ","このかん"],"s":[{"pos":["n-t","n-adv"],"g":["the other day","lately","recently","during this period"]},{"rapp":2,"g":["meanwhile","in the meantime"]}],"k":["この間","此の間"],"id":1004690,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0},{"a":3}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('このあいだ');
    const expected: Array<WordResult> = [
      {
        id: 1004690,
        k: [
          { ent: 'この間', match: true, p: ['i1'] },
          { ent: '此の間', match: true },
        ],
        r: [
          {
            ent: 'このあいだ',
            match: true,
            matchRange: [0, 5],
            p: ['i1'],
            a: 0,
          },
          { ent: 'このかん', match: false, a: 3 },
        ],
        s: [
          {
            pos: ['n-t', 'n-adv'],
            g: [
              { str: 'the other day' },
              { str: 'lately' },
              { str: 'recently' },
              { str: 'during this period' },
            ],
            match: true,
          },
          {
            g: [{ str: 'meanwhile' }, { str: 'in the meantime' }],
            rapp: 2,
            match: false,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch words by kana-equivalence', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2}
{"r":["はんぺん","はんぺい"],"s":[{"pos":["n"],"g":["pounded fish cake"],"misc":["uk"]},{"kapp":1,"g":["half a slice","half a ticket","ticket stub"]}],"k":["半片","半平"],"id":1010230,"rm":[{"a":[{"i":0},{"i":3}]},{"app":2,"a":[{"i":0},{"i":1}]}]}
{"r":["わいシャツ"],"s":[{"pos":["n"],"g":["obscene shirt (pun)"],"xref":[{"k":"Ｙシャツ"}]}],"k":["猥シャツ"],"id":1569320}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    let result = await getWords('ハンペイ');
    const expected: Array<WordResult> = [
      {
        id: 1010230,
        k: [
          { ent: '半片', match: false },
          { ent: '半平', match: true },
        ],
        r: [
          { ent: 'はんぺん', a: [{ i: 0 }, { i: 3 }], match: false },
          {
            ent: 'はんぺい',
            app: 2,
            a: [{ i: 0 }, { i: 1 }],
            match: true,
            matchRange: [0, 4],
          },
        ],
        s: [
          {
            pos: ['n'],
            g: [{ str: 'pounded fish cake' }],
            misc: ['uk'],
            match: true,
          },
          {
            kapp: 1,
            g: [
              { str: 'half a slice' },
              { str: 'half a ticket' },
              { str: 'ticket stub' },
            ],
            match: false,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);

    result = await getWords('ワイシャツ');
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      'r[0].matchRange[0]': 0,
      'r[0].matchRange[1]': 5,
    });
  });

  it('should expand gloss type information', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1}
{"r":["ばついち","バツいち","バツイチ"],"s":[{"xref":[{"sense":1,"k":"戸籍"}],"pos":["n"],"gt":32,"g":["being once divorced","one-time divorcee","one x mark (i.e. one name struck from the family register)"],"misc":["uk","joc"]}],"k":["罰一","ばつ一","バツ１"],"id":1010290,"rm":[{"app":3},{"app":4},{"app":0}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('バツイチ');
    const expected: Array<WordResult> = [
      {
        id: 1010290,
        k: [
          { ent: '罰一', match: false },
          { ent: 'ばつ一', match: false },
          { ent: 'バツ１', match: false },
        ],
        r: [
          { ent: 'ばついち', app: 3, match: false },
          { ent: 'バツいち', app: 4, match: false },
          { ent: 'バツイチ', app: 0, match: true, matchRange: [0, 4] },
        ],
        s: [
          {
            xref: [{ sense: 1, k: '戸籍' }],
            pos: ['n'],
            g: [
              { str: 'being once divorced' },
              { str: 'one-time divorcee' },
              {
                str:
                  'one x mark (i.e. one name struck from the family register)',
                type: GlossType.Lit,
              },
            ],
            misc: ['uk', 'joc'],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should sort more common entries first', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2}
{"r":["ひとびと"],"s":[{"pos":["n"],"g":["people","men and women"]},{"g":["each person","everybody"]}],"k":["人々","人びと","人人"],"id":1500001,"km":[{"p":["i1","n1","nf01"]}],"rm":[{"p":["i1","n1","nf01"],"a":2}]}
{"r":["にんにん"],"s":[{"xref":[{"r":"ひとびと","sense":2,"k":"人々"}],"pos":["n"],"g":["each person","everybody"],"misc":["dated"]}],"k":["人々","人人"],"id":1500000,"rm":[{"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('人々');
    const expected: Array<WordResult> = [
      {
        id: 1500001,
        k: [
          {
            ent: '人々',
            p: ['i1', 'n1', 'nf01'],
            match: true,
            matchRange: [0, 2],
          },
          { ent: '人びと', match: false },
          { ent: '人人', match: false },
        ],
        r: [{ ent: 'ひとびと', p: ['i1', 'n1', 'nf01'], a: 2, match: true }],
        s: [
          {
            g: [{ str: 'people' }, { str: 'men and women' }],
            pos: ['n'],
            match: true,
          },
          { g: [{ str: 'each person' }, { str: 'everybody' }], match: true },
        ],
      },
      {
        id: 1500000,
        k: [
          { ent: '人々', match: true, matchRange: [0, 2] },
          { ent: '人人', match: false },
        ],
        r: [{ ent: 'にんにん', a: 1, match: true }],
        s: [
          {
            g: [{ str: 'each person' }, { str: 'everybody' }],
            xref: [{ r: 'ひとびと', sense: 2, k: '人々' }],
            pos: ['n'],
            misc: ['dated'],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should search by starting string', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":3}
{"r":["せんにん"],"s":[{"pos":["n"],"g":["immortal mountain wizard (in Taoism)","mountain man (esp. a hermit)"]},{"g":["one not bound by earthly desires or the thoughts of normal men"]}],"k":["仙人","僊人"],"id":1387170,"km":[{"p":["n2","nf34","s2"]}],"rm":[{"p":["n2","nf34","s2"],"a":3}]}
{"r":["せんだい"],"s":[{"pos":["n"],"g":["Sendai (city in Miyagi)"]}],"k":["仙台"],"id":2164680,"km":[{"p":["s1"]}],"rm":[{"p":["s1"],"a":1}]}
{"r":["セント"],"s":[{"pos":["n"],"g":["cent (monetary unit)"],"misc":["uk"]}],"k":["仙"],"id":1075090,"km":[{"i":["ateji"]}],"rm":[{"p":["g1"],"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('仙', { matchType: 'startsWith', limit: 2 });
    const expected: Array<WordResult> = [
      {
        id: 1075090,
        k: [{ ent: '仙', i: ['ateji'], match: true, matchRange: [0, 1] }],
        r: [{ ent: 'セント', p: ['g1'], a: 1, match: true }],
        s: [
          {
            g: [{ str: 'cent (monetary unit)' }],
            pos: ['n'],
            misc: ['uk'],
            match: true,
          },
        ],
      },
      {
        id: 2164680,
        k: [{ ent: '仙台', p: ['s1'], match: true, matchRange: [0, 1] }],
        r: [{ ent: 'せんだい', p: ['s1'], a: 1, match: true }],
        s: [
          { g: [{ str: 'Sendai (city in Miyagi)' }], pos: ['n'], match: true },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should search by individual kanji', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2}
{"r":["せんにん"],"s":[{"pos":["n"],"g":["immortal mountain wizard (in Taoism)","mountain man (esp. a hermit)"]},{"g":["one not bound by earthly desires or the thoughts of normal men"]}],"k":["仙人","僊人"],"id":1387170,"km":[{"p":["n2","nf34","s2"]}],"rm":[{"p":["n2","nf34","s2"],"a":3}]}
{"r":["せんだい"],"s":[{"pos":["n"],"g":["Sendai (city in Miyagi)"]}],"k":["仙台"],"id":2164680,"km":[{"p":["s1"]}],"rm":[{"p":["s1"],"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWordsWithKanji('仙');
    const expected: Array<WordResult> = [
      {
        id: 2164680,
        k: [{ ent: '仙台', p: ['s1'], match: true, matchRange: [0, 1] }],
        r: [{ ent: 'せんだい', p: ['s1'], a: 1, match: true }],
        s: [
          { g: [{ str: 'Sendai (city in Miyagi)' }], pos: ['n'], match: true },
        ],
      },
      {
        id: 1387170,
        k: [
          {
            ent: '仙人',
            p: ['n2', 'nf34', 's2'],
            match: true,
            matchRange: [0, 1],
          },
          { ent: '僊人', match: false },
        ],
        r: [{ ent: 'せんにん', p: ['n2', 'nf34', 's2'], a: 3, match: true }],
        s: [
          {
            g: [
              { str: 'immortal mountain wizard (in Taoism)' },
              { str: 'mountain man (esp. a hermit)' },
            ],
            pos: ['n'],
            match: true,
          },
          {
            g: [
              {
                str:
                  'one not bound by earthly desires or the thoughts of normal men',
              },
            ],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should search by gloss', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2}
{"r":["あっというまに","あっとゆうまに","アッというまに","アッとゆうまに"],"s":[{"pos":["exp","adv"],"gt":128,"g":["just like that","in the twinkling of an eye","in the blink of an eye","in the time it takes to say \\"ah!\\""]}],"k":["あっという間に","あっと言う間に","あっとゆう間に","アッという間に","アッと言う間に","アッとゆう間に"],"id":1000390,"km":[{"p":["s1"]}],"rm":[{"app":3,"p":["s1"]},{"app":6,"a":[{"i":1},{"i":0}]},{"app":24},{"app":48,"a":[{"i":1},{"i":0}]}]}
{"r":["またたくまに"],"s":[{"pos":["adv"],"g":["in the twinkling of an eye","in a flash"]}],"k":["瞬く間に","またたく間に"],"id":1909530,"rm":[{"a":3}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    let result = await getWordsWithGloss('Twinkl', 'en');
    const expected: Array<WordResult> = [
      {
        id: 1000390,
        k: [
          { ent: 'あっという間に', p: ['s1'], match: true },
          { ent: 'あっと言う間に', match: true },
          { ent: 'あっとゆう間に', match: true },
          { ent: 'アッという間に', match: true },
          { ent: 'アッと言う間に', match: true },
          { ent: 'アッとゆう間に', match: true },
        ],
        r: [
          { ent: 'あっというまに', app: 3, p: ['s1'], match: true },
          {
            ent: 'あっとゆうまに',
            app: 6,
            a: [{ i: 1 }, { i: 0 }],
            match: true,
          },
          { ent: 'アッというまに', app: 24, match: true },
          {
            ent: 'アッとゆうまに',
            app: 48,
            a: [{ i: 1 }, { i: 0 }],
            match: true,
          },
        ],
        s: [
          {
            g: [
              { str: 'just like that' },
              { str: 'in the twinkling of an eye', matchRange: [7, 13] },
              { str: 'in the blink of an eye' },
              { str: 'in the time it takes to say "ah!"', type: 2 },
            ],
            pos: ['exp', 'adv'],
            match: true,
          },
        ],
      },
      {
        id: 1909530,
        k: [
          { ent: '瞬く間に', match: true },
          { ent: 'またたく間に', match: true },
        ],
        r: [{ ent: 'またたくまに', a: 3, match: true }],
        s: [
          {
            g: [
              { str: 'in the twinkling of an eye', matchRange: [7, 13] },
              { str: 'in a flash' },
            ],
            pos: ['adv'],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);

    // Try something random that tokenizes to nothing
    result = await getWordsWithGloss('○', 'en');
    assert.deepEqual(result, []);
  });

  it('should search by cross-reference', async () => {
    fetchMock.mock('end:jpdict-rc-en-version.json', VERSION_INFO);
    fetchMock.mock(
      'end:words-rc-en-1.0.0.ljson',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":8}
{"r":["せいしょ"],"s":[{"field":["Christn"],"pos":["n"],"g":["Bible","Holy Writ","scriptures"]}],"k":["聖書"],"id":1380340,"km":[{"p":["i1","n1","nf14"]}],"rm":[{"p":["i1","n1","nf14"],"a":1}]}
{"r":["ワイシャツ"],"s":[{"lsrc":[{"src":"white shirt","wasei":true}],"xref":[{"r":"ホワイトシャツ"}],"pos":["n"],"g":["shirt","business shirt","dress shirt"],"misc":["uk","abbr"]}],"k":["Ｙシャツ"],"id":1148640,"km":[{"p":["i1","s1"]}],"rm":[{"p":["i1","s1"]}]}
{"r":["ジャントー","ジャントウ"],"s":[{"lsrc":[{"lang":"zh"}],"xref":[{"k":"対子"}],"field":["mahj"],"pos":["n"],"g":["pair (as part of a winning hand, together with four melds)","eyes"]}],"k":["雀頭"],"id":2749740,"rm":[0,{"i":["ik"]}]}
{"r":["もとめる"],"s":[{"pos":["v1","vt"],"g":["to want","to wish for"]},{"pos":["v1","vt"],"g":["to request","to demand","to require","to ask for"]},{"pos":["v1","vt"],"g":["to seek","to search for","to look for","to pursue (pleasure)","to hunt (a job)"]},{"xref":[{"sense":1,"k":"買う"}],"pos":["v1","vt"],"g":["to purchase","to buy"],"misc":["pol"]}],"k":["求める"],"id":1229350,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":3}]}
{"r":["こちら","こっち","こち"],"s":[{"xref":[{"r":"そちら","sense":1},{"r":"あちら","sense":1},{"r":"どちら","sense":1}],"pos":["pn"],"g":["this way (direction close to the speaker or towards the speaker)","this direction"],"misc":["uk"]},{"pos":["pn"],"g":["here (place close to the speaker or where the speaker is)"],"misc":["uk"]},{"pos":["pn"],"g":["this one (something physically close to the speaker)"],"misc":["uk"]},{"pos":["pn"],"g":["I","me","we","us"],"misc":["uk"]},{"rapp":1,"pos":["pn"],"g":["this person (someone physically close to the speaker and of equal or higher status)"],"misc":["uk"]}],"k":["此方"],"id":1004500,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0},{"p":["i1"],"a":3},{"i":["ok"],"a":1}]}
{"r":["ぶんしょ","もんじょ","ぶんじょ"],"s":[{"pos":["n"],"g":["document","writing","letter","papers","notes","records","archives"]},{"inf":"paleography term","rapp":2,"pos":["n"],"g":["document addressed to someone"]}],"k":["文書"],"id":1583840,"km":[{"p":["i1","n1","nf02"]}],"rm":[{"p":["i1","n1","nf02"],"a":1},{"a":1},{"i":["ok"]}]}
{"r":["まる"],"s":[{"pos":["n"],"g":["circle"],"xref":[{"r":"まる","sense":1,"k":"○"}]},{"pos":["n","n-pref"],"g":["entirety","whole","full","complete"]},{"pos":["n"],"g":["money","dough","moola"],"misc":["sl"]},{"inf":"esp. 丸","pos":["n"],"g":["enclosure inside a castle's walls"]},{"xref":[{"r":"スッポン","sense":1}],"pos":["n"],"g":["soft-shelled turtle"],"dial":["ks"]},{"inf":"esp. 丸","xref":[{"sense":3,"k":"麻呂"}],"pos":["suf"],"g":["suffix for ship names","suffix for names of people (esp. infants)","suffix for names of swords, armour, musical instruments, etc.","suffix for names of dogs, horses, etc."]}],"k":["丸","円"],"id":1216250,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0}]}
{"r":["がん"],"s":[{"pos":["n","n-suf"],"g":["fishball","meatball"]},{"pos":["n","n-suf"],"g":["pill"],"xref":[{"k":"丸薬"}]}],"k":["丸"],"id":2252570,"rm":[{"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    // 1. Search on k only (聖書 linked from バイブル)
    let result = await getWordsByCrossReference({ k: '聖書' });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].ent': '聖書',
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      's.length': 1,
      's[0].match': true,
    });

    // 2. Search on r only (ワイシャツ linked from カッターシャツ)
    result = await getWordsByCrossReference({ r: 'ワイシャツ' });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      's.length': 1,
      's[0].match': true,
    });

    // 3. Search on k and r (雀頭, ジャントー linked from 頭)
    result = await getWordsByCrossReference({ k: '雀頭', r: 'ジャントー' });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 2,
      'r[0].ent': 'ジャントー',
      'r[0].match': true,
      'r[1].ent': 'ジャントウ',
      'r[1].match': false,
      's.length': 1,
      's[0].match': true,
    });

    // 4. Search on k and sense (求める, 2  linked from 求む)
    result = await getWordsByCrossReference({ k: '求める', sense: 2 });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      's.length': 4,
      's[0].match': false,
      's[1].match': true,
      's[2].match': false,
      's[3].match': false,
    });

    // 5. Search on r and sense (こちら, 1 linked from そちら)
    result = await getWordsByCrossReference({ r: 'こちら', sense: 1 });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 3,
      'r[0].match': true,
      'r[1].match': false,
      'r[2].match': false,
      's.length': 5,
      's[0].match': true,
      's[1].match': false,
      's[2].match': false,
      's[3].match': false,
      's[4].match': false,
    });

    // 6. Search on k and r and sense (文書, ぶんしょ, 2 linked from 古文書))
    result = await getWordsByCrossReference({
      k: '文書',
      r: 'ぶんしょ',
      sense: 2,
    });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 3,
      'r[0].match': true,
      'r[1].match': false,
      'r[2].match': false,
      's.length': 2,
      's[0].match': false,
      's[1].match': true,
    });

    // 7. Search on k and r and sense where there are multiple records that
    //    match on k (丸, まる, 1 linked from 〇).
    result = await getWordsByCrossReference({ k: '丸', r: 'まる', sense: 1 });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 2,
      'k[0].match': true,
      'k[1].match': false,
      'r.length': 1,
      'r[0].match': true,
      's.length': 6,
      's[0].match': true,
      's[1].match': false,
      's[2].match': false,
      's[3].match': false,
      's[4].match': false,
      's[5].match': false,
    });
  });
});
