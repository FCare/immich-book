import { useState, useEffect, useMemo, useRef } from "react";
import {
  getAlbumInfo,
  type AlbumResponseDto,
  type AssetResponseDto,
} from "@immich/sdk";
import {
  pdf,
  Document,
  Page,
  Image,
  View,
  Text,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import {
  calculatePageLayout,
  mmToPixels,
  pixelsToMm,
} from "../utils/pageLayout";
import type { ImmichConfig } from "../types";
import roboto400 from "@fontsource/roboto/files/roboto-latin-400-normal.woff?url";
import roboto500 from "@fontsource/roboto/files/roboto-latin-500-normal.woff?url";
import caveat500 from "@fontsource/caveat/files/caveat-latin-500-normal.woff?url";
import caveat600 from "@fontsource/caveat/files/caveat-latin-600-normal.woff?url";

// Register fonts for PDF using local bundled files
Font.register({
  family: "Roboto",
  fonts: [
    { src: roboto400, fontWeight: 400 },
    { src: roboto500, fontWeight: 500 },
  ],
});
Font.register({
  family: "Caveat",
  fonts: [
    { src: caveat500, fontWeight: 500 },
    { src: caveat600, fontWeight: 600 },
  ],
});

// Scrapbook styling tokens: each photo is mounted like a polaroid, mildly
// askew, held down by a scrap of washi tape - a deliberate alternative to a
// flat, uncropped photo grid.
const SCRAPBOOK = {
  mat: "#FFFEFC",
  ink: "#2B3A4A",
  shadow: "rgba(38, 41, 46, 0.24)",
  tape: ["#C7D3BE", "#DCC9B6", "#C2CFDE"],
};

// Page background presets - decorated "paper" instead of flat white, kept
// in the same warm/muted family as the polaroid mat and tape. "blob" is an
// organic mottled-paper texture (soft off-color patches); "dots" is a fine
// grid, both applied over the base color. "white" renders no texture at
// all, so it's free to pick as a no-op default.
type BackgroundTexture = "none" | "blob" | "dots" | "lines" | "grid" | "speckle";

type PageBackground =
  | "white"
  | "kraft"
  | "cream"
  | "sage"
  | "dusk-blue"
  | "blush"
  | "charcoal"
  | "dots"
  | "sage-dots"
  | "blue-dots"
  | "blush-dots"
  | "notebook"
  | "kraft-lines"
  | "graph"
  | "confetti";

const PAGE_BACKGROUNDS: Record<
  PageBackground,
  { label: string; base: string; texture: BackgroundTexture; accent: string }
> = {
  white: { label: "White", base: "#FFFFFF", texture: "none", accent: "" },

  // Mottled paper grain - same organic blob positions (PAGE_BACKGROUND_BLOBS)
  // at different colors, so they read as one paper family, not unrelated
  // patterns.
  kraft: { label: "Kraft paper", base: "#C9A97E", texture: "blob", accent: "#8A6B41" },
  cream: { label: "Cream cardstock", base: "#F8F1E4", texture: "blob", accent: "#D6C4A1" },
  sage: { label: "Sage paper", base: "#E7ECDF", texture: "blob", accent: "#7F9468" },
  "dusk-blue": { label: "Dusk blue paper", base: "#E5EBF3", texture: "blob", accent: "#6E85A8" },
  blush: { label: "Blush paper", base: "#F6E9E5", texture: "blob", accent: "#C4897A" },
  charcoal: { label: "Charcoal paper", base: "#E9E6E1", texture: "blob", accent: "#6B6156" },

  // Fine dot grid, planner/bullet-journal style.
  dots: { label: "Dot grid", base: "#FBF7EF", texture: "dots", accent: SCRAPBOOK.ink },
  "sage-dots": { label: "Sage dot grid", base: "#EFF3EA", texture: "dots", accent: "#6F8259" },
  "blue-dots": { label: "Blue dot grid", base: "#EAF0F8", texture: "dots", accent: "#52709A" },
  "blush-dots": { label: "Blush dot grid", base: "#FBEFEC", texture: "dots", accent: "#B8776A" },

  // Ruled notebook paper.
  notebook: { label: "Ruled notebook", base: "#FDFBF6", texture: "lines", accent: "#B9C6DA" },
  "kraft-lines": { label: "Ruled kraft", base: "#C9A97E", texture: "lines", accent: "#7A5C36" },

  // Graph paper.
  graph: { label: "Graph paper", base: "#FCFBF8", texture: "grid", accent: "#C9CFC2" },

  // Scattered flecks in the washi-tape palette - the odd one out, playful.
  confetti: { label: "Confetti", base: "#FBF7EF", texture: "speckle", accent: "" },
};

// Named groups purely for the <optgroup> picker - doesn't affect layout.
const PAGE_BACKGROUND_GROUPS: { label: string; keys: PageBackground[] }[] = [
  { label: "Plain", keys: ["white"] },
  {
    label: "Paper grain",
    keys: ["kraft", "cream", "sage", "dusk-blue", "blush", "charcoal"],
  },
  { label: "Dot grid", keys: ["dots", "sage-dots", "blue-dots", "blush-dots"] },
  { label: "Ruled", keys: ["notebook", "kraft-lines"] },
  { label: "Graph", keys: ["graph"] },
  { label: "Confetti", keys: ["confetti"] },
];

// Organic blob positions (fraction of page width/height) shared by every
// "blob"-textured background, so they all read as the same paper grain at
// a different color rather than unrelated patterns.
const PAGE_BACKGROUND_BLOBS = [
  { cx: 0.18, cy: 0.22, r: 0.32, opacity: 0.12 },
  { cx: 0.82, cy: 0.7, r: 0.36, opacity: 0.14 },
  { cx: 0.55, cy: 0.12, r: 0.24, opacity: 0.08 },
  { cx: 0.3, cy: 0.85, r: 0.28, opacity: 0.1 },
];

const PAGE_BACKGROUND_DOT_SPACING = 18; // px, web CSS dot/line/grid pattern
const PAGE_BACKGROUND_LINE_SPACING = 28;
const CONFETTI_COLORS = [...SCRAPBOOK.tape, SCRAPBOOK.ink];

// Precomputed scatter for the "confetti" texture - deterministic (not
// Math.random()) so it's stable across re-renders and identical between
// the web CSS version and the PDF Svg version.
const PAGE_BACKGROUND_SPECKLES = Array.from({ length: 50 }, (_, i) => ({
  x: seededRandom("speckle-x", i),
  y: seededRandom("speckle-y", i),
  r: 2 + seededRandom("speckle-r", i) * 3,
  color: CONFETTI_COLORS[Math.floor(seededRandom("speckle-c", i) * CONFETTI_COLORS.length)],
}));

function pageBackgroundCss(bg: PageBackground): React.CSSProperties {
  const preset = PAGE_BACKGROUNDS[bg];
  const s = PAGE_BACKGROUND_DOT_SPACING;
  const l = PAGE_BACKGROUND_LINE_SPACING;

  switch (preset.texture) {
    case "none":
      return { backgroundColor: preset.base };
    case "dots":
      return {
        backgroundColor: preset.base,
        backgroundImage: `radial-gradient(${preset.accent}29 1px, transparent 1.5px)`,
        backgroundSize: `${s}px ${s}px`,
      };
    case "lines":
      return {
        backgroundColor: preset.base,
        backgroundImage: `repeating-linear-gradient(to bottom, ${preset.accent}55 0px, ${preset.accent}55 1px, transparent 1px, transparent ${l}px)`,
      };
    case "grid":
      return {
        backgroundColor: preset.base,
        backgroundImage: [
          `repeating-linear-gradient(to bottom, ${preset.accent}55 0px, ${preset.accent}55 1px, transparent 1px, transparent ${l}px)`,
          `repeating-linear-gradient(to right, ${preset.accent}55 0px, ${preset.accent}55 1px, transparent 1px, transparent ${l}px)`,
        ].join(", "),
      };
    case "speckle":
      return {
        backgroundColor: preset.base,
        backgroundImage: PAGE_BACKGROUND_SPECKLES.map(
          (sp) =>
            `radial-gradient(circle ${sp.r}px at ${sp.x * 100}% ${sp.y * 100}%, ${sp.color}, transparent 70%)`,
        ).join(", "),
      };
    case "blob":
      return {
        backgroundColor: preset.base,
        backgroundImage: PAGE_BACKGROUND_BLOBS.map(
          (b) =>
            `radial-gradient(circle at ${b.cx * 100}% ${b.cy * 100}%, ${preset.accent}${Math.round(b.opacity * 255).toString(16).padStart(2, "0")} 0%, transparent ${b.r * 100}%)`,
        ).join(", "),
      };
  }
}

// PDF equivalent of pageBackgroundCss - react-pdf has no CSS
// background-image or repeating-pattern primitive, so the same preset is
// painted as an explicit Svg layer behind the page content instead. Dots
// use a coarser spacing than the web CSS version to keep the per-page
// element count reasonable across a whole book.
// Deliberately built with plain <View> (backgroundColor + borderRadius
// for circles) rather than <Svg>/<Rect>/<Circle>: react-pdf appears to
// run vector (Svg) drawing through a different path than regular
// View/Text content, and in testing that made a textured background
// paint over everything else on the page - including captions -
// regardless of where it sat in the JSX tree. A page-doubling bug
// (content "overflowing" its Svg box) was also traced to the same Svg
// usage. Plain Views share the exact same layout/paint pipeline as the
// rest of the page, which sidesteps both issues.
function PdfPageBackground({
  background,
  width,
  height,
}: {
  background: PageBackground;
  width: number;
  height: number;
}) {
  const preset = PAGE_BACKGROUNDS[background];
  if (preset.texture === "none") return null;

  const dotSpacing = 26;
  const lineSpacing = 30;

  const circle = (
    key: string | number,
    cx: number,
    cy: number,
    r: number,
    color: string,
    opacity: number,
  ) => (
    <View
      key={key}
      style={{
        position: "absolute",
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: color,
        opacity,
      }}
    />
  );

  // Approximates the web version's soft radial-gradient blob (full color
  // fading to transparent at the edge) with concentric rings of
  // increasing opacity toward the center - a single flat circle (the
  // PDF's only other option, since Svg gradients are avoided here) reads
  // as a hard, flat disc instead of a soft paper-grain blob.
  const softBlob = (
    keyPrefix: string | number,
    cx: number,
    cy: number,
    r: number,
    color: string,
    opacity: number,
  ) => {
    const rings = 5;
    return Array.from({ length: rings }, (_, i) => {
      const t = (i + 1) / rings;
      return circle(
        `${keyPrefix}-${i}`,
        cx,
        cy,
        r * t,
        color,
        (opacity / rings) * (1.6 - t),
      );
    });
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        backgroundColor: preset.base,
        overflow: "hidden",
      }}
    >
      {preset.texture === "blob" &&
        PAGE_BACKGROUND_BLOBS.map((b, i) => {
          const cx = b.cx * width;
          const cy = b.cy * height;
          const maxR = Math.min(cx, width - cx, cy, height - cy);
          const r = Math.max(
            0,
            Math.min(b.r * Math.max(width, height), maxR),
          );
          return softBlob(i, cx, cy, r, preset.accent, b.opacity);
        })}
      {preset.texture === "dots" &&
        Array.from({ length: Math.ceil(height / dotSpacing) }).flatMap(
          (_, row) =>
            Array.from({ length: Math.ceil(width / dotSpacing) }).map(
              (_, col) =>
                circle(
                  `${row}-${col}`,
                  dotSpacing / 2 + col * dotSpacing,
                  dotSpacing / 2 + row * dotSpacing,
                  0.7,
                  preset.accent,
                  0.35,
                ),
            ),
        )}
      {preset.texture === "lines" &&
        Array.from({ length: Math.ceil(height / lineSpacing) }).map(
          (_, row) => (
            <View
              key={row}
              style={{
                position: "absolute",
                left: 0,
                top: row * lineSpacing,
                width,
                height: 0.75,
                backgroundColor: preset.accent,
                opacity: 0.5,
              }}
            />
          ),
        )}
      {preset.texture === "grid" && (
        <>
          {Array.from({ length: Math.ceil(height / lineSpacing) }).map(
            (_, row) => (
              <View
                key={`h${row}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top: row * lineSpacing,
                  width,
                  height: 0.6,
                  backgroundColor: preset.accent,
                  opacity: 0.5,
                }}
              />
            ),
          )}
          {Array.from({ length: Math.ceil(width / lineSpacing) }).map(
            (_, col) => (
              <View
                key={`v${col}`}
                style={{
                  position: "absolute",
                  left: col * lineSpacing,
                  top: 0,
                  width: 0.6,
                  height,
                  backgroundColor: preset.accent,
                  opacity: 0.5,
                }}
              />
            ),
          )}
        </>
      )}
      {preset.texture === "speckle" &&
        PAGE_BACKGROUND_SPECKLES.map((sp, i) => {
          const cx = sp.x * width;
          const cy = sp.y * height;
          const r = Math.max(
            0,
            Math.min(sp.r, cx, width - cx, cy, height - cy),
          );
          return circle(i, cx, cy, r, sp.color, 0.55);
        })}
    </View>
  );
}

// Deterministic pseudo-random number in [0, 1) from a string id - stable
// across re-renders (unlike Math.random()), so a photo's tilt doesn't jitter
// every time unrelated state changes.
function seededRandom(id: string, salt: number): number {
  let hash = 0;
  const s = `${id}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return (((hash % 1000) + 1000) % 1000) / 1000;
}

// Plain Blob-backed photo image for the PDF, anchored at (top, left)
// within its cell.
function PdfPhotoImage({
  src,
  containerWidth,
  containerHeight,
  top,
  left,
}: {
  src: Blob | undefined;
  containerWidth: number;
  containerHeight: number;
  top: number;
  left: number;
}) {
  if (!src) return null;
  return (
    <Image
      src={src}
      style={{
        position: "absolute",
        top,
        left,
        width: containerWidth,
        height: containerHeight,
        objectFit: "contain",
      }}
    />
  );
}

function photoTiltDeg(assetId: string): number {
  const maxDeg = 3;
  return (seededRandom(assetId, 1) * 2 - 1) * maxDeg;
}

function tapeStyle(assetId: string) {
  const color = SCRAPBOOK.tape[Math.floor(seededRandom(assetId, 2) * 3)];
  const tiltDeg = (seededRandom(assetId, 3) * 2 - 1) * 8;
  return { color, tiltDeg };
}

// Alternate the page caption between the top and bottom margin band so a
// spread doesn't read as a rigid, repeated template.
function captionAtBottom(logicalPageNumber: number): boolean {
  return logicalPageNumber % 2 === 0;
}

// Quick page-format presets - the width/height mm fields stay fully
// editable regardless, this is just a shortcut to common sizes.
const PAGE_FORMAT_PRESETS = [
  { label: "A4 Portrait", widthMm: 210, heightMm: 297 },
  { label: "A4 Landscape", widthMm: 297, heightMm: 210 },
  { label: "Square 21x21", widthMm: 210, heightMm: 210 },
  { label: "Square 30x30", widthMm: 300, heightMm: 300 },
];

interface PhotoGridProps {
  immichConfig: ImmichConfig;
  album: AlbumResponseDto;
  onBack: () => void;
}

interface GlobalConfig {
  // Page settings
  pageWidth: number;
  pageHeight: number;
  margin: number;
  combinePages: boolean;

  // Layout settings
  spacing: number;
  filterVideos: boolean;

  // Display settings
  showDates: boolean;
  showCaptions: boolean;
  fontSize: number;
  pageBackground: PageBackground;
}

type CoverLayout = "photo-title" | "full-bleed" | "text-only" | "patchwork";

const COVER_LAYOUTS: { value: CoverLayout; label: string }[] = [
  { value: "photo-title", label: "Photo & Title" },
  { value: "full-bleed", label: "Full-bleed Photo" },
  { value: "text-only", label: "Text Only" },
  { value: "patchwork", label: "Patchwork" },
];

// "Patchwork" cover: a grid of small photos from across the whole album,
// tiled edge to edge like a quilt, with the title on a card in the
// middle. Column count is fixed; rows are derived from the page's own
// aspect ratio so tiles come out roughly square regardless of page
// format (A4 portrait vs square, say).
const MOSAIC_COLS = 10;

function mosaicRowsFor(pageWidth: number, pageHeight: number): number {
  return Math.max(1, Math.round(MOSAIC_COLS * (pageHeight / pageWidth)));
}

// Evenly samples `count` items across the full list (wrapping/repeating
// if there are fewer assets than grid cells) so the mosaic represents the
// whole album's span rather than just its first N photos.
function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length === 0) return [];
  return Array.from(
    { length: count },
    (_, i) => items[Math.floor((i * items.length) / count) % items.length],
  );
}

interface AlbumConfig extends GlobalConfig {
  // Customizations (album-specific only)
  customOrdering: string[] | null;
  // Bumped each time a page's "shuffle" control is used, to reroll its
  // bento arrangement without changing anything else.
  layoutVariants: Record<number, number>;
  // Forces how many photos land on a given page number, overriding the
  // automatically picked count. Keyed by logical page number.
  pageCounts: Record<number, number>;
  // LLM-generated page captions, keyed by logical page number
  pageCaptions: Record<number, string>;
  // User-written captions per photo (polaroid card), keyed by asset id
  cardCaptions: Record<string, string>;
  // How many photo slots on a page are turned into text cards (0-3),
  // keyed by logical page number.
  textCardCounts: Record<number, number>;
  // Text card contents, keyed by the card's synthetic id
  // ("text-{pageNumber}-{index}", see pageLayout.ts).
  textCardContents: Record<string, string>;
  // Manual per-page slot assignment (drag-and-drop swaps), keyed by
  // logical page number - see LayoutOptions.slotOverrides in
  // pageLayout.ts for why this exists instead of just reordering assets.
  slotOverrides: Record<number, string[]>;
  // Card/asset ids the user has manually swapped at least once, purely
  // for the "reordered" indicator dot - a swap only ever touches exactly
  // the two ids involved, unlike the old splice-based reorder it replaced
  // which could shift a neighboring card's index without moving it.
  manuallyMovedIds: string[];
  // Front cover, rendered as an unnumbered page before page 1. Optional
  // and off-by-default-when-unset isn't right here - some print services
  // generate their own cover and don't want one in the submitted PDF, so
  // this needs an explicit on/off rather than always including it.
  showCover: boolean;
  // Empty string falls back to the album's own name at render time.
  coverTitle: string;
  // Which photo to use on the cover - null falls back to the first photo
  // in the book's current order.
  coverAssetId: string | null;
  coverLayout: CoverLayout;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  pageWidth: 2515,
  pageHeight: 3260,
  margin: 118,
  combinePages: false,
  spacing: 20,
  filterVideos: true,
  showDates: true,
  showCaptions: true,
  fontSize: 12,
  pageBackground: "white",
};

// Helper functions for config persistence - stored server-side (see
// backend/main.py, proxied at /photobooks and /globalconfig) rather than
// in this browser's localStorage, so a photobook can be resumed from any
// device/client, not just the one it was edited on.
async function loadGlobalConfig(): Promise<GlobalConfig> {
  try {
    const res = await fetch("/globalconfig");
    if (res.ok) {
      return { ...DEFAULT_GLOBAL_CONFIG, ...(await res.json()) };
    }
  } catch (e) {
    console.error("Failed to load global config:", e);
  }
  return DEFAULT_GLOBAL_CONFIG;
}

async function saveGlobalConfig(config: GlobalConfig) {
  try {
    await fetch("/globalconfig", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
  } catch (e) {
    console.error("Failed to save global config:", e);
  }
}

async function loadAlbumConfig(albumId: string): Promise<AlbumConfig> {
  const globalConfig = await loadGlobalConfig();
  const defaults: AlbumConfig = {
    ...globalConfig,
    customOrdering: null,
    layoutVariants: {},
    pageCounts: {},
    pageCaptions: {},
    cardCaptions: {},
    textCardCounts: {},
    textCardContents: {},
    slotOverrides: {},
    manuallyMovedIds: [],
    showCover: true,
    coverTitle: "",
    coverAssetId: null,
    coverLayout: "photo-title",
  };

  try {
    const res = await fetch(`/photobooks/${encodeURIComponent(albumId)}`);
    if (res.ok) {
      const albumSpecific = await res.json();
      return { ...defaults, ...albumSpecific };
    }
  } catch (e) {
    console.error("Failed to load album config:", e);
  }

  return defaults;
}

async function saveAlbumConfig(albumId: string, config: AlbumConfig) {
  try {
    await fetch(`/photobooks/${encodeURIComponent(albumId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    // Also update global config with page and layout settings, used to
    // seed the defaults for the next album that has no photobook yet.
    const globalConfig: GlobalConfig = {
      pageWidth: config.pageWidth,
      pageHeight: config.pageHeight,
      margin: config.margin,
      combinePages: config.combinePages,
      spacing: config.spacing,
      filterVideos: config.filterVideos,
      showDates: config.showDates,
      showCaptions: config.showCaptions,
      fontSize: config.fontSize,
      pageBackground: config.pageBackground,
    };
    await saveGlobalConfig(globalConfig);
  } catch (e) {
    console.error("Failed to save album config:", e);
  }
}

// Convert 300 DPI pixels to 72 DPI points for PDF
// At 300 DPI: 1 inch = 300 pixels
// At 72 DPI: 1 inch = 72 points
// Conversion: points = pixels * (72/300)
const toPoints = (pixels: number) => pixels * (72 / 300);

// How tall the page-caption band needs to be (in points) to comfortably
// fit its text: react-pdf drops the text entirely if its box isn't
// noticeably taller than the font size (confirmed by isolated testing -
// a box only ~1.1x the font size renders nothing, ~1.6x is reliable).
// Used both for the caption's own rendered height AND to compute the
// content area's effective margin (see the `pages` useMemo) - without
// the latter, photos are laid out right up to the nominal margin and
// end up painted over a caption band that's actually taller than that.
function pageCaptionBandHeightPt(fontSize: number, marginPx: number): number {
  const captionFontSizePt = fontSize * 1.9;
  const paddingPt = Math.max(4, toPoints(marginPx) * 0.15);
  return Math.max(toPoints(marginPx), captionFontSizePt * 1.6 + paddingPt * 2);
}

// Static styles for the PDF
const staticStyles = StyleSheet.create({
  page: {
    backgroundColor: "white",
  },
});

// Strips characters that aren't safe in a downloaded filename across
// platforms, so the album name can be used directly.
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "photobook";
}

// Fetches each url with bounded concurrency (not Promise.all(urls.map))
// - a large book can have several hundred photos, and firing that many
// fetches at once overwhelms both the browser's per-origin connection
// limit and Immich's on-demand image generation, causing scattered
// failures. Individual failures are swallowed (logged, counted) rather
// than aborting the whole batch, since a handful of missing photos is
// far better than no PDF at all.
async function fetchBlobsWithConcurrency(
  items: { key: string; url: string }[],
  concurrency: number,
  onProgress: (done: number, total: number) => void,
): Promise<{ blobs: Map<string, Blob>; failures: number }> {
  const blobs = new Map<string, Blob>();
  let done = 0;
  let failures = 0;
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const { key, url } = items[i];
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blobs.set(key, await res.blob());
      } catch (e) {
        console.error(`Failed to fetch ${key} (${url}):`, e);
        failures++;
      } finally {
        done++;
        onProgress(done, items.length);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return { blobs, failures };
}

// A small spinning flower (petals in the washi-tape palette) shown while
// the PDF is being generated - in keeping with the scrapbook look rather
// than a generic spinner.
function PdfSpinner() {
  return (
    <svg
      className="animate-spin"
      width="18"
      height="18"
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <ellipse
          key={i}
          cx="20"
          cy="10"
          rx="5"
          ry="9"
          fill={SCRAPBOOK.tape[i % SCRAPBOOK.tape.length]}
          opacity={0.85}
          transform={`rotate(${i * 60} 20 20)`}
        />
      ))}
      <circle cx="20" cy="20" r="3.5" fill={SCRAPBOOK.ink} />
    </svg>
  );
}

// Fetches this album's photobook config from the backend before mounting
// the actual editor - PhotoGridEditor's many useState(initialConfig.x)
// calls need a resolved config up front, so this wrapper turns the async
// load into a plain loading state instead of threading a promise through
// every field.
function PhotoGrid(props: PhotoGridProps) {
  const [initialConfig, setInitialConfig] = useState<AlbumConfig | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setInitialConfig(null);
    loadAlbumConfig(props.album.id).then((config) => {
      if (!cancelled) setInitialConfig(config);
    });
    return () => {
      cancelled = true;
    };
  }, [props.album.id]);

  if (!initialConfig) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-4 text-gray-600">Loading photobook...</p>
      </div>
    );
  }

  // key={album.id} forces a fresh mount per album, so every piece of
  // state below starts from this album's own config instead of leftover
  // state from whichever album was open before.
  return (
    <PhotoGridEditor key={props.album.id} {...props} initialConfig={initialConfig} />
  );
}

interface PhotoGridEditorProps extends PhotoGridProps {
  initialConfig: AlbumConfig;
}

function PhotoGridEditor({
  immichConfig,
  album,
  onBack,
  initialConfig,
}: PhotoGridEditorProps) {
  const [assets, setAssets] = useState<AssetResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // The blob URL is only good for this browser tab's lifetime - release it
  // whenever a new PDF is generated (or the editor unmounts) instead of
  // leaking one per generation.
  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  // Page settings
  const [pageWidth, setPageWidth] = useState(initialConfig.pageWidth);
  const [pageHeight, setPageHeight] = useState(initialConfig.pageHeight);
  const [margin, setMargin] = useState(initialConfig.margin);
  const [combinePages, setCombinePages] = useState(initialConfig.combinePages);

  // Layout settings
  const [spacing, setSpacing] = useState(initialConfig.spacing);
  const [filterVideos, setFilterVideos] = useState(initialConfig.filterVideos);

  // Validation helpers
  const isPageWidthValid = pageWidth >= 1000 && pageWidth <= 10000;
  const isPageHeightValid = pageHeight >= 1000 && pageHeight <= 10000;
  const isMarginValid = margin >= 0 && margin <= pageWidth / 2;
  const isSpacingValid = spacing >= 0 && spacing <= 100;

  // Clamped values for use in layout calculations (prevent crashes from invalid values)
  const validPageWidth = isPageWidthValid
    ? pageWidth
    : Math.max(1000, Math.min(10000, pageWidth));
  const validPageHeight = isPageHeightValid
    ? pageHeight
    : Math.max(1000, Math.min(10000, pageHeight));
  const validMargin = isMarginValid
    ? margin
    : Math.max(0, Math.min(validPageWidth / 2, margin));
  const validSpacing = isSpacingValid
    ? spacing
    : Math.max(0, Math.min(100, spacing));

  // Display settings
  const [showDates, setShowDates] = useState(initialConfig.showDates);
  const [showCaptions, setShowCaptions] = useState(initialConfig.showCaptions);
  const [fontSize, setFontSize] = useState(initialConfig.fontSize);
  const [pageBackground, setPageBackground] = useState<PageBackground>(
    initialConfig.pageBackground,
  );

  // Customizations
  const [customOrdering, setCustomOrdering] = useState<string[] | null>(
    initialConfig.customOrdering,
  );
  const [layoutVariants, setLayoutVariants] = useState<Map<number, number>>(
    () =>
      new Map(
        Object.entries(initialConfig.layoutVariants).map(([k, v]) => [
          Number(k),
          v,
        ]),
      ),
  );
  const [pageCounts, setPageCounts] = useState<Map<number, number>>(
    () =>
      new Map(
        Object.entries(initialConfig.pageCounts).map(([k, v]) => [
          Number(k),
          v,
        ]),
      ),
  );
  const [pageCaptions, setPageCaptions] = useState<Map<number, string>>(
    () =>
      new Map(
        Object.entries(initialConfig.pageCaptions).map(([k, v]) => [
          Number(k),
          v,
        ]),
      ),
  );
  const [cardCaptions, setCardCaptions] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialConfig.cardCaptions)),
  );
  const [textCardCounts, setTextCardCounts] = useState<Map<number, number>>(
    () =>
      new Map(
        Object.entries(initialConfig.textCardCounts).map(([k, v]) => [
          Number(k),
          v,
        ]),
      ),
  );
  const [textCardContents, setTextCardContents] = useState<
    Map<string, string>
  >(() => new Map(Object.entries(initialConfig.textCardContents)));
  // Manual per-page slot assignment - see LayoutOptions.slotOverrides.
  const [slotOverrides, setSlotOverrides] = useState<Map<number, string[]>>(
    () =>
      new Map(
        Object.entries(initialConfig.slotOverrides).map(([k, v]) => [
          Number(k),
          v,
        ]),
      ),
  );
  // Ids the user has manually swapped at least once - drives the
  // "reordered" indicator dot precisely (a swap only ever touches the two
  // ids involved).
  const [manuallyMovedIds, setManuallyMovedIds] = useState<Set<string>>(
    () => new Set(initialConfig.manuallyMovedIds),
  );
  const [showCover, setShowCover] = useState(initialConfig.showCover);
  const [coverTitle, setCoverTitle] = useState(
    initialConfig.coverTitle || album.albumName,
  );
  const [coverAssetId, setCoverAssetId] = useState<string | null>(
    initialConfig.coverAssetId,
  );
  const [coverLayout, setCoverLayout] = useState<CoverLayout>(
    initialConfig.coverLayout,
  );
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionProgress, setCaptionProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [captionError, setCaptionError] = useState<string | null>(null);

  // Drag state for reordering - dropping one card onto another swaps
  // them outright (see the pointermove/pointerup effect below), rather
  // than splicing the dragged card into the sequence at the drop
  // position, which is why we only need the dragged id here.
  const [reorderDragState, setReorderDragState] = useState<{
    draggedAssetId: string;
  } | null>(null);
  const [dropTargetAssetId, setDropTargetAssetId] = useState<string | null>(
    null,
  );

  // Width available to the preview column - pages (especially combined
  // spreads) are scaled down to fit it, rather than relying on horizontal
  // scroll, which left the right-hand page looking cut off/undersized.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setPreviewWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    loadAlbumAssets();

    // Clean up old localStorage keys (migration)
    localStorage.removeItem(`immich-book-aspect-ratios-${album.id}`);
    localStorage.removeItem(`immich-book-ordering-${album.id}`);
    localStorage.removeItem(`immich-book-description-positions-${album.id}`);
  }, [album.id]);

  // Save config to localStorage whenever it changes (with clamped values)
  useEffect(() => {
    // Only save if all values are valid
    if (!isPageWidthValid || !isPageHeightValid || !isMarginValid || !isSpacingValid) {
      return;
    }

    const config: AlbumConfig = {
      pageWidth,
      pageHeight,
      margin,
      combinePages,
      spacing,
      filterVideos,
      showDates,
      showCaptions,
      fontSize,
      pageBackground,
      customOrdering,
      layoutVariants: Object.fromEntries(layoutVariants),
      pageCounts: Object.fromEntries(pageCounts),
      pageCaptions: Object.fromEntries(pageCaptions),
      cardCaptions: Object.fromEntries(cardCaptions),
      textCardCounts: Object.fromEntries(textCardCounts),
      textCardContents: Object.fromEntries(textCardContents),
      slotOverrides: Object.fromEntries(slotOverrides),
      manuallyMovedIds: Array.from(manuallyMovedIds),
      showCover,
      coverTitle,
      coverAssetId,
      coverLayout,
    };
    saveAlbumConfig(album.id, config);
  }, [
    album.id,
    pageWidth,
    pageHeight,
    margin,
    combinePages,
    spacing,
    filterVideos,
    showDates,
    showCaptions,
    fontSize,
    pageBackground,
    customOrdering,
    layoutVariants,
    pageCounts,
    pageCaptions,
    cardCaptions,
    showCover,
    coverTitle,
    coverAssetId,
    coverLayout,
    textCardCounts,
    textCardContents,
    slotOverrides,
    manuallyMovedIds,
    isPageWidthValid,
    isPageHeightValid,
    isMarginValid,
    isSpacingValid,
  ]);

  const loadAlbumAssets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const albumData = await getAlbumInfo({ id: album.id });
      // Sort assets by creation date ascending
      const sorted = albumData.assets.sort((a, b) => {
        return (
          new Date(a.fileCreatedAt).getTime() -
          new Date(b.fileCreatedAt).getTime()
        );
      });
      setAssets(sorted);
    } catch (err) {
      setError((err as Error).message || "Failed to load album assets");
    } finally {
      setIsLoading(false);
    }
  };

  // Reroll a page's bento arrangement - same photos, different split
  // pattern (e.g. a 3-photo page can be tiled several different ways
  // depending on their formats).
  const handleShuffleLayout = (logicalPageNumber: number) => {
    setLayoutVariants((prev) => {
      const next = new Map(prev);
      next.set(logicalPageNumber, (prev.get(logicalPageNumber) || 0) + 1);
      return next;
    });
  };

  // Force (or, with null, stop forcing) how many photos land on a page
  const handleSetPageCount = (
    logicalPageNumber: number,
    count: number | null,
  ) => {
    setPageCounts((prev) => {
      const next = new Map(prev);
      if (count === null) {
        next.delete(logicalPageNumber);
      } else {
        next.set(logicalPageNumber, count);
      }
      return next;
    });
  };

  // Set how many of a page's slots are text cards instead of photos (0-3)
  const handleSetTextCardCount = (
    logicalPageNumber: number,
    count: number,
  ) => {
    setTextCardCounts((prev) => {
      const next = new Map(prev);
      if (count === 0) {
        next.delete(logicalPageNumber);
      } else {
        next.set(logicalPageNumber, count);
      }
      return next;
    });
  };

  // Drag & drop for reordering - implemented with pointer events and
  // manual hit-testing (element.closest("[data-reorder-asset-id]") under
  // the pointer) rather than native HTML5 drag-and-drop. Native DnD turned
  // out to be unreliable here: it breaks under a scaled/transformed
  // ancestor (the preview's fit-to-width zoom), silently swallows drops on
  // tiles with no onDrop handler (text cards), and needs browser-specific
  // dataTransfer setup. Pointer events sidestep all of that.
  const handleReorderPointerDown = (
    assetId: string,
    event: React.PointerEvent,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setReorderDragState({ draggedAssetId: assetId });
  };

  // Undo a manual swap for one card: un-flag it, drop its page's slot
  // override (that whole page falls back to fresh auto tiling - a manual
  // arrangement only makes sense as the set the user actually placed, not
  // a partial remnant of it), and if it was swapped across pages, restore
  // its default position in the master sequence too.
  const handleResetCard = (assetId: string) => {
    setManuallyMovedIds((prev) => {
      if (!prev.has(assetId)) return prev;
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
    setSlotOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [pageNumber, ids] of prev) {
        if (ids.includes(assetId)) {
          next.delete(pageNumber);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setCustomOrdering((prev) => {
      if (!prev || !prev.includes(assetId)) return prev;
      const defaultIndex = defaultFilteredAssets.findIndex(
        (a) => a.id === assetId,
      );
      const next = prev.filter((id) => id !== assetId);
      next.splice(defaultIndex, 0, assetId);
      return next;
    });
  };

  // Reset ordering to default
  const handleResetOrdering = () => {
    setCustomOrdering(null);
    setSlotOverrides(new Map());
    setManuallyMovedIds(new Set());
  };

  // Filter assets based on user preferences (default order)
  const defaultFilteredAssets = useMemo(() => {
    return filterVideos
      ? assets.filter((asset) => asset.type === "IMAGE")
      : assets;
  }, [assets, filterVideos]);

  // Apply custom ordering to filtered assets
  const filteredAssets = useMemo(() => {
    if (!customOrdering) return defaultFilteredAssets;

    // Create a map for quick lookup
    const assetMap = new Map(
      defaultFilteredAssets.map((asset) => [asset.id, asset]),
    );
    // Reorder based on customOrdering, filtering out any IDs that don't exist
    const reordered = customOrdering
      .map((id) => assetMap.get(id))
      .filter((asset): asset is AssetResponseDto => asset !== undefined);

    // Add any assets that aren't in customOrdering at the end
    const orderedIds = new Set(customOrdering);
    const remaining = defaultFilteredAssets.filter(
      (asset) => !orderedIds.has(asset.id),
    );

    return [...reordered, ...remaining];
  }, [defaultFilteredAssets, customOrdering]);

  // Cover photo - explicit pick if the user made one, otherwise the
  // book's first photo in its current order.
  const coverAsset = useMemo(() => {
    if (coverAssetId) {
      const picked = filteredAssets.find((a) => a.id === coverAssetId);
      if (picked) return picked;
    }
    return filteredAssets[0] ?? null;
  }, [filteredAssets, coverAssetId]);

  // Photos sampled for the "patchwork" cover layout - computed
  // unconditionally (cheap) so it stays available for both the live
  // preview and the PDF export's fetch list.
  const mosaicRows = mosaicRowsFor(validPageWidth, validPageHeight);
  const mosaicAssets = useMemo(
    () => sampleEvenly(filteredAssets, MOSAIC_COLS * mosaicRows),
    [filteredAssets, mosaicRows],
  );

  // Calculate unified page layout - single source of truth!
  // When page captions are on, the content area's margin needs to be at
  // least as tall as the caption band itself (see
  // pageCaptionBandHeightPt) - otherwise photos are positioned right up
  // to the nominal margin and end up painted over a caption band that's
  // actually taller than that (confirmed: this is exactly what made
  // captions look "hidden behind photos").
  const layoutMargin = showCaptions
    ? Math.max(
        validMargin,
        pageCaptionBandHeightPt(fontSize, validMargin) * (300 / 72),
      )
    : validMargin;

  const pages = useMemo(() => {
    return calculatePageLayout(filteredAssets, {
      pageWidth: validPageWidth,
      pageHeight: validPageHeight,
      margin: layoutMargin,
      spacing: validSpacing,
      combinePages,
      layoutVariants,
      pageCounts,
      textCardCounts,
      slotOverrides,
    });
  }, [
    filteredAssets,
    layoutMargin,
    validSpacing,
    validPageWidth,
    validPageHeight,
    combinePages,
    layoutVariants,
    pageCounts,
    textCardCounts,
    slotOverrides,
  ]);

  // While a reorder drag is active, track the pointer over the whole
  // window (not just the card it started on) and hit-test which card is
  // underneath via elementFromPoint - this works correctly regardless of
  // the preview's CSS zoom, since elementFromPoint uses actual rendered
  // coordinates. Dropping one card onto another swaps them outright:
  // same page swaps their slot assignment directly (the auto layout's
  // aspect-ratio-driven grouping doesn't otherwise respect a specific
  // drop position - see slotOverrides in pageLayout.ts); across pages,
  // there's no shared slot list to swap within, so it swaps their
  // positions in the master sequence instead, which changes which page
  // each naturally belongs to.
  useEffect(() => {
    if (!reorderDragState) return;
    const { draggedAssetId } = reorderDragState;

    const cardUnderPointer = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      const card = el?.closest<HTMLElement>("[data-reorder-asset-id]");
      return card?.dataset.reorderAssetId ?? null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      setDropTargetAssetId(cardUnderPointer(event.clientX, event.clientY));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const targetAssetId = cardUnderPointer(event.clientX, event.clientY);

      if (targetAssetId && targetAssetId !== draggedAssetId) {
        let draggedPage: number | null = null;
        let targetPage: number | null = null;
        for (const page of pages) {
          const ids = page.photos.map((p) => p.id);
          if (ids.includes(draggedAssetId)) draggedPage = page.pageNumber;
          if (ids.includes(targetAssetId)) targetPage = page.pageNumber;
        }

        if (draggedPage !== null && targetPage !== null) {
          if (draggedPage === targetPage) {
            const order = pages
              .find((p) => p.pageNumber === draggedPage)!
              .photos.map((p) => p.id);
            const di = order.indexOf(draggedAssetId);
            const ti = order.indexOf(targetAssetId);
            [order[di], order[ti]] = [order[ti], order[di]];
            setSlotOverrides((prev) => new Map(prev).set(draggedPage!, order));
          } else {
            const currentOrder = filteredAssets.map((a) => a.id);
            const i = currentOrder.indexOf(draggedAssetId);
            const j = currentOrder.indexOf(targetAssetId);
            [currentOrder[i], currentOrder[j]] = [
              currentOrder[j],
              currentOrder[i],
            ];
            setCustomOrdering(currentOrder);
            // Stale now that each page's card membership has changed -
            // let both pages fall back to a fresh auto tiling.
            setSlotOverrides((prev) => {
              const next = new Map(prev);
              next.delete(draggedPage!);
              next.delete(targetPage!);
              return next;
            });
          }
          setManuallyMovedIds((prev) => {
            const next = new Set(prev);
            next.add(draggedAssetId);
            next.add(targetAssetId);
            return next;
          });
        }
      }

      setReorderDragState(null);
      setDropTargetAssetId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderDragState, pages, filteredAssets]);

  // Group page photos by logical page number - matches the numbering
  // already used for pageCaptions/the "Page X of Y" UI: in combined mode
  // each physical (spread) page holds two logical pages side by side,
  // split at the horizontal midpoint.
  const logicalPages = useMemo(() => {
    const result: { number: number; photos: (typeof pages)[0]["photos"] }[] =
      [];
    for (const page of pages) {
      if (!combinePages) {
        result.push({ number: page.pageNumber, photos: page.photos });
        continue;
      }
      const half = page.width / 2;
      const rightPhotos = page.photos.filter((p) => p.x >= half);
      result.push({
        number: page.pageNumber * 2 - 1,
        photos: page.photos.filter((p) => p.x < half),
      });
      if (rightPhotos.length > 0) {
        result.push({ number: page.pageNumber * 2, photos: rightPhotos });
      }
    }
    return result;
  }, [pages, combinePages]);

  // Determine pageLayout based on combinePages setting
  const pageLayout = combinePages ? "singlePage" : "twoPageLeft";

  // Calculate total logical pages for display purposes
  const totalLogicalPages = combinePages ? pages.length * 2 : pages.length;

  // Small button group for per-page layout controls - shuffle the bento
  // arrangement, force a photo count, or swap some slots for text cards.
  const renderStyleSwitcher = (logicalPageNumber: number) => {
    return (
      <div className="flex gap-1">
        <button
          onClick={() => handleShuffleLayout(logicalPageNumber)}
          className="px-2 py-1 text-xs border rounded transition-colors bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          title="Try another arrangement for this page"
        >
          Shuffle
        </button>
        <select
          value={pageCounts.get(logicalPageNumber) ?? ""}
          onChange={(e) =>
            handleSetPageCount(
              logicalPageNumber,
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
          className="px-1 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600"
          title="Force how many photos are on this page"
        >
          <option value="">Auto photos</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} photo{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <select
          value={textCardCounts.get(logicalPageNumber) ?? 0}
          onChange={(e) =>
            handleSetTextCardCount(logicalPageNumber, Number(e.target.value))
          }
          className="px-1 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600"
          title="Turn some of this page's slots into text cards"
        >
          <option value="0">No text cards</option>
          <option value="1">1 text card</option>
          <option value="2">2 text cards</option>
          <option value="3">3 text cards</option>
        </select>
      </div>
    );
  };

  // Generate one short LLM caption per page from the Immich descriptions of
  // the photos grouped on that page (thebrain, proxied server-side at
  // /llm/ - see nginx.conf.template). Explicit action rather than automatic:
  // this hits a shared local GPU and results are meant to be reviewed/edited
  // before printing, not regenerated on every layout tweak.
  const handleGenerateCaptions = async () => {
    const candidates = logicalPages
      .map((lp) => ({
        number: lp.number,
        descriptions: lp.photos
          .map((p) => p.asset?.exifInfo?.description)
          .filter((d): d is string => !!d && d.trim().length > 0),
      }))
      .filter((c) => c.descriptions.length > 0);

    if (candidates.length === 0) {
      setCaptionError(
        "Aucune photo de l'album n'a de description Immich à partir de laquelle générer une légende.",
      );
      return;
    }

    setIsGeneratingCaptions(true);
    setCaptionError(null);
    setCaptionProgress({ done: 0, total: candidates.length });

    const newCaptions = new Map(pageCaptions);
    let failures = 0;

    for (let i = 0; i < candidates.length; i++) {
      const { number, descriptions } = candidates[i];
      try {
        const prompt = `Voici les descriptions de plusieurs photos qui apparaissent ensemble sur une page d'un album photo :\n${descriptions
          .map((d) => `- ${d}`)
          .join(
            "\n",
          )}\n\nPropose une courte légende pour cette page, dans le style d'un album photo (3 à 6 mots, chaleureuse et familière, par exemple "À la mer" ou "On se la coule douce"). Réponds uniquement avec la légende, sans guillemets ni point final.`;

        const response = await fetch("/llm/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemma-4-12B-it-qat-w4a16-ct",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 20,
            temperature: 0.8,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content ?? "";
        const caption = raw
          .trim()
          .replace(/^["'«»]+|["'«».]+$/g, "")
          .trim();

        if (caption) {
          newCaptions.set(number, caption);
        }
      } catch (err) {
        console.error(`Failed to generate caption for page ${number}:`, err);
        failures++;
      }

      setCaptionProgress({ done: i + 1, total: candidates.length });
    }

    setPageCaptions(newCaptions);
    setIsGeneratingCaptions(false);
    setCaptionProgress(null);
    if (failures > 0) {
      setCaptionError(
        `${failures} légende${failures > 1 ? "s" : ""} sur ${candidates.length} n'${
          failures > 1 ? "ont" : "a"
        } pas pu être générée${failures > 1 ? "s" : ""}.`,
      );
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-4 text-gray-600">Loading photos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto">
        <button
          onClick={onBack}
          className="mb-4 text-blue-600 hover:text-blue-800"
        >
          ← Back to albums
        </button>
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={loadAlbumAssets}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm transition-colors shadow-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Builds the actual PDF document element from photo Blobs fetched
  // ahead of time (see handleGeneratePdf) - react-pdf's own image
  // fetching turned out to be unreliable on its own (photos randomly,
  // but reproducibly, missing), so every photo is fetched ourselves with
  // real error handling and handed to <Image> as a Blob instead of a URL.
  const buildPdfDocument = (
    imageBlobs: Map<string, Blob>,
    mosaicBlobs: Map<string, Blob>,
  ) => {
    const coverPageWidth = toPoints(validPageWidth);
    const coverPageHeight = toPoints(validPageHeight);
    const coverImageBlob = coverAsset
      ? imageBlobs.get(coverAsset.id)
      : undefined;
    const coverScrimHeight = coverPageHeight * 0.28;

    return (
    <Document pageLayout={pageLayout}>
      {showCover && (
        <Page
          size={{ width: coverPageWidth, height: coverPageHeight }}
          style={{
            ...staticStyles.page,
            backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
          }}
        >
          <PdfPageBackground
            background={pageBackground}
            width={coverPageWidth}
            height={coverPageHeight}
          />

          {coverLayout === "text-only" && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: coverPageWidth * 0.1,
              }}
            >
              <View
                style={{
                  width: coverPageWidth * 0.3,
                  height: 1,
                  backgroundColor: SCRAPBOOK.ink,
                  opacity: 0.3,
                  marginBottom: 16,
                }}
              />
              <Text
                style={{
                  fontFamily: "Caveat",
                  fontWeight: 600,
                  fontSize: coverPageWidth * 0.09,
                  color: SCRAPBOOK.ink,
                  textAlign: "center",
                }}
              >
                {coverTitle || album.albumName}
              </Text>
              <View
                style={{
                  width: coverPageWidth * 0.3,
                  height: 1,
                  backgroundColor: SCRAPBOOK.ink,
                  opacity: 0.3,
                  marginTop: 16,
                }}
              />
            </View>
          )}

          {coverLayout === "photo-title" && coverImageBlob && (
            <>
              <View
                style={{
                  position: "absolute",
                  top: coverPageHeight * 0.08,
                  left: coverPageWidth * 0.08,
                  width: coverPageWidth * 0.84,
                  height: coverPageHeight * 0.68,
                  backgroundColor: SCRAPBOOK.mat,
                }}
              >
                <PdfPhotoImage
                  src={coverImageBlob}
                  top={coverPageWidth * 0.02}
                  left={coverPageWidth * 0.02}
                  containerWidth={coverPageWidth * 0.8}
                  containerHeight={coverPageHeight * 0.64}
                />
              </View>
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: coverPageHeight * 0.2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Caveat",
                    fontWeight: 600,
                    fontSize: coverPageWidth * 0.055,
                    color: SCRAPBOOK.ink,
                    textAlign: "center",
                  }}
                >
                  {coverTitle || album.albumName}
                </Text>
              </View>
            </>
          )}

          {coverLayout === "full-bleed" && coverImageBlob && (
            <>
              <Image
                src={coverImageBlob}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: coverPageWidth,
                  height: coverPageHeight,
                  objectFit: "cover",
                }}
              />
              {/* Approximates a top-to-bottom fade with stacked bands
                  rather than an Svg gradient - see PdfPageBackground's
                  comment for why Svg is avoided here. */}
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  width: coverPageWidth,
                  height: coverScrimHeight,
                }}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: (coverScrimHeight * i) / 10,
                      width: coverPageWidth,
                      height: coverScrimHeight / 10 + 0.5,
                      backgroundColor: "#000000",
                      opacity: (0.55 * (i + 1)) / 10,
                    }}
                  />
                ))}
              </View>
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: coverScrimHeight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Caveat",
                    fontWeight: 600,
                    fontSize: coverPageWidth * 0.06,
                    color: "#FFFFFF",
                    textAlign: "center",
                  }}
                >
                  {coverTitle || album.albumName}
                </Text>
              </View>
            </>
          )}

          {coverLayout === "patchwork" && (
            <>
              {mosaicAssets.map((a, i) => {
                const tileBlob = mosaicBlobs.get(a.id);
                if (!tileBlob) return null;
                const tileW = coverPageWidth / MOSAIC_COLS;
                const tileH = coverPageHeight / mosaicRows;
                const col = i % MOSAIC_COLS;
                const row = Math.floor(i / MOSAIC_COLS);
                return (
                  <Image
                    key={i}
                    src={tileBlob}
                    style={{
                      position: "absolute",
                      left: col * tileW,
                      top: row * tileH,
                      // Slightly oversized to paper over hairline gaps
                      // between tiles from rounding.
                      width: tileW + 0.75,
                      height: tileH + 0.75,
                      objectFit: "cover",
                    }}
                  />
                );
              })}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    backgroundColor: "rgba(255,254,252,0.92)",
                    paddingHorizontal: coverPageWidth * 0.06,
                    paddingVertical: coverPageHeight * 0.03,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Caveat",
                      fontWeight: 600,
                      fontSize: coverPageWidth * 0.06,
                      color: SCRAPBOOK.ink,
                      textAlign: "center",
                    }}
                  >
                    {coverTitle || album.albumName}
                  </Text>
                </View>
              </View>
            </>
          )}
        </Page>
      )}

      {pages.map((pageData) => {
        // FIXME: pdfkit (internal of react-pdf) uses 72dpi internally and we downscale everything here;
        // instead we should produce a high-quality 300 dpi pdf

        // Convert page dimensions from 300 DPI to 72 DPI
        const pageWidth = toPoints(pageData.width);
        const pageHeight = toPoints(pageData.height);
        return (
          <Page
            key={pageData.pageNumber}
            size={{
              width: pageWidth,
              height: pageHeight,
            }}
            style={{
              ...staticStyles.page,
              backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
            }}
          >
            <PdfPageBackground
              background={pageBackground}
              width={pageWidth}
              height={pageHeight}
            />

            {/* Page break indicator for combined pages */}
            {combinePages && (
              <View
                style={{
                  position: "absolute",
                  left: pageWidth / 2,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  borderLeft: "1 dashed #D1D5DB",
                }}
              />
            )}

            {/* Page caption(s) - alternating margin band, one per
                logical page (two side by side when combined) */}
            {showCaptions &&
              (combinePages
                ? [
                    {
                      key: pageData.pageNumber * 2 - 1,
                      left: 0,
                      width: pageWidth / 2,
                    },
                    {
                      key: pageData.pageNumber * 2,
                      left: pageWidth / 2,
                      width: pageWidth / 2,
                    },
                  ]
                : [{ key: pageData.pageNumber, left: 0, width: pageWidth }]
              ).map((band) => {
                const caption = pageCaptions.get(band.key);
                if (!caption) return null;
                // Text size is the priority: the chosen font size is
                // always honored, and the band grows to fit it if the
                // page margin alone isn't tall enough - previously this
                // was backwards (a Math.min capped the font size to the
                // margin), which silently froze the caption at the same
                // size for most of the font size range.
                const captionFontSize = fontSize * 1.9;
                const captionPaddingVertical = Math.max(
                  4,
                  toPoints(validMargin) * 0.15,
                );
                const bandHeight = pageCaptionBandHeightPt(
                  fontSize,
                  validMargin,
                );
                return (
                  <View
                    key={band.key}
                    style={{
                      position: "absolute",
                      left: band.left,
                      ...(captionAtBottom(band.key)
                        ? { bottom: 0 }
                        : { top: 0 }),
                      width: band.width,
                      height: bandHeight,
                      paddingHorizontal: Math.max(16, band.width * 0.12),
                      paddingVertical: captionPaddingVertical,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Caveat",
                        fontWeight: 600,
                        fontSize: captionFontSize,
                        color: SCRAPBOOK.ink,
                        textAlign: "center",
                      }}
                    >
                      {caption}
                    </Text>
                  </View>
                );
              })}

            {pageData.photos.map((photoBox) => {
              const width = toPoints(photoBox.width);
              const height = toPoints(photoBox.height);
              const frameInset = Math.max(4, width * 0.035);
              const tilt = photoTiltDeg(photoBox.id);
              const tape = tapeStyle(photoBox.id);
              const tapeWidth = width * 0.22;

              // Text card - no backing photo, an editable note
              // mounted the same way as a photo card.
              if (!photoBox.asset) {
                return (
                  <View
                    key={photoBox.id}
                    style={{
                      position: "absolute",
                      left: toPoints(photoBox.x),
                      top: toPoints(photoBox.y),
                      width,
                      height,
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width,
                        height,
                        transform: `rotate(${tilt}deg) scale(0.93)`,
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          top: 4,
                          left: 3,
                          width,
                          height,
                          backgroundColor: SCRAPBOOK.shadow,
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width,
                          height,
                          backgroundColor: SCRAPBOOK.mat,
                          padding: frameInset * 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Caveat",
                            fontWeight: 500,
                            fontSize: fontSize * 1.5,
                            color: SCRAPBOOK.ink,
                            textAlign: "center",
                          }}
                        >
                          {textCardContents.get(photoBox.id) || ""}
                        </Text>
                      </View>
                      <View
                        style={{
                          position: "absolute",
                          top: -frameInset * 0.5,
                          left: (width - tapeWidth) / 2,
                          width: tapeWidth,
                          height: frameInset * 1.6,
                          backgroundColor: tape.color,
                          opacity: 0.8,
                          transform: `rotate(${tape.tiltDeg}deg)`,
                        }}
                      />
                    </View>
                  </View>
                );
              }

              const asset = photoBox.asset;
              // Pre-fetched by handleGeneratePdf as a Blob ("preview"
              // size - always a plain, pre-rotated JPEG, unlike the
              // original upload which can be any format/orientation).
              const imageBlob = imageBlobs.get(asset.id);
              const dateStripHeight = showDates
                ? fontSize * 1.6
                : 0;
              const cardCaption = cardCaptions.get(asset.id);
              // Only cards that actually have a caption reserve the
              // extra strip - an empty card keeps its full image. The
              // strip has to be noticeably taller than the caption
              // text's own font size (not just a hair more) - confirmed
              // by testing that a strip only ~1.1x the font size makes
              // react-pdf drop the text entirely (presumably it doesn't
              // fit the line box once line-height is accounted for),
              // while ~1.6x renders reliably.
              const captionStripHeight = cardCaption
                ? fontSize * 1.3 * 1.6
                : 0;
              const bottomStripHeight =
                dateStripHeight + captionStripHeight;

              return (
                <View
                  key={photoBox.id}
                  style={{
                    position: "absolute",
                    left: toPoints(photoBox.x),
                    top: toPoints(photoBox.y),
                    width,
                    height,
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width,
                      height,
                      transform: `rotate(${tilt}deg) scale(0.93)`,
                    }}
                  >
                    {/* Soft cast shadow behind the mat */}
                    <View
                      style={{
                        position: "absolute",
                        top: 4,
                        left: 3,
                        width,
                        height,
                        backgroundColor: SCRAPBOOK.shadow,
                      }}
                    />
                    {/* Polaroid mat */}
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width,
                        height,
                        backgroundColor: SCRAPBOOK.mat,
                      }}
                    >
                      <PdfPhotoImage
                        src={imageBlob}
                        top={frameInset}
                        left={frameInset}
                        containerWidth={width - frameInset * 2}
                        containerHeight={
                          height - frameInset * 2 - bottomStripHeight
                        }
                      />
                      {cardCaption && (
                        <View
                          style={{
                            position: "absolute",
                            left: frameInset,
                            width: width - frameInset * 2,
                            bottom: frameInset * 0.3 + dateStripHeight,
                            height: captionStripHeight,
                            display: "flex",
                            // react-pdf defaults to flexDirection:"column"
                            // (unlike CSS's "row" default) - without this,
                            // alignItems/justifyContent end up swapped
                            // from what they'd mean on the web, which was
                            // pushing the caption to the right instead of
                            // centering it.
                            flexDirection: "row",
                            alignItems: "flex-end",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Caveat",
                              fontWeight: 500,
                              fontSize: fontSize * 1.3,
                              color: SCRAPBOOK.ink,
                              textAlign: "center",
                            }}
                          >
                            {cardCaption}
                          </Text>
                        </View>
                      )}
                      {showDates && asset.fileCreatedAt && (
                        <View
                          style={{
                            position: "absolute",
                            left: frameInset,
                            width: width - frameInset * 2,
                            bottom: frameInset * 0.3,
                            height: dateStripHeight,
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "flex-end",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Caveat",
                              fontWeight: 500,
                              fontSize: fontSize * 1.3,
                              color: SCRAPBOOK.ink,
                            }}
                          >
                            {new Date(
                              asset.fileCreatedAt,
                            ).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* Washi tape */}
                    <View
                      style={{
                        position: "absolute",
                        top: -frameInset * 0.5,
                        left: (width - tapeWidth) / 2,
                        width: tapeWidth,
                        height: frameInset * 1.6,
                        backgroundColor: tape.color,
                        opacity: 0.8,
                        transform: `rotate(${tape.tiltDeg}deg)`,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </Page>
        );
      })}

      {showCover && (
        <Page
          size={{ width: coverPageWidth, height: coverPageHeight }}
          style={{
            ...staticStyles.page,
            backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
          }}
        >
          <PdfPageBackground
            background={pageBackground}
            width={coverPageWidth}
            height={coverPageHeight}
          />
        </Page>
      )}
    </Document>
    );
  };

  const handleGeneratePdf = async () => {
    setPdfError(null);
    setIsGeneratingPdf(true);
    setPdfProgress(null);
    try {
      const assetIds = new Set<string>();
      pages.forEach((p) =>
        p.photos.forEach((photo) => {
          if (photo.asset) assetIds.add(photo.asset.id);
        }),
      );
      const usesPatchworkCover = showCover && coverLayout === "patchwork";
      if (
        showCover &&
        coverLayout !== "text-only" &&
        coverLayout !== "patchwork" &&
        coverAsset
      ) {
        assetIds.add(coverAsset.id);
      }
      const mosaicIds = usesPatchworkCover
        ? Array.from(new Set(mosaicAssets.map((a) => a.id)))
        : [];

      const ids = Array.from(assetIds);
      const totalFetches = ids.length + mosaicIds.length;
      let overallDone = 0;
      setPdfProgress({ done: 0, total: totalFetches });
      const onProgress = () => {
        overallDone++;
        setPdfProgress({ done: overallDone, total: totalFetches });
      };

      // "preview" - not "original"/"fullsize": the original is whatever
      // format the file was uploaded in (HEIC among them, which Chrome
      // can't decode at all, client-side canvas tricks included - and
      // that redirects to "original" on this server anyway). "preview"
      // is always a plain, pre-rotated JPEG Immich already generated, so
      // it's reliable even if the resolution is more modest.
      const { blobs: imageBlobs, failures: imageFailures } =
        await fetchBlobsWithConcurrency(
          ids.map((id) => ({
            key: id,
            url: `${window.location.origin}${immichConfig.baseUrl}/assets/${id}/thumbnail?size=preview`,
          })),
          6,
          onProgress,
        );
      // Mosaic tiles are small and pre-cached by Immich (unlike
      // "fullsize", generated on demand), so a higher concurrency is
      // fine and keeps a large patchwork grid from taking forever.
      const { blobs: mosaicBlobs, failures: mosaicFailures } =
        await fetchBlobsWithConcurrency(
          mosaicIds.map((id) => ({
            key: id,
            url: `${window.location.origin}${immichConfig.baseUrl}/assets/${id}/thumbnail?size=thumbnail`,
          })),
          12,
          onProgress,
        );

      const blob = await pdf(
        buildPdfDocument(imageBlobs, mosaicBlobs),
      ).toBlob();
      setPdfUrl(URL.createObjectURL(blob));
      const failures = imageFailures + mosaicFailures;
      if (failures > 0) {
        setPdfError(
          `${failures} of ${totalFetches} photos couldn't be fetched and are missing from the PDF - try generating again.`,
        );
      }
    } catch (e) {
      console.error("Failed to generate PDF:", e);
      setPdfError(
        e instanceof Error
          ? `PDF generation failed: ${e.message}`
          : "PDF generation failed.",
      );
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  };

  return (
    <div>
      {/* Controls */}
      <div className="mb-6 flex flex-col lg:flex-row flex-1 items-start lg:justify-between gap-4 lg:gap-8">
        <div className="w-full lg:w-auto">
          <button
            onClick={onBack}
            className="text-blue-600 hover:text-blue-800 mb-2"
          >
            ← Back to albums
          </button>
          <h2 className="text-2xl font-semibold">{album.albumName}</h2>
          <p className="text-gray-600 mt-1">
            {filteredAssets.length}{" "}
            {filteredAssets.length !== assets.length && `of ${assets.length}`}{" "}
            assets
          </p>

          {/* Generate PDF button */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              {isGeneratingPdf && <PdfSpinner />}
              {isGeneratingPdf
                ? pdfProgress
                  ? `Génération... ${pdfProgress.done}/${pdfProgress.total}`
                  : "Génération..."
                : "Générer le PDF"}
            </button>
            {pdfUrl && !isGeneratingPdf && (
              <a
                href={pdfUrl}
                download={`${sanitizeFileName(album.albumName)}.pdf`}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors shadow-sm"
              >
                Télécharger le PDF
              </a>
            )}
            <button
              onClick={handleGenerateCaptions}
              disabled={isGeneratingCaptions}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors shadow-sm"
              title="Génère une légende par page à partir des descriptions Immich des photos de la page (via thebrain)"
            >
              {isGeneratingCaptions
                ? `Génération... ${captionProgress?.done ?? 0}/${captionProgress?.total ?? 0}`
                : "Générer les légendes"}
            </button>
          </div>
          {captionError && (
            <p className="mt-2 text-xs text-red-600 max-w-xs">
              {captionError}
            </p>
          )}
        </div>

        <div className="space-y-3 w-full lg:w-auto">
          {/* 1. Page Setup */}
          <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 sm:w-24">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Page
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={
                    PAGE_FORMAT_PRESETS.find(
                      (p) =>
                        p.widthMm === Math.round(pixelsToMm(pageWidth)) &&
                        p.heightMm === Math.round(pixelsToMm(pageHeight)),
                    )?.label || "custom"
                  }
                  onChange={(e) => {
                    const preset = PAGE_FORMAT_PRESETS.find(
                      (p) => p.label === e.target.value,
                    );
                    if (preset) {
                      setPageWidth(mmToPixels(preset.widthMm));
                      setPageHeight(mmToPixels(preset.heightMm));
                    }
                  }}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  title="Quick format - width/height stay editable below"
                >
                  <option value="custom">Custom</option>
                  {PAGE_FORMAT_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="pageWidth" className="text-gray-600 text-sm">
                    Width:
                  </label>
                  <input
                    type="number"
                    id="pageWidth"
                    value={Math.round(pixelsToMm(pageWidth))}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setPageWidth(mmToPixels(value));
                      }
                    }}
                    min={Math.round(pixelsToMm(1000))}
                    max={Math.round(pixelsToMm(10000))}
                    step="1"
                    className={`px-2 py-1.5 w-[4.5rem] text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isPageWidthValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="pageHeight" className="text-gray-600 text-sm">
                    Height:
                  </label>
                  <input
                    type="number"
                    id="pageHeight"
                    value={Math.round(pixelsToMm(pageHeight))}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setPageHeight(mmToPixels(value));
                      }
                    }}
                    min={Math.round(pixelsToMm(1000))}
                    max={Math.round(pixelsToMm(10000))}
                    step="1"
                    className={`px-2 py-1.5 w-[4.5rem] text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isPageHeightValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
                <label
                  htmlFor="combinePages"
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    id="combinePages"
                    checked={combinePages}
                    onChange={(e) => setCombinePages(e.target.checked)}
                    className="h-4 w-4 accent-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Combine Pages</span>
                </label>
              </div>
            </div>
          </div>

          {/* 2. Layout */}
          <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 sm:w-24">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                Layout
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="margin" className="text-gray-600 text-sm">
                    Margin:
                  </label>
                  <input
                    type="number"
                    id="margin"
                    value={Math.round(pixelsToMm(margin))}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setMargin(mmToPixels(value));
                      }
                    }}
                    min="0"
                    max={Math.round(pixelsToMm(pageWidth) / 2)}
                    step="1"
                    className={`px-2 py-1.5 w-16 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                      isMarginValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="spacing" className="text-gray-600 text-sm">
                    Spacing:
                  </label>
                  <input
                    type="number"
                    id="spacing"
                    value={Math.round(pixelsToMm(spacing))}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setSpacing(mmToPixels(value));
                      }
                    }}
                    min="0"
                    max={Math.round(pixelsToMm(100))}
                    step="1"
                    className={`px-2 py-1.5 w-16 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                      isSpacingValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Presentation */}
          <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 sm:w-24">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                Presentation
              </h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label
                  htmlFor="filterVideos"
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    id="filterVideos"
                    checked={filterVideos}
                    onChange={(e) => setFilterVideos(e.target.checked)}
                    className="h-4 w-4 accent-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Exclude Videos</span>
                </label>
                <label
                  htmlFor="showDates"
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    id="showDates"
                    checked={showDates}
                    onChange={(e) => setShowDates(e.target.checked)}
                    className="h-4 w-4 accent-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Show Dates</span>
                </label>
                <label
                  htmlFor="showCaptions"
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    id="showCaptions"
                    checked={showCaptions}
                    onChange={(e) => setShowCaptions(e.target.checked)}
                    className="h-4 w-4 accent-purple-600 rounded"
                  />
                  <span className="text-sm text-gray-700">Page Captions</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="fontSize" className="text-gray-600 text-sm">
                    Font Size:
                  </label>
                  <select
                    id="fontSize"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="8">8 pt</option>
                    <option value="9">9 pt</option>
                    <option value="10">10 pt</option>
                    <option value="11">11 pt</option>
                    <option value="12">12 pt</option>
                    <option value="14">14 pt</option>
                    <option value="16">16 pt</option>
                    <option value="18">18 pt</option>
                    <option value="20">20 pt</option>
                    <option value="22">22 pt</option>
                    <option value="24">24 pt</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="pageBackground"
                    className="text-gray-600 text-sm"
                  >
                    Background:
                  </label>
                  <select
                    id="pageBackground"
                    value={pageBackground}
                    onChange={(e) =>
                      setPageBackground(e.target.value as PageBackground)
                    }
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {(Object.keys(PAGE_BACKGROUNDS) as PageBackground[]).map(
                      (key) => (
                        <option key={key} value={key}>
                          {PAGE_BACKGROUNDS[key].label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Cover */}
          <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 sm:w-24">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Cover
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label
                  htmlFor="showCover"
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    id="showCover"
                    checked={showCover}
                    onChange={(e) => setShowCover(e.target.checked)}
                    className="h-4 w-4 accent-amber-600 rounded"
                  />
                  <span className="text-sm text-gray-700">
                    Include cover page
                  </span>
                </label>
                {showCover && (
                  <>
                    <input
                      type="text"
                      value={coverTitle}
                      onChange={(e) => setCoverTitle(e.target.value)}
                      placeholder={album.albumName}
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent w-48"
                    />
                    <div className="flex gap-1">
                      {COVER_LAYOUTS.map((layout) => (
                        <button
                          key={layout.value}
                          onClick={() => setCoverLayout(layout.value)}
                          className={`px-2 py-1 text-xs border rounded transition-colors ${
                            coverLayout === layout.value
                              ? "bg-amber-500 text-white border-amber-500"
                              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          {layout.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-400 sm:ml-28">
              Some print services generate their own cover and don't want
              one in the submitted PDF - turn this off if so. The cover
              uses the same page background as the rest of the book. Hover
              a photo below and click "Set as cover" to choose the cover
              image.
            </p>
          </div>

          {/* 5. Customizations (only shown when there are any) */}
          {customOrdering !== null && (
            <div className="p-3 bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 sm:w-24">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Customizations
                </h3>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-sm text-gray-600">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      Custom order
                    </span>
                    <button
                      onClick={handleResetOrdering}
                      className="text-xs px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors font-medium"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Preview - always shown; the generated PDF (if any)
          appears below once ready, rather than replacing this editor. */}
        <div
          ref={previewContainerRef}
          className="space-y-8 pb-8 px-4 sm:px-0"
        >
          {showCover &&
            (() => {
              const displayWidth = toPoints(validPageWidth);
              const displayHeight = toPoints(validPageHeight);
              const scale =
                previewWidth > 0
                  ? Math.min(1, previewWidth / displayWidth)
                  : 1;
              const imageUrl = coverAsset
                ? `${immichConfig.baseUrl}/assets/${coverAsset.id}/thumbnail?size=preview`
                : null;
              const titleInput = (
                titleFontSize: number,
                color: string,
                extraClassName = "",
              ) => (
                <input
                  value={coverTitle}
                  onChange={(e) => setCoverTitle(e.target.value)}
                  placeholder={album.albumName}
                  className={`text-center bg-transparent focus:outline-none rounded w-[90%] ${extraClassName}`}
                  style={{
                    fontFamily: "Caveat",
                    fontWeight: 600,
                    fontSize: `${titleFontSize}px`,
                    color,
                  }}
                />
              );

              return (
                <div className="relative">
                  <div className="text-center mb-2">
                    <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-sm rounded">
                      Cover
                    </span>
                  </div>
                  <div
                    className="mx-auto relative shadow-lg border border-gray-200"
                    style={{
                      width: `${displayWidth}px`,
                      height: `${displayHeight}px`,
                      zoom: scale,
                      ...pageBackgroundCss(pageBackground),
                    }}
                  >
                    {coverLayout === "text-only" && (
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-4"
                        style={{ paddingLeft: "10%", paddingRight: "10%" }}
                      >
                        <div
                          style={{
                            width: "30%",
                            height: 2,
                            backgroundColor: SCRAPBOOK.ink,
                            opacity: 0.3,
                          }}
                        />
                        {titleInput(displayWidth * 0.09, SCRAPBOOK.ink)}
                        <div
                          style={{
                            width: "30%",
                            height: 2,
                            backgroundColor: SCRAPBOOK.ink,
                            opacity: 0.3,
                          }}
                        />
                      </div>
                    )}

                    {coverLayout === "photo-title" && imageUrl && (
                      <>
                        <div
                          className="absolute shadow-lg overflow-hidden"
                          style={{
                            top: "8%",
                            left: "8%",
                            right: "8%",
                            bottom: "24%",
                            backgroundColor: SCRAPBOOK.mat,
                            padding: "3%",
                          }}
                        >
                          <img
                            src={imageUrl}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div
                          className="absolute inset-x-0 bottom-0 flex items-center justify-center"
                          style={{ height: "20%" }}
                        >
                          {titleInput(
                            displayWidth * 0.055,
                            SCRAPBOOK.ink,
                            "focus:bg-white/60",
                          )}
                        </div>
                      </>
                    )}

                    {coverLayout === "full-bleed" && imageUrl && (
                      <>
                        <img
                          src={imageUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div
                          className="absolute inset-x-0 bottom-0 flex items-center justify-center"
                          style={{
                            height: "28%",
                            background:
                              "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
                          }}
                        >
                          {titleInput(displayWidth * 0.06, "#FFFFFF")}
                        </div>
                      </>
                    )}

                    {coverLayout === "patchwork" && (
                      <>
                        <div
                          className="absolute inset-0 grid overflow-hidden"
                          style={{
                            gridTemplateColumns: `repeat(${MOSAIC_COLS}, 1fr)`,
                            gridTemplateRows: `repeat(${mosaicRows}, 1fr)`,
                          }}
                        >
                          {mosaicAssets.map((a, i) => (
                            <img
                              key={i}
                              src={`${immichConfig.baseUrl}/assets/${a.id}/thumbnail?size=thumbnail`}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ))}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className="px-6 py-3 shadow-lg"
                            style={{ backgroundColor: "rgba(255,254,252,0.92)" }}
                          >
                            {titleInput(displayWidth * 0.06, SCRAPBOOK.ink)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

          {pages.map((page) => {
            // Scale down to match PDF dimensions (72 DPI from 300 DPI)
            const displayWidth = toPoints(page.width);
            const displayHeight = toPoints(page.height);
            // Shrink to fit the available column width (combined spreads
            // are often wider than the viewport) - never scale up past 1.
            const scale =
              previewWidth > 0 ? Math.min(1, previewWidth / displayWidth) : 1;
            const scaledWidth = displayWidth * scale;
            const scaledHeight = displayHeight * scale;

            return (
              <div key={page.pageNumber} className="relative">
                {/* Page number and style controls */}
                {combinePages ? (
                  /* Combined pages mode - show controls above each logical page */
                  <div
                    className="mb-2 flex"
                    style={{
                      width: `${scaledWidth}px`,
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  >
                    {/* Left page controls */}
                    <div
                      className="flex flex-wrap items-center justify-center gap-2"
                      style={{ width: `${scaledWidth / 2}px` }}
                    >
                      <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                        Page {page.pageNumber * 2 - 1} of {totalLogicalPages}
                      </span>
                      {renderStyleSwitcher(page.pageNumber * 2 - 1)}
                    </div>

                    {/* Right page controls (only if it exists) */}
                    {page.pageNumber * 2 <= totalLogicalPages && (
                      <div
                        className="flex flex-wrap items-center justify-center gap-2"
                        style={{ width: `${scaledWidth / 2}px` }}
                      >
                        <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                          Page {page.pageNumber * 2} of {totalLogicalPages}
                        </span>
                        {renderStyleSwitcher(page.pageNumber * 2)}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Single page mode - center everything */
                  <div className="text-center mb-2 flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                      Page {page.pageNumber} of {totalLogicalPages}
                    </span>
                    {renderStyleSwitcher(page.pageNumber)}
                  </div>
                )}

                {/* Page container - laid out at its true (unscaled) size,
                    then shrunk to fit the preview column with CSS `zoom`
                    (not `transform: scale`) so every absolute-positioned
                    child (captions, photos) keeps using displayWidth-based
                    coordinates unchanged. `zoom` actually resizes the box
                    in layout, unlike `transform`, whose CSS transform on an
                    ancestor breaks native HTML5 drag-and-drop for photo
                    reordering in Chromium. */}
                <div
                  className="mx-auto relative shadow-lg border border-gray-200"
                  style={{
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                    zoom: scale,
                    ...pageBackgroundCss(pageBackground),
                  }}
                >
                  {/* Page break indicator for combined pages */}
                  {combinePages && (
                    <div
                      className="absolute top-0 bottom-0 border-l border-dashed border-gray-300 z-10 pointer-events-none"
                      style={{ left: `${displayWidth / 2}px` }}
                    />
                  )}

                  {/* Page caption(s) - editable, alternating margin band */}
                  {showCaptions &&
                    (combinePages
                      ? [
                          {
                            key: page.pageNumber * 2 - 1,
                            left: 0,
                            width: displayWidth / 2,
                          },
                          {
                            key: page.pageNumber * 2,
                            left: displayWidth / 2,
                            width: displayWidth / 2,
                          },
                        ]
                      : [{ key: page.pageNumber, left: 0, width: displayWidth }]
                    ).map((band) => {
                      if (!pageCaptions.has(band.key)) return null;
                      // Text size is the priority: the chosen font size is
                      // always honored, and the band grows to fit it if
                      // the page margin alone isn't tall enough. Uses the
                      // same sizing as the PDF version (see
                      // pageCaptionBandHeightPt) so the editor matches
                      // what the export actually looks like.
                      const captionFontSize = fontSize * 1.9;
                      const captionPaddingVertical = Math.max(
                        4,
                        toPoints(validMargin) * 0.15,
                      );
                      const bandHeight = pageCaptionBandHeightPt(
                        fontSize,
                        validMargin,
                      );
                      return (
                        <input
                          key={band.key}
                          type="text"
                          value={pageCaptions.get(band.key) || ""}
                          onChange={(e) => {
                            setPageCaptions((prev) => {
                              const next = new Map(prev);
                              next.set(band.key, e.target.value);
                              return next;
                            });
                          }}
                          className="absolute bg-transparent text-center focus:outline-none focus:bg-white/70 rounded"
                          style={{
                            left: `${band.left}px`,
                            ...(captionAtBottom(band.key)
                              ? { bottom: 0 }
                              : { top: 0 }),
                            width: `${band.width}px`,
                            height: `${bandHeight}px`,
                            paddingLeft: `${Math.max(16, band.width * 0.12)}px`,
                            paddingRight: `${Math.max(16, band.width * 0.12)}px`,
                            paddingTop: `${captionPaddingVertical}px`,
                            paddingBottom: `${captionPaddingVertical}px`,
                            boxSizing: "border-box",
                            fontFamily: "Caveat",
                            fontWeight: 600,
                            fontSize: `${captionFontSize}px`,
                            color: SCRAPBOOK.ink,
                          }}
                        />
                      );
                    })}

                  {/* Photos */}
                  {page.photos.map((photoBox) => {
                    const containerWidth = toPoints(photoBox.width);
                    const containerHeight = toPoints(photoBox.height);
                    const frameInset = Math.max(6, containerWidth * 0.035);
                    const tilt = photoTiltDeg(photoBox.id);
                    const tape = tapeStyle(photoBox.id);
                    const tapeWidth = containerWidth * 0.22;

                    // Text card - no backing photo, an editable note
                    // mounted the same way as a photo card.
                    if (!photoBox.asset) {
                      return (
                        <div
                          key={photoBox.id}
                          className="absolute"
                          style={{
                            left: `${toPoints(photoBox.x)}px`,
                            top: `${toPoints(photoBox.y)}px`,
                            width: `${containerWidth}px`,
                            height: `${containerHeight}px`,
                          }}
                        >
                          <div
                            className="absolute inset-0"
                            style={{
                              transform: `rotate(${tilt}deg) scale(0.93)`,
                              boxShadow: `2px 5px 10px ${SCRAPBOOK.shadow}`,
                              backgroundColor: SCRAPBOOK.mat,
                            }}
                          >
                            {/* Flex wrapper centers the (auto-growing)
                                textarea both horizontally and vertically -
                                a native <textarea> has no way to vertically
                                center its own text, so the box itself has
                                to hug its content and be centered instead. */}
                            <div
                              className="absolute flex items-center justify-center"
                              style={{
                                inset: frameInset * 2,
                              }}
                            >
                              <textarea
                                ref={(el) => {
                                  if (!el) return;
                                  el.style.height = "auto";
                                  el.style.height = `${Math.min(
                                    el.scrollHeight,
                                    containerHeight - frameInset * 4,
                                  )}px`;
                                }}
                                value={textCardContents.get(photoBox.id) || ""}
                                onChange={(e) => {
                                  setTextCardContents((prev) => {
                                    const next = new Map(prev);
                                    if (e.target.value) {
                                      next.set(photoBox.id, e.target.value);
                                    } else {
                                      next.delete(photoBox.id);
                                    }
                                    return next;
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                placeholder="Write something..."
                                className="w-full bg-transparent text-center resize-none overflow-hidden focus:outline-none focus:bg-white/70 rounded placeholder:text-gray-300"
                                style={{
                                  maxHeight: `${containerHeight - frameInset * 4}px`,
                                  fontFamily: "Caveat",
                                  fontWeight: 500,
                                  fontSize: `${fontSize * 1.5}px`,
                                  color: SCRAPBOOK.ink,
                                  lineHeight: 1.2,
                                }}
                              />
                            </div>
                            <div
                              className="absolute"
                              style={{
                                top: -frameInset * 0.5,
                                left: `calc(50% - ${tapeWidth / 2}px)`,
                                width: tapeWidth,
                                height: frameInset * 1.6,
                                backgroundColor: tape.color,
                                opacity: 0.8,
                                transform: `rotate(${tape.tiltDeg}deg)`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    }

                    const asset = photoBox.asset;
                    const imageUrl = `${immichConfig.baseUrl}/assets/${asset.id}/thumbnail?size=preview`;

                    const isBeingDragged =
                      reorderDragState?.draggedAssetId === asset.id;
                    const isDropTarget = dropTargetAssetId === asset.id;
                    const isReordered = manuallyMovedIds.has(asset.id);

                    const dateStripHeight = showDates ? fontSize * 1.6 : 0;
                    const cardCaption = cardCaptions.get(asset.id) || "";
                    const hasCardCaption = cardCaption.length > 0;
                    // Only cards that actually have a caption reserve the
                    // extra strip - an empty card keeps its full image, with
                    // just a hover-only "+ caption" hint overlaid on it.
                    const captionStripHeight = hasCardCaption
                      ? fontSize * 1.4
                      : 0;
                    const bottomStripHeight =
                      dateStripHeight + captionStripHeight;

                    return (
                      <div
                        key={photoBox.id}
                        data-reorder-asset-id={asset.id}
                        className={`absolute group cursor-move ${isBeingDragged ? "opacity-50" : ""}`}
                        style={{
                          left: `${toPoints(photoBox.x)}px`,
                          top: `${toPoints(photoBox.y)}px`,
                          width: `${containerWidth}px`,
                          height: `${containerHeight}px`,
                          touchAction: "none",
                        }}
                        onPointerDown={(e) =>
                          handleReorderPointerDown(asset.id, e)
                        }
                      >
                        {/* Drop indicator - shown on left edge when hovering during drag */}
                        {isDropTarget && reorderDragState && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-lg z-10" />
                        )}

                        {/* Polaroid card - visual only, mildly askew */}
                        <div
                          className="absolute inset-0"
                          style={{
                            transform: `rotate(${tilt}deg) scale(0.93)`,
                            boxShadow: `2px 5px 10px ${SCRAPBOOK.shadow}`,
                            backgroundColor: SCRAPBOOK.mat,
                          }}
                        >
                          <div
                            className="absolute overflow-hidden"
                            style={{
                              top: frameInset,
                              left: frameInset,
                              right: frameInset,
                              bottom: frameInset + bottomStripHeight,
                            }}
                          >
                            <img
                              src={imageUrl}
                              alt={asset.originalFileName}
                              className="object-contain w-full h-full"
                              loading="lazy"
                            />
                          </div>
                          {
                            // Always mounted (not conditionally rendered on
                            // hasCardCaption) so typing the first character
                            // doesn't swap the DOM node under the user's
                            // cursor and drop focus. Empty cards get a
                            // hover-only overlay that doesn't reserve any
                            // layout space; once there's text, it moves into
                            // the reserved strip below the image.
                            <input
                              type="text"
                              value={cardCaption}
                              onChange={(e) => {
                                setCardCaptions((prev) => {
                                  const next = new Map(prev);
                                  if (e.target.value) {
                                    next.set(asset.id, e.target.value);
                                  } else {
                                    next.delete(asset.id);
                                  }
                                  return next;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              placeholder="+ caption"
                              // When empty, this sits invisible over part of
                              // the image - without pointer-events-none it
                              // silently swallows the mousedown that should
                              // start a drag-to-reorder, making dragging
                              // "work sometimes" depending on where the user
                              // grabs the card.
                              className={`absolute text-center focus:outline-none rounded transition-opacity ${
                                hasCardCaption
                                  ? "bg-transparent focus:bg-white/70"
                                  : "opacity-0 pointer-events-none group-hover:opacity-70 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto bg-white/80"
                              }`}
                              style={{
                                left: frameInset,
                                right: frameInset,
                                bottom: hasCardCaption
                                  ? frameInset * 0.3 + dateStripHeight
                                  : frameInset,
                                height: fontSize * 1.4,
                                fontFamily: "Caveat",
                                fontWeight: 500,
                                fontSize: `${fontSize * 1.3}px`,
                                color: SCRAPBOOK.ink,
                                lineHeight: 1,
                              }}
                            />
                          }
                          {showDates && asset.fileCreatedAt && (
                            <div
                              className="absolute flex items-end justify-center text-center"
                              style={{
                                left: frameInset,
                                right: frameInset,
                                bottom: frameInset * 0.3,
                                height: dateStripHeight,
                                fontFamily: "Caveat",
                                fontWeight: 500,
                                fontSize: `${fontSize * 1.3}px`,
                                color: SCRAPBOOK.ink,
                                lineHeight: 1,
                              }}
                            >
                              {new Date(
                                asset.fileCreatedAt,
                              ).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                          )}
                          {/* Washi tape */}
                          <div
                            className="absolute"
                            style={{
                              top: -frameInset * 0.5,
                              left: `calc(50% - ${tapeWidth / 2}px)`,
                              width: tapeWidth,
                              height: frameInset * 1.6,
                              backgroundColor: tape.color,
                              opacity: 0.8,
                              transform: `rotate(${tape.tiltDeg}deg)`,
                            }}
                          />
                        </div>

                        {/* Cover picker */}
                        {coverAsset?.id === asset.id ? (
                          <div
                            className="absolute top-2 right-2 bg-amber-500 text-white px-2 py-0.5 rounded shadow text-xs font-medium z-10"
                            title="This is the cover photo"
                          >
                            ★ Cover
                          </div>
                        ) : (
                          <div
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded shadow text-xs font-medium z-10"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCoverAssetId(asset.id);
                            }}
                            title="Set as cover photo"
                          >
                            Set as cover
                          </div>
                        )}

                        {/* Customization indicator */}
                        {isReordered && (
                          <div
                            className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full shadow-lg z-10"
                            title="Image reordered"
                          />
                        )}

                        {/* Reset button - shown on hover for reordered images */}
                        {isReordered && (
                          <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded shadow-lg text-xs font-medium"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleResetCard(asset.id);
                            }}
                            title="Reset order"
                          >
                            Reset
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {showCover &&
            (() => {
              const displayWidth = toPoints(validPageWidth);
              const displayHeight = toPoints(validPageHeight);
              const scale =
                previewWidth > 0
                  ? Math.min(1, previewWidth / displayWidth)
                  : 1;
              return (
                <div className="relative">
                  <div className="text-center mb-2">
                    <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-sm rounded">
                      Back Cover
                    </span>
                  </div>
                  <div
                    className="mx-auto relative shadow-lg border border-gray-200"
                    style={{
                      width: `${displayWidth}px`,
                      height: `${displayHeight}px`,
                      zoom: scale,
                      ...pageBackgroundCss(pageBackground),
                    }}
                  />
                </div>
              );
            })()}
        </div>

      {pdfError && (
        <p className="px-4 sm:px-0 text-sm text-red-600">{pdfError}</p>
      )}

      {pdfUrl && (
        <div
          className="w-full mt-4 px-4 sm:px-0"
          style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}
        >
          <iframe
            src={pdfUrl}
            title="Generated PDF"
            className="w-full h-full border border-gray-200 rounded-lg shadow-sm"
          />
        </div>
      )}
    </div>
  );
}

export default PhotoGrid;
