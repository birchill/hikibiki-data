export type DataSeries = 'kanji' | 'radicals' | 'names';

export const allDataSeries: ReadonlyArray<DataSeries> = [
  'kanji',
  'radicals',
  'names',
];

// For certain interface actions we lump kanji and radicals together.
// e.g. If you want to update the kanji data set, you need to update the
// radicals too since we cross-reference the two.
export type MajorDataSeries = 'kanji' | 'names';
