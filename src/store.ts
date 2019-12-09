import { DBSchema, deleteDB, IDBPDatabase, IDBPTransaction, openDB } from 'idb';

import { RadicalEntryLine, RadicalDeletionLine } from './bushudb';
import { DatabaseVersion } from './common';
import { KanjiEntryLine, KanjiDeletionLine } from './kanjidb';
import { stripFields } from './utils';

// Define a variant on KanjiEntryLine that turns 'c' into a number
export interface KanjiRecord extends Omit<KanjiEntryLine, 'c'> {
  c: number;
}

export function toKanjiRecord(entry: KanjiEntryLine): KanjiRecord {
  return {
    ...entry,
    c: entry.c.codePointAt(0) as number,
  };
}

export function getIdForKanjiRecord(entry: KanjiDeletionLine): number {
  return entry.c.codePointAt(0) as number;
}

export type RadicalRecord = RadicalEntryLine;

export function toRadicalRecord(entry: RadicalEntryLine): RadicalRecord {
  return entry;
}

export function getIdForRadicalRecord(entry: RadicalDeletionLine): string {
  return entry.id;
}

export interface DatabaseVersionRecord extends DatabaseVersion {
  id: 1 | 2;
}

interface KanjiSchema extends DBSchema {
  kanji: {
    key: number;
    value: KanjiRecord;
    indexes: {
      'r.on': Array<string>;
      'r.kun': Array<string>;
      'r.na': Array<string>;
      'rad.x': number;
      'misc.kk': number;
      'misc.gr': number;
      'misc.jlpt': number;
    };
  };
  bushu: {
    key: string;
    value: RadicalRecord;
    indexes: {
      r: number;
      b: string;
      k: string;
      na: Array<string>;
    };
  };
  dbVersion: {
    key: number;
    value: DatabaseVersionRecord;
  };
}

export class KanjiStore {
  private state: 'idle' | 'opening' | 'open' | 'error' | 'deleting' = 'idle';
  private db: IDBPDatabase<KanjiSchema> | undefined;
  private openPromise: Promise<IDBPDatabase<KanjiSchema>> | undefined;
  private deletePromise: Promise<void> | undefined;

  async open(): Promise<IDBPDatabase<KanjiSchema>> {
    if (this.state === 'open') {
      return this.db!;
    }

    if (this.state === 'opening') {
      return this.openPromise!;
    }

    if (this.state === 'deleting') {
      throw new Error(
        'Trying to open a database while it is still being deleted'
      );
    }

    this.state = 'opening';

    this.openPromise = openDB<KanjiSchema>('KanjiStore', 1, {
      upgrade(
        db: IDBPDatabase<KanjiSchema>,
        oldVersion: number,
        newVersion: number | null,
        transaction: IDBPTransaction<KanjiSchema>
      ) {
        const kanjiTable = db.createObjectStore<'kanji'>('kanji', {
          keyPath: 'c',
        });
        kanjiTable.createIndex('r.on', 'r.on', { multiEntry: true });
        kanjiTable.createIndex('r.kun', 'r.kun', { multiEntry: true });
        kanjiTable.createIndex('r.na', 'r.na', { multiEntry: true });
        kanjiTable.createIndex('rad.x', 'rad.x');
        kanjiTable.createIndex('misc.kk', 'misc.kk');
        kanjiTable.createIndex('misc.gr', 'misc.gr');
        kanjiTable.createIndex('misc.jlpt', 'misc.jlpt');

        const bushuTable = db.createObjectStore<'bushu'>('bushu', {
          keyPath: 'id',
        });
        bushuTable.createIndex('r', 'r');
        bushuTable.createIndex('b', 'b');
        bushuTable.createIndex('k', 'k');
        bushuTable.createIndex('na', 'na', { multiEntry: true });

        db.createObjectStore<'dbVersion'>('dbVersion', {
          keyPath: 'id',
        });
      },
      blocked() {
        // TODO: At very least we should be logging this
      },
      blocking() {
        // TODO: At very least we should be logging this
      },
    }).then(db => {
      this.db = db;
      this.state = 'open';
      return db;
    });

    try {
      await this.openPromise;
    } catch (e) {
      this.state = 'error';
      throw e;
    } finally {
      // This is not strictly necessary, but it doesn't hurt.
      this.openPromise = undefined;
    }

    return this.db!;
  }

  async destroy() {
    if (this.state === 'idle') {
      return;
    }

    if (this.state === 'deleting') {
      return this.deletePromise;
    }

    if (this.state === 'opening') {
      await this.openPromise;
    }

    this.state = 'deleting';

    // For error / open

    this.deletePromise = deleteDB('KanjiStore', {
      blocked() {
        // TODO: Log this
      },
    }).then(() => {
      this.db = undefined;
      this.openPromise = undefined;
    });

    await this.deletePromise;

    this.deletePromise = undefined;
  }

  async getDbVersion(db: 'kanji' | 'bushu'): Promise<DatabaseVersion | null> {
    await this.open();

    const key = db === 'kanji' ? 1 : 2;
    const versionDoc = await this.db!.get('dbVersion', key);
    if (!versionDoc) {
      return null;
    }

    return stripFields(versionDoc, ['id']);
  }

  async getKanji(kanji: Array<number>): Promise<Array<KanjiRecord>> {
    await this.open();

    const result: Array<KanjiRecord> = [];
    {
      const tx = this.db!.transaction('kanji');
      for (const c of kanji) {
        const record = await tx.store.get(c);
        if (record) {
          result.push(record);
        }
      }
      await tx.done;
    }

    return result;
  }

  async getAllRadicals(): Promise<Array<RadicalRecord>> {
    await this.open();

    return this.db!.getAll('bushu');
  }

  async bulkUpdateTable<Name extends 'kanji' | 'bushu'>({
    table,
    put,
    drop,
    version,
  }: {
    table: Name;
    put: Array<KanjiSchema[Name]['value']>;
    drop: Array<KanjiSchema[Name]['key']> | '*';
    version: DatabaseVersion;
  }) {
    const tx = this.db!.transaction([table, 'dbVersion'], 'readwrite');
    const targetTable = tx.objectStore(table);

    if (drop === '*') {
      await targetTable.clear();
    } else {
      for (const id of drop) {
        // We could possibly skip waiting on the result of this like we do
        // below, but we don't normally delete a lot of records so it seems
        // safest to wait for now.
        await targetTable.delete(id);
      }
    }

    for (const record of put) {
      // The important thing here is NOT to wait on the result of put.
      // This speeds up the operation by an order of magnitude or two and
      // is basically Dexie's secret sauce.
      //
      // See: https://jsfiddle.net/birtles/vx4urLkw/17/
      targetTable.put(record);
    }

    const dbVersionTable = tx.objectStore('dbVersion');
    dbVersionTable.put({
      id: table === 'kanji' ? 1 : 2,
      ...version,
    });

    await tx.done;
  }
}
