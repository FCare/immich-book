# Immich Book

Create beautiful photo books from your [Immich](https://immich.app/) albums.

A web application that generates print-ready photo books from your Immich albums using the official Immich SDK. This is a self-hosted, private fork - it connects to a single Immich server through a server-side proxy (no manual connection screen, no public hosted instance).

## Features

### Connection & Browsing

- Connects to Immich through a server-side proxy (nginx injects the API key; see `nginx.conf.template`) - no credentials ever reach the browser
- Browse and select from all your albums

### Layout & Customization

- Three composition styles per page - **Bento** (varied-size tiles matched to each photo's aspect ratio), **Columns** (Pinterest-style masonry), **Collage** (denser Bento variant) - assigned automatically, overridable per page
- Draggable bento split boundaries with magnetic snap, per-split axis flip, resizable photo frames
- Force how many photos land on a given page
- Page dimensions in millimeters, with A4/Square format presets, or fully custom
- Per-printer profiles (see below) with their own trim sizes, bleed, and page-count constraints
- Per-album configuration with global fallback
- Full undo/redo history of edits

### Photo Presentation

- Polaroid, scrapbook and clean (edge-to-edge) card styles
- Drag & drop to reorder photos, or set a placed photo aside to pull it back into the unplaced list without losing your layout
- Optional date badge per photo
- Optional user-written caption per photo (only cards with a caption use the extra space), and an editable per-page caption band
- Textured or flat page backgrounds, with the background's hex code shown for matching a cover/spine color
- Front/back cover with photo+title, full-bleed, or text-only layouts, and an optional separated cover for printers that need one

### Preview & Export

- Live preview, automatically scaled to fit the window, with a page thumbnail navigation rail (cover/back-cover anchors pinned, scrollable interior pages)
- Printer-accurate bleed ("fond perdu"): bled photos extend past the trim edge so print-shop cutting tolerance never reveals a background sliver
- High-quality PDF export using @react-pdf/renderer

## Getting Started

You will need:

- An Immich server with API access
- An Immich API key with the following permissions:
  - `album.read` - To browse and list albums
  - `asset.read` - To read asset metadata (descriptions, dates, etc.)
  - `asset.view` - To access photo thumbnails, used for both the web
    preview and PDF export

### Creating an API Key

1. Log into your Immich instance
2. Go to **Account Settings** → **API Keys**
3. Click **New API Key**
4. Give it a descriptive name (e.g., "Immich Book")
5. Select the required permissions:
   - `album.read`
   - `asset.read`
   - `asset.view`
6. Click **Create**
7. Copy the API key (you won't be able to see it again!)

### Deployment

This app is meant to be deployed with Docker, behind a reverse proxy that reaches your Immich server on the same internal network.

**Read [INTEGRATION.md](INTEGRATION.md) first** - this app has no authentication of its own and expects a trusted upstream reverse proxy to provide it. Deploying it without that layer means anyone who can reach it has full access to every stored photobook.

```bash
git clone <this-repository>
cd immich-book
cp .env.example .env
```

Fill in `.env` (see `.env.example` for what each variable does):

```bash
IMMICH_API_KEY=your-immich-api-key
IMMICH_SERVER_URL=https://your-immich-server.example.com
EXTERNAL_NETWORK=name-of-your-existing-docker-network
```

Then build and run:

```bash
docker compose build
docker compose up -d
```

`nginx.conf.template` proxies `/api/` to `immich_server:2283` (adjust the container name/port to match your Immich deployment) and injects `IMMICH_API_KEY` server-side. `docker-compose.yml` passes `IMMICH_SERVER_URL` through as the `VITE_IMMICH_PROXY_TARGET` build arg - the app auto-connects through the proxy on load, no manual entry.

### Using Immich Book

1. **Select an Album** - browse your albums, click one to open it
2. **Configure Page Layout** - printer profile, page format/dimensions, spacing, dates, captions
3. **Adjust individual pages** - switch a page's style (Bento/Columns/Collage), drag split boundaries, force its photo count
4. **Customize photos** - drag & drop to reorder, add a per-photo caption, set a photo aside if you're not sure where it belongs yet
5. **Generate PDF** - click "Generate PDF" to preview, use the PDF viewer toolbar to download

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
