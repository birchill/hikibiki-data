import { IDBPDatabase, IDBPTransaction, openDB } from 'idb/with-async-ittr';

import { KanjiEntryLine, Misc, Readings } from './kanji';
import { KanjiRecord, NameRecord, JpdictSchema, RadicalRecord } from './store';
import { stripFields } from './utils';

// Database query methods
//
// This is in a separate file so that we can include just the query methods
// in a separate worker / context and tree-shake out the rest of the module.
//
// Furthermore, these methods are careful not to read from the version table
// since that can block when the database is being updated. Instead, these
// methods are intended to be run on a separate thread to where the database
// update methods are being run so that it is still possible for the user to
// user the database while it is being updated.

/* ------------------------------------------------------------------------
 *
 * Opening
 *
 * -----------------------------------------------------------------------*/

let _state: 'idle' | 'opening' | 'open' = 'idle';
let _db: IDBPDatabase<JpdictSchema> | undefined;
let _openPromise: Promise<IDBPDatabase<JpdictSchema> | null> | undefined;

async function open(): Promise<IDBPDatabase<JpdictSchema> | null> {
  if (_state === 'open') {
    return _db!;
  }

  if (_state === 'opening') {
    return _openPromise!;
  }

  _state = 'opening';

  _openPromise = openDB<JpdictSchema>('jpdict', 2, {
    upgrade(
      _db: IDBPDatabase<JpdictSchema>,
      _oldVersion: number,
      _newVersion: number | null,
      transaction: IDBPTransaction<JpdictSchema>
    ) {
      // If the database does not exist, do not try to create it.
      // If it is for an old version, do not try to use it.
      transaction.abort();
    },
    blocked() {
      console.log('Opening blocked');
    },
    blocking() {
      if (_db) {
        _db.close();
        _db = undefined;
        _state = 'idle';
      }
    },
    terminated() {
      _db = undefined;
      _state = 'idle';
    },
  })
    .then((db) => {
      _db = db;
      _state = 'open';
      return db;
    })
    .catch((_) => {
      _state = 'idle';
      _db = undefined;
      return null;
    })
    .finally(() => {
      _openPromise = undefined;
    });

  return _openPromise!;
}

/* ------------------------------------------------------------------------
 *
 * KANJI
 *
 * -----------------------------------------------------------------------*/

export interface KanjiResult
  extends Omit<KanjiEntryLine, 'rad' | 'comp' | 'm_lang' | 'var' | 'cf'> {
  m_lang: string;
  rad: {
    x: number;
    nelson?: number;
    b?: string;
    k?: string;
    na: Array<string>;
    m: Array<string>;
    m_lang: string;
    base?: {
      b?: string;
      k?: string;
      na: Array<string>;
      m: Array<string>;
      m_lang: string;
    };
  };
  comp: Array<{
    c: string;
    na: Array<string>;
    // An optional field indicating the kanji character to link to.
    //
    // For example, if the component is ⺮, one might want to look up other
    // kanji with that component, but they also might want to look up the
    // corresponding kanji for the component, i.e. 竹.
    //
    // For kanji / katakana components this is empty. For radical components
    // this is the kanji of the base radical, if any.
    k?: string;
    m: Array<string>;
    m_lang: string;
  }>;
  cf: Array<RelatedKanji>;
}

export interface RelatedKanji {
  c: string;
  r: Readings;
  m: Array<string>;
  m_lang: string;
  misc: Misc;
}

export async function getKanji({
  kanji,
  lang,
  logWarningMessage = console.log,
}: {
  kanji: Array<string>;
  lang: string;
  logWarningMessage?: (msg: string) => void;
}): Promise<Array<KanjiResult>> {
  const ids = kanji.map((kanji) => kanji.codePointAt(0)!);
  const kanjiRecords: Array<KanjiRecord> = await getKanjiById(ids);

  const radicalResults = await getRadicalForKanji({
    kanjiRecords,
    lang,
    logWarningMessage,
  });
  if (kanjiRecords.length !== radicalResults.length) {
    throw new Error(
      `There should be as many kanji records (${kanjiRecords.length}) as radical blocks (${radicalResults.length})`
    );
  }

  const componentResults = await getComponentsForKanji({
    kanjiRecords,
    lang,
    logWarningMessage,
  });
  if (kanjiRecords.length !== componentResults.length) {
    throw new Error(
      `There should be as many kanji records (${kanjiRecords.length}) as component arrays (${componentResults.length})`
    );
  }

  const relatedResults = await getRelatedKanji(kanjiRecords, lang);
  if (kanjiRecords.length !== relatedResults.length) {
    throw new Error(
      `There should be as many kanji records (${kanjiRecords.length}) as related kanji arrays (${relatedResults.length})`
    );
  }

  // Zip the arrays together
  return kanjiRecords.map((record, i) =>
    stripFields(
      {
        ...record,
        c: String.fromCodePoint(record.c),
        m_lang: record.m_lang || lang,
        rad: radicalResults[i],
        comp: componentResults[i],
        cf: relatedResults[i],
      },
      ['var']
    )
  );
}

async function getKanjiById(ids: Array<number>): Promise<Array<KanjiRecord>> {
  const db = await open();
  if (!db) {
    return [];
  }

  const kanjiRecords: Array<KanjiRecord> = [];
  {
    const tx = db!.transaction('kanji');
    for (const c of ids) {
      const record = await tx.store.get(c);
      if (record) {
        kanjiRecords.push(record);
      }
    }
  }

  return kanjiRecords;
}

async function getRadicalForKanji({
  kanjiRecords,
  lang,
  logWarningMessage,
}: {
  kanjiRecords: Array<KanjiRecord>;
  lang: string;
  logWarningMessage: (msg: string) => void;
}): Promise<Array<KanjiResult['rad']>> {
  const radicals = await getRadicals();

  return kanjiRecords.map((record) => {
    const variantId = getRadicalVariantId(record);
    const baseId = formatRadicalId(record.rad.x);

    const radicalVariant = radicals.get(variantId || baseId);
    let rad: KanjiResult['rad'];
    if (radicalVariant) {
      rad = {
        x: record.rad.x,
        b: radicalVariant.b,
        k: radicalVariant.k,
        na: radicalVariant.na,
        m: radicalVariant.m,
        m_lang: radicalVariant.m_lang || lang,
      };
      if (record.rad.nelson) {
        rad.nelson = record.rad.nelson;
      }
    } else {
      // The radical was not found. This should basically never happen.
      // But rather than crash fatally, just fill in some nonsense data
      // instead.
      logWarningMessage(`Failed to find radical: ${variantId || baseId}`);
      rad = {
        ...record.rad,
        // We generally maintain the invariant that either 'b' or 'k' is
        // filled in (or both for a base radical) so even though the TS
        // typings don't require it, we should provide one here.
        b: '�',
        na: [''],
        m: [''],
        m_lang: lang,
      };
    }

    // If this a variant, return the base radical information too
    if (variantId) {
      const baseRadical = radicals.get(baseId);
      if (baseRadical) {
        const { b, k, na, m, m_lang } = baseRadical;
        rad.base = { b, k, na, m, m_lang: m_lang || lang };
      }
    }

    return rad;
  });
}

function formatRadicalId(id: number): string {
  return id.toString().padStart(3, '0');
}

type RadicalVariantArray = Array<{ radical: number; id: string }>;

function parseVariants(record: KanjiRecord): RadicalVariantArray {
  const variants: Array<{ radical: number; id: string }> = [];

  if (record.var) {
    for (const variantId of record.var) {
      const matches = variantId.match(/^(\d+)-/);
      if (matches) {
        const [, radical] = matches;
        variants.push({
          radical: parseInt(radical, 10),
          id: variantId,
        });
      }
    }
  }

  return variants;
}

function popVariantForRadical(
  radical: number,
  variants: RadicalVariantArray
): string | undefined {
  // Add special handling so that if we are searching for a variant for 74 (⽉)
  // but we find 130-2 (にくづき) we match that.
  const variantIndex = variants.findIndex(
    (a) => a.radical === radical || (radical === 74 && a.id === '130-2')
  );

  if (variantIndex === -1) {
    return undefined;
  }

  const id = variants[variantIndex].id;
  variants.splice(variantIndex, 1);

  return id;
}

function getRadicalVariantId(record: KanjiRecord): string | undefined {
  const variants = parseVariants(record);
  const variant = variants.find((a) => a.radical === record.rad.x);
  return variant?.id;
}

// NOTE: This is NOT meant to be a generic romaji utility. It does NOT
// cover e.g. ファ or ジャ. It is very specifically for filling out component
// records that use a katakana character and handles exactly the range we use
// there to detect katakana (which excludes some katakana at the end of the
// Unicode katakana block like ヾ).
//
// It also doesn't differentiate between e.g. ア or ァ. In fact, it is only
// ever expected to cover ム and ユ but we've made it a little bit more generic
// simply because the kanji components data is expected to be frequently updated
// and it's completely possible that other katakana symbols might show up there
// in the future.
const katakanaToRoman: Array<[string, string]> = [
  ['ァ', 'a'],
  ['ア', 'a'],
  ['ィ', 'i'],
  ['イ', 'i'],
  ['ゥ', 'u'],
  ['ウ', 'u'],
  ['ェ', 'e'],
  ['エ', 'e'],
  ['ォ', 'o'],
  ['オ', 'o'],
  ['カ', 'ka'],
  ['ガ', 'ga'],
  ['キ', 'ki'],
  ['ギ', 'gi'],
  ['ク', 'ku'],
  ['グ', 'gu'],
  ['ケ', 'ke'],
  ['ゲ', 'ge'],
  ['コ', 'ko'],
  ['ゴ', 'go'],
  ['サ', 'sa'],
  ['ザ', 'za'],
  ['シ', 'shi'],
  ['ジ', 'ji'],
  ['ス', 'su'],
  ['ズ', 'zu'],
  ['セ', 'se'],
  ['ゼ', 'ze'],
  ['ソ', 'so'],
  ['ゾ', 'zo'],
  ['タ', 'ta'],
  ['ダ', 'da'],
  ['チ', 'chi'],
  ['ヂ', 'di'],
  ['ッ', 'tsu'],
  ['ツ', 'tsu'],
  ['ヅ', 'dzu'],
  ['テ', 'te'],
  ['デ', 'de'],
  ['ト', 'to'],
  ['ド', 'do'],
  ['ナ', 'na'],
  ['ニ', 'ni'],
  ['ヌ', 'nu'],
  ['ネ', 'ne'],
  ['ノ', 'no'],
  ['ハ', 'ha'],
  ['バ', 'ba'],
  ['パ', 'pa'],
  ['ヒ', 'hi'],
  ['ビ', 'bi'],
  ['ピ', 'pi'],
  ['フ', 'fu'],
  ['ブ', 'bu'],
  ['プ', 'pu'],
  ['ヘ', 'he'],
  ['ベ', 'be'],
  ['ペ', 'pe'],
  ['ホ', 'ho'],
  ['ボ', 'bo'],
  ['ポ', 'po'],
  ['マ', 'ma'],
  ['ミ', 'mi'],
  ['ム', 'mu'],
  ['メ', 'me'],
  ['モ', 'mo'],
  ['ャ', 'ya'],
  ['ヤ', 'ya'],
  ['ュ', 'yu'],
  ['ユ', 'yu'],
  ['ョ', 'yo'],
  ['ヨ', 'yo'],
  ['ラ', 'ra'],
  ['リ', 'ri'],
  ['ル', 'ru'],
  ['レ', 're'],
  ['ロ', 'ro'],
  ['ヮ', 'wa'],
  ['ワ', 'wa'],
  ['ヰ', 'wi'],
  ['ヱ', 'we'],
  ['ヲ', 'wo'],
  ['ン', 'n'],
  ['ヴ', 'vu'],
  ['ヵ', 'ka'],
  ['ヶ', 'ke'],
  ['ヷ', 'ga'],
  ['ヸ', 'vi'],
  ['ヹ', 've'],
  ['ヺ', 'vo'],
];

async function getComponentsForKanji({
  kanjiRecords,
  lang,
  logWarningMessage,
}: {
  kanjiRecords: Array<KanjiRecord>;
  lang: string;
  logWarningMessage: (msg: string) => void;
}): Promise<Array<KanjiResult['comp']>> {
  // Collect all the characters together
  const components = kanjiRecords.reduce<Array<string>>(
    (components, record) =>
      components.concat(record.comp ? [...record.comp] : []),
    []
  );

  // Work out which kanji characters we need to lookup
  const radicalMap = await getCharToRadicalMapping();
  const kanjiToLookup = new Set<number>();
  for (const c of components) {
    if (c && !radicalMap.has(c)) {
      kanjiToLookup.add(c.codePointAt(0)!);
    }
  }

  // ... And look them up
  let kanjiMap: Map<string, KanjiRecord> = new Map();
  if (kanjiToLookup.size) {
    const kanjiRecords = await getKanjiById([...kanjiToLookup]);
    kanjiMap = new Map(
      kanjiRecords.map((record) => [String.fromCodePoint(record.c), record])
    );
  }

  // Now fill out the information
  const radicals = await getRadicals();
  const result: Array<KanjiResult['comp']> = [];
  for (const record of kanjiRecords) {
    const comp: KanjiResult['comp'] = [];
    const variants = parseVariants(record);

    for (const c of record.comp ? [...record.comp] : []) {
      if (radicalMap.has(c)) {
        let radicalRecord = radicals.get(radicalMap.get(c)!);
        if (radicalRecord) {
          // Look for a matching variant
          const variantId = popVariantForRadical(radicalRecord!.r, variants);
          if (typeof variantId !== 'undefined') {
            const variantRadical = radicals.get(variantId);
            if (variantRadical) {
              radicalRecord = variantRadical;
            } else {
              logWarningMessage(
                `Couldn't find radical record for variant ${variantId}`
              );
            }
          }

          const component: KanjiResult['comp'][0] = {
            c,
            na: radicalRecord.na,
            m: radicalRecord.m,
            m_lang: radicalRecord.m_lang || lang,
          };
          const baseRadical = radicals.get(formatRadicalId(radicalRecord.r));
          if (baseRadical && baseRadical.k) {
            component.k = baseRadical.k;
          }

          comp.push(component);
        } else {
          logWarningMessage(`Couldn't find radical record for ${c}`);
        }
      } else if (kanjiMap.has(c)) {
        const kanjiRecord = kanjiMap.get(c);
        if (kanjiRecord) {
          let na: Array<string> = [];
          if (kanjiRecord.r.kun && kanjiRecord.r.kun.length) {
            na = kanjiRecord.r.kun.map((reading) => reading.replace('.', ''));
          } else if (kanjiRecord.r.on && kanjiRecord.r.on.length) {
            na = kanjiRecord.r.on;
          }

          comp.push({
            c,
            na,
            m: kanjiRecord.m,
            m_lang: kanjiRecord.m_lang || lang,
          });
        }
      } else if (c.codePointAt(0)! >= 0x30a1 && c.codePointAt(0)! <= 0x30fa) {
        // NOTE: If we ever support languages that are not roman-based, or
        // where it doesn't make sense to convert katakana into a roman
        // equivalent we should detect that here.
        //
        // For now we handle Japanese simply because that seems likely.
        if (lang === 'ja') {
          comp.push({
            c,
            na: [c],
            m: [`片仮名の${c}`],
            m_lang: lang,
          });
        } else {
          const asRoman = katakanaToRoman[c.codePointAt(0)! - 0x30a1][1];
          // NOTE: We only currently deal with a very limited number of
          // languages where it seems legitimate to write 片仮名 as
          // "katakana" (as best I can tell).
          //
          // Once we come to handle languages like Korean and so on we'll
          // actually want to localize this properly.
          //
          // e.g.
          //
          //   Korean: 카타카나
          //   Chinese (what kind?): 片假名
          //   Arabic: الكاتاكانا ?
          //   Persian: काताकाना ?
          //   Russian: Ката́кана ?
          //
          // Given that all these languages fall back to English anyway,
          // though, it's probably not so bad if we forget to do this.
          //
          // TODO: Update this when we handle word dictionary
          if (!['en', 'es', 'pt', 'fr'].includes(lang)) {
            logWarningMessage(
              `Generating katakana record for unknown language: ${lang}`
            );
          }
          comp.push({
            c,
            na: [c],
            m: [`katakana ${asRoman}`],
            m_lang: lang,
          });
        }
      } else {
        logWarningMessage(`Couldn't find a radical or kanji entry for ${c}`);
      }
    }

    result.push(comp);
  }

  return result;
}

async function getRelatedKanji(
  kanjiRecords: Array<KanjiRecord>,
  lang: string
): Promise<Array<Array<RelatedKanji>>> {
  // Collect all the characters together
  const cf = kanjiRecords.reduce<Array<number>>(
    (cf, record) =>
      cf.concat(
        record.cf ? [...record.cf].map((c) => c.codePointAt(0) || 0) : []
      ),
    []
  );
  const kanjiToLookup = new Set<number>(cf);

  // ... And look them up
  let kanjiMap: Map<string, KanjiRecord> = new Map();
  if (kanjiToLookup.size) {
    const kanjiRecords = await getKanjiById([...kanjiToLookup]);
    kanjiMap = new Map(
      kanjiRecords.map((record) => [String.fromCodePoint(record.c), record])
    );
  }

  // Now fill out the information
  const result: Array<Array<RelatedKanji>> = [];
  for (const record of kanjiRecords) {
    const relatedKanji: Array<RelatedKanji> = [];
    for (const cfChar of record.cf ? [...record.cf] : []) {
      const kanji = kanjiMap.get(cfChar);
      if (!kanji) {
        continue;
      }

      const { r, m, m_lang, misc } = kanji;
      relatedKanji.push({ c: cfChar, r, m, m_lang: m_lang || lang, misc });
    }
    result.push(relatedKanji);
  }

  return result;
}

async function getRadicals(): Promise<Map<string, RadicalRecord>> {
  const db = await open();
  if (!db) {
    return new Map();
  }

  return db
    .getAll('radicals')
    .then((records) => new Map(records.map((record) => [record.id, record])));
}

async function getCharToRadicalMapping(): Promise<Map<string, string>> {
  const radicals = await getRadicals();

  let baseRadical: RadicalRecord | undefined;
  const mapping: Map<string, string> = new Map();

  for (const radical of radicals.values()) {
    if (radical.id.indexOf('-') === -1) {
      baseRadical = radical;
      if (radical.b) {
        mapping.set(radical.b, radical.id);
      }
      if (radical.k) {
        mapping.set(radical.k, radical.id);
      }
    } else {
      if (!baseRadical) {
        throw new Error('Radicals out of order--no base radical found');
      }
      if (radical.r !== baseRadical.r) {
        throw new Error('Radicals out of order--ID mismatch');
      }
      // Skip 130-2. This one is special. It's にくづき which has the same
      // unicode codepoint as つき but we don't want to clobber that record
      // (which we'll end up doing because they have different base radicals).
      //
      // Instead, we'll take care to pick up variants like this in
      // getComponentsForKanji (or more specifically popVariantForRadical).
      if (radical.id === '130-2') {
        continue;
      }
      if (radical.b && radical.b !== baseRadical.b) {
        mapping.set(radical.b, radical.id);
      }
      if (radical.k && radical.k !== baseRadical.k) {
        mapping.set(radical.k, radical.id);
      }
    }
  }

  return mapping;
}

/* ------------------------------------------------------------------------
 *
 * NAMES
 *
 * -----------------------------------------------------------------------*/

export type { NameRecord as NameResult };

export async function getNames(search: string): Promise<Array<NameRecord>> {
  const db = await open();
  if (!db) {
    return [];
  }

  const result: Set<NameRecord> = new Set();

  // Try the k (kanji) index first
  const kanjiIndex = db!.transaction('names').store.index('k');
  // (We explicitly use IDBKeyRange.only because otherwise the idb TS typings
  // fail to recognize that these indices are multi-entry and hence it is
  // valid to supply a single string instead of an array of strings.)
  for await (const cursor of kanjiIndex.iterate(IDBKeyRange.only(search))) {
    result.add(cursor.value);
  }

  // Then the r (reading) index
  const readingIndex = db!.transaction('names').store.index('r');
  for await (const cursor of readingIndex.iterate(IDBKeyRange.only(search))) {
    result.add(cursor.value);
  }

  return [...result];
}
