import { DBSchema, deleteDB, IDBPDatabase, IDBPTransaction, openDB } from 'idb';

import { DataVersion } from './data-version';
import { KanjiEntryLine, KanjiDeletionLine } from './kanji';
import { RadicalEntryLine, RadicalDeletionLine } from './radicals';
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

export interface DataVersionRecord extends DataVersion {
  id: 1 | 2;
}

interface JpdictSchema extends DBSchema {
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

    this.openPromise = openDB<JpdictSchema>('jpdict', 1, {
      upgrade(
        db: IDBPDatabase<JpdictSchema>,
        oldVersion: number,
        newVersion: number | null,
        transaction: IDBPTransaction<JpdictSchema>
      ) {
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
      },
      blocked() {
        console.log('Opening blocked');
      },
      blocking() {
        if (this.db) {
          this.db.close();
          this.db = undefined;
          this.state = 'idle';
        }
      },
    }).then((db) => {
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
    await this.close();

    this.state = 'deleting';

    this.deletePromise = deleteDB('jpdict', {
      blocked() {
        console.log('Deletion blocked');
      },
    });

    await this.deletePromise;

    this.deletePromise = undefined;
  }

  async getDataVersion(series: DataSeries): Promise<DataVersion | null> {
    await this.open();

    const key = series === 'kanji' ? 1 : 2;
    const versionDoc = await this.db!.get('version', key);
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
    }

    return result;
  }

  async getAllRadicals(): Promise<Array<RadicalRecord>> {
    await this.open();

    return this.db!.getAll('radicals');
  }

  async bulkUpdateTable<Name extends 'kanji' | 'radicals'>({
    table,
    put,
    drop,
    version,
  }: {
    table: Name;
    put: Array<JpdictSchema[Name]['value']>;
    drop: Array<JpdictSchema[Name]['key']> | '*';
    version: DataVersion;
  }) {
    try {
      await this.open();
    } catch (e) {
      throw e;
    }

    const tx = this.db!.transaction([table, 'version'], 'readwrite');
    const targetTable = tx.objectStore(table);

    try {
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
      const putPromises: Array<Promise<JpdictSchema[Name]['key']>> = [];
      for (const record of put) {
        // The important thing here is NOT to wait on the result of put.
        // This speeds up the operation by an order of magnitude or two and
        // is Dexie's secret sauce.
        //
        // See: https://jsfiddle.net/birtles/vx4urLkw/17/
        putPromises.push(targetTable.put(record));
      }
      await Promise.all(putPromises);
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
      await dbVersionTable.put({
        id: table === 'kanji' ? 1 : 2,
        ...version,
      });
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
}
