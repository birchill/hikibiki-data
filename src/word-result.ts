import { WordRecord } from './store';
import { KanjiMeta, ReadingMeta, WordSense } from './words';

export type WordResult = {
  id: number;
  k: Array<ExtendedKanjiEntry>;
  r: Array<ExtendedKanaEntry>;
  s: Array<ExtendedSense>;
};

type ExtendedKanjiEntry = { ent: string; match: boolean } & KanjiMeta;
type ExtendedKanaEntry = { ent: string; match: boolean } & ReadingMeta;
type ExtendedSense = { match: boolean } & WordSense;

export function toWordResult(record: WordRecord, search: string): WordResult {
  // The hard part here is marking which parts of the result matched.
  //
  // There are three cases:
  //
  // 1) We matched on a kanji entry
  //
  //    -- All k entries that exactly match `search` should match.
  //    -- All r entries that apply to the k entry should match.
  //       (i.e. no app field or one that matches).
  //    -- All s entries that:
  //       -- Have a kapp field, and it matches, should match.
  //       -- Have only a rapp field, and the corresponding r entry matches,
  //          should match.
  //       -- Have no kapp or rapp field should match.
  //
  // 2) We matched on a reading (kana) entry
  //
  //    -- All r entries that exactly match `search` should match.
  //    -- All k entries to which the matching r entries apply should match.
  //    -- All s entries that:
  //       -- Have a rapp field, and the corresponding r entry matches,
  //          should match.
  //       -- Have no rapp field should match.
  //
  // 3) We matched on a hiragana index
  //
  //    -- As above trying (1) first then (2) using the hiragana-converted
  //       term.
  //
  // Because of (3), we just always search both arrays.

  // First build up a bitfield of all kanji matches.
  let kanjiMatches = arrayToBitfield(record.k || [], (k) => k === search);

  let kanaMatches = 0;
  let senseMatches = 0;
  if (kanjiMatches) {
    // Case (1) from above: Find corresponding kana matches
    const kanaIsMatch = (rm: ReadingMeta | null) =>
      !rm || typeof rm.app === 'undefined' || !!(rm.app & kanjiMatches);

    kanaMatches = arrayToBitfield(
      // We need to extend the rm array with nulls so that any readings without
      // meta fields are treated as applying to all kanji.
      extendWithNulls(record.rm || [], record.r.length),
      kanaIsMatch
    );

    senseMatches = arrayToBitfield(record.s, (sense) => {
      if (typeof sense.kapp !== 'undefined') {
        return !!(sense.kapp & kanjiMatches);
      } else if (typeof sense.rapp !== 'undefined') {
        return !!(sense.rapp & kanaMatches);
      } else {
        return true;
      }
    });
  } else {
    // Case (2) from above: Find kana matches whilst also remembering which
    // kanji they apply to.
    for (const [i, r] of record.r.entries()) {
      if (r === search) {
        kanaMatches = kanaMatches | (1 << i);
        kanjiMatches |= kanjiMatchesForKana(record, i);
      }
    }
    kanaMatches = arrayToBitfield(record.r, (r) => r === search);

    senseMatches = arrayToBitfield(
      record.s,
      (sense) =>
        typeof sense.rapp === 'undefined' || !!(sense.rapp & kanaMatches)
    );
  }

  return {
    id: record.id,
    k: mergeMeta(record.k, record.km, kanjiMatches, (key, match, meta) => ({
      ent: key,
      ...meta,
      match,
    })),
    r: mergeMeta(record.r, record.rm, kanaMatches, (key, match, meta) => ({
      ent: key,
      ...meta,
      match,
    })),
    s: record.s.map((sense, i) => ({
      ...sense,
      match: !!(senseMatches & (1 << i)),
    })),
  };
}

function kanjiMatchesForKana(record: WordRecord, i: number) {
  // A wild-card match is a bitfield with length equal to that of the kanji
  // array with all bits set to 1.
  const wildCardMatch = (1 << (record.k || []).length) - 1;

  if (!record.rm || record.rm.length < i + 1) {
    return wildCardMatch;
  }

  return record.rm[i]!.app ?? wildCardMatch;
}

function arrayToBitfield<T>(arr: Array<T>, test: (elem: T) => boolean): number {
  return arr.reduce(
    (value, elem, i) => (test(elem) ? value | (1 << i) : value),
    0
  );
}

function mergeMeta<MetaType extends KanjiMeta | ReadingMeta, MergedType>(
  keys: Array<string> | undefined,
  meta: Array<null | MetaType> | undefined,
  matches: number,
  merge: (key: string, match: boolean, meta?: MetaType) => MergedType
): Array<MergedType> {
  const result: Array<MergedType> = [];

  for (const [i, key] of (keys || []).entries()) {
    const match = !!(matches & (1 << i));
    if (meta && meta.length >= i + 1 && meta[i] !== null) {
      result.push(merge(key, match, meta[i]!));
    } else {
      result.push(merge(key, match));
    }
  }

  return result;
}

function extendWithNulls<T>(
  arr: Array<T | null>,
  len: number
): Array<T | null> {
  const extra = Math.max(len - arr.length, 0);
  return arr.concat(Array(extra).fill(null));
}
