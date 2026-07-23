import { useState, useEffect } from "react";
import {
  setBaseUrl,
  getAlbumInfo,
  type AlbumResponseDto,
} from "@immich/sdk";
import AlbumSelector from "./components/AlbumSelector";
import PhotoGrid from "./components/PhotoGrid";
import type { ImmichConfig } from "./types";

function App() {
  const [immichConfig, setImmichConfig] = useState<ImmichConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumResponseDto | null>(
    null,
  );
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(false);

  // Theme is a pure display preference with nothing to sync server-side
  // (Immich itself doesn't expose one via its API - it's a local-only
  // browser setting there too), so plain localStorage is the right home
  // for it, same as Immich's own web client.
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("immich-book-dark-mode");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("immich-book-dark-mode", String(darkMode));
  }, [darkMode]);

  // Check for reset parameter in URL to clear localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "true") {
      console.log("Clearing all localStorage data...");
      localStorage.clear();
      // Remove the parameter from URL, preserve hash
      const hash = window.location.hash;
      window.history.replaceState({}, "", window.location.pathname + hash);
      window.location.reload();
    }
  }, []);

  // Connect through the proxy - nginx injects the Immich API key
  // server-side (see nginx.conf.template), no per-user setup needed.
  useEffect(() => {
    const proxyTarget = import.meta.env.VITE_IMMICH_PROXY_TARGET;
    if (!proxyTarget) {
      setConfigError(
        "VITE_IMMICH_PROXY_TARGET is not set - check the docker-compose build args.",
      );
      return;
    }
    // No apiKey set here on purpose: the SDK would attach it as an
    // x-api-key header, which Traefik forwards to Voight-Kampff's
    // forwardAuth and which then takes priority over (and breaks) the
    // valid vk_session cookie. nginx injects the real Immich key
    // server-side instead (see nginx.conf.template).
    const config: ImmichConfig = {
      serverUrl: proxyTarget,
      apiKey: "",
      baseUrl: "/api",
    };
    setBaseUrl(config.baseUrl);
    setImmichConfig(config);
  }, []);

  // Load album from URL hash if specified
  useEffect(() => {
    if (!immichConfig) return;

    const loadAlbumFromHash = () => {
      const hash = window.location.hash;

      // Extract album ID from hash like #/albums/<id>
      const albumsMatch = hash.match(/#\/albums\/([^/]+)/);
      const albumId = albumsMatch ? albumsMatch[1] : null;

      if (albumId) {
        // Only load if different from current
        if (!selectedAlbum || selectedAlbum.id !== albumId) {
          setIsLoadingAlbum(true);
          getAlbumInfo({ id: albumId })
            .then((album) => {
              setSelectedAlbum(album);
            })
            .catch((err) => {
              console.error("Failed to load album from URL:", err);
              // Clear invalid album ID from hash - go back to album list
              window.location.hash = "";
              setSelectedAlbum(null);
            })
            .finally(() => {
              setIsLoadingAlbum(false);
            });
        }
      } else {
        // No album in hash, clear selection
        if (selectedAlbum) {
          setSelectedAlbum(null);
        }
      }
    };

    // Load on mount
    loadAlbumFromHash();

    // Handle hash changes (browser back/forward, manual hash changes)
    const handleHashChange = () => {
      loadAlbumFromHash();
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [immichConfig]);

  const handleAlbumSelect = (album: AlbumResponseDto) => {
    setSelectedAlbum(album);
    // Update hash to #/albums/<id>
    window.location.hash = `/albums/${album.id}`;
  };

  const handleBackToAlbums = () => {
    setSelectedAlbum(null);
    // Clear hash to go back to album list
    window.location.hash = "";
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
              Immich Book
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create photo books from your Immich albums
            </p>
          </div>
          <button
            onClick={() => setDarkMode((prev) => !prev)}
            className="flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 text-xs font-semibold transition-colors"
            title="Toggle dark mode"
          >
            <span className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
              {darkMode ? (
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              )}
            </span>
            {darkMode ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {configError ? (
          <div className="max-w-md mx-auto p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-300">
              {configError}
            </p>
          </div>
        ) : !immichConfig || isLoadingAlbum ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              {immichConfig ? "Loading album..." : "Connecting..."}
            </p>
          </div>
        ) : !selectedAlbum ? (
          <AlbumSelector
            immichConfig={immichConfig}
            onSelectAlbum={handleAlbumSelect}
          />
        ) : (
          <PhotoGrid
            immichConfig={immichConfig}
            album={selectedAlbum}
            onBack={handleBackToAlbums}
          />
        )}
      </main>
    </div>
  );
}

export default App;
