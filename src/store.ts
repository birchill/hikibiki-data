import {
  DBSchema,
  deleteDB,
  IDBPDatabase,
  IDBPTransaction,
  openDB,
} from 'idb/with-async-ittr';

import { DataSeries } from './data-series';
import { DataVersion } from './data-version';
import { KanjiEntryLine, KanjiDeletionLine } from './kanji';
import { RadicalEntryLine, RadicalDeletionLine } from './radicals';
import { NameEntryLine, NameDeletionLine } from './names';
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

export type NameRecord = NameEntryLine;

export function toNameRecord(entry: NameEntryLine): NameRecord {
  return entry;
}

export function getIdForNameRecord(entry: NameDeletionLine): number {
  return entry.id;
}

export interface DataVersionRecord extends DataVersion {
  id: 1 | 2 | 3;
}

function getVersionKey(series: DataSeries): 1 | 2 | 3 {
  switch (series) {
    case 'kanji':
      return 1;

    case 'radicals':
      return 2;

    case 'names':
      return 3;
  }
}

export interface JpdictSchema extends DBSchema {
  kanji: {
    key: number;
    value: KanjiRecord;
    indexes: {
      'r.on': Array<string>;
      'r.kun': Array<string>;
      'r.na': Array<string>;
    };
  };
  radicals: {
    key: string;
    value: RadicalRecord;
    indexes: {
      r: number;
      b: string;
      k: string;
    };
  };
  names: {
    key: number;
    value: NameRecord;
    indexes: {
      k: Array<string>;
      r: Array<string>;
    };
  };
  version: {
    key: number;
    value: DataVersionRecord;
  };
}

export class JpdictStore {
  private state: 'idle' | 'opening' | 'open' | 'error' | 'deleting' = 'idle';
  private db: IDBPDatabase<JpdictSchema> | undefined;
  private openPromise: Promise<IDBPDatabase<JpdictSchema>> | undefined;
  private deletePromise: Promise<void> | undefined;

  async open(): Promise<IDBPDatabase<JpdictSchema>> {
    if (this.state === 'open') {
      return this.db!;
    }

    if (this.state === 'opening') {
      return this.openPromise!;
    }

    if (this.state === 'deleting') {
      await this.deletePromise!;
    }

    this.state = 'opening';

    const self = this;

    this.openPromise = openDB<JpdictSchema>('jpdict', 2, {
      upgrade(
        db: IDBPDatabase<JpdictSchema>,
        oldVersion: number,
        newVersion: number | null,
        transaction: IDBPTransaction<JpdictSchema>
      ) {
        if (oldVersion < 1) {
          const kanjiTable = db.createObjectStore<'kanji'>('kanji', {
            keyPath: 'c',
          });
          kanjiTable.createIndex('r.on', 'r.on', { multiEntry: true });
          kanjiTable.createIndex('r.kun', 'r.kun', { multiEntry: true });
          kanjiTable.createIndex('r.na', 'r.na', { multiEntry: true });

          const radicalsTable = db.createObjectStore<'radicals'>('radicals', {
            keyPath: 'id',
          });
          radicalsTable.createIndex('r', 'r');
          radicalsTable.createIndex('b', 'b');
          radicalsTable.createIndex('k', 'k');

          db.createObjectStore<'version'>('version', {
            keyPath: 'id',
          });
        }
        if (oldVersion < 2) {
          const namesTable = db.createObjectStore<'names'>('names', {
            keyPath: 'id',
          });
          namesTable.createIndex('k', 'k', { multiEntry: true });
          namesTable.createIndex('r', 'r', { multiEntry: true });
        }
      },
      blocked() {
        console.log('Opening blocked');
      },
      blocking() {
        if (self.db) {
          try {
            self.db.close();
          } catch (_) {}
          self.db = undefined;
          self.state = 'idle';
        }
      },
    }).then((db) => {
      self.db = db;
      self.state = 'open';
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

    // IndexedDB doesn't provide a way to check if a database exists
    // so we just unconditionally try to delete the old database, in case it
    // exists, _every_ _single_ _time_.
    //
    // We don't bother waiting on it or reporting errors, however.
    deleteDB('KanjiStore').catch(() => {});

    return this.db!;
  }

  async close() {
    if (this.state === 'idle') {
      return;
    }

    if (this.state === 'deleting') {
      return this.deletePromise;
    }

    if (this.state === 'opening') {
      await this.openPromise;
    }

    this.db!.close();
    this.db = undefined;
    this.state = 'idle';
  }

  async destroy() {
    if (this.state !== 'idle') {
      await this.close();
    }

    this.state = 'deleting';

    this.deletePromise = deleteDB('jpdict', {
      blocked() {
        console.log('Deletion blocked');
      },
    });

    await this.deletePromise;

    this.deletePromise = undefined;
    this.state = 'idle';
  }

  async clearTable(series: DataSeries) {
    await this.bulkUpdateTable({
      table: series,
      put: [],
      drop: '*',
      version: null,
    });
  }

  async getDataVersion(series: DataSeries): Promise<DataVersion | null> {
    await this.open();

    const key = getVersionKey(series);
    const versionDoc = await this.db!.get('version', key);
    if (!versionDoc) {
      return null;
    }

    return stripFields(versionDoc, ['id']);
  }

  async bulkUpdateTable<Name extends DataSeries>({
    table,
    put,
    drop,
    version,
    onProgress,
  }: {
    table: Name;
    put: Array<JpdictSchema[Name]['value']>;
    drop: Array<JpdictSchema[Name]['key']> | '*';
    version: DataVersion | null;
    onProgress?: (params: { processed: number; total: number }) => void;
  }) {
    await this.open();

    const tx = this.db!.transaction([table, 'version'], 'readwrite');
    const targetTable = tx.objectStore(table);

    // Calculate the total number of records we will process.
    const totalRecords = (drop !== '*' ? drop.length : 0) + put.length;

    try {
      if (drop === '*') {
        await targetTable.clear();
      } else {
        for (const id of drop) {
          // We could possibly skip waiting on the result of this like we do
          // below, but we don't normally delete a lot of records so it seems
          // safest to wait for now.
          //
          // This is also the reason we don't report progress for delete
          // actions.
          await targetTable.delete(id);
        }
      }
    } catch (e) {
      console.log('Error during delete portion of bulk update');
      console.log(JSON.stringify(drop));

      // Ignore the abort from the transaction
      tx.done.catch(() => {});
      try {
        tx.abort();
      } catch (_) {
        // Ignore exceptions from aborting the transaction.
        // This can happen is the transaction has already been aborted by this
        // point.
      }

      throw e;
    }

    try {
      let processed = 0;

      // Batch updates so we can report progress.
      //
      // 4,000 gives us enough granularity when dealing with small data sets
      // like the kanji data (~13k records) while avoiding being too spammy with
      // large data sets like the names data (~740k records).
      const BATCH_SIZE = 4000;
      while (put.length) {
        const batch = put.splice(0, BATCH_SIZE);
        const putPromises: Array<Promise<JpdictSchema[Name]['key']>> = [];
        for (const record of batch) {
          // The important thing here is NOT to wait on the result of put.
          // This speeds up the operation by an order of magnitude or two and
          // is Dexie's secret sauce.
          //
          // See: https://jsfiddle.net/birtles/vx4urLkw/17/
          putPromises.push(targetTable.put(record));
        }
        await Promise.all(putPromises);

        processed += batch.length;
        if (onProgress) {
          onProgress({ processed, total: totalRecords });
        }
      }
    } catch (e) {
      console.log('Error during put portion of bulk update');
      console.log(JSON.stringify(put));

      // Ignore the abort from the transaction
      tx.done.catch(() => {});
      try {
        tx.abort();
      } catch (_) {
        // As above, ignore exceptions from aborting the transaction.
      }

      throw e;
    }

    try {
      const dbVersionTable = tx.objectStore('version');
      const id = getVersionKey(table);
      if (version) {
        await dbVersionTable.put({
          ...version,
          id,
        });
      } else {
        await dbVersionTable.delete(id);
      }
    } catch (e) {
      console.log('Error during version update portion of bulk update');
      console.log(JSON.stringify(version));

      // Ignore the abort from the transaction
      tx.done.catch(() => {});
      try {
        tx.abort();
      } catch (_) {
        // As above, ignore exceptions from aborting the transaction.
      }

      throw e;
    }

    await tx.done;
  }

  // Test API
  async _getKanji(kanji: Array<number>): Promise<Array<KanjiRecord>> {
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
    }

    return result;
  }
}
