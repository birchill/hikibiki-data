import { jsonEqualish } from '@birchill/json-equalish';

import { DataVersion } from './data-version';
import { hasLanguage, download } from './download';
import {
  KanjiEntryLine,
  Misc,
  Readings,
  isKanjiEntryLine,
  isKanjiDeletionLine,
} from './kanji';
import { isRadicalEntryLine, isRadicalDeletionLine } from './radicals';
import { isNameEntryLine, isNameDeletionLine } from './names';
import { JpdictStore, KanjiRecord, RadicalRecord, NameRecord } from './store';
import { UpdateAction } from './update-actions';
import { UpdateState } from './update-state';
import { reducer as updateReducer } from './update-reducer';
import {
  cancelUpdate,
  updateKanji,
  updateRadicals,
  updateNames,
  UpdateOptions,
} from './update';
import { stripFields } from './utils';

const MAJOR_VERSION: { [series in DataSeries]: number } = {
  kanji: 3,
  radicals: 3,
  names: 1,
};

export const enum DataSeriesState {
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

export type { NameRecord as NameResult };

export class AbortError extends Error {
  constructor(...params: any[]) {
    super(...params);
    Object.setPrototypeOf(this, AbortError.prototype);

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, AbortError);
    }

    this.name = 'AbortError';
  }
}

export type ChangeTopic = 'stateupdated' | 'deleted';
export type ChangeCallback = (topic: ChangeTopic) => void;

export class JpdictDatabase {
  dataState: {
    kanji: DataSeriesState;
    radicals: DataSeriesState;
    names: DataSeriesState;
  } = {
    kanji: DataSeriesState.Initializing,
    radicals: DataSeriesState.Initializing,
    names: DataSeriesState.Initializing,
  };
  dataVersion: {
    kanji: DataVersion | null;
    radicals: DataVersion | null;
    names: DataVersion | null;
  } = {
    kanji: null,
    radicals: null,
    names: null,
  };
  updateState: UpdateState = { state: 'idle', lastCheck: null };
  store: JpdictStore;
  onWarning?: (message: string) => void;
  verbose: boolean = false;

  private preferredLang: string | null = null;
  private readyPromise: Promise<any>;
  private inProgressUpdate: Promise<void> | undefined;
  private updateQueue: Array<DataSeries>;
  private radicalsPromise: Promise<Map<string, RadicalRecord>> | undefined;
  private charToRadicalMap: Map<string, string> = new Map();
  private changeListeners: ChangeCallback[] = [];

  constructor({ verbose = false }: { verbose?: boolean } = {}) {
    this.store = new JpdictStore();
    this.verbose = verbose;

    // Fetch initial state
    this.readyPromise = (async () => {
      try {
        for (const series of [
          <const>'kanji',
          <const>'radicals',
          <const>'names',
        ]) {
          const dataVersion = await this.store.getDataVersion(series);
          this.updateDataVersion(series, dataVersion);
        }
      } catch (e) {
        console.error('Failed to open IndexedDB');
        console.error(e);

        this.dataState = {
          kanji: DataSeriesState.Unavailable,
          radicals: DataSeriesState.Unavailable,
          names: DataSeriesState.Unavailable,
        };
        this.dataVersion = { kanji: null, radicals: null, names: null };

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
      callback(topic);
    }
  }

  private updateDataVersion(series: DataSeries, version: DataVersion | null) {
    if (
      this.dataState[series] !== DataSeriesState.Initializing &&
      this.dataState[series] !== DataSeriesState.Unavailable &&
      jsonEqualish(this.dataVersion[series], version)
    ) {
      return;
    }

    this.dataVersion[series] = version;
    this.dataState[series] = version
      ? DataSeriesState.Ok
      : DataSeriesState.Empty;

    // Invalidate our cached version of the radical database if we updated it
    if (series === 'radicals') {
      this.radicalsPromise = undefined;
      this.charToRadicalMap = new Map();
    }

    this.notifyChanged('stateupdated');
  }

  async update({
    seriesToUpdate,
  }: { seriesToUpdate?: Array<DataSeries> } = {}) {
    const toUpdate = seriesToUpdate || ['kanji', 'radicals'];

    // If we update kanji, we should update the radicals too.
    if (toUpdate.includes('kanji') && !toUpdate.includes('radicals')) {
      toUpdate.push('radicals');
    }

    // Check for an existing update
    if (this.inProgressUpdate) {
      if (this.verbose) {
        console.log('Detected overlapping updates. Re-using existing update.');
      }

      // Append any items not already in the queue.
      for (const series of toUpdate) {
        if (!this.updateQueue.includes(series)) {
          if (this.verbose) {
            console.log(`Adding ${series} to the update queue.`);
          }
          this.updateQueue.push(series);
        }
      }

      return this.inProgressUpdate;
    }

    this.updateQueue = toUpdate;

    this.inProgressUpdate = (async () => {
      try {
        await this.ready;

        // TODO: This needs to take into account the available languages for
        // each data series.
        const lang = this.preferredLang || (await this.getDbLang()) || 'en';

        for (const series of this.updateQueue) {
          switch (series) {
            case 'kanji':
              await this.doUpdate({
                series,
                lang,
                forceFetch: true,
                isEntryLine: isKanjiEntryLine,
                isDeletionLine: isKanjiDeletionLine,
                update: updateKanji,
              });
              break;

            case 'radicals':
              await this.doUpdate({
                series,
                lang,
                forceFetch: true,
                isEntryLine: isRadicalEntryLine,
                isDeletionLine: isRadicalDeletionLine,
                update: updateRadicals,
              });
              break;

            case 'names':
              await this.doUpdate({
                series,
                lang,
                forceFetch: true,
                isEntryLine: isNameEntryLine,
                isDeletionLine: isNameDeletionLine,
                update: updateNames,
              });
              break;
          }
        }

        // Check if we were canceled. If we were, the queue will have been
        // emptied and we may skip the above loop entirely so we need to check
        // here to ensure we produce the correct error reporting.
        if (!this.inProgressUpdate) {
          throw new AbortError();
        }
      } finally {
        this.inProgressUpdate = undefined;
        this.updateQueue = [];
        this.notifyChanged('stateupdated');
      }
    })();

    return this.inProgressUpdate;
  }

  private async doUpdate<EntryLine, DeletionLine>({
    series,
    lang,
    forceFetch = false,
    isEntryLine,
    isDeletionLine,
    update,
  }: {
    series: DataSeries;
    lang: string;
    forceFetch?: boolean;
    isEntryLine: (a: any) => a is EntryLine;
    isDeletionLine: (a: any) => a is DeletionLine;
    update: (options: UpdateOptions<EntryLine, DeletionLine>) => Promise<void>;
  }) {
    let wroteSomething = false;

    const reducer = (action: UpdateAction) => {
      this.updateState = updateReducer(this.updateState, action);
      if (action.type === 'finishpatch') {
        wroteSomething = true;
        this.updateDataVersion(series, action.version);
      }
      this.notifyChanged('stateupdated');
    };

    // Check if we have been canceled while waiting to become ready
    if (!this.inProgressUpdate) {
      reducer({ type: 'error', checkDate: null });
      throw new AbortError();
    }

    const checkDate = new Date();

    try {
      reducer({ type: 'start', series });

      if (this.verbose) {
        console.log(
          `Requesting download stream for ${series} series with current version ${JSON.stringify(
            this.dataVersion[series] || undefined
          )}`
        );
      }

      const downloadStream = await download({
        series,
        lang,
        majorVersion: MAJOR_VERSION[series],
        currentVersion: this.dataVersion[series] || undefined,
        forceFetch,
        isEntryLine,
        isDeletionLine,
      });

      if (!this.inProgressUpdate) {
        throw new AbortError();
      }

      await update({
        downloadStream,
        lang,
        store: this.store,
        callback: reducer,
        verbose: this.verbose,
      });

      if (!this.inProgressUpdate) {
        throw new AbortError();
      }

      reducer({ type: 'finish', checkDate });
    } catch (e) {
      // We should only update the last-check date if we actually made some
      // sort of update.
      reducer({
        type: 'error',
        checkDate: wroteSomething ? checkDate : null,
      });
      throw e;
    }
  }

  async cancelUpdate(): Promise<boolean> {
    this.inProgressUpdate = undefined;
    this.updateQueue = [];

    return await cancelUpdate(this.store);
  }

  async destroy() {
    try {
      await this.ready;
    } catch (e) {
      /* Ignore, we're going to destroy anyway */
    }

    const hasData = ['kanji', 'radicals', 'names'].some(
      (key: DataSeries) => this.dataState[key] !== DataSeriesState.Unavailable
    );
    if (hasData) {
      // Wait for radicals query to finish before tidying up
      await this.getRadicals();
      await this.store.destroy();
    }

    if (this.verbose && this.inProgressUpdate) {
      console.log('Destroying database while there is an in-progress update');
    }

    this.store = new JpdictStore();
    this.dataState = {
      kanji: DataSeriesState.Empty,
      radicals: DataSeriesState.Empty,
      names: DataSeriesState.Empty,
    };
    this.dataVersion = { kanji: null, radicals: null, names: null };
    this.updateState = { state: 'idle', lastCheck: null };
    this.notifyChanged('deleted');
  }

  getPreferredLang(): string | null {
    return this.preferredLang;
  }

  async setPreferredLang(lang: string | null) {
    if (this.preferredLang === lang) {
      return;
    }

    this.preferredLang = lang;

    // Check if the language actually matches the language we already have
    if (lang && lang === (await this.getDbLang())) {
      return;
    }

    const hadUpdate = await this.cancelUpdate();

    // Clobber any data for which there is data for the newly-set language.
    for (const series of [<const>'kanji', <const>'radicals']) {
      // No need to clear the data if it's already empty (unless we had an
      // update in progress that we canceled since that might have left some
      // data there).
      if (this.dataState[series] === DataSeriesState.Empty && !hadUpdate) {
        continue;
      }

      // No need to clear the data if the new target language is not available
      // for this data series.
      if (
        lang &&
        !(await hasLanguage({
          series,
          lang,
          majorVersion: MAJOR_VERSION[series],
        }))
      ) {
        continue;
      }

      if (this.verbose) {
        console.log(`Clobbering ${series} data to change lang to ${lang}`);
      }
      await this.store.clearTable(series);
      this.updateDataVersion(series, null);
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

    // The priority for determining the database language is as follows:
    //
    // 1. Words (superset of all other data series) -- not yet implemented
    // 2. Kanji / Radicals (subset of words, should have the same set of values
    //    and should be kept in sync)
    // 3. Names (only English)
    //
    if (this.dataState.kanji === DataSeriesState.Ok) {
      return this.dataVersion.kanji!.lang;
    }

    if (this.dataState.radicals === DataSeriesState.Ok) {
      return this.dataVersion.radicals!.lang;
    }

    return null;
  }

  async getKanji(kanji: Array<string>): Promise<Array<KanjiResult>> {
    await this.ready;

    if (
      this.dataState.kanji !== DataSeriesState.Ok ||
      this.dataState.radicals !== DataSeriesState.Ok
    ) {
      return [];
    }

    const lang = this.dataVersion.kanji!.lang;

    const ids = kanji.map((kanji) => kanji.codePointAt(0)!);
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

    const relatedResults = await this.getRelatedKanji(kanjiRecords, lang);
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

  private async getRadicalForKanji(
    kanjiRecords: Array<KanjiRecord>,
    lang: string
  ): Promise<Array<KanjiResult['rad']>> {
    const radicals = await this.getRadicals();

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
        this.logWarningMessage(
          `Failed to find radical: ${variantId || baseId}`
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
        kanjiRecords.map((record) => [String.fromCodePoint(record.c), record])
      );
    }

    // Now fill out the information
    const radicals = await this.getRadicals();
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
                this.logWarningMessage(
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
            this.logWarningMessage(`Couldn't find radical record for ${c}`);
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

  private async getRelatedKanji(
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
      const kanjiRecords = await this.store.getKanji([...kanjiToLookup]);
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

  private async getRadicals(): Promise<Map<string, RadicalRecord>> {
    await this.ready;

    if (!this.radicalsPromise) {
      this.radicalsPromise = this.store
        .getAllRadicals()
        .then(
          (records) => new Map(records.map((record) => [record.id, record]))
        );
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

    this.charToRadicalMap = mapping;

    return mapping;
  }

  async getNames(search: string): Promise<Array<NameRecord>> {
    return this.store.getNames(search);
  }

  private logWarningMessage(message: string) {
    console.error(message);
    if (this.onWarning) {
      this.onWarning(message);
    }
  }
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
