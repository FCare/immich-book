import { useState, useEffect } from "react";
import { getAllAlbums, type AlbumResponseDto } from "@immich/sdk";
import type { ImmichConfig } from "../types";
import { syncAllAlbums, getAlbumSyncStatus } from "../services/albumSync";
import { albumStorage } from "../db/albumStorage";

interface AlbumSelectorProps {
  immichConfig: ImmichConfig;
  onSelectAlbum: (album: AlbumResponseDto) => void;
}

// Photobooks are stored server-side keyed by album id (see backend/main.py)
// and never automatically expire, so albums deleted in Immich would
// otherwise leave orphaned data behind forever.
async function cleanupOrphanedPhotobooks(currentAlbumIds: Set<string>) {
  const res = await fetch("/photobooks");
  if (!res.ok) return;
  const { albumIds } = (await res.json()) as { albumIds: string[] };

  const orphans = albumIds.filter((id) => !currentAlbumIds.has(id));
  await Promise.all(
    orphans.map((id) =>
      fetch(`/photobooks/${encodeURIComponent(id)}`, { method: "DELETE" }),
    ),
  );
}

function AlbumSelector({ immichConfig, onSelectAlbum }: AlbumSelectorProps) {
  const [albums, setAlbums] = useState<AlbumResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [syncStats, setSyncStats] = useState<Map<string, { missingCount: number; newCount: number }>>(new Map());

  useEffect(() => {
    loadAlbums();
    loadSyncStats();
  }, []);

  const loadSyncStats = async () => {
    try {
      const storedAlbums = await albumStorage.getAllAlbums();
      const stats = new Map<string, { missingCount: number; newCount: number }>();
      
      for (const album of storedAlbums) {
        const syncStatus = await getAlbumSyncStatus(album.id);
        stats.set(album.id, {
          missingCount: syncStatus.missingCount,
          newCount: syncStatus.newCount,
        });
      }
      
      setSyncStats(stats);
    } catch (error) {
      console.error("Failed to load sync stats:", error);
    }
  };

  const loadAlbums = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch both owned and shared albums concurrently
      const [ownedAlbums, sharedAlbums] = await Promise.all([
        getAllAlbums({}),
        getAllAlbums({ shared: true }),
      ]);

      // Combine and deduplicate by album ID using Map
      const allAlbums = [...ownedAlbums, ...sharedAlbums];
      const uniqueAlbums = Array.from(
        new Map(allAlbums.map((album) => [album.id, album])).values(),
      );

      // Sort by most recent asset
      uniqueAlbums.sort((a, b) => {
        if (!a.endDate) {
          return -1;
        }
        if (!b.endDate) {
          return 1;
        }
        return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
      });

      setAlbums(uniqueAlbums);

      // Prune any stored photobook whose Immich album no longer exists
      // (deleted, or this user lost access to it) - fire-and-forget, not
      // worth failing the album list over.
      cleanupOrphanedPhotobooks(new Set(uniqueAlbums.map((a) => a.id))).catch(
        (err) => console.error("Failed to clean up orphaned photobooks:", err),
      );
    } catch (err) {
      const error = err as any;
      let errorMessage = error.message || "Failed to load albums";

      // Check if it's a 401 Unauthorized error
      if (
        error.status === 401 ||
        errorMessage.includes("401") ||
        errorMessage.includes("Unauthorized")
      ) {
        errorMessage = `Authentication failed: ${errorMessage}\n\nYour API key may have been revoked or expired. Please reconnect with a valid API key.`;
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: albums.length });
    
    try {
      const results = await syncAllAlbums(
        albums,
        immichConfig.baseUrl,
        (current, total) => {
          setSyncProgress({ current, total });
        }
      );
      
      // Update sync stats
      await loadSyncStats();
      
      const totalMissing = results.reduce((sum, r) => sum + r.missingCount, 0);
      const totalNew = results.reduce((sum, r) => sum + r.newCount, 0);
      
      alert(`Sync completed!\n${totalNew} new photos\n${totalMissing} missing photos`);
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Sync failed. Check console for details.");
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">
          Loading albums...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto">
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md">
          <p className="text-sm text-red-800 dark:text-red-300 whitespace-pre-line">
            {error}
          </p>
          <button
            onClick={loadAlbums}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm transition-colors shadow-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">
          No albums found in your Immich library.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            Select an Album
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Choose an album to create a photo book ({albums.length} albums found)
          </p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={isSyncing}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={isSyncing ? "animate-spin" : ""}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          {isSyncing ? `Syncing ${syncProgress?.current}/${syncProgress?.total}...` : "Sync All"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {albums.map((album) => (
          <button
            key={album.id}
            onClick={() => onSelectAlbum(album)}
            className="flex flex-col text-left bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-lg shadow-md hover:shadow-lg dark:hover:border-gray-700 transition-shadow overflow-hidden"
          >
            {album.albumThumbnailAssetId ? (
              <div className="h-48 bg-gray-200 dark:bg-gray-800 relative overflow-hidden">
                <img
                  src={`${immichConfig.baseUrl}/assets/${album.albumThumbnailAssetId}/thumbnail?size=preview`}
                  alt={album.albumName}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="h-48 bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                <svg
                  className="w-12 h-12 text-gray-400 dark:text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-50 truncate">
                {album.albumName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {album.assetCount} {album.assetCount === 1 ? "photo" : "photos"}
                </p>
                {syncStats.has(album.id) && (
                  <>
                    {syncStats.get(album.id)!.newCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        +{syncStats.get(album.id)!.newCount} new
                      </span>
                    )}
                    {syncStats.get(album.id)!.missingCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        {syncStats.get(album.id)!.missingCount} missing
                      </span>
                    )}
                  </>
                )}
              </div>
              {album.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                  {album.description}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AlbumSelector;
