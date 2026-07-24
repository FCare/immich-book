/**
 * Album synchronization service
 * Handles syncing between Immich API and local IndexedDB storage
 */

import { albumStorage, StoredAlbum, StoredAsset, SyncState } from "../db/albumStorage";

export interface AlbumResponseDto {
  id: string;
  albumName: string;
  description: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
}

export interface AssetResponseDto {
  id: string;
  type: string;
  originalFileName: string;
  localDateTime: string;
  fileCreatedAt: string;
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

export interface SyncResult {
  success: boolean;
  albumId: string;
  missingCount: number;
  newCount: number;
  error?: string;
}

/**
 * Fetch album details with all assets from Immich API
 */
async function fetchAlbumFromImmich(
  albumId: string,
  baseUrl: string,
): Promise<{ album: AlbumResponseDto; assets: AssetResponseDto[] }> {
  const response = await fetch(`${baseUrl}/albums/${albumId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch album: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    album: {
      id: data.id,
      albumName: data.albumName,
      description: data.description || "",
      assetCount: data.assetCount,
      albumThumbnailAssetId: data.albumThumbnailAssetId,
    },
    assets: data.assets || [],
  };
}

/**
 * Sync an album from Immich to local storage
 */
export async function syncAlbum(
  albumId: string,
  baseUrl: string,
): Promise<SyncResult> {
  try {
    // Fetch current state from Immich
    const { album, assets } = await fetchAlbumFromImmich(albumId, baseUrl);

    // Get existing local copy if any
    const existingAlbum = await albumStorage.getAlbum(albumId);

    // Map of current remote assets by ID
    const remoteAssetMap = new Map(assets.map((a) => [a.id, a]));

    // Detect changes
    const missingAssetIds: string[] = [];
    const newAssetIds: string[] = [];

    if (existingAlbum) {
      // Check for missing assets (present locally but not in remote)
      for (const localAsset of existingAlbum.assets) {
        if (!remoteAssetMap.has(localAsset.id)) {
          missingAssetIds.push(localAsset.id);
        }
      }

      // Check for new assets (present in remote but not locally)
      const localAssetMap = new Map(
        existingAlbum.assets.map((a) => [a.id, a]),
      );
      for (const remoteAsset of assets) {
        if (!localAssetMap.has(remoteAsset.id)) {
          newAssetIds.push(remoteAsset.id);
        }
      }
    } else {
      // First sync - all assets are new
      newAssetIds.push(...assets.map((a) => a.id));
    }

    // Create stored assets with status
    const storedAssets: StoredAsset[] = assets.map((asset) => {
      let status: "present" | "missing" | "new" = "present";
      if (newAssetIds.includes(asset.id)) {
        status = "new";
      }
      return {
        id: asset.id,
        type: asset.type,
        originalFileName: asset.originalFileName,
        localDateTime: asset.localDateTime,
        fileCreatedAt: asset.fileCreatedAt,
        status,
        exifInfo: asset.exifInfo,
      };
    });

    // Add missing assets as placeholders
    if (existingAlbum) {
      for (const missingId of missingAssetIds) {
        const localAsset = existingAlbum.assets.find((a) => a.id === missingId);
        if (localAsset) {
          storedAssets.push({
            ...localAsset,
            status: "missing",
          });
        }
      }
    }

    // Save to local storage
    const storedAlbum: StoredAlbum = {
      id: album.id,
      albumName: album.albumName,
      description: album.description,
      assetCount: album.assetCount,
      assets: storedAssets,
      lastSyncedAt: Date.now(),
      albumThumbnailAssetId: album.albumThumbnailAssetId,
    };

    await albumStorage.saveAlbum(storedAlbum);

    // Save sync state
    const syncState: SyncState = {
      albumId: album.id,
      lastSyncedAt: Date.now(),
      missingAssetIds,
      newAssetIds,
    };

    await albumStorage.saveSyncState(syncState);

    return {
      success: true,
      albumId: album.id,
      missingCount: missingAssetIds.length,
      newCount: newAssetIds.length,
    };
  } catch (error) {
    console.error("Sync failed:", error);
    return {
      success: false,
      albumId,
      missingCount: 0,
      newCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sync all albums from Immich
 */
export async function syncAllAlbums(
  albums: AlbumResponseDto[],
  baseUrl: string,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (let i = 0; i < albums.length; i++) {
    if (onProgress) {
      onProgress(i + 1, albums.length);
    }
    const result = await syncAlbum(albums[i].id, baseUrl);
    results.push(result);
  }

  return results;
}

/**
 * Get sync status for an album
 */
export async function getAlbumSyncStatus(albumId: string): Promise<{
  isSynced: boolean;
  lastSyncedAt: number | null;
  missingCount: number;
  newCount: number;
}> {
  const syncState = await albumStorage.getSyncState(albumId);

  if (!syncState) {
    return {
      isSynced: false,
      lastSyncedAt: null,
      missingCount: 0,
      newCount: 0,
    };
  }

  return {
    isSynced: true,
    lastSyncedAt: syncState.lastSyncedAt,
    missingCount: syncState.missingAssetIds.length,
    newCount: syncState.newAssetIds.length,
  };
}
