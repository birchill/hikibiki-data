import { isArrayOfStrings } from './utils';

export interface NameEntryLine {
  id: number;
  // Kanji readings
  k?: Array<string>;
  // Kana readings
  r: Array<string>;
  tr: Array<NameTranslation>;
}

export interface NameTranslation {
  // The type(s) for this entry. This can be missing (e.g. ノコノコ).
  type?: Array<NameType>;
  // The translation text itself.
  det: Array<string>;
  // Cross-references to other entries (in the form of an arbitrary string of
  // Japanese text).
  cf?: Array<string>;
}

export type NameType =
  | 'surname'
  | 'place'
  | 'unclass'
  | 'company'
  | 'product'
  | 'work'
  | 'masc'
  | 'fem'
  | 'person'
  | 'given'
  | 'station'
  | 'org'
  | 'ok';

export const allNameTypes: ReadonlyArray<NameType> = [
  'surname',
  'place',
  'unclass',
  'company',
  'product',
  'work',
  'masc',
  'fem',
  'person',
  'given',
  'station',
  'org',
  'ok',
];

export function isNameType(a: unknown): a is NameType {
  return typeof a === 'string' && allNameTypes.includes(a as NameType);
}

export interface NameDeletionLine {
  id: number;
  deleted: true;
}

export function isNameEntryLine(a: any): a is NameEntryLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    // id
    typeof a.id === 'number' &&
    (a.id as number) > 0 &&
    Number.isFinite(a.id) &&
    // k
    (typeof a.k === 'undefined' || isArrayOfStrings(a.k)) &&
    // r
    isArrayOfStrings(a.r) &&
    // tr
    Array.isArray(a.tr) &&
    (a.tr as Array<any>).every(isNameTranslation) &&
    // deleted (should NOT be present)
    typeof a.deleted === 'undefined'
  );
}

function isNameTranslation(a: any): a is NameTranslation {
  return (
    typeof a === 'object' &&
    a !== null &&
    (typeof a.type === 'undefined' ||
      (isArrayOfStrings(a.type) &&
        (a.type as Array<NameType>).every(isNameType))) &&
    isArrayOfStrings(a.det) &&
    (typeof a.cf === 'undefined' || isArrayOfStrings(a.cf))
  );
}

export function isNameDeletionLine(a: any): a is NameDeletionLine {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof a.id === 'number' &&
    (a.id as number) > 0 &&
    Number.isFinite(a.id) &&
    typeof a.deleted === 'boolean' &&
    a.deleted
  );
}
