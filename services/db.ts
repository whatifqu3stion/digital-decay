import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface DecayDB extends DBSchema {
  images: {
    key: string;
    value: Blob;
  };
  state: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'digital_decay_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DecayDB>>;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<DecayDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images');
        }
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state');
        }
      },
    });
  }
  return dbPromise;
};

export const DBService = {
  async saveImage(key: string, blob: Blob): Promise<void> {
    const db = await getDB();
    await db.put('images', blob, key);
  },

  async getImage(key: string): Promise<Blob | undefined> {
    const db = await getDB();
    return db.get('images', key);
  },

  async clearImages(): Promise<void> {
    const db = await getDB();
    await db.clear('images');
  },

  async saveState(key: string, value: any): Promise<void> {
    const db = await getDB();
    await db.put('state', value, key);
  },

  async getState(key: string): Promise<any> {
    const db = await getDB();
    return db.get('state', key);
  },

  async clearState(): Promise<void> {
    const db = await getDB();
    await db.clear('state');
  },
  
  async getAllKeys(storeName: 'images' | 'state'): Promise<string[]> {
      const db = await getDB();
      // @ts-ignore
      return db.getAllKeys(storeName);
  },

  async resetAll(): Promise<void> {
    const db = await getDB();
    await db.clear('images');
    await db.clear('state');
  }
};
