import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface SettingsProps {
  onClose: () => void;
}

interface ImmichConfig {
  immichServerUrl: string;
  immichApiKey: string;
}

export default function Settings({ onClose }: SettingsProps) {
  const [immichServerUrl, setImmichServerUrl] = useState("");
  const [immichApiKey, setImmichApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Load current config
    fetch("/user/immich-config")
      .then((res) => {
        if (res.status === 404) {
          // No config yet, use empty values
          setLoading(false);
          return null;
        }
        if (!res.ok) throw new Error("Failed to load config");
        return res.json();
      })
      .then((data: ImmichConfig | null) => {
        if (data) {
          setImmichServerUrl(data.immichServerUrl);
          setImmichApiKey(data.immichApiKey);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!immichServerUrl || !immichApiKey) {
      setError("Veuillez remplir tous les champs");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/user/immich-config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          immichServerUrl,
          immichApiKey,
        }),
      });

      if (!res.ok) {
        throw new Error("Échec de la sauvegarde");
      }

      setSuccess(true);
      setTimeout(() => {
        // Reload the page to use the new config
        window.location.reload();
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Paramètres
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">
            Chargement...
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              <div>
                <label
                  htmlFor="immich-url"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  URL du serveur Immich
                </label>
                <input
                  id="immich-url"
                  type="url"
                  placeholder="https://photos.example.com"
                  value={immichServerUrl}
                  onChange={(e) => setImmichServerUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label
                  htmlFor="api-key"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Clé API Immich
                </label>
                <input
                  id="api-key"
                  type="password"
                  placeholder="Votre clé API Immich"
                  value={immichApiKey}
                  onChange={(e) => setImmichApiKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Créez une clé API dans les paramètres de votre compte Immich
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-sm">
                Configuration sauvegardée ! Rechargement...
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                text-white rounded-md font-medium transition-colors"
            >
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
