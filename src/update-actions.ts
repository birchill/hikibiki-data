import { DatabaseVersion } from './common';

export type StartAction = {
  type: 'start';
  dbName: 'kanjidb' | 'bushudb';
};

export type StartDownloadAction = {
  type: 'startdownload';
  dbName: 'kanjidb' | 'bushudb';
  version: DatabaseVersion;
};

export type ProgressAction = {
  type: 'progress';
  loaded: number;
  total: number;
};

export type FinishDownloadAction = {
  type: 'finishdownload';
  version: DatabaseVersion;
};

export type FinishAction = {
  type: 'finish';
  checkDate: Date;
};

export type ErrorAction = {
  type: 'error';
  checkDate: Date | null;
};

export type UpdateAction =
  | StartAction
  | StartDownloadAction
  | ProgressAction
  | FinishDownloadAction
  | FinishAction
  | ErrorAction;
