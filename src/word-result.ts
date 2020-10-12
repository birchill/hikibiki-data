import { stripFields } from './utils';
import { WordRecord } from './store';
import {
  BITS_PER_GLOSS_TYPE,
  GlossType,
  KanjiMeta,
  ReadingMeta,
  WordSense,
} from './words';

export type WordResult = {
  id: number;
  k: Array<ExtendedKanjiEntry>;
  r: Array<ExtendedKanaEntry>;
  s: Array<ExtendedSense>;
};

export type Gloss = {
  str: string;
  type?: GlossType; // undefined = GlossType.None
};

type ExtendedKanjiEntry = { ent: string; match: boolean } & KanjiMeta;
type ExtendedKanaEntry = { ent: string; match: boolean } & ReadingMeta;
type ExtendedSense = { match: boolean; g: Array<Gloss> } & Omit<
  WordSense,
  'g' | 'gt'
>;

export const enum MatchMode {
  Lexeme,
  Kanji,
}

export function toWordResult(
  record: WordRecord,
  search: string,
  matchMode: MatchMode
): WordResult {
  const [kanjiMatches, kanaMatches, senseMatches] = getMatchMetadata(
    record,
    search,
    matchMode
  );

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
      g: expandGlosses(sense),
      ...stripFields(sense, ['g', 'gt']),
      match: !!(senseMatches & (1 << i)),
    })),
  };
}

function getMatchMetadata(
  record: WordRecord,
  search: string,
  matchMode: MatchMode
): [kanjiMatches: number, kanaMatches: number, senseMatches: number] {
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
  //       -- Have a kapp field, and the corresponding k entry matches,
  //          should match.
  //       -- Have no rapp or kapp field should match.
  //
  // 3) We matched on a hiragana index
  //
  //    -- As above trying (1) first then (2) using the hiragana-converted
  //       term.
  //
  // Because of (3), we just always search both arrays.

  // First build up a bitfield of all kanji matches.
  const kanjiMatcher: (k: string) => boolean =
    matchMode === MatchMode.Lexeme
      ? (k) => k === search
      : (k) => [...k].includes(search);
  let kanjiMatches = arrayToBitfield(record.k || [], kanjiMatcher);

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
  } else if (matchMode !== MatchMode.Kanji) {
    // Case (2) from above: Find kana matches whilst also remembering which
    // kanji they apply to.
    for (const [i, r] of record.r.entries()) {
      if (r === search) {
        kanaMatches = kanaMatches | (1 << i);
        kanjiMatches |= kanjiMatchesForKana(record, i);
      }
    }
    kanaMatches = arrayToBitfield(record.r, (r) => r === search);

    senseMatches = arrayToBitfield(record.s, (sense) => {
      if (typeof sense.rapp !== 'undefined') {
        return !!(sense.rapp & kanaMatches);
      } else if (typeof sense.kapp !== 'undefined') {
        return !!(sense.kapp & kanjiMatches);
      } else {
        return true;
      }
    });
  }

  return [kanjiMatches, kanaMatches, senseMatches];
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

function expandGlosses(sense: WordSense): Array<Gloss> {
  const gt = sense.gt || 0;
  const typeMask = (1 << BITS_PER_GLOSS_TYPE) - 1;
  const glossTypeAtIndex = (i: number): GlossType => {
    return (gt >> (i * BITS_PER_GLOSS_TYPE)) & typeMask;
  };
  return sense.g.map((gloss, i) => {
    // This rather convoluted mess is because our test harness differentiates
    // between properties that are not set and those that are set to
    // undefined.
    const result: Gloss = { str: gloss };
    const type = glossTypeAtIndex(i);
    if (type !== GlossType.None) {
      result.type = type;
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
//
// Sorting
//
// ---------------------------------------------------------------------------

// As with Array.prototype.sort, sorts `results` in-place, but returns the
// result to support chaining.
export function sortResultsByFrequency(
  results: Array<WordResult>
): Array<WordResult> {
  const idToScore: Map<number, number> = new Map();
  for (const result of results) {
    idToScore.set(result.id, getScore(result));
  }
  results.sort((a, b) => {
    const aScore = idToScore.get(a.id)!;
    const bScore = idToScore.get(b.id)!;
    return aScore === bScore ? 0 : aScore > bScore ? -1 : 1;
  });

  return results;
}

export function getScore(result: WordResult): number {
  // Go through each _matching_ kanji / reading and look for priority
  // information and return the highest score.
  const scores: Array<number> = [0];

  // Scores from kanji readings
  for (const k of result.k) {
    if (!k.match || !k.p) {
      continue;
    }

    scores.push(
      k.p.reduce((value, priority) => value + getScoreForPriority(priority), 0)
    );
  }

  // Scores from kana readings
  for (const r of result.r) {
    if (!r.match || !r.p) {
      continue;
    }

    scores.push(
      r.p.reduce((value, priority) => value + getScoreForPriority(priority), 0)
    );
  }

  // Return top score
  return Math.max(...scores);
}

// This assignment is pretty arbitrary. We can tweak it as needed but it's
// only used for sorting entries and generally all we need to do is distinguish
// between the really common ones and the obscure academic ones.
//
// Entries with (P) are those ones that are marked with (P) in Edict.
const SCORE_ASSIGNMENTS: Map<string, number> = new Map([
  ['i1', 50], // Top 10,000 words minus i2 (from 1998) (P)
  ['i2', 20],
  ['n1', 40], // Top on 12,000 words in newspapers (from 2003?) (P)
  ['n2', 20], // Next 12,000
  ['s1', 45], // "Speculative" annotations? Seem pretty common to me. (P)
  ['s2', 30], // (P)
  ['g1', 35], // (P)
  ['g2', 15],
]);

function getScoreForPriority(p: string): number {
  if (SCORE_ASSIGNMENTS.has(p)) {
    return SCORE_ASSIGNMENTS.get(p)!;
  }

  if (p.startsWith('nf')) {
    // The wordfreq scores are groups of 500 words.
    // e.g. nf01 is the top 500 words, and nf48 is the 23,501 ~ 24,000
    // most popular words.
    const wordfreq = parseInt(p.substring(2), 10);
    if (wordfreq > 0 && wordfreq < 48) {
      return 48 - wordfreq;
    }
  }

  return 0;
}
