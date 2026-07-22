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
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Immich Book</h1>
            <p className="text-sm text-gray-500">
              Create photo books from your Immich albums
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {configError ? (
          <div className="max-w-md mx-auto p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{configError}</p>
          </div>
        ) : !immichConfig || isLoadingAlbum ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">
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
