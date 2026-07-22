# Immich Book

Create beautiful photo books from your [Immich](https://immich.app/) albums.

A web application that generates print-ready photo books from your Immich albums using the official Immich SDK. This is a self-hosted, private fork - it connects to a single Immich server through a server-side proxy (no manual connection screen, no public hosted instance).

## Features

### Connection & Browsing

- Connects to Immich through a server-side proxy (nginx injects the API key; see `nginx.conf.template`) - no credentials ever reach the browser
- Browse and select from all your albums

### Layout & Customization

- Three composition styles per page - **Bento** (varied-size tiles matched to each photo's aspect ratio), **Columns** (Pinterest-style masonry), **Collage** (denser Bento variant) - assigned automatically, overridable per page, with a shuffle control to reroll the arrangement
- Force how many photos land on a given page
- Page dimensions in millimeters, with A4/Square format presets, or fully custom
- Combine pages mode for dual-page spreads
- Per-album configuration with global fallback

### Photo Presentation

- Polaroid-style photo cards (mat, soft shadow, mild tilt, washi tape)
- Drag & drop to reorder photos
- Optional date badge per photo
- Optional user-written caption per photo (only cards with a caption use the extra space)
- LLM-generated page captions from the Immich descriptions of the photos on that page (via a local model, proxied server-side), editable, alternating top/bottom placement

### Preview & Export

- Live preview, automatically scaled to fit the window
- Page break indicator in combined mode
- High-quality PDF export using @react-pdf/renderer

## Getting Started

You will need:

- An Immich server with API access
- An Immich API key with the following permissions:
  - `album.read` - To browse and list albums
  - `asset.read` - To read asset metadata (descriptions, dates, etc.)
  - `asset.view` - To access photo thumbnails for the web preview
  - `asset.download` - To fetch full-resolution originals for the PDF export

### Creating an API Key

1. Log into your Immich instance
2. Go to **Account Settings** → **API Keys**
3. Click **New API Key**
4. Give it a descriptive name (e.g., "Immich Book")
5. Select the required permissions:
   - `album.read`
   - `asset.read`
   - `asset.view`
   - `asset.download`
6. Click **Create**
7. Copy the API key (you won't be able to see it again!)

### Deployment

This fork is meant to be deployed with Docker, behind a reverse proxy that reaches your Immich server on the same internal network:

```bash
git clone <this-repository>
cd immich-book
```

Put your Immich API key in `.env`:

```bash
IMMICH_API_KEY=your-immich-api-key
```

Then build and run:

```bash
docker compose build
docker compose up -d
```

`nginx.conf.template` proxies `/api/` to `immich_server:2283` (adjust the container name/port to match your Immich deployment) and injects `IMMICH_API_KEY` server-side. `docker-compose.yml` sets `VITE_IMMICH_PROXY_TARGET` as a build arg - the app auto-connects through the proxy on load, no manual entry.

If you also want LLM-generated page captions, point the `/llm/` proxy location in `nginx.conf.template` at an OpenAI-compatible chat completions endpoint on your network.

### Using Immich Book

1. **Select an Album** - browse your albums, click one to open it
2. **Configure Page Layout** - page format/dimensions, combine pages, spacing, dates, captions
3. **Adjust individual pages** - switch a page's style (Bento/Columns/Collage), shuffle its arrangement, force its photo count
4. **Customize photos** - drag & drop to reorder, add a per-photo caption
5. **Generate page captions** - click "Generate captions" to have the local LLM summarize each page's photo descriptions, then edit as needed
6. **Generate PDF** - click "Generate PDF" to preview, use the PDF viewer toolbar to download

## Development

```bash
npm install
```

Create a `.env` file pointing at your Immich server (dev mode proxies `/api` through Vite):

```bash
# .env
VITE_IMMICH_PROXY_TARGET=https://your-immich-server.com
```

```bash
npm start           # Dev server at http://localhost:5173
npm run build       # Build for production (output in dist/)
npm run type-check  # Run TypeScript type checking
```

## Acknowledgments

Originally based on [ch1bo/immich-book](https://github.com/ch1bo/immich-book), since substantially rewritten (layout engine, deployment model, captioning).

- [Immich](https://immich.app/) - the self-hosted photo management platform this depends on
- [@react-pdf/renderer](https://react-pdf.org/) - PDF generation

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for the full terms.
