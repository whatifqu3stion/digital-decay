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

let dbPromise: Promise<IDBPDatabase<DecayDB>> | null = null;

const getDB = async (): Promise<IDBPDatabase<DecayDB> | null> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null;
  }
  try {
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
    return await dbPromise;
  } catch (err) {
    console.warn("IndexedDB unavailable or blocked:", err);
    return null;
  }
};

export const DBService = {
  async saveImage(key: string, blob: Blob): Promise<void> {
    try {
      const db = await getDB();
      if (db) await db.put('images', blob, key);
    } catch (e) {
      console.warn("DBService.saveImage failed:", e);
    }
  },

  async getImage(key: string): Promise<Blob | undefined> {
    try {
      const db = await getDB();
      if (db) return await db.get('images', key);
    } catch (e) {
      console.warn("DBService.getImage failed:", e);
    }
    return undefined;
  },

  async clearImages(): Promise<void> {
    try {
      const db = await getDB();
      if (db) await db.clear('images');
    } catch (e) {
      console.warn("DBService.clearImages failed:", e);
    }
  },

  async saveState(key: string, value: any): Promise<void> {
    try {
      const db = await getDB();
      if (db) await db.put('state', value, key);
    } catch (e) {
      console.warn("DBService.saveState failed:", e);
    }
  },

  async getState(key: string): Promise<any> {
    try {
      const db = await getDB();
      if (db) return await db.get('state', key);
    } catch (e) {
      console.warn("DBService.getState failed:", e);
    }
    return undefined;
  },

  async clearState(): Promise<void> {
    try {
      const db = await getDB();
      if (db) await db.clear('state');
    } catch (e) {
      console.warn("DBService.clearState failed:", e);
    }
  },
  
  async getAllKeys(storeName: 'images' | 'state'): Promise<string[]> {
    try {
      const db = await getDB();
      if (db) {
        // @ts-ignore
        return await db.getAllKeys(storeName);
      }
    } catch (e) {
      console.warn("DBService.getAllKeys failed:", e);
    }
    return [];
  },

  async resetAll(): Promise<void> {
    try {
      const db = await getDB();
      if (db) {
        await db.clear('images');
        await db.clear('state');
      }
    } catch (e) {
      console.warn("DBService.resetAll failed:", e);
    }
  }
};
