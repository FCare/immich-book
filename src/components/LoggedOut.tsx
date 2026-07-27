export default function LoggedOut() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <svg
            className="mx-auto h-16 w-16 text-green-500 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Vous êtes déconnecté
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Vous avez été déconnecté avec succès d'Immich Book.
        </p>

        <button
          onClick={() => {
            // Clear all cookies for this domain
            document.cookie.split(';').forEach(c => {
              const name = c.trim().split('=')[0];
              document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=' + window.location.hostname;
              document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
            });
            // Force full page reload without cache
            window.location.href = '/?t=' + Date.now();
          }}
          className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
        >
          Se reconnecter
        </button>

        <p className="mt-6 text-sm text-gray-500 dark:text-gray-500">
          Cliquez sur "Se reconnecter" pour accéder à nouveau à vos albums
        </p>
      </div>
    </div>
  );
}
