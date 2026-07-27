import { useState, useEffect } from "react";
import { getAllAlbums, type AlbumResponseDto } from "@immich/sdk";
import { Settings as SettingsIcon, LogOut } from "lucide-react";
import type { ImmichConfig } from "../types";

interface AlbumSelectorProps {
  immichConfig: ImmichConfig;
  onSelectAlbum: (album: AlbumResponseDto) => void;
  onOpenSettings: () => void;
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

function AlbumSelector({ immichConfig, onSelectAlbum, onOpenSettings }: AlbumSelectorProps) {
  const [albums, setAlbums] = useState<AlbumResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [albumToReset, setAlbumToReset] = useState<AlbumResponseDto | null>(
    null,
  );
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Deletes this user's photobook row for the album (config, page
  // overrides, history) - the Immich album itself is untouched. Selecting
  // the album again afterward starts a brand new photobook from scratch.
  const handleConfirmReset = async () => {
    if (!albumToReset) return;
    setIsResetting(true);
    setResetError(null);
    try {
      const res = await fetch(
        `/photobooks/${encodeURIComponent(albumToReset.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      localStorage.removeItem(`immich-book-history-${albumToReset.id}`);
      setAlbumToReset(null);
    } catch (err) {
      console.error("Failed to reset photobook:", err);
      setResetError(
        (err as Error).message || "Failed to reset photobook",
      );
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, []);

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
        <div className="flex gap-2">
          <button
            onClick={onOpenSettings}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100
              hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Paramètres"
          >
            <SettingsIcon size={24} />
          </button>
          <button
            onClick={() => {
              // Use OAuth end-session endpoint with post_logout_redirect_uri
              const logoutUrl = new URL("https://sso.caronboulme.fr/application/o/photobook/end-session/");
              logoutUrl.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/logged-out`);
              window.location.href = logoutUrl.toString();
            }}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400
              hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Se déconnecter"
          >
            <LogOut size={24} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {albums.map((album) => (
          <div key={album.id} className="relative group">
            <button
              onClick={() => onSelectAlbum(album)}
              className="flex flex-col text-left w-full bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-lg shadow-md hover:shadow-lg dark:hover:border-gray-700 transition-shadow overflow-hidden"
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
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {album.assetCount} {album.assetCount === 1 ? "photo" : "photos"}
                </p>
                {album.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                    {album.description}
                  </p>
                )}
              </div>
            </button>
            {/* Reset this user's photobook for this album - only shown on
                hover so it doesn't compete with the main "select" click
                target for a rarely-used destructive action. */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setResetError(null);
                setAlbumToReset(album);
              }}
              title="Reset photobook"
              aria-label="Reset photobook"
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {albumToReset && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">
              Reset photobook?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This will permanently delete your photobook for{" "}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {albumToReset.albumName}
              </span>{" "}
              - every page, cover, and edit you've made. The Immich album
              itself is untouched. You can start a brand new photobook for
              it right after.
            </p>
            {resetError && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                {resetError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setAlbumToReset(null)}
                disabled={isResetting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors disabled:opacity-50"
              >
                {isResetting ? "Resetting..." : "Reset photobook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AlbumSelector;
