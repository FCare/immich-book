/**
 * IndexedDB storage for album metadata and sync state
 * Stores local copies of albums and tracks photo changes
 */

const DB_NAME = "immich-book-albums";
const DB_VERSION = 1;
const STORE_ALBUMS = "albums";
const STORE_SYNC_STATE = "syncState";

export interface StoredAlbum {
  id: string;
  albumName: string;
  description: string;
  assetCount: number;
  assets: StoredAsset[];
  lastSyncedAt: number;
  albumThumbnailAssetId: string | null;
}

export interface StoredAsset {
  id: string;
  type: string;
  originalFileName: string;
  localDateTime: string;
  fileCreatedAt: string;
  status: "present" | "missing" | "new";
  exifInfo?: {
    make?: string;
    model?: string;
    description?: string;
    orientation?: string;
    dateTimeOriginal?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

export interface SyncState {
  albumId: string;
  lastSyncedAt: number;
  missingAssetIds: string[];
  newAssetIds: string[];
}

class AlbumStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Albums store
        if (!db.objectStoreNames.contains(STORE_ALBUMS)) {
          const albumStore = db.createObjectStore(STORE_ALBUMS, {
            keyPath: "id",
          });
          albumStore.createIndex("lastSyncedAt", "lastSyncedAt");
        }

        // Sync state store
        if (!db.objectStoreNames.contains(STORE_SYNC_STATE)) {
          const syncStore = db.createObjectStore(STORE_SYNC_STATE, {
            keyPath: "albumId",
          });
          syncStore.createIndex("lastSyncedAt", "lastSyncedAt");
        }
      };
    });
  }

  async saveAlbum(album: StoredAlbum): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ALBUMS], "readwrite");
      const store = transaction.objectStore(STORE_ALBUMS);
      const request = store.put(album);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAlbum(albumId: string): Promise<StoredAlbum | null> {
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ALBUMS], "readonly");
      const store = transaction.objectStore(STORE_ALBUMS);
      const request = store.get(albumId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllAlbums(): Promise<StoredAlbum[]> {
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ALBUMS], "readonly");
      const store = transaction.objectStore(STORE_ALBUMS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAlbum(albumId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ALBUMS], "readwrite");
      const store = transaction.objectStore(STORE_ALBUMS);
      const request = store.delete(albumId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveSyncState(syncState: SyncState): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_SYNC_STATE],
        "readwrite",
      );
      const store = transaction.objectStore(STORE_SYNC_STATE);
      const request = store.put(syncState);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncState(albumId: string): Promise<SyncState | null> {
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SYNC_STATE], "readonly");
      const store = transaction.objectStore(STORE_SYNC_STATE);
      const request = store.get(albumId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_ALBUMS, STORE_SYNC_STATE],
        "readwrite",
      );

      const albumStore = transaction.objectStore(STORE_ALBUMS);
      const syncStore = transaction.objectStore(STORE_SYNC_STATE);

      const clearAlbums = albumStore.clear();
      const clearSync = syncStore.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Singleton instance
export const albumStorage = new AlbumStorage();
