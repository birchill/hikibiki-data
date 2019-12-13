import { jsonEqualish } from '@birchill/json-equalish';

import { isRadicalEntryLine, isRadicalDeletionLine } from './bushudb';
import { DatabaseVersion } from './common';
import { hasLanguage, download } from './download';
import {
  KanjiEntryLine,
  isKanjiEntryLine,
  isKanjiDeletionLine,
} from './kanjidb';
import { KanjiStore, KanjiRecord, RadicalRecord } from './store';
import { UpdateAction } from './update-actions';
import { UpdateState } from './update-state';
import { reducer as updateReducer } from './update-reducer';
import {
  cancelUpdate,
  updateKanji,
  updateRadicals,
  UpdateOptions,
} from './update';

const KANJIDB_MAJOR_VERSION = 1;
const BUSHUDB_MAJOR_VERSION = 1;

export const enum DatabaseState {
  // We don't know yet if we have a database or not
  Initializing,
  // No data has been stored yet
  Empty,
  // We have data and it's usable
  Ok,
  // The database itself is somehow unavailable (e.g. IndexedDB has been
  // disabled or blocked due to user permissions or private mode browsing).
  Unavailable,
}

export interface KanjiResult
  extends Omit<KanjiEntryLine, 'rad' | 'comp' | 'm_lang'> {
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
    m: Array<string>;
    m_lang: string;
  }>;
}

export type ChangeTopic = 'stateupdated' | 'deleted';
export type ChangeCallback = (topic: ChangeTopic) => void;

export class KanjiDatabase {
  state: DatabaseState = DatabaseState.Initializing;
  updateState: UpdateState = { state: 'idle', lastCheck: null };
  store: KanjiStore;
  dbVersions: {
    kanjidb: DatabaseVersion | null | undefined;
    bushudb: DatabaseVersion | null | undefined;
  } = { kanjidb: undefined, bushudb: undefined };
  onWarning?: (message: string) => void;
  verbose: boolean = false;

  private preferredLang: string | null = null;
  private readyPromise: Promise<any>;
  private inProgressUpdate: Promise<void> | undefined;
  private radicalsPromise: Promise<Map<string, RadicalRecord>> | undefined;
  private charToRadicalMap: Map<string, string> = new Map();
  private changeListeners: ChangeCallback[] = [];

  constructor({ verbose = false }: { verbose?: boolean } = {}) {
    this.store = new KanjiStore();
    this.verbose = verbose;

    // Fetch initial state
    this.readyPromise = (async () => {
      try {
        const kanjiDbVersion = await this.store.getDbVersion('kanji');
        this.updateDbVersion('kanjidb', kanjiDbVersion);

        const bushuDbVersion = await this.store.getDbVersion('bushu');
        this.updateDbVersion('bushudb', bushuDbVersion);
      } catch (e) {
        console.error('Failed to open IndexedDB');
        console.error(e);

        this.dbVersions = { kanjidb: null, bushudb: null };
        this.state = DatabaseState.Unavailable;

        throw e;
      } finally {
        this.notifyChanged('stateupdated');
      }
    })();

    // Pre-fetch the radical information (but don't block on this)
    this.getRadicals().catch(() => {
      // Ignore errors from pre-fetching. This should only happen when the
      // database is unavailable (which we deal with by notifying the onChange
      // listener). If there is another cause, then we will deal with it
      // next time we call getRadicals().
    });
  }

  get ready() {
    return this.readyPromise;
  }

  addChangeListener(callback: ChangeCallback) {
    if (this.changeListeners.indexOf(callback) !== -1) {
      return;
    }
    this.changeListeners.push(callback);
  }

  removeChangeListener(callback: ChangeCallback) {
    const index = this.changeListeners.indexOf(callback);
    if (index === -1) {
      return;
    }
    this.changeListeners.splice(index, 1);
  }

  private notifyChanged(topic: ChangeTopic) {
    const changeListeners = [...this.changeListeners];
    for (const callback of changeListeners) {
      callback('stateupdated');
    }
  }

  private updateDbVersion(
    db: 'kanjidb' | 'bushudb',
    version: DatabaseVersion | null
  ) {
    if (jsonEqualish(this.dbVersions[db], version)) {
      return;
    }

    this.dbVersions[db] = version;
    if (this.dbVersions.kanjidb === null || this.dbVersions.bushudb === null) {
      this.state = DatabaseState.Empty;
    } else if (
      typeof this.dbVersions.kanjidb !== 'undefined' &&
      typeof this.dbVersions.bushudb !== 'undefined'
    ) {
      this.state = DatabaseState.Ok;
    }

    // Invalidate our cached version of the radical database if we updated it
    if (db === 'bushudb') {
      this.radicalsPromise = undefined;
      this.charToRadicalMap = new Map();
    }

    this.notifyChanged('stateupdated');
  }

  async update() {
    if (this.inProgressUpdate) {
      if (this.verbose) {
        console.log('Detected overlapping updates. Re-using existing update.');
      }
      return this.inProgressUpdate;
    }

    this.inProgressUpdate = (async () => {
      try {
        await this.ready;

        const lang = this.preferredLang || (await this.getDbLang()) || 'en';

        await this.doUpdate({
          dbName: 'kanjidb',
          lang,
          forceFetch: true,
          isEntryLine: isKanjiEntryLine,
          isDeletionLine: isKanjiDeletionLine,
          update: updateKanji,
        });

        await this.doUpdate({
          dbName: 'bushudb',
          lang,
          isEntryLine: isRadicalEntryLine,
          isDeletionLine: isRadicalDeletionLine,
          update: updateRadicals,
        });
      } finally {
        this.inProgressUpdate = undefined;
        this.notifyChanged('stateupdated');
      }
    })();

    return this.inProgressUpdate;
  }

  private async doUpdate<EntryLine, DeletionLine>({
    dbName,
    lang,
    forceFetch = false,
    isEntryLine,
    isDeletionLine,
    update,
  }: {
    dbName: 'bushudb' | 'kanjidb';
    lang: string;
    forceFetch?: boolean;
    isEntryLine: (a: any) => a is EntryLine;
    isDeletionLine: (a: any) => a is DeletionLine;
    update: (options: UpdateOptions<EntryLine, DeletionLine>) => Promise<void>;
  }) {
    let wroteSomething = false;

    const reducer = (action: UpdateAction) => {
      this.updateState = updateReducer(this.updateState, action);
      if (action.type === 'finishdownload') {
        wroteSomething = true;
        this.updateDbVersion(dbName, action.version);
      }
      this.notifyChanged('stateupdated');
    };

    // Check if we have been canceled while waiting to become ready
    if (!this.inProgressUpdate) {
      reducer({ type: 'abort', checkDate: null });
      throw new Error('AbortError');
    }

    const checkDate = new Date();

    try {
      reducer({ type: 'start', dbName });

      if (this.verbose) {
        console.log(
          `Requesting download stream for ${dbName} db with current version ${JSON.stringify(
            this.dbVersions[dbName] || undefined
          )}`
        );
      }

      const downloadStream = await download({
        dbName,
        lang,
        majorVersion:
          dbName === 'kanjidb' ? KANJIDB_MAJOR_VERSION : BUSHUDB_MAJOR_VERSION,
        currentVersion: this.dbVersions[dbName] || undefined,
        forceFetch,
        isEntryLine,
        isDeletionLine,
      });

      if (!this.inProgressUpdate) {
        throw new Error('AbortError');
      }

      await update({
        downloadStream,
        lang,
        store: this.store,
        callback: reducer,
        verbose: this.verbose,
      });

      if (!this.inProgressUpdate) {
        throw new Error('AbortError');
      }

      reducer({ type: 'finish', checkDate });
    } catch (e) {
      if (e?.message === 'AbortError') {
        // We should only update the last-check date if we actually made some
        // sort of update.
        reducer({
          type: 'abort',
          checkDate: wroteSomething ? checkDate : null,
        });
      } else {
        reducer({ type: 'error', dbName, error: e });
      }
      throw e;
    }
  }

  async cancelUpdate(): Promise<boolean> {
    const hadProgressUpdate = !!this.inProgressUpdate;
    this.inProgressUpdate = undefined;

    await cancelUpdate(this.store);

    return hadProgressUpdate;
  }

  async destroy() {
    try {
      await this.ready;
    } catch (e) {
      /* Ignore, we're going to destroy anyway */
    }

    if (this.state !== DatabaseState.Unavailable) {
      // Wait for radicals query to finish before tidying up
      await this.getRadicals();
      await this.store.destroy();
    }

    if (this.verbose && this.inProgressUpdate) {
      console.log('Destroying database while there is an in-progress update');
    }

    this.store = new KanjiStore();
    this.state = DatabaseState.Empty;
    this.updateState = { state: 'idle', lastCheck: null };
    this.dbVersions = { kanjidb: null, bushudb: null };
    this.notifyChanged('deleted');
  }

  getPreferredLang(): string | null {
    return this.preferredLang;
  }

  async setPreferredLang(lang: string | null) {
    if (this.preferredLang === lang) {
      return;
    }

    // Check if the language actually matches the language we already have
    if (lang && lang === (await this.getDbLang())) {
      this.preferredLang = lang;
      return;
    }

    // Make sure the language exists before we clobber the database
    if (
      this.state !== DatabaseState.Empty &&
      this.state !== DatabaseState.Unavailable &&
      lang &&
      (!(await hasLanguage({
        dbName: 'kanjidb',
        lang,
        majorVersion: KANJIDB_MAJOR_VERSION,
      })) ||
        !(await hasLanguage({
          dbName: 'bushudb',
          lang,
          majorVersion: BUSHUDB_MAJOR_VERSION,
        })))
    ) {
      throw new Error(`Version information for language "${lang}" not found`);
    }

    this.preferredLang = lang;

    const hadUpdate = await this.cancelUpdate();

    // If we are empty and didn't have an update in progress, there is no need
    // to clobber the database (and in fact doing so could confuse clients who
    // are simply trying to set the initially preferred language).
    if (this.state !== DatabaseState.Empty || hadUpdate) {
      if (this.verbose) {
        console.log(`Clobbering database to change lang to ${lang}`);
      }
      await this.destroy();
    }

    // We _could_ detect if we had data or had an in-progress update and
    // automatically call update() here in that case, but it seems simpler to
    // just let the client be responsible for deciding if/when they want to
    // update.
  }

  async getDbLang(): Promise<string | null> {
    try {
      await this.ready;
    } catch (e) {
      /* Ignore, we will handle the unavailable state below explicitly. */
    }

    if (
      this.state === DatabaseState.Empty ||
      this.state === DatabaseState.Unavailable
    ) {
      return null;
    }

    return this.dbVersions.kanjidb!.lang;
  }

  async getKanji(kanji: Array<string>): Promise<Array<KanjiResult>> {
    await this.ready;

    if (this.state !== DatabaseState.Ok) {
      return [];
    }

    const lang = (await this.getDbLang())!;

    const ids = kanji.map(kanji => kanji.codePointAt(0)!);
    const kanjiRecords = await this.store.getKanji(ids);

    const radicalResults = await this.getRadicalForKanji(kanjiRecords, lang);
    if (kanjiRecords.length !== radicalResults.length) {
      throw new Error(
        `There should be as many kanji records (${kanjiRecords.length}) as radical blocks (${radicalResults.length})`
      );
    }

    const componentResults = await this.getComponentsForKanji(
      kanjiRecords,
      lang
    );
    if (kanjiRecords.length !== componentResults.length) {
      throw new Error(
        `There should be as many kanji records (${kanjiRecords.length}) as component arrays (${componentResults.length})`
      );
    }

    // Zip the arrays together
    return kanjiRecords.map((record, i) => {
      return {
        ...record,
        c: String.fromCodePoint(record.c),
        m_lang: record.m_lang || lang,
        rad: radicalResults[i],
        comp: componentResults[i],
      };
    });
  }

  private async getRadicalForKanji(
    kanjiRecords: Array<KanjiRecord>,
    lang: string
  ): Promise<Array<KanjiResult['rad']>> {
    const radicals = await this.getRadicals();

    return kanjiRecords.map(record => {
      const radicalVariant = radicals.get(radicalIdForKanji(record));
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
        this.logWarningMessage(
          `Failed to find radical: ${radicalIdForKanji(record)}`
        );
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
      if (record.rad.var) {
        const baseRadical = radicals.get(baseRadicalIdForKanji(record));
        if (baseRadical) {
          const { b, k, na, m, m_lang } = baseRadical;
          rad.base = { b, k, na, m, m_lang: m_lang || lang };
        }
      }

      return rad;
    });
  }

  private async getComponentsForKanji(
    kanjiRecords: Array<KanjiRecord>,
    lang: string
  ): Promise<Array<KanjiResult['comp']>> {
    // Collect all the characters together
    const components = kanjiRecords.reduce<Array<string>>(
      (components, record) =>
        components.concat(record.comp ? [...record.comp] : []),
      []
    );

    // Work out which kanji characters we need to lookup
    const radicalMap = await this.getCharToRadicalMapping();
    const kanjiToLookup = new Set<number>();
    for (const c of components) {
      if (c && !radicalMap.has(c)) {
        kanjiToLookup.add(c.codePointAt(0)!);
      }
    }

    // ... And look them up
    let kanjiMap: Map<string, KanjiRecord> = new Map();
    if (kanjiToLookup.size) {
      const kanjiRecords = await this.store.getKanji([...kanjiToLookup]);
      kanjiMap = new Map(
        kanjiRecords.map(record => [String.fromCodePoint(record.c), record])
      );
    }

    // Now fill out the information
    const radicals = await this.getRadicals();
    const result: Array<KanjiResult['comp']> = [];
    for (const record of kanjiRecords) {
      const comp: KanjiResult['comp'] = [];
      for (const c of record.comp ? [...record.comp] : []) {
        if (radicalMap.has(c)) {
          const radicalRecord = radicals.get(radicalMap.get(c)!);
          if (radicalRecord) {
            comp.push({
              c,
              na: radicalRecord.na,
              m: radicalRecord.m,
              m_lang: radicalRecord.m_lang || lang,
            });
          }
        } else if (kanjiMap.has(c)) {
          const kanjiRecord = kanjiMap.get(c);
          if (kanjiRecord) {
            let na: Array<string> = [];
            if (kanjiRecord.r.kun && kanjiRecord.r.kun.length) {
              na = kanjiRecord.r.kun.map(reading => reading.replace('.', ''));
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
            if (!['en', 'es', 'pt', 'fr'].includes(lang)) {
              this.logWarningMessage(
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
          this.logWarningMessage(
            `Couldn't find a radical or kanji entry for ${c}`
          );
        }
      }

      result.push(comp);
    }

    return result;
  }

  private async getRadicals(): Promise<Map<string, RadicalRecord>> {
    await this.ready;

    if (!this.radicalsPromise) {
      this.radicalsPromise = this.store
        .getAllRadicals()
        .then(records => new Map(records.map(record => [record.id, record])));
    }

    return this.radicalsPromise;
  }

  private async getCharToRadicalMapping(): Promise<Map<string, string>> {
    if (this.charToRadicalMap.size) {
      return this.charToRadicalMap;
    }

    const radicals = await this.getRadicals();

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
        if (radical.b && radical.b !== baseRadical.b) {
          mapping.set(radical.b, radical.id);
        }
        if (radical.k && radical.k !== baseRadical.k) {
          mapping.set(radical.k, radical.id);
        }
      }
    }

    this.charToRadicalMap = mapping;

    return mapping;
  }

  private logWarningMessage(message: string) {
    console.error(message);
    if (this.onWarning) {
      this.onWarning(message);
    }
  }
}

function baseRadicalIdForKanji(record: KanjiRecord): string {
  return record.rad.x.toString().padStart(3, '0');
}

function radicalIdForKanji(record: KanjiRecord): string {
  let id = baseRadicalIdForKanji(record);
  if (record.rad.var) {
    id += `-${record.rad.var}`;
  }
  return id;
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
