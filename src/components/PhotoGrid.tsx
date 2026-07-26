import { useState, useEffect, useMemo, useRef } from "react";
import {
  getAlbumInfo,
  getTimeBuckets,
  getTimeBucket,
  getFaces,
  type AlbumResponseDto,
  type AssetResponseDto,
  type AssetFaceResponseDto,
} from "@immich/sdk";
import { pdf, Font } from "@react-pdf/renderer";
import {
  calculatePageLayout,
  mmToPixels,
  pixelsToMm,
  naturalAspectRatio,
} from "../utils/pageLayout";
import type { ImmichConfig } from "../types";
import { t, type Language } from "../i18n";
import {
  type PageBackground,
  type CardStyle,
  type CoverLayout,
  type FocalPoint,
  type FrameSize,
  type AlbumConfig,
  loadAlbumConfig,
  detectAlbumChanges,
  saveAlbumConfig,
} from "../config/albumConfig";
import { buildPdfDocument } from "../pdf/buildPdfDocument";
import { mergePdfBlobs } from "../pdf/mergePdf";
import { SidebarPageSettings } from "./sidebar/SidebarPageSettings";
import { SidebarLayoutSettings } from "./sidebar/SidebarLayoutSettings";
import { SidebarPresentationSettings } from "./sidebar/SidebarPresentationSettings";
import { SidebarCoverSettings } from "./sidebar/SidebarCoverSettings";
import { FrontCoverStandalone } from "./cover/FrontCoverStandalone";
import { BackCoverStandalone } from "./cover/BackCoverStandalone";
import { CoverSpread } from "./cover/CoverSpread";
import { PageNavRail, PageThumbButton, PAGE_THUMB_WIDTH, pageSignature } from "./PageNavRail";
import { useDragToScroll } from "../hooks/useDragToScroll";
import {
  type HistoryOperation,
  type FlattenedState,
  useEditHistory,
} from "../history/editHistory";
import {
  HistoryPanel,
  ResetAllConfirmDialog,
  FlattenConfirmDialog,
} from "../history/HistoryPanel";
import roboto400 from "@fontsource/roboto/files/roboto-latin-400-normal.woff?url";
import roboto500 from "@fontsource/roboto/files/roboto-latin-500-normal.woff?url";
import caveat500 from "@fontsource/caveat/files/caveat-latin-500-normal.woff?url";
import caveat600 from "@fontsource/caveat/files/caveat-latin-600-normal.woff?url";

// The target of a "place this not-yet-in-the-book photo here" request -
// see performNewAssetPlacement. Module-level (not just local to
// PhotoGridEditor) so cover-rendering components can type the target
// they hand back for a placement/swap without depending on the whole
// editor component.
export type NewAssetTarget =
  | { kind: "cover" }
  | { kind: "back-cover" }
  | { kind: "interior-replace"; placeholderAsset: AssetResponseDto }
  | { kind: "interior-swap"; asset: AssetResponseDto };

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
export const SCRAPBOOK = {
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

export const PAGE_BACKGROUNDS: Record<
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

  // Same base colors as the paper-grain family above, flat (no texture) -
  // for matching a solid color elsewhere (e.g. a Flexilivre spine) without
  // the grain showing through.
  "kraft-plain": { label: "Kraft", base: "#C9A97E", texture: "none", accent: "" },
  "cream-plain": { label: "Cream", base: "#F8F1E4", texture: "none", accent: "" },
  "sage-plain": { label: "Sage", base: "#E7ECDF", texture: "none", accent: "" },
  "dusk-blue-plain": { label: "Dusk blue", base: "#E5EBF3", texture: "none", accent: "" },
  "blush-plain": { label: "Blush", base: "#F6E9E5", texture: "none", accent: "" },
  "charcoal-plain": { label: "Charcoal", base: "#E9E6E1", texture: "none", accent: "" },

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
export const PAGE_BACKGROUND_GROUPS: { label: string; keys: PageBackground[] }[] = [
  {
    label: "Plain",
    keys: [
      "white",
      "kraft-plain",
      "cream-plain",
      "sage-plain",
      "dusk-blue-plain",
      "blush-plain",
      "charcoal-plain",
    ],
  },
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
export const PAGE_BACKGROUND_BLOBS = [
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
export const PAGE_BACKGROUND_SPECKLES = Array.from({ length: 50 }, (_, i) => ({
  x: seededRandom("speckle-x", i),
  y: seededRandom("speckle-y", i),
  r: 2 + seededRandom("speckle-r", i) * 3,
  color: CONFETTI_COLORS[Math.floor(seededRandom("speckle-c", i) * CONFETTI_COLORS.length)],
}));

export function pageBackgroundCss(bg: PageBackground): React.CSSProperties {
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

// Shared by the web preview and the PDF renderer (src/pdf/buildPdfDocument.tsx).
export function photoTiltDeg(assetId: string): number {
  const maxDeg = 3;
  return (seededRandom(assetId, 1) * 2 - 1) * maxDeg;
}

export function tapeStyle(assetId: string) {
  const color = SCRAPBOOK.tape[Math.floor(seededRandom(assetId, 2) * 3)];
  const tiltDeg = (seededRandom(assetId, 3) * 2 - 1) * 8;
  return { color, tiltDeg };
}

// Alternate the page caption between the top and bottom margin band so a
// spread doesn't read as a rigid, repeated template.
export function captionAtBottom(logicalPageNumber: number): boolean {
  return logicalPageNumber % 2 === 0;
}

export interface PageFormat {
  // Which product line this belongs to (e.g. "Photo Book", "Livre de
  // poche") - printers with more than one category get a category
  // selector above the format chips, so picking a size is two short
  // steps instead of one long, mixed list.
  category: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export interface Printer {
  id: string;
  label: string;
  logo: string | null;
  // Where to actually upload the generated PDF - absent for "libre",
  // since it isn't tied to a specific print service.
  url?: string;
  formats: PageFormat[];
  // Recommended bleed in mm - null means bleed isn't part of this
  // printer's expected file (adding it would make the PDF the wrong
  // size), so the bleed control is locked off instead of just defaulted.
  bleedMm: number | null;
  // Real printers only accept exactly their own listed trim sizes, and
  // (per their own submission docs) one physical page per PDF page - so
  // width/height become chip-only and spreads are disabled. PDF Libre
  // keeps every field freely editable, as before.
  constrained: boolean;
  // How many interior pages a submitted file must be a multiple of -
  // books are printed and bound in sheets, not single leaves, so most
  // binderies require at least an even count; some (Flexilivre: 4, see
  // below) need a stricter multiple. Defaults to 2 (even) when unset.
  interiorPageMultiple?: number;
  note?: string;
}

// Sources: Flexilivre's own upload/format help pages (single PDF, cover
// as first/last page, no separate back-cover pages, 5mm bleed) and a
// real Blurb "PDF to Book" upload error for this album (Small Square
// "18x18cm" nominal actually rejects anything but 6.875in/174.625mm
// exactly). Pixartprinting and Pumbo need a genuinely different file
// structure (a separate wraparound cover spread with computed spine/
// mors/chasse) that this tool doesn't produce yet - see the "Imprimer
// chez" section below, where they're commented out for the same reason.
export const PRINTERS: Printer[] = [
  {
    id: "libre",
    label: "PDF Libre",
    logo: null,
    formats: [
      { category: "Standard", label: "A4 Portrait", widthMm: 210, heightMm: 297 },
      { category: "Standard", label: "A4 Landscape", widthMm: 297, heightMm: 210 },
      { category: "Standard", label: "Square 21x21", widthMm: 210, heightMm: 210 },
      { category: "Standard", label: "Square 30x30", widthMm: 300, heightMm: 300 },
    ],
    bleedMm: null,
    constrained: false,
  },
  {
    id: "flexilivre",
    label: "Flexilivre",
    logo: "/logos/flexilivre.svg",
    url: "https://www.flexilivre.com/fichier/",
    formats: [
      { category: "Standard", label: "A4 Portrait", widthMm: 210, heightMm: 297 },
      { category: "Standard", label: "A4 Paysage", widthMm: 297, heightMm: 210 },
      { category: "Standard", label: "A5 Portrait", widthMm: 150, heightMm: 210 },
      { category: "Standard", label: "A5 Paysage", widthMm: 210, heightMm: 150 },
      { category: "Standard", label: "Carré 21x21", widthMm: 210, heightMm: 210 },
      { category: "Standard", label: "Grand carré 30x30", widthMm: 300, heightMm: 300 },
    ],
    bleedMm: 5,
    constrained: true,
    // Confirmed via Flexilivre's own file-prep docs: interior page count
    // must be a multiple of 4.
    interiorPageMultiple: 4,
  },
  {
    id: "blurb",
    label: "Blurb",
    logo: "/logos/blurb.png",
    url: "https://www.blurb.com/pdf-to-book",
    formats: [
      // Confirmed via Blurb's spec calculator, which clearly separates
      // trim ("Format de la page / repère de rognage") from the
      // bleed-inclusive "final exported PDF" figure - only the trim
      // value is used here, matching this tool's flat-page convention.
      // Interior trim is identical across cover types (softcover, rigide
      // jaquette, rigide imprimée) for a given size - only the cover
      // file itself differs, which this tool doesn't generate anyway.
      // Small Square is additionally confirmed by a real "PDF to Book"
      // upload error for this album (174.625mm was the size Blurb
      // actually required, not the 18cm the nominal name implies).
      {
        category: "Photo Book",
        label: "Mini Square",
        widthMm: 127,
        heightMm: 127,
      },
      {
        category: "Photo Book",
        label: "Small Square",
        widthMm: 174.625,
        heightMm: 174.625,
      },
      {
        category: "Photo Book",
        label: "Large Square",
        widthMm: 298.45,
        heightMm: 298.45,
      },
      {
        category: "Photo Book",
        label: "Portrait standard",
        widthMm: 203.2,
        heightMm: 254.01,
      },
      {
        category: "Photo Book",
        label: "Paysage standard",
        widthMm: 241.3,
        heightMm: 203.21,
      },
      {
        category: "Photo Book",
        label: "Grand paysage",
        widthMm: 320.675,
        heightMm: 276.225,
      },
      {
        category: "Livre de poche",
        label: "13x20cm",
        widthMm: 127,
        heightMm: 203.21,
      },
      {
        category: "Livre de poche",
        label: "15x23cm",
        widthMm: 152.4,
        heightMm: 228.61,
      },
      {
        category: "Livre de poche",
        label: "20x25cm",
        widthMm: 203.2,
        heightMm: 254.01,
      },
      {
        category: "Magazine",
        label: "Premium - 21.5x28cm",
        widthMm: 215.9,
        heightMm: 279.4,
      },
    ],
    bleedMm: null,
    constrained: true,
  },
];

interface PhotoGridProps {
  immichConfig: ImmichConfig;
  album: AlbumResponseDto;
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const COVER_LAYOUTS: { value: CoverLayout; labelKey: keyof typeof translations.en }[] = [
  { value: "photo-title", labelKey: "coverLayoutPhotoTitle" },
  { value: "full-bleed", labelKey: "coverLayoutFullBleed" },
  { value: "text-only", labelKey: "coverLayoutTextOnly" },
];

export const CARD_STYLES: { value: CardStyle; label: string }[] = [
  { value: "scrapbook", label: "Scrapbook" },
  { value: "clean", label: "Clean" },
];

// Convert 300 DPI pixels to 72 DPI points for PDF
// At 300 DPI: 1 inch = 300 pixels
// At 72 DPI: 1 inch = 72 points
// Conversion: points = pixels * (72/300)
export const toPoints = (pixels: number) => pixels * (72 / 300);

// How tall the page-caption band needs to be (in points) to comfortably
// fit its text: react-pdf drops the text entirely if its box isn't
// noticeably taller than the font size (confirmed by isolated testing -
// a box only ~1.1x the font size renders nothing, ~1.6x is reliable).
// Used both for the caption's own rendered height AND to compute the
// content area's effective margin (see the `pages` useMemo) - without
// the latter, photos are laid out right up to the nominal margin and
// end up painted over a caption band that's actually taller than that.
export function pageCaptionBandHeightPt(fontSize: number, marginPx: number): number {
  const captionFontSizePt = fontSize * 1.9;
  const paddingPt = Math.max(4, toPoints(marginPx) * 0.15);
  return Math.max(toPoints(marginPx), captionFontSizePt * 1.6 + paddingPt * 2);
}

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

// Smart-crop focal point: the area-weighted centroid of every face Immich
// detected on this asset, normalized to (0-1, 0-1) - used to bias an
// object-fit: cover crop toward it instead of a dead-center crop that can
// cut off a face. null means the photo was checked and no face was found
// (falls back to the default center crop).
// NOTE: face data does NOT come from getAssetInfo()/AssetResponseDto -
// `people[].faces` and `unassignedFaces` are never populated by
// /api/assets/{id} on this Immich version (confirmed by direct API
// inspection: people[] lists names but each person's faces[] is always
// empty, and unassignedFaces is always null). The bounding boxes live
// behind the dedicated /api/faces?id= endpoint instead (SDK: getFaces),
// which is what ensureFocalPoints calls.
// CAVEAT: boundingBoxX1/X2/Y1/Y2 are relative to that face's own
// imageWidth/imageHeight - if that reference frame ever differs from the
// displayed (EXIF-rotation-corrected) image, the computed point will be
// off. Unverified against a real portrait/rotated photo as of writing.
export function computeFocalPoint(
  faces: AssetFaceResponseDto[],
): FocalPoint | null {
  if (faces.length === 0) return null;

  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;
  for (const f of faces) {
    const w = f.imageWidth || 1;
    const h = f.imageHeight || 1;
    const x1 = f.boundingBoxX1 / w;
    const x2 = f.boundingBoxX2 / w;
    const y1 = f.boundingBoxY1 / h;
    const y2 = f.boundingBoxY2 / h;
    const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    // A degenerate (zero-area) box still counts a little, rather than
    // vanishing entirely from the average.
    const weight = area > 0 ? area : 1e-6;
    totalWeight += weight;
    sumX += ((x1 + x2) / 2) * weight;
    sumY += ((y1 + y2) / 2) * weight;
  }
  if (totalWeight === 0) return null;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp01(sumX / totalWeight), y: clamp01(sumY / totalWeight) };
}

// CSS `object-position` value for a focal point, or undefined (browser's
// own 50%/50% default) when none was found - shared by every `object-cover`
// image in the web preview.
export function focalPointToCss(
  point: FocalPoint | null | undefined,
): string | undefined {
  if (!point) return undefined;
  return `${point.x * 100}% ${point.y * 100}%`;
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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading photobook...
          </p>
        </div>
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
  darkMode,
  onToggleDarkMode,
  initialConfig,
}: PhotoGridEditorProps) {
  const [assets, setAssets] = useState<AssetResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  // Two shapes: a "done/total" step count for the image-fetch and
  // per-chunk render phases (discrete steps), and a "percent" fraction
  // for the merge phase (a single request whose progress is measured in
  // bytes transferred, not steps).
  const [pdfProgress, setPdfProgress] = useState<
    { done: number; total: number } | { percent: number } | null
  >(null);
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
  const [printerId, setPrinterId] = useState(initialConfig.printerId);
  const [pageWidth, setPageWidth] = useState(initialConfig.pageWidth);
  const [pageHeight, setPageHeight] = useState(initialConfig.pageHeight);
  const [margin, setMargin] = useState(initialConfig.margin);

  // Layout settings
  const [spacing, setSpacing] = useState(initialConfig.spacing);
  // Never filter videos - simpler UX
  const filterVideos = false;
  // Bleed ("fond perdu") - an optional border around the trim size,
  // filled with the page background, so a print shop trimming the book
  // doesn't reveal a white edge. Off by default since most digital/home
  // printing doesn't need it.
  const [bleedEnabled, setBleedEnabled] = useState(
    initialConfig.bleedEnabled,
  );
  const [bleed, setBleed] = useState(initialConfig.bleed);

  const selectedPrinter =
    PRINTERS.find((p) => p.id === printerId) ?? PRINTERS[0];

  // Printers with more than one product line (Blurb: Photo Book / Livre
  // de poche / Magazine) get a category selector above the format
  // chips, so the list stays short instead of mixing every size from
  // every product together. Not persisted - just derived from whichever
  // printer/format is initially active.
  const [formatCategory, setFormatCategory] = useState(
    () =>
      PRINTERS.find((p) => p.id === initialConfig.printerId)?.formats.find(
        (f) =>
          Math.abs(f.widthMm - pixelsToMm(initialConfig.pageWidth)) < 0.1 &&
          Math.abs(f.heightMm - pixelsToMm(initialConfig.pageHeight)) < 0.1,
      )?.category ??
      PRINTERS.find((p) => p.id === initialConfig.printerId)?.formats[0]
        ?.category ??
      "",
  );

  // Switching printer re-derives everything that printer constrains:
  // snaps to its first format, forces bleed to its requirement (or off,
  // if bleed isn't part of that printer's expected file), and turns off
  // spreads (every printer profile here expects one physical page per
  // PDF page - only "PDF Libre" leaves this alone).
  const handleSelectPrinter = (id: string) => {
    const printer = PRINTERS.find((p) => p.id === id) ?? PRINTERS[0];
    setPrinterId(id);
    const firstFormat = printer.formats[0];
    if (firstFormat) {
      setPageWidth(mmToPixels(firstFormat.widthMm));
      setPageHeight(mmToPixels(firstFormat.heightMm));
      setFormatCategory(firstFormat.category);
    }
    if (printer.constrained) {
      if (printer.bleedMm !== null) {
        setBleedEnabled(true);
        setBleed(mmToPixels(printer.bleedMm));
      } else {
        setBleedEnabled(false);
      }
    }
  };

  // Switching category snaps to its first format, same reasoning as
  // switching printer - keeps the format chip row always showing one
  // active selection instead of momentarily matching nothing.
  const handleSelectCategory = (category: string) => {
    setFormatCategory(category);
    const firstFormat = selectedPrinter.formats.find(
      (f) => f.category === category,
    );
    if (firstFormat) {
      setPageWidth(mmToPixels(firstFormat.widthMm));
      setPageHeight(mmToPixels(firstFormat.heightMm));
    }
  };

  // Validation helpers
  const isPageWidthValid = pageWidth >= 1000 && pageWidth <= 10000;
  const isPageHeightValid = pageHeight >= 1000 && pageHeight <= 10000;
  const isMarginValid = margin >= 0 && margin <= pageWidth / 2;
  const isSpacingValid = spacing >= 0 && spacing <= 100;
  const isBleedValid =
    bleed >= 0 && bleed <= Math.min(pageWidth, pageHeight) / 4;

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
  const validBleed = isBleedValid
    ? bleed
    : Math.max(0, Math.min(Math.min(validPageWidth, validPageHeight) / 4, bleed));

  // Display settings
  const [showDates, setShowDates] = useState(initialConfig.showDates);
  const [showCaptions, setShowCaptions] = useState(initialConfig.showCaptions);
  const [fontSize, setFontSize] = useState(initialConfig.fontSize);
  const [pageBackground, setPageBackground] = useState<PageBackground>(
    initialConfig.pageBackground,
  );
  const [cardStyle, setCardStyle] = useState<CardStyle>(
    initialConfig.cardStyle,
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
  const [focalPoints, setFocalPoints] = useState<
    Map<string, FocalPoint | null>
  >(() => new Map(Object.entries(initialConfig.focalPoints)));
  // Ids currently being fetched via getFaces - a ref (not state) so
  // ensureFocalPoints can dedupe concurrent calls without waiting for a
  // re-render.
  const focalPointFetchesInFlight = useRef<Set<string>>(new Set());
  // Manual bento split-boundary drags, keyed by SplitInfo.path - see the
  // boundary drag effect below.
  const [boundaryOverrides, setBoundaryOverrides] = useState<
    Map<string, number>
  >(() => new Map(Object.entries(initialConfig.boundaryOverrides)));
  // Manual bento split-axis flips (stacked <-> side-by-side), same
  // keying as boundaryOverrides - see the double-click handler on each
  // boundary handle below.
  const [axisOverrides, setAxisOverrides] = useState<
    Map<string, "vertical" | "horizontal">
  >(() => new Map(Object.entries(initialConfig.axisOverrides)));
  // The boundary currently being dragged, if any - a live React state
  // (unlike the crop-pan drag) because moving one boundary must reflow
  // every affected cell's rect, not just one image's CSS position.
  const [boundaryDragState, setBoundaryDragState] = useState<{
    path: string;
    pageNumber: number;
    axis: "vertical" | "horizontal";
    rect: { x: number; y: number; width: number; height: number };
    startX: number;
    startY: number;
    startFraction: number;
    scale: number;
    // The override value in effect before this drag began, for the
    // history entry - undefined if this boundary had never been
    // dragged before (the auto-computed fraction was in effect).
    prevFraction: number | undefined;
  } | null>(null);
  // Live fraction for the boundary currently being dragged, merged into
  // the layout computation below - separate from `boundaryOverrides`
  // (the persisted map) so a drag-in-progress doesn't autosave every
  // frame, only once committed on release.
  const [liveBoundaryFraction, setLiveBoundaryFraction] = useState<{
    path: string;
    fraction: number;
  } | null>(null);
  // Boundaries the user has right-clicked to send behind whichever other
  // boundary currently overlaps them - two split lines can land at (or
  // get magnet-snapped to) the exact same spot, and without this,
  // whichever one happens to render on top would be the only one ever
  // reachable again by pointer. Purely a transient view concern (not
  // part of the book's saved state).
  const [boundariesSentToBack, setBoundariesSentToBack] = useState<
    Set<string>
  >(new Set());
  // Dragging a "photo-title" cover's white mat/card resize handle - same
  // shape as boundaryDragState/liveBoundaryFraction above (a real drag,
  // captured start state, rAF-throttled live preview, committed once on
  // release), but for the frame's width/height fraction instead of a
  // bento split's position.
  const [frameResizeState, setFrameResizeState] = useState<{
    target: "cover" | "back-cover";
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    availWidth: number;
    availHeight: number;
    scale: number;
    prevSize: FrameSize | null;
  } | null>(null);
  const [liveFrameSize, setLiveFrameSize] = useState<{
    target: "cover" | "back-cover";
    width: number;
    height: number;
  } | null>(null);
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
  // Missing photo placeholders - asset IDs that were in the photobook but removed from album
  const [missingAssetIds, setMissingAssetIds] = useState<Set<string>>(new Set());
  // Subset of missingAssetIds the user explicitly "set aside" (still in
  // the Immich album, unlike the rest of missingAssetIds) - tracked
  // separately purely so it can be persisted and restored on reload; see
  // setAsideAssetIds in albumConfig.ts.
  const [setAsideAssetIds, setSetAsideAssetIds] = useState<Set<string>>(new Set());
  const setAsideRestoredRef = useRef(false);
  const [changesDetected, setChangesDetected] = useState(false);
  const [isDetectingChanges, setIsDetectingChanges] = useState(true);
  // New photos - assets in the album but not in the photobook yet
  const [newAssets, setNewAssets] = useState<AssetResponseDto[]>([]);
  const [selectedNewAsset, setSelectedNewAsset] = useState<AssetResponseDto | null>(null);
  const [loadedNewAssetIds, setLoadedNewAssetIds] = useState<Set<string>>(new Set());
  // Always show cover - simpler UX
  const showCover = true;
  const [separatedCover, setSeparatedCover] = useState(initialConfig.separatedCover);
  const [spineWidth, setSpineWidth] = useState(initialConfig.spineWidth);
  const [spineColor, setSpineColor] = useState(initialConfig.spineColor);
  const [spineTextColor, setSpineTextColor] = useState(initialConfig.spineTextColor);
  const [spineTextSize, setSpineTextSize] = useState(initialConfig.spineTextSize);
  const [spineTitle, setSpineTitle] = useState(initialConfig.spineTitle || album.albumName);
  const [coverTitle, setCoverTitle] = useState(
    initialConfig.coverTitle || album.albumName,
  );
  const [coverTextSize, setCoverTextSize] = useState(initialConfig.coverTextSize);
  const [coverAssetId, setCoverAssetId] = useState<string | null>(
    initialConfig.coverAssetId,
  );
  const [coverLayout, setCoverLayout] = useState<CoverLayout>(
    initialConfig.coverLayout,
  );
  const [coverFrameSize, setCoverFrameSize] = useState<FrameSize | null>(
    initialConfig.coverFrameSize,
  );
  const [backCoverAssetId, setBackCoverAssetId] = useState<string | null>(
    initialConfig.backCoverAssetId,
  );
  const [backCoverLayout, setBackCoverLayout] = useState<CoverLayout>(
    initialConfig.backCoverLayout,
  );
  const [backCoverFrameSize, setBackCoverFrameSize] = useState<FrameSize | null>(
    initialConfig.backCoverFrameSize,
  );
  const [backCoverText, setBackCoverText] = useState(
    initialConfig.backCoverText,
  );
  const [backCoverTextSize, setBackCoverTextSize] = useState(initialConfig.backCoverTextSize);
  const [backCoverPlainText, setBackCoverPlainText] = useState(
    initialConfig.backCoverPlainText,
  );
  // Always exclude cover photos from pages - simpler UX
  const excludeCoverPhotosFromPages = true;
  // Which settings tab is showing - purely local UI state, not worth
  // persisting per album.
  const [settingsTab, setSettingsTab] = useState<
    "page" | "layout" | "presentation" | "cover"
  >("page");
  // Sidebar collapse is a layout preference, not per-album content, so
  // it lives in its own localStorage key (same pattern as dark mode)
  // rather than in AlbumConfig.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem("immich-book-sidebar-collapsed") === "true",
  );
  useEffect(() => {
    localStorage.setItem(
      "immich-book-sidebar-collapsed",
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);
  // Drag state for reordering. Dragging no longer swaps cards outright -
  // on a "croppable" (object-cover) card it instead pans the smart-crop
  // focal point (see handleReorderPointerDown/the pointermove effect
  // below); on any other card it's inert. Swapping is click-only now
  // (arm with a click, confirm with a second click) - see swapFirstId.
  // `pan`, when present, carries everything the drag needs to compute a
  // new focal point purely from pixel deltas, without touching React
  // state until the gesture ends (state updates on every pointermove
  // would be a lot of re-renders of this very large component tree).
  const [reorderDragState, setReorderDragState] = useState<{
    draggedAssetId: string;
    pan?: {
      imgEl: HTMLImageElement;
      startX: number;
      startY: number;
      startFocalX: number;
      startFocalY: number;
      // The actual pre-drag value (possibly absent), for the history
      // entry - distinct from startFocalX/Y above, which default to
      // 0.5/0.5 for the pan math and would otherwise make an undo pin a
      // card at dead-center instead of clearing back to "no override".
      prevPoint: FocalPoint | null;
      containerWidth: number;
      containerHeight: number;
      naturalWidth: number;
      naturalHeight: number;
    };
  } | null>(null);
  // Selected photo for swapping (can be cover, back-cover, or regular photo)
  const [selectedPhotoForSwap, setSelectedPhotoForSwap] = useState<{
    type: 'cover' | 'back-cover' | 'photo';
    assetId: string;
  } | null>(null);

  // Armed card for click-to-swap - an alternative to dragging for two
  // cards that are far apart (different pages, off the visible area). A
  // plain click (pointerdown+up with no movement, no drop) arms a card;
  // a second plain click on another card swaps them. Set from within the
  // same pointer handling as the drag gesture below, so both are always
  // available together with no separate mode.
  const [swapFirstId, setSwapFirstId] = useState<string | null>(null);

  // Confirmation dialog for click-to-swap
  const [swapConfirmation, setSwapConfirmation] = useState<{
    firstId: string;
    secondId: string;
  } | null>(null);

  // Confirmation dialog for placing a newly-detected photo (from the
  // "new photos to place" panel) onto a cover/back-cover/interior slot -
  // deferred so every placement goes through the same confirm-then-apply
  // step as an existing-card swap, instead of applying instantly.
  const [newAssetPlacementConfirmation, setNewAssetPlacementConfirmation] =
    useState<{ newAsset: AssetResponseDto; target: NewAssetTarget } | null>(
      null,
    );

  // History - stored in localStorage per album
  const [history, setHistory] = useState<HistoryOperation[]>(() => {
    try {
      const stored = localStorage.getItem(`immich-book-history-${album.id}`);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      // Filter out old-format new-photo operations (migration safety)
      return parsed.filter((op: any) => {
        // Remove operations that don't have the new format (missing asset objects)
        if (op.type === 'swap-new-photo' && !op.newAsset) return false;
        if (op.type === 'replace-placeholder' && !op.newAsset) return false;
        if (op.type === 'insert-new-photo' && !op.newAsset) return false;
        if (op.type === 'delete-placeholder' && !op.placeholderAsset) return false;
        return true;
      });
    } catch {
      return [];
    }
  });
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [showFlattenConfirmation, setShowFlattenConfirmation] = useState(false);

  useEffect(() => {
    localStorage.setItem(`immich-book-history-${album.id}`, JSON.stringify(history));
  }, [history, album.id]);

  // Flattened reference state - the baseline for Reset All
  const [flattenedState, setFlattenedState] = useState<FlattenedState | null>(null);

  // Language preference - stored in localStorage
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem("immich-book-language");
    return (stored === "fr" || stored === "en" ? stored : "fr") as Language;
  });

  useEffect(() => {
    localStorage.setItem("immich-book-language", language);
  }, [language]);

  // Width available to the preview column - pages (especially combined
  // spreads) are scaled down to fit it, rather than relying on horizontal
  // scroll, which left the right-hand page looking cut off/undersized.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);

  // Click-and-drag-to-scroll for the "new photos to place" strip (only
  // when the drag starts on empty space between thumbnails - each
  // thumbnail already drags-to-place via handleReorderPointerDown) and
  // the "pages with missing photos" panel.
  const newAssetsScrollRef = useRef<HTMLDivElement>(null);
  const newAssetsDragScroll = useDragToScroll("x");
  const missingPagesScrollRef = useRef<HTMLDivElement>(null);
  const missingPagesDragScroll = useDragToScroll("y");

  useEffect(() => {
    const updateWidth = () => {
      const sidebarWidth = sidebarCollapsed ? 64 : 320; // w-16 : w-80
      const historyWidth = historyCollapsed ? 64 : 320; // w-16 : w-80
      const navRailWidth = 96; // w-24, see PageNavRail
      const padding = 128; // px-16 on both sides + extra margin
      const safetyMargin = 100; // Extra safety to prevent overflow
      const availableWidth = window.innerWidth - sidebarWidth - historyWidth - navRailWidth - padding - safetyMargin;
      setPreviewWidth(Math.max(400, availableWidth)); // Minimum 400px
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [sidebarCollapsed, historyCollapsed]);

  useEffect(() => {
    loadAlbumAssets();
    setChangesDetected(false);  // Reset flag when changing albums
    setIsDetectingChanges(true); // Start detecting changes

    // Clean up old localStorage keys (migration)
    localStorage.removeItem(`immich-book-aspect-ratios-${album.id}`);
    localStorage.removeItem(`immich-book-ordering-${album.id}`);
    localStorage.removeItem(`immich-book-description-positions-${album.id}`);
  }, [album.id]);

  // Detect missing/new photos after assets are loaded
  useEffect(() => {
    if (assets.length === 0 || changesDetected) return;
    
    console.log(`Detecting changes for ${assets.length} assets...`);
    
    detectAlbumChanges(album.id, assets.map(a => a.id))
      .then(({ missingAssets, newAssetIds }) => {
        console.log(`Album changes: ${newAssetIds.length} new, ${missingAssets.length} missing`);
        setIsDetectingChanges(false); // Detection complete

        if (missingAssets.length > 0) {
          // There are missing photos - this is a real change
          setChangesDetected(true);
          setMissingAssetIds(new Set(missingAssets.map(a => a.id)));
          // Inject missing assets as placeholders
          setAssets(prev => {
            const combined = [...prev, ...missingAssets];
            const albumOrder = album.order || "desc";
            return combined.sort((a, b) => {
              const timeA = new Date(a.fileCreatedAt).getTime();
              const timeB = new Date(b.fileCreatedAt).getTime();
              return albumOrder === "asc" ? timeA - timeB : timeB - timeA;
            });
          });
        }
        
        // Check if this is first time (all assets are "new" = no snapshot exists yet)
        const isFirstTime = newAssetIds.length > 0 && newAssetIds.length === assets.length && missingAssets.length === 0;
        
        if (isFirstTime) {
          // First time opening this album - save snapshot but keep photos in normal layout
          console.log("First time opening album, saving initial snapshot...");
          setChangesDetected(false); // No real changes, just initializing
          fetch(`/photobooks/${encodeURIComponent(album.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              config: initialConfig,
              assets: assets.map(a => ({
                id: a.id,
                type: a.type,
                originalFileName: a.originalFileName,
                fileCreatedAt: a.fileCreatedAt,
                localDateTime: a.localDateTime,
              })),
            }),
          });
        } else if (newAssetIds.length > 0) {
          // Real new photos added to the album
          setChangesDetected(true);
          const newPhotos = assets.filter(a => newAssetIds.includes(a.id));
          setNewAssets(newPhotos);
          // Remove new photos from the main assets array (they stay in newAssets panel until placed)
          setAssets(prev => prev.filter(a => !newAssetIds.includes(a.id)));
          console.log(`${newPhotos.length} new photos available for placement`);
        }

        // Restore previously "set aside" photos (see setAsideAssetIds in
        // albumConfig.ts) - unlike a real Immich deletion, these are
        // still present in `assets` right now, so they'd otherwise look
        // like completely normal photos again on this reload. Applied
        // last (and merged, not replaced) so it always wins regardless
        // of whatever the branches above just did to missingAssetIds/
        // newAssets for real Immich-side changes.
        if (!setAsideRestoredRef.current && initialConfig.setAsideAssetIds.length > 0) {
          setAsideRestoredRef.current = true;
          const idsToRestore = initialConfig.setAsideAssetIds;
          setMissingAssetIds(prev => {
            const next = new Set(prev);
            idsToRestore.forEach(id => next.add(id));
            return next;
          });
          setSetAsideAssetIds(new Set(idsToRestore));
          setNewAssets(prev => {
            const alreadyThere = new Set(prev.map(a => a.id));
            const toMove = assets.filter(
              a => idsToRestore.includes(a.id) && !alreadyThere.has(a.id),
            );
            return toMove.length > 0 ? [...prev, ...toMove] : prev;
          });
        }
      })
      .catch(err => {
        console.error("Failed to detect album changes:", err);
        setIsDetectingChanges(false); // Stop loading even on error
      });
  }, [assets, changesDetected, album.id, initialConfig]);

  // Save config to localStorage whenever it changes (with clamped values)
  useEffect(() => {
    // Only save if all values are valid
    if (
      !isPageWidthValid ||
      !isPageHeightValid ||
      !isMarginValid ||
      !isSpacingValid ||
      !isBleedValid
    ) {
      return;
    }

    const config: AlbumConfig = {
      printerId,
      pageWidth,
      pageHeight,
      margin,
      spacing,
      filterVideos: false, // Never filter videos - simpler UX
      bleedEnabled,
      bleed,
      showDates,
      showCaptions,
      fontSize,
      pageBackground,
      cardStyle,
      customOrdering,
      layoutVariants: Object.fromEntries(layoutVariants),
      pageCounts: Object.fromEntries(pageCounts),
      pageCaptions: Object.fromEntries(pageCaptions),
      cardCaptions: Object.fromEntries(cardCaptions),
      focalPoints: Object.fromEntries(focalPoints),
      boundaryOverrides: Object.fromEntries(boundaryOverrides),
      axisOverrides: Object.fromEntries(axisOverrides),
      textCardCounts: Object.fromEntries(textCardCounts),
      textCardContents: Object.fromEntries(textCardContents),
      slotOverrides: Object.fromEntries(slotOverrides),
      manuallyMovedIds: Array.from(manuallyMovedIds),
      setAsideAssetIds: Array.from(setAsideAssetIds),
      showCover: true, // Always true - simpler UX
      separatedCover,
      spineWidth,
      spineColor,
      spineTextColor,
      spineTextSize,
      spineTitle,
      coverTitle,
      coverTextSize,
      coverAssetId,
      coverLayout,
      coverFrameSize,
      backCoverAssetId,
      backCoverLayout,
      backCoverFrameSize,
      backCoverText,
      backCoverTextSize,
      backCoverPlainText,
      excludeCoverPhotosFromPages: true, // Always true - simpler UX
    };
    // Save config (without assets snapshot - that's saved separately after resolving placeholders)
    saveAlbumConfig(album.id, config);
  }, [
    album.id,
    printerId,
    pageWidth,
    pageHeight,
    margin,
    spacing,
    filterVideos,
    bleedEnabled,
    bleed,
    showDates,
    showCaptions,
    fontSize,
    pageBackground,
    cardStyle,
    customOrdering,
    layoutVariants,
    pageCounts,
    pageCaptions,
    cardCaptions,
    focalPoints,
    boundaryOverrides,
    axisOverrides,
    showCover,
    separatedCover,
    spineWidth,
    spineColor,
    spineTextColor,
    spineTextSize,
    spineTitle,
    coverTitle,
    coverTextSize,
    coverAssetId,
    coverLayout,
    coverFrameSize,
    backCoverAssetId,
    backCoverLayout,
    backCoverFrameSize,
    backCoverText,
    backCoverTextSize,
    backCoverPlainText,
    excludeCoverPhotosFromPages,
    textCardCounts,
    textCardContents,
    slotOverrides,
    manuallyMovedIds,
    setAsideAssetIds,
    isPageWidthValid,
    isPageHeightValid,
    isMarginValid,
    isSpacingValid,
  ]);

  const loadAlbumAssets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Always oldest first - a photobook should read as a chronological
      // story regardless of the source album's own sort setting in Immich.
      const albumOrder = "asc";

      // Step 1: Get all time buckets for this album
      const timebuckets = await getTimeBuckets({
        albumId: album.id,
        order: albumOrder,
      });
      
      if (!timebuckets || timebuckets.length === 0) {
        setError("Album has no assets");
        return;
      }
      
      // Step 2: Load assets from each time bucket
      const allAssets: AssetResponseDto[] = [];
      for (const bucket of timebuckets) {
        const bucketData = await getTimeBucket({
          albumId: album.id,
          timeBucket: bucket.timeBucket,
        });
        
        // The API returns columnar format: { id: [...], duration: [...], ... }
        // We need to convert it to row format: [{ id, duration, ... }, ...]
        if (bucketData && Array.isArray(bucketData.id)) {
          const numAssets = bucketData.id.length;
          for (let i = 0; i < numAssets; i++) {
            const asset: any = {};
            for (const key in bucketData) {
              asset[key] = bucketData[key][i];
            }
            allAssets.push(asset as AssetResponseDto);
          }
        }
      }
      
      if (allAssets.length === 0) {
        setError("Album has no assets");
        return;
      }
      
      // Step 3: Sort assets by creation date, respecting the album's order preference
      const sorted = allAssets.sort((a, b) => {
        const timeA = new Date(a.fileCreatedAt).getTime();
        const timeB = new Date(b.fileCreatedAt).getTime();
        return albumOrder === "asc" ? timeA - timeB : timeB - timeA;
      });
      setAssets(sorted);
    } catch (err: any) {
      console.error("Error loading album:", err);
      
      // Check if album was deleted from Immich (404 or similar errors)
      const isAlbumDeleted = 
        err?.status === 404 || 
        err?.statusCode === 404 ||
        err?.message?.includes('not found') ||
        err?.message?.includes('404');
      
      if (isAlbumDeleted) {
        console.log(`Album ${album.id} no longer exists in Immich, deleting photobook...`);
        
        // Delete the photobook from backend
        fetch(`/photobooks/${encodeURIComponent(album.id)}`, {
          method: 'DELETE',
        })
          .then(() => {
            console.log('Photobook deleted successfully');
          })
          .catch(deleteErr => {
            console.error('Failed to delete photobook:', deleteErr);
          })
          .finally(() => {
            // Navigate back to albums list
            onBack();
          });
      } else {
        setError((err as Error).message || "Failed to load album assets");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Force (or, with null, stop forcing) how many photos land on a page
  const handleSetPageCount = (
    logicalPageNumber: number,
    count: number | null,
  ) => {
    const prevCount = pageCounts.get(logicalPageNumber) ?? null;
    setPageCounts((prev) => {
      const next = new Map(prev);
      if (count === null) {
        next.delete(logicalPageNumber);
      } else {
        next.set(logicalPageNumber, count);
      }
      return next;
    });
    // A manual slot override is a permutation of this page's card ids at
    // its PREVIOUS count - changing the count invalidates it outright
    // (calculatePageLayout already ignores a length-mismatched override,
    // but only by accident of the new count differing from the old one;
    // an override left over from an earlier count/insert cycle that
    // happens to match the new count by coincidence would otherwise be
    // silently reapplied, pinning old slot assignments - including
    // freezing out an asset added since - instead of the fresh natural
    // tiling a page-count change should always produce).
    setSlotOverrides((prev) => {
      if (!prev.has(logicalPageNumber)) return prev;
      const next = new Map(prev);
      next.delete(logicalPageNumber);
      return next;
    });
    // Record in history
    setHistory((prev) => [
      {
        type: "set-page-count",
        pageNumber: logicalPageNumber,
        prevCount,
        newCount: count,
        timestamp: Date.now(),
      },
      ...prev,
    ]);
  };

  // Set how many of a page's slots are text cards instead of photos (0-3)
  const handleSetTextCardCount = (
    logicalPageNumber: number,
    count: number,
  ) => {
    const prevCount = textCardCounts.get(logicalPageNumber) || 0;
    setTextCardCounts((prev) => {
      const next = new Map(prev);
      if (count === 0) {
        next.delete(logicalPageNumber);
      } else {
        next.set(logicalPageNumber, count);
      }
      return next;
    });
    // Record in history
    setHistory((prev) => [
      {
        type: "set-text-card-count",
        pageNumber: logicalPageNumber,
        prevCount,
        newCount: count,
        timestamp: Date.now(),
      },
      ...prev,
    ]);
  };

  // Filter assets based on user preferences (default order)
  const defaultFilteredAssets = useMemo(() => {
    // Filter out any undefined assets (safety after undo operations)
    const validAssets = assets.filter((asset) => asset !== undefined && asset !== null);
    return filterVideos
      ? validAssets.filter((asset) => asset.type === "IMAGE")
      : validAssets;
  }, [assets, filterVideos]);

  // Drag & drop for reordering - implemented with pointer events and
  // manual hit-testing (element.closest("[data-reorder-asset-id]") under
  // the pointer) rather than native HTML5 drag-and-drop. Native DnD turned
  // out to be unreliable here: it breaks under a scaled/transformed
  // ancestor (the preview's fit-to-width zoom), silently swallows drops on
  // tiles with no onDrop handler (text cards), and needs browser-specific
  // dataTransfer setup. Pointer events sidestep all of that.
  //
  // `croppable` opts a card into smart-crop panning instead of swapping
  // when dragged (see the pointermove/pointerup effect below) - true only
  // for an object-cover photo `<img>` (interior "clean" cards, full-bleed
  // covers), since panning only makes sense where a crop is actually
  // happening. `event.currentTarget` is either that `<img>` itself, or a
  // wrapping element containing it (the cover components wrap every
  // layout, cropped or not, in one pointerdown target) - either way, the
  // `<img>`'s own rendered box is exactly the object-fit: cover
  // "container" the pan math needs.
  const handleReorderPointerDown = (
    assetId: string,
    event: React.PointerEvent,
    croppable = false,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();

    let pan: NonNullable<typeof reorderDragState>["pan"];
    if (croppable) {
      const target = event.currentTarget as HTMLElement;
      const imgEl = (
        target.tagName === "IMG" ? target : target.querySelector("img")
      ) as HTMLImageElement | null;
      if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
        const rect = imgEl.getBoundingClientRect();
        const start = focalPoints.get(assetId) ?? null;
        pan = {
          imgEl,
          startX: event.clientX,
          startY: event.clientY,
          startFocalX: start?.x ?? 0.5,
          startFocalY: start?.y ?? 0.5,
          prevPoint: start,
          containerWidth: rect.width,
          containerHeight: rect.height,
          naturalWidth: imgEl.naturalWidth,
          naturalHeight: imgEl.naturalHeight,
        };
      }
    }
    setReorderDragState({ draggedAssetId: assetId, pan });
  };

  const { handleUndo, handleResetCard, handleResetOrdering, handleFlatten, handleResetAll } =
    useEditHistory({
      history,
      setHistory,
      setSlotOverrides,
      setManuallyMovedIds,
      setTextCardContents,
      setCustomOrdering,
      setLayoutVariants,
      setPageCounts,
      setTextCardCounts,
      setPageCaptions,
      setCardCaptions,
      setFocalPoints,
      setBoundaryOverrides,
      setAxisOverrides,
      setCoverAssetId,
      setCoverFrameSize,
      setBackCoverAssetId,
      setBackCoverFrameSize,
      setCoverTitle,
      setBackCoverText,
      setAssets,
      setNewAssets,
      setMissingAssetIds,
      setSetAsideAssetIds,
      setFlattenedState,
      setShowFlattenConfirmation,
      setShowResetConfirmation,
      defaultFilteredAssets,
      customOrdering,
      slotOverrides,
      manuallyMovedIds,
      layoutVariants,
      pageCounts,
      textCardCounts,
      textCardContents,
      pageCaptions,
      cardCaptions,
    });

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

  // Back cover photo - explicit pick if the user made one, otherwise the
  // book's last photo in its current order. Independent of the front
  // cover photo.
  const backCoverAsset = useMemo(() => {
    if (backCoverAssetId) {
      const picked = filteredAssets.find((a) => a.id === backCoverAssetId);
      if (picked) return picked;
    }
    return filteredAssets[filteredAssets.length - 1] ?? null;
  }, [filteredAssets, backCoverAssetId]);

  // Interior pages leave out the cover/back-cover photos when the user
  // opts in - otherwise each one prints twice (once on its cover, again
  // inside the book). Derived from filteredAssets (not the other way
  // around) so removing a photo from the interior never shifts which
  // photo the cover/back-cover fall back to. Only excludes a photo that's
  // actually shown as a photo on its cover - "text-only" doesn't display
  // one, so nothing should disappear from the interior on its account.
  const interiorAssets = useMemo(() => {
    if (!excludeCoverPhotosFromPages || !showCover) return filteredAssets;
    const excludedIds = new Set<string>();
    if (coverLayout !== "text-only" && coverAsset) {
      excludedIds.add(coverAsset.id);
    }
    if (backCoverLayout !== "text-only" && backCoverAsset) {
      excludedIds.add(backCoverAsset.id);
    }
    if (excludedIds.size === 0) return filteredAssets;
    return filteredAssets.filter((a) => !excludedIds.has(a.id));
  }, [
    filteredAssets,
    excludeCoverPhotosFromPages,
    showCover,
    coverLayout,
    coverAsset,
    backCoverLayout,
    backCoverAsset,
  ]);

  // Fetches face info (getFaces) for whichever asset ids don't have a
  // focal point yet, concurrency-limited like fetchBlobsWithConcurrency
  // above - a book can have hundreds of photos, and firing that many
  // requests at once would hammer Immich the same way an unbounded image
  // fetch burst would. Never re-fetches an id already in `focalPoints`,
  // even if its value is null (checked, no face found). Returns only the
  // newly-fetched entries, since the `focalPoints` state won't reflect
  // them until the next render - callers that need them immediately
  // (e.g. PDF generation) must merge the return value themselves.
  const FOCAL_POINT_FETCH_CONCURRENCY = 4;
  const ensureFocalPoints = async (
    ids: string[],
  ): Promise<Map<string, FocalPoint | null>> => {
    const missing = Array.from(new Set(ids)).filter(
      (id) =>
        !focalPoints.has(id) && !focalPointFetchesInFlight.current.has(id),
    );
    if (missing.length === 0) return new Map();
    missing.forEach((id) => focalPointFetchesInFlight.current.add(id));

    const results = new Map<string, FocalPoint | null>();
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= missing.length) return;
        const id = missing[i];
        try {
          const faces = await getFaces({ id });
          results.set(id, computeFocalPoint(faces));
        } catch (e) {
          console.error(`Failed to fetch face info for ${id}:`, e);
          // Not added to results -> not cached -> retried next time
          // ensureFocalPoints is called for this id, unlike a genuine
          // "no face found" which must be cached as null.
        } finally {
          focalPointFetchesInFlight.current.delete(id);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(FOCAL_POINT_FETCH_CONCURRENCY, missing.length) }, worker),
    );

    if (results.size > 0) {
      setFocalPoints((prev) => {
        const next = new Map(prev);
        results.forEach((v, k) => next.set(k, v));
        return next;
      });
    }
    return results;
  };

  const coverFocalPoint = coverAsset
    ? focalPoints.get(coverAsset.id) ?? null
    : null;
  const backCoverFocalPoint = backCoverAsset
    ? focalPoints.get(backCoverAsset.id) ?? null
    : null;

  // Resolved "photo-title" mat/card size for each cover - the live drag
  // in progress (if any) wins over the persisted override, which wins
  // over the component's own built-in default (passing undefined lets
  // FrontCoverStandalone/BackCoverStandalone fall back to their own
  // default fraction).
  const resolvedCoverFrameSize =
    liveFrameSize?.target === "cover" ? liveFrameSize : coverFrameSize;
  const resolvedBackCoverFrameSize =
    liveFrameSize?.target === "back-cover" ? liveFrameSize : backCoverFrameSize;

  // Prefetch focal points for every currently-placed photo (interior +
  // covers) as soon as the book's photo set changes, regardless of the
  // current card style/cover layout - the PDF export always crops in
  // "cover" mode even when the web preview doesn't (e.g. "scrapbook" card
  // style), so this keeps generation instant instead of waiting on
  // face-detection fetches at that point.
  useEffect(() => {
    const ids = new Set<string>();
    interiorAssets.forEach((a) => ids.add(a.id));
    if (coverAsset) ids.add(coverAsset.id);
    if (backCoverAsset) ids.add(backCoverAsset.id);
    ensureFocalPoints(Array.from(ids));
  }, [interiorAssets, coverAsset, backCoverAsset]);

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

  // Merges in the boundary drag currently in progress (if any) so the
  // page reflows live as the user drags - kept separate from
  // `boundaryOverrides` itself so a drag-in-progress doesn't autosave on
  // every frame, only once committed on release.
  const effectiveBoundaryOverrides = useMemo(() => {
    if (!liveBoundaryFraction) return boundaryOverrides;
    const next = new Map(boundaryOverrides);
    next.set(liveBoundaryFraction.path, liveBoundaryFraction.fraction);
    return next;
  }, [boundaryOverrides, liveBoundaryFraction]);

  const pages = useMemo(() => {
    return calculatePageLayout(interiorAssets, {
      pageWidth: validPageWidth,
      pageHeight: validPageHeight,
      margin: layoutMargin,
      spacing: validSpacing,
      pageCountMultiple: selectedPrinter.interiorPageMultiple ?? 2,
      layoutVariants,
      pageCounts,
      textCardCounts,
      slotOverrides,
      boundaryOverrides: effectiveBoundaryOverrides,
      axisOverrides,
    });
  }, [
    interiorAssets,
    layoutMargin,
    validSpacing,
    validPageWidth,
    validPageHeight,
    selectedPrinter.interiorPageMultiple,
    layoutVariants,
    pageCounts,
    textCardCounts,
    slotOverrides,
    effectiveBoundaryOverrides,
    axisOverrides,
  ]);

  // Swaps two cards outright, wherever they are: same page swaps their
  // slot assignment directly (the auto layout's aspect-ratio-driven
  // grouping doesn't otherwise respect a specific drop position - see
  // slotOverrides in pageLayout.ts); across pages, there's no shared slot
  // list to swap within, so it swaps their positions in the master
  // sequence instead, which changes which page each naturally belongs to.
  // Shared by both the drag-and-drop reorder below and click-to-swap mode.
  // Front/back cover are addressed by a fixed, content-independent slot
  // id ("cover"/"back-cover") rather than the id of whichever asset is
  // currently shown there - unlike an interior card, the same asset can
  // simultaneously be a cover AND appear in `pages` (when
  // excludeCoverPhotosFromPages is off), so reusing the asset id here
  // would make it ambiguous which of the two slots is meant. A cover
  // swap only ever changes *membership* (which asset id is excluded from
  // the interior sequence via coverAssetId/backCoverAssetId) - it never
  // touches `assets`/`filteredAssets` directly, so the swapped-out photo
  // reappears on its own in the interior pages (see interiorAssets)
  // without any extra bookkeeping, and undo only needs to restore the id.
  const isCoverSlotId = (id: string) => id === "cover" || id === "back-cover";

  const performCoverSwap = (draggedId: string, targetId: string) => {
    if (isCoverSlotId(draggedId) && isCoverSlotId(targetId)) {
      // cover <-> back-cover: one atomic history entry so a single Undo
      // reverses both fields together.
      if (!coverAsset || !backCoverAsset) return;
      const prevCoverAssetId = coverAsset.id;
      const prevBackCoverAssetId = backCoverAsset.id;
      setCoverAssetId(prevBackCoverAssetId);
      setBackCoverAssetId(prevCoverAssetId);
      setHistory((prev) => [
        {
          type: "swap-cover-slots",
          prevCoverAssetId,
          prevBackCoverAssetId,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
      return;
    }

    // cover/back-cover <-> an interior photo.
    const coverSlot = isCoverSlotId(draggedId) ? draggedId : targetId;
    const photoAssetId = isCoverSlotId(draggedId) ? targetId : draggedId;
    const photoAsset = filteredAssets.find((a) => a.id === photoAssetId);
    if (!photoAsset) return;

    if (coverSlot === "cover") {
      if (!coverAsset) return;
      const prevAssetId = coverAsset.id;
      setCoverAssetId(photoAsset.id);
      setHistory((prev) => [
        {
          type: "set-cover",
          prevAssetId,
          newAssetId: photoAsset.id,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    } else {
      if (!backCoverAsset) return;
      const prevAssetId = backCoverAsset.id;
      setBackCoverAssetId(photoAsset.id);
      setHistory((prev) => [
        {
          type: "set-back-cover",
          prevAssetId,
          newAssetId: photoAsset.id,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    }
  };

  const performSwap = (draggedAssetId: string, targetAssetId: string) => {
    if (targetAssetId === draggedAssetId) return;

    if (isCoverSlotId(draggedAssetId) || isCoverSlotId(targetAssetId)) {
      performCoverSwap(draggedAssetId, targetAssetId);
      return;
    }

    let draggedPage: number | null = null;
    let targetPage: number | null = null;
    for (const page of pages) {
      const ids = page.photos.map((p) => p.id);
      if (ids.includes(draggedAssetId)) draggedPage = page.pageNumber;
      if (ids.includes(targetAssetId)) targetPage = page.pageNumber;
    }

    if (draggedPage === null || targetPage === null) return;

    const draggedIsText = draggedAssetId.startsWith("text-");
    const targetIsText = targetAssetId.startsWith("text-");

    if (draggedPage === targetPage) {
      // Same page - the id (and, for photos, its asset) just moves to
      // a different slot rect; a text card keeps its own id wherever
      // it lands, so its written content follows automatically.
      const order = pages
        .find((p) => p.pageNumber === draggedPage)!
        .photos.map((p) => p.id);
      const prevOrder = [...order];
      const di = order.indexOf(draggedAssetId);
      const ti = order.indexOf(targetAssetId);
      [order[di], order[ti]] = [order[ti], order[di]];
      setSlotOverrides((prev) => new Map(prev).set(draggedPage!, order));
      setManuallyMovedIds((prev) => {
        const next = new Set(prev);
        next.add(draggedAssetId);
        next.add(targetAssetId);
        return next;
      });
      // Record in history
      setHistory((prev) => [
        {
          type: "swap-same-page",
          pageNumber: draggedPage!,
          order,
          prevOrder,
          assetIds: [draggedAssetId, targetAssetId],
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    } else if (draggedIsText && targetIsText) {
      // Text cards are page-local slots (their id is tied to a page
      // number), not movable "assets" in the master sequence - so a
      // cross-page swap between two of them exchanges their written
      // content instead of relocating anything.
      const draggedText = textCardContents.get(draggedAssetId) || "";
      const targetText = textCardContents.get(targetAssetId) || "";
      setTextCardContents((prev) => {
        const next = new Map(prev);
        if (targetText) next.set(draggedAssetId, targetText);
        else next.delete(draggedAssetId);
        if (draggedText) next.set(targetAssetId, draggedText);
        else next.delete(targetAssetId);
        return next;
      });
      setManuallyMovedIds((prev) => {
        const next = new Set(prev);
        next.add(draggedAssetId);
        next.add(targetAssetId);
        return next;
      });
      // Record in history
      setHistory((prev) => [
        {
          type: "swap-text-cards",
          assetIds: [draggedAssetId, targetAssetId],
          prevContents: [draggedText, targetText],
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    } else if (!draggedIsText && !targetIsText) {
      const currentOrder = filteredAssets.map((a) => a.id);
      const prevOrder = [...currentOrder];
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
      setManuallyMovedIds((prev) => {
        const next = new Set(prev);
        next.add(draggedAssetId);
        next.add(targetAssetId);
        return next;
      });
      // Record in history
      setHistory((prev) => [
        {
          type: "swap-cross-page",
          assetIds: [draggedAssetId, targetAssetId],
          prevOrder,
          draggedPage: draggedPage!,
          targetPage: targetPage!,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    }
    // A text card and a real photo on different pages can't trade
    // places: the text card's slot belongs to its page's layout,
    // while the photo lives in the master sequence - dropped here,
    // nothing happens.
  };

  // Resolves a card id from the existing-card swap system (swapFirstId -
  // "cover", "back-cover", a text card id, or a real asset id) into a
  // NewAssetTarget, so arming an existing card FIRST and then picking a
  // new photo SECOND lands on the exact same confirm-then-place flow as
  // the reverse order (pick the new photo first, then click a target) -
  // the outcome shouldn't depend on which one the user clicked first.
  const isNewAssetCardId = (id: string) => newAssets.some((a) => a.id === id);

  // Sole dispatcher for "the user wants to exchange card A and card B" -
  // drag-drop and click-arm-then-click both call ONLY this, for any
  // pair of cards (interior photo, cover, back-cover, or a not-yet-
  // placed "new photo" from the top panel). It decides which of the two
  // confirmation flows applies and arms it; neither branch mutates
  // anything itself. A pair where neither side is placed yet (two new
  // photos) has nothing to swap, so it's a no-op.
  const requestSwap = (idA: string, idB: string) => {
    if (idA === idB) return;
    const aIsNew = isNewAssetCardId(idA);
    const bIsNew = isNewAssetCardId(idB);
    if (aIsNew || bIsNew) {
      if (aIsNew && bIsNew) return;
      const newAssetId = aIsNew ? idA : idB;
      const otherId = aIsNew ? idB : idA;
      const newAsset = newAssets.find((a) => a.id === newAssetId);
      const target = resolveNewAssetTarget(otherId);
      if (newAsset && target) performNewAssetPlacement(newAsset, target);
      return;
    }
    setSwapConfirmation({ firstId: idA, secondId: idB });
  };

  const resolveNewAssetTarget = (cardId: string): NewAssetTarget | null => {
    if (cardId === "cover") return coverAsset ? { kind: "cover" } : null;
    if (cardId === "back-cover") return backCoverAsset ? { kind: "back-cover" } : null;
    if (cardId.startsWith("text-")) return null; // no photo-swap target
    const asset = filteredAssets.find((a) => a.id === cardId);
    if (!asset) return null;
    return missingAssetIds.has(asset.id)
      ? { kind: "interior-replace", placeholderAsset: asset }
      : { kind: "interior-swap", asset };
  };

  // Pulls a currently-placed photo out of the layout into the "photos to
  // place" pool, leaving a placeholder hole in its old slot - same
  // visual treatment as a photo detected missing from Immich (see
  // missingAssetIds), but for a photo the user still wants in the book,
  // just not in that exact spot right now. Unlike a real deletion, the
  // asset itself is untouched in `assets` (same slot, same layout math),
  // only its rendering and its availability in the "new photos" pool
  // change.
  const handleSetAsidePhoto = (assetId: string) => {
    const asset = filteredAssets.find((a) => a.id === assetId);
    if (!asset) return;
    setSwapFirstId(null);
    setMissingAssetIds((prev) => {
      const next = new Set(prev);
      next.add(assetId);
      return next;
    });
    setSetAsideAssetIds((prev) => {
      const next = new Set(prev);
      next.add(assetId);
      return next;
    });
    setNewAssets((prev) => [...prev.filter((a) => a.id !== assetId), asset]);
    setHistory((prev) => [
      { type: "set-aside-photo", assetId, timestamp: Date.now() },
      ...prev,
    ]);
  };

  // Single entry point for placing a "new photo" (from the top panel,
  // not yet part of the book) onto a cover/back-cover/interior slot.
  // Every click handler that offers this action calls ONLY this
  // function - none of them mutate coverAssetId/backCoverAssetId/assets
  // directly. It never applies the placement itself: it arms a
  // confirmation (mirroring the swapFirstId -> swapConfirmation flow
  // used for existing-card swaps), and the actual mutation lives in the
  // single place below (applyNewAssetPlacement), run only from the
  // confirmation dialog's Confirm button.
  const performNewAssetPlacement = (
    newAsset: AssetResponseDto,
    target: NewAssetTarget,
  ) => {
    setNewAssetPlacementConfirmation({ newAsset, target });
  };

  const applyNewAssetPlacement = () => {
    if (!newAssetPlacementConfirmation) return;
    const { newAsset, target } = newAssetPlacementConfirmation;

    // Whatever is being placed is leaving the "new photos" pool for a
    // real slot - if it got there via "set aside" rather than being
    // freshly added to the Immich album, that bookkeeping is now stale
    // and would otherwise wrongly re-apply on the next reload.
    setSetAsideAssetIds((prev) => {
      if (!prev.has(newAsset.id)) return prev;
      const next = new Set(prev);
      next.delete(newAsset.id);
      return next;
    });

    switch (target.kind) {
      case "cover": {
        if (!coverAsset) break;
        const oldCover = coverAsset;
        // The incoming photo isn't part of the book yet - it has to be
        // added to `assets` (taking the old cover's place) before
        // setting coverAssetId, otherwise the coverAsset lookup
        // (filteredAssets.find) can't find it and silently falls back
        // to the wrong photo.
        setAssets((prev) =>
          prev.map((a) => (a.id === oldCover.id ? newAsset : a)),
        );
        setCoverAssetId(newAsset.id);
        setNewAssets((prev) => [
          ...prev.filter((a) => a.id !== newAsset.id),
          oldCover,
        ]);
        setHistory((prev) => [
          {
            type: "set-cover",
            prevAssetId: oldCover.id,
            newAssetId: newAsset.id,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        break;
      }
      case "back-cover": {
        if (!backCoverAsset) break;
        const oldBackCover = backCoverAsset;
        setAssets((prev) =>
          prev.map((a) => (a.id === oldBackCover.id ? newAsset : a)),
        );
        setBackCoverAssetId(newAsset.id);
        setNewAssets((prev) => [
          ...prev.filter((a) => a.id !== newAsset.id),
          oldBackCover,
        ]);
        setHistory((prev) => [
          {
            type: "set-back-cover",
            prevAssetId: oldBackCover.id,
            newAssetId: newAsset.id,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        break;
      }
      case "interior-replace": {
        const placeholder = target.placeholderAsset;
        const updatedAssets = assets.map((a) =>
          a.id === placeholder.id ? newAsset : a,
        );
        setAssets(updatedAssets);
        setNewAssets((prev) => prev.filter((a) => a.id !== newAsset.id));
        setMissingAssetIds((prev) => {
          const next = new Set(prev);
          next.delete(placeholder.id);
          return next;
        });
        setHistory((prev) => [
          {
            type: "replace-placeholder",
            newAsset,
            placeholderAsset: placeholder,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        setTimeout(() => {
          const config: AlbumConfig = {
            printerId, pageWidth, pageHeight, margin, spacing,
            filterVideos, bleedEnabled, bleed, showDates, showCaptions,
            fontSize, pageBackground, cardStyle, customOrdering,
            layoutVariants: Object.fromEntries(layoutVariants),
            pageCounts: Object.fromEntries(pageCounts),
            pageCaptions: Object.fromEntries(pageCaptions),
            cardCaptions: Object.fromEntries(cardCaptions),
            focalPoints: Object.fromEntries(focalPoints),
            boundaryOverrides: Object.fromEntries(boundaryOverrides),
            axisOverrides: Object.fromEntries(axisOverrides),
            textCardCounts: Object.fromEntries(textCardCounts),
            textCardContents: Object.fromEntries(textCardContents),
            slotOverrides: Object.fromEntries(slotOverrides),
            manuallyMovedIds: Array.from(manuallyMovedIds),
            showCover, coverTitle, coverAssetId, coverLayout,
            backCoverAssetId, backCoverLayout,
            backCoverText, backCoverPlainText, excludeCoverPhotosFromPages,
          };
          saveAlbumConfig(album.id, config, updatedAssets);
        }, 100);
        break;
      }
      case "interior-swap": {
        const asset = target.asset;
        const updatedAssets = assets.map((a) =>
          a.id === asset.id ? newAsset : a,
        );
        setAssets(updatedAssets);
        setNewAssets((prev) => [
          ...prev.filter((a) => a.id !== newAsset.id),
          asset,
        ]);
        setHistory((prev) => [
          {
            type: "swap-new-photo",
            newAsset,
            replacedAsset: asset,
            timestamp: Date.now(),
          },
          ...prev,
        ]);
        setTimeout(() => {
          const config: AlbumConfig = {
            printerId, pageWidth, pageHeight, margin, spacing,
            filterVideos, bleedEnabled, bleed, showDates, showCaptions,
            fontSize, pageBackground, cardStyle, customOrdering,
            layoutVariants: Object.fromEntries(layoutVariants),
            pageCounts: Object.fromEntries(pageCounts),
            pageCaptions: Object.fromEntries(pageCaptions),
            cardCaptions: Object.fromEntries(cardCaptions),
            focalPoints: Object.fromEntries(focalPoints),
            boundaryOverrides: Object.fromEntries(boundaryOverrides),
            axisOverrides: Object.fromEntries(axisOverrides),
            textCardCounts: Object.fromEntries(textCardCounts),
            textCardContents: Object.fromEntries(textCardContents),
            slotOverrides: Object.fromEntries(slotOverrides),
            manuallyMovedIds: Array.from(manuallyMovedIds),
            showCover, coverTitle, coverAssetId, coverLayout,
            backCoverAssetId, backCoverLayout,
            backCoverText, backCoverPlainText, excludeCoverPhotosFromPages,
          };
          saveAlbumConfig(album.id, config, updatedAssets);
        }, 100);
        break;
      }
    }

    setSelectedNewAsset(null);
    setNewAssetPlacementConfirmation(null);
  };

  // While a reorder gesture is active, track the pointer over the whole
  // window (not just the card it started on). Two outcomes, decided by
  // whether the pointer actually moved past a small threshold - dragging
  // a card onto another no longer swaps them (removed - swapping is
  // click-only now, see below):
  //   - Real movement on a "croppable" card (reorderDragState.pan set) -
  //     pans that card's smart-crop focal point live. The focal point is
  //     written straight to the dragged <img>'s style during the drag
  //     (imperative DOM mutation, not React state) so dragging stays
  //     smooth regardless of how large this component tree is; the
  //     result is only committed to `focalPoints` (one state update) on
  //     release.
  //   - No real movement (a plain click, on any card) - arms/confirms a
  //     swap exactly as before: a click arms a card, a second click on a
  //     different card opens swapConfirmation, via requestSwap.
  useEffect(() => {
    if (!reorderDragState) return;
    const { draggedAssetId, pan } = reorderDragState;

    const PAN_THRESHOLD_PX = 6;
    let hasPanned = false;
    let lastFocalX = pan?.startFocalX ?? 0.5;
    let lastFocalY = pan?.startFocalY ?? 0.5;

    const handlePointerMove = (event: PointerEvent) => {
      if (!pan) return;
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      if (!hasPanned && Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
      hasPanned = true;

      // Same geometry object-fit: cover itself uses - the image is
      // scaled up just enough to cover the container on its shorter
      // axis, then the "spare" length in the other axis is how far the
      // crop window can slide. Dragging the pointer right should feel
      // like dragging the photo itself right (i.e. revealing more of
      // its left side), hence the minus sign.
      const scale = Math.max(
        pan.containerWidth / pan.naturalWidth,
        pan.containerHeight / pan.naturalHeight,
      );
      const overflowX = pan.naturalWidth * scale - pan.containerWidth;
      const overflowY = pan.naturalHeight * scale - pan.containerHeight;
      const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
      lastFocalX =
        overflowX > 0.5
          ? clamp01(pan.startFocalX - dx / overflowX)
          : pan.startFocalX;
      lastFocalY =
        overflowY > 0.5
          ? clamp01(pan.startFocalY - dy / overflowY)
          : pan.startFocalY;
      pan.imgEl.style.objectPosition = `${lastFocalX * 100}% ${lastFocalY * 100}%`;
    };

    const handlePointerUp = () => {
      if (hasPanned) {
        setFocalPoints((prev) => {
          const next = new Map(prev);
          next.set(draggedAssetId, { x: lastFocalX, y: lastFocalY });
          return next;
        });
        setHistory((prev) => [
          {
            type: "pan-focal-point",
            assetId: draggedAssetId,
            prevPoint: pan?.prevPoint ?? null,
            newPoint: { x: lastFocalX, y: lastFocalY },
            timestamp: Date.now(),
          },
          ...prev,
        ]);
      } else if (isNewAssetCardId(draggedAssetId)) {
        // A plain click on a new-photo thumbnail is handled by its own
        // onClick (arm/complete via selectedNewAsset) - the click-arm-
        // then-click-again flow below only applies between two already-
        // placed cards.
      } else if (swapFirstId === null) {
        setSwapFirstId(draggedAssetId);
      } else if (swapFirstId === draggedAssetId) {
        setSwapFirstId(null);
      } else {
        // Click-to-swap - show confirmation dialog
        requestSwap(swapFirstId, draggedAssetId);
        setSwapFirstId(null);
      }

      setReorderDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [reorderDragState, pages, filteredAssets, swapFirstId, newAssets]);

  // Dragging a bento split boundary - unlike the crop-pan drag above,
  // this needs a real per-frame React state update (liveBoundaryFraction)
  // because moving one boundary reflows every cell on its side of the
  // split, not just one image's CSS position. Throttled to one update
  // per animation frame regardless of how often pointermove fires.
  useEffect(() => {
    if (!boundaryDragState) return;
    const { path, pageNumber, axis, rect, startX, startY, startFraction, scale } =
      boundaryDragState;

    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    // ~6pt on screen, converted to the same raw (300dpi) unit space
    // rect.x/width are in.
    const SNAP_THRESHOLD_RAW = 6 * (300 / 72);

    // Other same-axis boundaries on this page to magnet-snap against -
    // captured once at drag start (not re-read live), since descendants
    // of the boundary being dragged shift as a direct consequence of the
    // drag itself and shouldn't be snap targets for their own ancestor.
    const page = pages.find((p) => p.pageNumber === pageNumber);
    const otherLinesRaw = (page?.splits ?? [])
      .filter(
        (s) => s.axis === axis && s.path !== path && !s.path.startsWith(path),
      )
      .map((s) => {
        const origin = axis === "vertical" ? s.rect.x : s.rect.y;
        const length = axis === "vertical" ? s.rect.width : s.rect.height;
        return origin + length * s.fraction;
      });

    const rectOrigin = axis === "vertical" ? rect.x : rect.y;
    const rectLength = axis === "vertical" ? rect.width : rect.height;
    const axisLengthPt = toPoints(rectLength);

    let finalFraction = startFraction;
    let rafId: number | null = null;
    let pendingEvent: PointerEvent | null = null;

    const applyPendingMove = () => {
      rafId = null;
      if (!pendingEvent) return;
      const dxScreen = pendingEvent.clientX - startX;
      const dyScreen = pendingEvent.clientY - startY;
      const deltaPt = (axis === "vertical" ? dxScreen : dyScreen) / scale;
      const fractionDelta = axisLengthPt > 0 ? deltaPt / axisLengthPt : 0;
      let fraction = clamp01(startFraction + fractionDelta);

      const lineRaw = rectOrigin + rectLength * fraction;
      for (const otherRaw of otherLinesRaw) {
        if (Math.abs(lineRaw - otherRaw) < SNAP_THRESHOLD_RAW) {
          fraction = clamp01((otherRaw - rectOrigin) / rectLength);
          break;
        }
      }

      finalFraction = fraction;
      setLiveBoundaryFraction({ path, fraction });
    };

    const handlePointerMove = (event: PointerEvent) => {
      pendingEvent = event;
      if (rafId === null) {
        rafId = requestAnimationFrame(applyPendingMove);
      }
    };

    const handlePointerUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      setBoundaryOverrides((prev) => {
        const next = new Map(prev);
        next.set(path, finalFraction);
        return next;
      });
      setHistory((prev) => [
        {
          type: "drag-split-boundary",
          path,
          prevFraction: boundaryDragState.prevFraction,
          newFraction: finalFraction,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
      setLiveBoundaryFraction(null);
      setBoundaryDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [boundaryDragState]);

  // Starts a "photo-title" cover frame resize - currentWidth/Height are
  // the frame's own already-resolved fraction (its built-in default if
  // never overridden), passed in by the cover component itself rather
  // than duplicated here, since each cover has its own different default
  // size. availWidth/availHeight are that cover's raw (pre-toPoints)
  // pixel dimensions, used below to convert a pixel drag into a fraction
  // delta.
  const handleFrameResizePointerDown = (
    target: "cover" | "back-cover",
    event: React.PointerEvent,
    currentWidth: number,
    currentHeight: number,
    availWidth: number,
    availHeight: number,
    scale: number,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setFrameResizeState({
      target,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
      availWidth,
      availHeight,
      scale,
      prevSize: target === "cover" ? coverFrameSize : backCoverFrameSize,
    });
  };

  // Dragging a cover frame's resize handle - same rAF-throttled live-
  // preview pattern as the split-boundary drag above. The handle sits at
  // the frame's bottom-right corner but the frame stays centered in its
  // available space as it resizes, so a pixel delta maps to *twice* that
  // in fraction terms (growing the right edge by X also grows the left
  // edge by X to stay centered).
  useEffect(() => {
    if (!frameResizeState) return;
    const {
      target,
      startX,
      startY,
      startWidth,
      startHeight,
      availWidth,
      availHeight,
      scale,
    } = frameResizeState;

    const MIN_FRAME_FRACTION = 0.3;
    const clampFrac = (v: number) => Math.min(1, Math.max(MIN_FRAME_FRACTION, v));

    let finalWidth = startWidth;
    let finalHeight = startHeight;
    let rafId: number | null = null;
    let pendingEvent: PointerEvent | null = null;

    const applyPendingMove = () => {
      rafId = null;
      if (!pendingEvent) return;
      const dxScreen = pendingEvent.clientX - startX;
      const dyScreen = pendingEvent.clientY - startY;
      const dxPt = ((dxScreen / scale) * 2) / toPoints(availWidth || 1);
      const dyPt = ((dyScreen / scale) * 2) / toPoints(availHeight || 1);
      finalWidth = clampFrac(startWidth + dxPt);
      finalHeight = clampFrac(startHeight + dyPt);
      setLiveFrameSize({ target, width: finalWidth, height: finalHeight });
    };

    const handlePointerMove = (event: PointerEvent) => {
      pendingEvent = event;
      if (rafId === null) rafId = requestAnimationFrame(applyPendingMove);
    };

    const handlePointerUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const newSize = { width: finalWidth, height: finalHeight };
      if (target === "cover") setCoverFrameSize(newSize);
      else setBackCoverFrameSize(newSize);
      setHistory((prev) => [
        {
          type: "resize-cover-frame",
          target,
          prevSize: frameResizeState.prevSize,
          newSize,
          timestamp: Date.now(),
        },
        ...prev,
      ]);
      setLiveFrameSize(null);
      setFrameResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [frameResizeState]);

  // Calculate total logical pages for display purposes
  const totalLogicalPages = pages.length;

  // Floating pill toolbar for per-page layout controls - shuffle the
  // bento arrangement, force a photo count, or swap some slots for text
  // cards. Icon + stepper rather than a row of bordered buttons/selects,
  // since this sits above every single page and gets used constantly.
  const renderStyleSwitcher = (logicalPageNumber: number) => {
    const currentCount = pageCounts.get(logicalPageNumber) ?? null;
    const currentText = textCardCounts.get(logicalPageNumber) ?? 0;
    // While in "Auto", the +/- buttons need to switch to manual starting
    // from however many slots are actually on the page right now (this
    // page's current photo+text-card count), not from a hardcoded 1 -
    // otherwise the very first click looked like it reset the page to a
    // near-empty layout instead of nudging it by one.
    const autoCount =
      pages.find((p) => p.pageNumber === logicalPageNumber)?.photos.length ??
      1;

    const decrementPhotos = () => {
      const base = currentCount ?? autoCount;
      if (base <= 1) handleSetPageCount(logicalPageNumber, null);
      else handleSetPageCount(logicalPageNumber, base - 1);
    };
    const incrementPhotos = () => {
      const base = currentCount ?? autoCount;
      if (base < 12) handleSetPageCount(logicalPageNumber, base + 1);
    };
    const decrementText = () =>
      handleSetTextCardCount(logicalPageNumber, Math.max(0, currentText - 1));
    const incrementText = () =>
      handleSetTextCardCount(logicalPageNumber, Math.min(3, currentText + 1));

    const stepBtn =
      "w-5 h-5 rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-xs leading-none transition-colors";
    const divider = (
      <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />
    );

    return (
      <div className="inline-flex items-center gap-0.5 px-1.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm">
        <span
          className="flex items-center gap-1 pl-1"
          title="Photos on this page"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-400 dark:text-gray-500 flex-none"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <button onClick={decrementPhotos} className={stepBtn}>
            –
          </button>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums w-9 text-center">
            {currentCount === null ? "Auto" : currentCount}
          </span>
          <button
            onClick={incrementPhotos}
            disabled={currentCount === 12}
            className={stepBtn}
          >
            +
          </button>
        </span>

        {divider}

        <span
          className="flex items-center gap-1 pr-1"
          title="Text cards on this page"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-400 dark:text-gray-500 flex-none"
          >
            <path d="M4 7V4h16v3M9 20h6M12 4v16" />
          </svg>
          <button
            onClick={decrementText}
            disabled={currentText === 0}
            className={stepBtn}
          >
            –
          </button>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 tabular-nums w-3 text-center">
            {currentText}
          </span>
          <button
            onClick={incrementText}
            disabled={currentText === 3}
            className={stepBtn}
          >
            +
          </button>
        </span>
        
        {/* Add new photo button - only visible when a new photo is selected */}
        {selectedNewAsset && (
          <>
            {divider}
            <button
              onClick={() => {
                if (!selectedNewAsset) return;
                
                console.log(`INSERT: Adding ${selectedNewAsset.id} to page ${logicalPageNumber} (currently ${assets.length} assets)`);
                
                // Find the current page to get its last photo
                const currentPage = pages.find(p => p.pageNumber === logicalPageNumber);
                let insertIndex = assets.length; // Default to end
                
                if (currentPage && currentPage.photos.length > 0) {
                  // Get the last non-text photo on this page
                  const lastPhotoOnPage = [...currentPage.photos].reverse().find(p => p.asset && !p.id.startsWith('text-'));
                  if (lastPhotoOnPage && lastPhotoOnPage.asset) {
                    // Find this photo's index in assets
                    const lastPhotoIndex = assets.findIndex(a => a.id === lastPhotoOnPage.asset!.id);
                    if (lastPhotoIndex !== -1) {
                      insertIndex = lastPhotoIndex + 1;
                      console.log(`Inserting after ${lastPhotoOnPage.asset.id} at index ${insertIndex}`);
                    }
                  }
                }
                
                // INSERT: Add new photo at the calculated position
                const updatedAssets = [
                  ...assets.slice(0, insertIndex),
                  selectedNewAsset,
                  ...assets.slice(insertIndex)
                ];
                console.log(`New assets count: ${updatedAssets.length}, inserted at index ${insertIndex}`);
                
                // Update assets state
                setAssets(updatedAssets);
                
                // Remove from new assets panel
                setNewAssets(prev => prev.filter(a => a.id !== selectedNewAsset.id));
                
                // ALWAYS increase photo count on this page to make room
                const prevPageCount = pageCounts.get(logicalPageNumber) ?? null;
                if (currentPage) {
                  // Count current non-text photos on the page
                  const currentPhotoCount = currentPage.photos.filter(p => p.asset && !p.id.startsWith('text-')).length;
                  const newCount = currentPhotoCount + 1;
                  console.log(`Increasing page ${logicalPageNumber} count from ${currentPhotoCount} to ${newCount}`);
                  handleSetPageCount(logicalPageNumber, newCount);
                }
                
                // Add to history with full asset info for undo
                setHistory(prev => {
                  console.log(`Adding to history: insert-new-photo`);
                  return [{
                    type: "insert-new-photo",
                    newAsset: selectedNewAsset,
                    pageNumber: logicalPageNumber,
                    prevPageCount,
                    timestamp: Date.now(),
                  }, ...prev];
                });
                
                // Clear selection
                const insertedAssetId = selectedNewAsset.id;
                setSelectedNewAsset(null);
                
                // Save snapshot to backend
                setTimeout(() => {
                  console.log(`Saving snapshot after insert...`);
                  const config: AlbumConfig = {
                    printerId,
                    pageWidth,
                    pageHeight,
                    margin,
                    spacing,
                    filterVideos,
                    bleedEnabled,
                    bleed,
                    showDates,
                    showCaptions,
                    fontSize,
                    pageBackground,
                    cardStyle,
                    customOrdering,
                    layoutVariants: Object.fromEntries(layoutVariants),
                    pageCounts: Object.fromEntries(pageCounts),
                    pageCaptions: Object.fromEntries(pageCaptions),
                    cardCaptions: Object.fromEntries(cardCaptions),
                    focalPoints: Object.fromEntries(focalPoints),
                    boundaryOverrides: Object.fromEntries(boundaryOverrides),
                    axisOverrides: Object.fromEntries(axisOverrides),
                    textCardCounts: Object.fromEntries(textCardCounts),
                    textCardContents: Object.fromEntries(textCardContents),
                    slotOverrides: Object.fromEntries(slotOverrides),
                    manuallyMovedIds: Array.from(manuallyMovedIds),
                    showCover,
                    coverTitle,
                    coverAssetId,
                    coverLayout,
                    coverFrameSize,
                    backCoverAssetId,
                    backCoverLayout,
                    backCoverFrameSize,
                    backCoverText,
                    backCoverPlainText,
                    excludeCoverPhotosFromPages,
                  };
                  saveAlbumConfig(album.id, config, updatedAssets);
                }, 100);
                
                console.log(`Inserted new photo ${insertedAssetId}, may appear on page ${logicalPageNumber}`);
              }}
              title={t(language, "addHere")}
              className="px-2 py-1 text-xs font-semibold text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/20 rounded transition-colors whitespace-nowrap"
            >
              {t(language, "addHere")}
            </button>
          </>
        )}
      </div>
    );
  };

  // Generate one short LLM caption per page from the Immich descriptions of
  // the photos grouped on that page (thebrain, proxied server-side at
  // /llm/ - see nginx.conf.template). Explicit action rather than automatic:
  // this hits a shared local GPU and results are meant to be reviewed/edited
  // before printing, not regenerated on every layout tweak.
  if (isLoading || isDetectingChanges) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center">
          {/* Elaborate flower spinner */}
          <div className="relative w-24 h-24 mx-auto">
            <svg className="animate-spin-slow w-24 h-24" viewBox="0 0 100 100">
              <g className="text-indigo-600 dark:text-indigo-400" fill="currentColor" opacity="0.9">
                {[...Array(8)].map((_, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="15"
                    r="8"
                    transform={`rotate(${i * 45} 50 50)`}
                    className="animate-pulse"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </g>
              <circle cx="50" cy="50" r="12" className="text-indigo-500 dark:text-indigo-300" fill="currentColor" />
            </svg>
          </div>
          <p className="mt-6 text-gray-600 dark:text-gray-400 font-medium">
            {isLoading ? t(language, "loadingPhotos") : t(language, "analyzingChanges")}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-4">
        <div className="max-w-md w-full">
          <button
            onClick={onBack}
            className="mb-4 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            ← Back to albums
          </button>
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            <button
              onClick={loadAlbumAssets}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm transition-colors shadow-sm font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }


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
      if (showCover && coverLayout !== "text-only" && coverAsset) {
        assetIds.add(coverAsset.id);
      }
      if (
        showCover &&
        backCoverLayout !== "text-only" &&
        backCoverAsset
      ) {
        assetIds.add(backCoverAsset.id);
      }

      const ids = Array.from(assetIds);
      const totalFetches = ids.length;
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

      // Top-up: the background prefetch (see the useEffect above
      // interiorAssets/coverAsset/backCoverAsset) usually already has
      // every placed photo's focal point by the time the user clicks
      // "Generate", but this guarantees it regardless of timing - the
      // PDF always crops in "cover" mode (even for card styles/layouts
      // that don't crop in the web preview), so it must never wait on a
      // stale/incomplete `focalPoints` state. `ensureFocalPoints` dedupes
      // against what's already cached, so this is a no-op fetch-wise
      // once the background prefetch has caught up.
      const freshFocalPoints = await ensureFocalPoints(ids);
      const focalPointsForPdf = new Map(focalPoints);
      freshFocalPoints.forEach((v, k) => focalPointsForPdf.set(k, v));

      // Shared by every buildPdfDocument() call below - only imageBlobs
      // and pdfType vary between the cover/interior/full variants.
      const pdfDocumentBaseParams = {
        album,
        validPageWidth,
        validPageHeight,
        validMargin,
        validBleed,
        bleedEnabled,
        coverAsset,
        backCoverAsset,
        spineWidth,
        separatedCover,
        backCoverLayout,
        backCoverFrameSize,
        backCoverText,
        backCoverTextSize,
        backCoverPlainText,
        fontSize,
        coverLayout,
        coverFrameSize,
        coverTitle,
        coverTextSize,
        showCover,
        pageBackground,
        spineColor,
        spineTextSize,
        spineTextColor,
        spineTitle,
        pages,
        showCaptions,
        pageCaptions,
        cardStyle,
        textCardContents,
        showDates,
        cardCaptions,
        focalPoints: focalPointsForPdf,
      };

      // react-pdf's WASM layout engine (yoga-layout) computes the whole
      // document's layout in a single pass - confirmed to crash the tab
      // outright on a book with hundreds of pages built in one
      // pdf().toBlob() call (~700+ photos), while ~100 photos in one
      // pass is fine. Building the interior in chunks this size, each
      // its own small react-pdf render, and concatenating the resulting
      // PDFs server-side (mergePdfBlobs -> backend /pdf/merge, byte-level
      // page copy, no re-encoding - full image quality kept) scales to a
      // book of any length: even after chunking, a large book's combined
      // size can exceed what a browser tab can hold as one buffer to
      // merge itself, which the server doesn't run into.
      const INTERIOR_CHUNK_PAGE_COUNT = 40;
      // Renders just the interior chunks - does NOT merge them. Merging
      // happens exactly once, at the end, over the full ordered part
      // list (front cover + interior chunks + back cover) - merging the
      // interior on its own first and then merging that result again
      // into the final file would mean downloading the (potentially
      // huge) merged interior from the server only to immediately
      // re-upload the same bytes for the second merge, doubling the
      // transfer for no reason and, with no progress feedback during
      // that leg, making generation look stuck.
      const buildInteriorChunkBlobs = async (): Promise<Blob[]> => {
        const chunks: typeof pages[] = [];
        for (let i = 0; i < pages.length; i += INTERIOR_CHUNK_PAGE_COUNT) {
          chunks.push(pages.slice(i, i + INTERIOR_CHUNK_PAGE_COUNT));
        }
        if (chunks.length === 0) chunks.push([]);
        setPdfProgress({ done: 0, total: chunks.length });
        const chunkBlobs: Blob[] = [];
        for (const chunkPages of chunks) {
          chunkBlobs.push(
            await pdf(
              buildPdfDocument({
                ...pdfDocumentBaseParams,
                imageBlobs,
                pdfType: "interior",
                pages: chunkPages,
              }),
            ).toBlob(),
          );
          setPdfProgress({ done: chunkBlobs.length, total: chunks.length });
        }
        return chunkBlobs;
      };

      if (separatedCover && showCover) {
        // Generate two PDFs: one for cover, one for interior
        const coverBlob = await pdf(buildPdfDocument({ ...pdfDocumentBaseParams, imageBlobs, pdfType: 'cover' })).toBlob();
        const interiorChunks = await buildInteriorChunkBlobs();
        let interiorBlob: Blob;
        if (interiorChunks.length === 1) {
          interiorBlob = interiorChunks[0];
        } else {
          setPdfProgress({ percent: 0 });
          interiorBlob = await mergePdfBlobs(interiorChunks, (fraction) =>
            setPdfProgress({ percent: fraction }),
          );
        }

        // Download both files
        const albumSlug = album.albumName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const coverUrl = URL.createObjectURL(coverBlob);
        const interiorUrl = URL.createObjectURL(interiorBlob);

        // Create download links
        const coverLink = document.createElement('a');
        coverLink.href = coverUrl;
        coverLink.download = `${albumSlug}-cover.pdf`;
        coverLink.click();

        setTimeout(() => {
          const interiorLink = document.createElement('a');
          interiorLink.href = interiorUrl;
          interiorLink.download = `${albumSlug}-interior.pdf`;
          interiorLink.click();

          // Show the cover PDF in preview
          setPdfUrl(coverUrl);
        }, 500);
      } else {
        // Generate a single PDF with everything: front cover and back
        // cover each rendered standalone (cheap, one page), the
        // interior in chunks, all concatenated into one file.
        const parts: Blob[] = [];
        if (showCover) {
          parts.push(
            await pdf(
              buildPdfDocument({
                ...pdfDocumentBaseParams,
                imageBlobs,
                pdfType: "front-cover-standalone",
              }),
            ).toBlob(),
          );
        }
        parts.push(...(await buildInteriorChunkBlobs()));
        if (showCover) {
          parts.push(
            await pdf(
              buildPdfDocument({
                ...pdfDocumentBaseParams,
                imageBlobs,
                pdfType: "back-cover-standalone",
              }),
            ).toBlob(),
          );
        }
        let blob: Blob;
        if (parts.length === 1) {
          blob = parts[0];
        } else {
          setPdfProgress({ percent: 0 });
          blob = await mergePdfBlobs(parts, (fraction) =>
            setPdfProgress({ percent: fraction }),
          );
        }
        setPdfUrl(URL.createObjectURL(blob));
      }
      
      const failures = imageFailures;
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

  const sidebarBrand = (
    <button
      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      title={sidebarCollapsed ? t(language, "openPanel") : t(language, "closePanel")}
      className={`flex items-center gap-2 font-bold text-gray-900 dark:text-gray-50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors ${sidebarCollapsed ? "justify-center w-9 h-9" : "px-2 py-1.5"}`}
    >
      <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-extrabold flex-none">
        IB
      </span>
      {!sidebarCollapsed && <span className="text-sm">Immich Book</span>}
    </button>
  );

  const sidebarLanguageToggle = (
    <button
      onClick={() => setLanguage(language === "fr" ? "en" : "fr")}
      title="Change language / Changer de langue"
      className={
        sidebarCollapsed
          ? "w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors text-xs font-bold"
          : "flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 text-xs font-semibold transition-colors"
      }
    >
      {language === "fr" ? "🇫🇷" : "🇬🇧"}
      {!sidebarCollapsed && (language === "fr" ? " FR" : " EN")}
    </button>
  );

  const sidebarThemeToggle = (
    <button
      onClick={onToggleDarkMode}
      title="Toggle dark mode"
      className={
        sidebarCollapsed
          ? "w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
          : "flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 text-xs font-semibold transition-colors"
      }
    >
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
      {!sidebarCollapsed && (darkMode ? t(language, "dark") : t(language, "light"))}
    </button>
  );



  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-950">
      <aside
        className={`flex-none flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-200 overflow-hidden ${
          sidebarCollapsed ? "w-16" : "w-80"
        }`}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3 py-4">
              {sidebarBrand}
              <div className="w-8 border-t border-gray-200 dark:border-gray-800" />
              <button
                onClick={() => {
                  setIsDetectingChanges(true);
                  detectAlbumChanges(album.id, assets.map(a => a.id))
                    .then(({ missingAssets, newAssetIds }) => {
                      console.log(`Manual sync: ${newAssetIds.length} new, ${missingAssets.length} missing`);

                      // Update missing assets
                      setMissingAssetIds(new Set(missingAssets.map((a: AssetResponseDto) => a.id)));

                      // Handle new photos
                      if (newAssetIds.length > 0) {
                        const newPhotos = assets.filter(a => newAssetIds.includes(a.id));
                        setNewAssets(prev => {
                          // Merge with existing newAssets, avoiding duplicates
                          const existing = new Set(prev.map(a => a.id));
                          const toAdd = newPhotos.filter(a => !existing.has(a.id));
                          return [...prev, ...toAdd];
                        });
                        // Remove from main assets
                        setAssets(prev => prev.filter(a => !newAssetIds.includes(a.id)));
                        console.log(`${newPhotos.length} new photos added to panel`);
                      }

                      setChangesDetected(missingAssets.length > 0 || newAssetIds.length > 0);
                    })
                    .catch(err => {
                      console.error('Sync failed:', err);
                    })
                    .finally(() => {
                      setIsDetectingChanges(false);
                    });
                }}
                disabled={isDetectingChanges}
                title="Sync with Immich"
                className="w-9 h-9 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className={`w-4 h-4 ${isDetectingChanges ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf}
                title={t(language, "generatePdf")}
                className="w-9 h-9 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 flex items-center justify-center transition-colors"
              >
                {isGeneratingPdf ? (
                  <PdfSpinner />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M10.2 2h3.6l.6 3.4a7 7 0 0 1 2.7 1.6l3.3-1.2 1.8 3.1-2.7 2.3a7 7 0 0 1 0 3.2l2.7 2.3-1.8 3.1-3.3-1.2a7 7 0 0 1-2.7 1.6l-.6 3.4h-3.6l-.6-3.4a7 7 0 0 1-2.7-1.6l-3.3 1.2-1.8-3.1 2.7-2.3a7 7 0 0 1 0-3.2L1.8 9.2 3.6 6l3.3 1.2a7 7 0 0 1 2.7-1.6L10.2 2z" />
                  </svg>
                )}
              </button>
              {pdfUrl && !isGeneratingPdf && (
                <a
                  href={pdfUrl}
                  download={`${sanitizeFileName(album.albumName)}.pdf`}
                  title={t(language, "downloadPdf")}
                  className="w-9 h-9 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
                  </svg>
                </a>
              )}
              {pdfUrl && !isGeneratingPdf && selectedPrinter.url && (
                <a
                  href={selectedPrinter.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t(language, "printWith") + " " + selectedPrinter.label}
                  className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors border border-gray-200 dark:border-gray-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 14h12v8H6z" />
                  </svg>
                </a>
              )}
              <div className="w-8 border-t border-gray-200 dark:border-gray-800" />
              <div className="mt-auto flex flex-col gap-2">
                {sidebarLanguageToggle}
                {sidebarThemeToggle}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6 p-4 min-h-full">
              <div className="flex items-center justify-between">
                {sidebarBrand}
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  title={t(language, "closePanel")}
                  className="w-7 h-7 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              </div>

              <div>
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-2 transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  {t(language, "albums")}
                </button>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex-1">
                    {album.albumName}
                  </h2>
                  <button
                    onClick={() => {
                      setIsDetectingChanges(true);
                      fetch(`/photobooks/${encodeURIComponent(album.id)}/detect-changes`, {
                        method: 'POST',
                      })
                        .then(res => res.json())
                        .then(({ missingAssets, newAssetIds }) => {
                          console.log(`Manual sync: ${newAssetIds.length} new, ${missingAssets.length} missing`);
                          
                          // Update missing assets
                          setMissingAssetIds(new Set(missingAssets.map((a: AssetResponseDto) => a.id)));
                          
                          // Handle new photos
                          if (newAssetIds.length > 0) {
                            const newPhotos = assets.filter(a => newAssetIds.includes(a.id));
                            setNewAssets(prev => {
                              // Merge with existing newAssets, avoiding duplicates
                              const existing = new Set(prev.map(a => a.id));
                              const toAdd = newPhotos.filter(a => !existing.has(a.id));
                              return [...prev, ...toAdd];
                            });
                            // Remove from main assets
                            setAssets(prev => prev.filter(a => !newAssetIds.includes(a.id)));
                            console.log(`${newPhotos.length} new photos added to panel`);
                          }
                          
                          setChangesDetected(missingAssets.length > 0 || newAssetIds.length > 0);
                        })
                        .catch(err => {
                          console.error('Sync failed:', err);
                        })
                        .finally(() => {
                          setIsDetectingChanges(false);
                        });
                    }}
                    disabled={isDetectingChanges}
                    title="Sync with Immich"
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg
                      className={`w-4 h-4 text-gray-600 dark:text-gray-400 ${isDetectingChanges ? 'animate-spin' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <p className="text-gray-500 dark:text-gray-400 mt-1 text-xs tabular-nums">
                  {filteredAssets.length}{" "}
                  {filteredAssets.length !== assets.length &&
                    `of ${assets.length}`}{" "}
                  assets
                </p>
              </div>

      {/* Settings - styled like browser tabs: the tab strip sits on a
          muted background, the active tab "lifts" into the content
          pane below by sharing its background, and the content pane
          itself has no separate card border - it just reads as the
          continuation of whichever tab is open. */}
      <div>
        <div className="flex gap-0.5 p-1 bg-gray-100 dark:bg-gray-900 rounded-t-xl">
          {(
            [
              {
                key: "page" as const,
                label: t(language, "tabPage"),
                icon: <rect x="4" y="3" width="16" height="18" rx="2" />,
              },
              {
                key: "layout" as const,
                label: t(language, "tabLayout"),
                icon: (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </>
                ),
              },
              {
                key: "presentation" as const,
                label: t(language, "tabPresentation"),
                icon: (
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </>
                ),
              },
              {
                key: "cover" as const,
                label: t(language, "tabCover"),
                icon: (
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
                ),
              },
            ]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSettingsTab(tab.key)}
              className={`flex-1 min-w-0 flex flex-col items-center gap-1 px-1 py-2 rounded-t-lg transition-colors ${
                settingsTab === tab.key
                  ? "bg-white dark:bg-gray-950 text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="flex-none"
              >
                {tab.icon}
              </svg>
              <span className="text-[10px] font-semibold leading-tight text-center">
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        {(swapFirstId ||
          customOrdering !== null ||
          slotOverrides.size > 0 ||
          manuallyMovedIds.size > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs bg-white dark:bg-gray-950 px-3 pt-3">
            {swapFirstId && (
              <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                {t(language, "cardSelected")}
                <button
                  onClick={() => setSwapFirstId(null)}
                  className="px-2.5 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full transition-colors font-medium"
                >
                  {t(language, "cancel")}
                </button>
              </span>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-gray-950 rounded-b-xl px-3 pb-3 pt-3">
          {settingsTab === "page" && (
            <SidebarPageSettings
              language={language}
              printerId={printerId}
              handleSelectPrinter={handleSelectPrinter}
              selectedPrinter={selectedPrinter}
              formatCategory={formatCategory}
              handleSelectCategory={handleSelectCategory}
              pageWidth={pageWidth}
              setPageWidth={setPageWidth}
              pageHeight={pageHeight}
              setPageHeight={setPageHeight}
              isPageWidthValid={isPageWidthValid}
              isPageHeightValid={isPageHeightValid}
            />
          )}

          {settingsTab === "layout" && (
            <SidebarLayoutSettings
              language={language}
              margin={margin}
              setMargin={setMargin}
              isMarginValid={isMarginValid}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              spacing={spacing}
              setSpacing={setSpacing}
              isSpacingValid={isSpacingValid}
              selectedPrinter={selectedPrinter}
              bleedEnabled={bleedEnabled}
              setBleedEnabled={setBleedEnabled}
              bleed={bleed}
              setBleed={setBleed}
              isBleedValid={isBleedValid}
            />
          )}

          {settingsTab === "presentation" && (
            <SidebarPresentationSettings
              language={language}
              showDates={showDates}
              setShowDates={setShowDates}
              showCaptions={showCaptions}
              setShowCaptions={setShowCaptions}
              fontSize={fontSize}
              setFontSize={setFontSize}
              cardStyle={cardStyle}
              setCardStyle={setCardStyle}
              pageBackground={pageBackground}
              setPageBackground={setPageBackground}
            />
          )}

          {settingsTab === "cover" && (
            <SidebarCoverSettings
              language={language}
              album={album}
              separatedCover={separatedCover}
              setSeparatedCover={setSeparatedCover}
              spineWidth={spineWidth}
              setSpineWidth={setSpineWidth}
              spineColor={spineColor}
              setSpineColor={setSpineColor}
              spineTextColor={spineTextColor}
              setSpineTextColor={setSpineTextColor}
              spineTextSize={spineTextSize}
              setSpineTextSize={setSpineTextSize}
              spineTitle={spineTitle}
              setSpineTitle={setSpineTitle}
              coverTitle={coverTitle}
              setCoverTitle={setCoverTitle}
              coverTextSize={coverTextSize}
              setCoverTextSize={setCoverTextSize}
              setHistory={setHistory}
              coverLayout={coverLayout}
              setCoverLayout={setCoverLayout}
              backCoverLayout={backCoverLayout}
              setBackCoverLayout={setBackCoverLayout}
              backCoverAsset={backCoverAsset}
              backCoverPlainText={backCoverPlainText}
              setBackCoverPlainText={setBackCoverPlainText}
              backCoverTextSize={backCoverTextSize}
              setBackCoverTextSize={setBackCoverTextSize}
            />
          )}
        </div>
      </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  className="px-5 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
                >
                  {isGeneratingPdf && <PdfSpinner />}
                  {isGeneratingPdf
                    ? pdfProgress
                      ? "percent" in pdfProgress
                        ? `${t(language, "generating")} ${Math.round(pdfProgress.percent * 100)}%`
                        : `${t(language, "generating")} ${pdfProgress.done}/${pdfProgress.total}`
                      : t(language, "generating")
                    : t(language, "generatePdf")}
                </button>
                {pdfUrl && !isGeneratingPdf && (
                  <a
                    href={pdfUrl}
                    download={`${sanitizeFileName(album.albumName)}.pdf`}
                    className="px-5 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold shadow-sm transition-colors text-center"
                  >
                    {t(language, "downloadPdf")}
                  </a>
                )}
              </div>

              {/* Printer link - only shown once a specific printer is
                  selected (Page tab), and only that one printer's link:
                  the page is now sized/bled for that printer specifically,
                  so the other services' links would just be misleading.
                  "PDF Libre" isn't tied to a print service, so this
                  section disappears entirely for it. Logo sits on a
                  fixed white chip (not dark:-varied) since a couple of
                  the logos are plain black artwork with no dark-mode
                  variant. */}
              {selectedPrinter.url && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {t(language, "printWith")}
                  </span>
                  <a
                    href={selectedPrinter.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={selectedPrinter.label}
                    className="inline-flex items-center justify-center h-10 px-3.5 rounded-lg bg-white border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-sm transition-all w-fit"
                  >
                    {selectedPrinter.logo ? (
                      <img
                        src={selectedPrinter.logo}
                        alt={selectedPrinter.label}
                        className="h-4 max-w-[92px] object-contain"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-gray-700">
                        {selectedPrinter.label}
                      </span>
                    )}
                  </a>
                </div>
              )}

              <div className="mt-auto pt-2 flex gap-2 justify-start flex-wrap">
                {sidebarLanguageToggle}
                {sidebarThemeToggle}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        {/* Top Panel - New Photos */}
        {newAssets.length > 0 && (
          <div className="flex-none bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-md z-10 p-4">
            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t(language, "newPhotosToPlace")}: {newAssets.length}
              </span>
              <div
                ref={newAssetsScrollRef}
                onPointerDown={(e) =>
                  newAssetsDragScroll.onPointerDown(e, newAssetsScrollRef.current, { restrictToSelf: true })
                }
                onClickCapture={(e) => {
                  if (newAssetsDragScroll.consumeDrag()) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                className="flex gap-3 overflow-x-auto custom-scrollbar pb-2"
              >
                  {newAssets.map((asset) => {
                    const imageLoaded = loadedNewAssetIds.has(asset.id);
                    return (
                      <button
                        key={asset.id}
                        data-reorder-asset-id={asset.id}
                        onPointerDown={(e) => handleReorderPointerDown(asset.id, e)}
                        onClick={() => {
                          setSwapConfirmation(null);
                          setNewAssetPlacementConfirmation(null);

                          // An existing card/cover was armed first
                          // (swapFirstId) - clicking a new photo now
                          // completes that swap the same way clicking an
                          // existing target after picking the new photo
                          // first would have, instead of just silently
                          // dropping the earlier selection and requiring
                          // a third click. Dragging this thumbnail onto
                          // a target does the same thing, via the
                          // generic reorder-drag effect (requestSwap).
                          if (swapFirstId) {
                            requestSwap(swapFirstId, asset.id);
                            setSwapFirstId(null);
                            return;
                          }

                          setSelectedNewAsset(selectedNewAsset?.id === asset.id ? null : asset);
                        }}
                        style={{ touchAction: "none" }}
                        className={`relative rounded-lg overflow-hidden transition-all flex-shrink-0 cursor-move ${
                          selectedNewAsset?.id === asset.id
                            ? 'ring-4 ring-indigo-500 scale-105'
                            : 'hover:scale-105 hover:shadow-lg'
                        }`}
                      >
                        {/* Placeholder with pulse effect */}
                        {!imageLoaded && (
                          <div className="w-24 h-24 bg-gray-300 dark:bg-gray-700 animate-pulse" />
                        )}
                        <img
                          src={`${immichConfig.baseUrl}/assets/${asset.id}/thumbnail?size=preview`}
                          alt={asset.originalFileName}
                          className={`w-24 h-24 object-cover ${imageLoaded ? 'block' : 'hidden'}`}
                          onLoad={() => setLoadedNewAssetIds(prev => new Set([...prev, asset.id]))}
                        />
                        {selectedNewAsset?.id === asset.id && imageLoaded && (
                          <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
        
        {/* Scrollable content area - only this area scrolls, not the panels */}
        <div className="flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden">
          {/* Live Preview - always shown; the generated PDF (if any)
              appears below once ready, rather than replacing this editor. */}
          <div
            ref={previewContainerRef}
            className="space-y-8 pb-8 px-4 sm:px-16 pt-6 max-w-full prevent-native-drag-select"
          >
          {showCover && separatedCover && (
            <div data-page-number="cover" data-page-nav-alt="back-cover">
            <CoverSpread
              validPageWidth={validPageWidth}
              validPageHeight={validPageHeight}
              spineWidth={spineWidth}
              bleedEnabled={bleedEnabled}
              validBleed={validBleed}
              previewWidth={previewWidth}
              coverAsset={coverAsset}
              backCoverAsset={backCoverAsset}
              coverFocalPoint={coverFocalPoint}
              backCoverFocalPoint={backCoverFocalPoint}
              coverFrameSize={resolvedCoverFrameSize}
              backCoverFrameSize={resolvedBackCoverFrameSize}
              onFrameResizePointerDown={handleFrameResizePointerDown}
              pageBackground={pageBackground}
              immichConfig={immichConfig}
              selectedNewAsset={selectedNewAsset}
              swapFirstId={swapFirstId}
              handleReorderPointerDown={handleReorderPointerDown}
              performNewAssetPlacement={performNewAssetPlacement}
              backCoverLayout={backCoverLayout}
              backCoverText={backCoverText}
              setBackCoverText={setBackCoverText}
              backCoverTextSize={backCoverTextSize}
              setHistory={setHistory}
              language={language}
              spineColor={spineColor}
              spineTextSize={spineTextSize}
              spineTextColor={spineTextColor}
              spineTitle={spineTitle}
              album={album}
              coverLayout={coverLayout}
              coverTitle={coverTitle}
              setCoverTitle={setCoverTitle}
              coverTextSize={coverTextSize}
            />
            </div>
          )}


          {showCover && !separatedCover && (
            <div data-page-number="cover">
            <FrontCoverStandalone
              validPageWidth={validPageWidth}
              validPageHeight={validPageHeight}
              bleedEnabled={bleedEnabled}
              validBleed={validBleed}
              previewWidth={previewWidth}
              coverAsset={coverAsset}
              coverFocalPoint={coverFocalPoint}
              coverFrameSize={resolvedCoverFrameSize}
              onFrameResizePointerDown={handleFrameResizePointerDown}
              immichConfig={immichConfig}
              swapFirstId={swapFirstId}
              coverTitle={coverTitle}
              setCoverTitle={setCoverTitle}
              coverTextSize={coverTextSize}
              setHistory={setHistory}
              album={album}
              language={language}
              pageBackground={pageBackground}
              coverLayout={coverLayout}
              selectedNewAsset={selectedNewAsset}
              handleReorderPointerDown={handleReorderPointerDown}
              performNewAssetPlacement={performNewAssetPlacement}
            />
            </div>
          )}

          {pages.map((page) => {
            // Scale down to match PDF dimensions (72 DPI from 300 DPI)
            const displayWidth = toPoints(page.width);
            const displayHeight = toPoints(page.height);
            const bleedPreviewPt = bleedEnabled ? toPoints(validBleed) : 0;
            // Shrink to fit the available column width (combined spreads
            // are often wider than the viewport) - never scale up past 1.
            // The scale is computed against the bleed-inclusive width so
            // a bled page never overflows the preview column.
            const scale =
              previewWidth > 0
                ? Math.min(1, previewWidth / (displayWidth + bleedPreviewPt * 2))
                : 1;
            return (
              <div key={page.pageNumber} data-page-number={page.pageNumber} className="relative">
                {/* Page number and style controls */}
                <div className="text-center mb-2 flex flex-wrap items-center justify-center gap-2">
                  <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm rounded-full font-medium">
                    {t(language, "pageOf")} {page.pageNumber} {t(language, "of")} {totalLogicalPages}
                  </span>
                  {renderStyleSwitcher(page.pageNumber)}
                </div>

                {/* Page container - laid out at its true (unscaled) size,
                    then shrunk to fit the preview column with CSS `zoom`
                    (not `transform: scale`) so every absolute-positioned
                    child (captions, photos) keeps using displayWidth-based
                    coordinates unchanged. `zoom` actually resizes the box
                    in layout, unlike `transform`, whose CSS transform on an
                    ancestor breaks native HTML5 drag-and-drop for photo
                    reordering in Chromium. */}
                  <div
                    className={`mx-auto relative shadow-lg dark:shadow-black/40 border border-gray-200 dark:border-gray-800 ${selectedNewAsset && coverAsset ? "ring-4 ring-green-400 ring-offset-2" : ""}`}
                    style={{
                      width: `${displayWidth + bleedPreviewPt * 2}px`,
                      height: `${displayHeight + bleedPreviewPt * 2}px`,
                      zoom: scale,
                      ...pageBackgroundCss(pageBackground),
                    }}
                  >
                  {/* Trim line - only meaningful when bleed is on; marks
                      where the printer will cut. */}
                  {bleedPreviewPt > 0 && (
                    <div
                      className="absolute pointer-events-none border border-dashed border-black/30 dark:border-white/30"
                      style={{
                        top: bleedPreviewPt,
                        left: bleedPreviewPt,
                        width: displayWidth,
                        height: displayHeight,
                      }}
                    />
                  )}

                    <div
                      className="absolute"
                      style={{
                        top: bleedPreviewPt,
                        left: bleedPreviewPt,
                        width: displayWidth,
                        height: displayHeight,
                      }}
                    >
                  {/* Page caption - editable margin band */}
                  {showCaptions &&
                    [{ key: page.pageNumber, left: 0, width: displayWidth }].map((band) => {
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
                          onFocus={(e) => {
                            e.target.dataset.initialValue = pageCaptions.get(band.key) || "";
                          }}
                          onChange={(e) => {
                            setPageCaptions((prev) => {
                              const next = new Map(prev);
                              if (e.target.value.trim() === "") {
                                next.delete(band.key);
                              } else {
                                next.set(band.key, e.target.value);
                              }
                              return next;
                            });
                          }}
                          onBlur={(e) => {
                            const prevText = e.target.dataset.initialValue || "";
                            const newText = e.target.value.trim();
                            if (prevText !== newText) {
                              setHistory((prev) => [
                                {
                                  type: "edit-page-caption",
                                  pageNumber: band.key,
                                  prevText,
                                  newText,
                                  timestamp: Date.now(),
                                },
                                ...prev,
                              ]);
                            }
                          }}
                          placeholder={t(language, "addCaption")}
                          className="absolute bg-transparent text-center focus:outline-none focus:bg-white/70 dark:focus:bg-gray-800/70 rounded placeholder:text-gray-400 dark:placeholder:text-gray-600"
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
                    // mounted the same way as a photo card. Draggable via
                    // the same data-reorder-asset-id/onPointerDown pattern
                    // as photo cards, keyed off its own synthetic id, so it
                    // can be swapped with another card (photo or text) and
                    // its content travels with it.
                    if (!photoBox.asset) {
                      const isBeingDragged =
                        reorderDragState?.draggedAssetId === photoBox.id;
                      const isReordered = manuallyMovedIds.has(photoBox.id);
                      const isSwapSelected = swapFirstId === photoBox.id;

                      return (
                        <div
                          key={photoBox.id}
                          data-reorder-asset-id={photoBox.id}
                          className={`absolute group cursor-move ${isBeingDragged ? "opacity-50" : ""} ${isSwapSelected ? "ring-4 ring-indigo-500 ring-offset-2 z-20" : ""}`}
                          style={{
                            left: `${toPoints(photoBox.x)}px`,
                            top: `${toPoints(photoBox.y)}px`,
                            width: `${containerWidth}px`,
                            height: `${containerHeight}px`,
                            touchAction: "none",
                          }}
                          onPointerDown={(e) =>
                            handleReorderPointerDown(photoBox.id, e)
                          }
                        >
                          {(() => {
                            const textCardBody = (
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
                                onFocus={(e) => {
                                  e.target.dataset.initialValue = textCardContents.get(photoBox.id) || "";
                                }}
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
                                onBlur={(e) => {
                                  const prevText = e.target.dataset.initialValue || "";
                                  const newText = e.target.value.trim();
                                  if (prevText !== newText) {
                                    setHistory((prev) => [
                                      {
                                        type: "edit-text-card",
                                        cardId: photoBox.id,
                                        prevText,
                                        newText,
                                        timestamp: Date.now(),
                                      },
                                      ...prev,
                                    ]);
                                  }
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
                            );

                            if (cardStyle === "clean") {
                              return (
                                <div
                                  className="absolute inset-0 flex items-center justify-center"
                                  style={{ padding: frameInset }}
                                >
                                  {textCardBody}
                                </div>
                              );
                            }

                            return (
                              <div
                                className="absolute inset-0"
                                style={{
                                  transform: `rotate(${tilt}deg) scale(0.93)`,
                                  boxShadow: `2px 5px 10px ${SCRAPBOOK.shadow}`,
                                  backgroundColor: SCRAPBOOK.mat,
                                }}
                              >
                                {/* Flex wrapper centers the (auto-growing)
                                    textarea both horizontally and
                                    vertically - a native <textarea> has no
                                    way to vertically center its own text,
                                    so the box itself has to hug its
                                    content and be centered instead. */}
                                <div
                                  className="absolute flex items-center justify-center"
                                  style={{
                                    inset: frameInset * 2,
                                  }}
                                >
                                  {textCardBody}
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
                            );
                          })()}

                          {/* Customization indicator */}
                          {isReordered && (
                            <div
                              className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full shadow-lg z-10"
                              title={t(language, "cardReordered")}
                            />
                          )}


                        </div>
                      );
                    }

                    const asset = photoBox.asset;
                    
                    // Check if this is a missing photo placeholder
                    const isMissingPhoto = missingAssetIds.has(asset.id);
                    
                    const imageUrl = `${immichConfig.baseUrl}/assets/${asset.id}/thumbnail?size=preview`;

                    // Dimming a card mid-drag signals "this is being moved
                    // elsewhere" - wrong feedback while its own crop is
                    // being panned in place, so panning cards stay at full
                    // opacity.
                    const isBeingDragged =
                      reorderDragState?.draggedAssetId === asset.id &&
                      !reorderDragState.pan;
                    const isReordered = manuallyMovedIds.has(asset.id);
                    const isSwapSelected = swapFirstId === asset.id;

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

                    // Scrapbook mode shows the whole photo (no cropping), so
                    // the mat has to hug the photo's own aspect ratio rather
                    // than stretch to the bento box's shape - otherwise a
                    // photo whose ratio doesn't match its box (e.g. a
                    // landscape photo in a portrait slot) reads as a mat with
                    // a huge, unbalanced blank margin on two sides.
                    const photoAspect = naturalAspectRatio(asset);
                    const availFrameWidth = Math.max(1, containerWidth - 2 * frameInset);
                    const availFrameHeight = Math.max(1, containerHeight - 2 * frameInset - bottomStripHeight);
                    let huggedImageWidth: number;
                    let huggedImageHeight: number;
                    if (photoAspect > availFrameWidth / availFrameHeight) {
                      huggedImageWidth = availFrameWidth;
                      huggedImageHeight = availFrameWidth / photoAspect;
                    } else {
                      huggedImageHeight = availFrameHeight;
                      huggedImageWidth = availFrameHeight * photoAspect;
                    }
                    const huggedFrameWidth = huggedImageWidth + 2 * frameInset;
                    const huggedFrameHeight = huggedImageHeight + 2 * frameInset + bottomStripHeight;
                    const huggedFrameLeft = (containerWidth - huggedFrameWidth) / 2;
                    const huggedFrameTop = (containerHeight - huggedFrameHeight) / 2;

                    return (
                      <div
                        key={photoBox.id}
                        data-reorder-asset-id={asset.id}
                        className={`absolute group ${selectedNewAsset ? "cursor-pointer" : "cursor-move"} ${isBeingDragged ? "opacity-50" : ""} ${isSwapSelected ? "ring-4 ring-indigo-500 ring-offset-2 z-20" : ""} ${selectedNewAsset && !isMissingPhoto ? "hover:ring-2 hover:ring-green-400" : ""} ${selectedNewAsset && isMissingPhoto ? "hover:ring-2 hover:ring-blue-400" : ""}`}
                        style={{
                          left: `${toPoints(photoBox.x)}px`,
                          top: `${toPoints(photoBox.y)}px`,
                          width: `${containerWidth}px`,
                          height: `${containerHeight}px`,
                          touchAction: "none",
                        }}
                        onClick={(e) => {
                          if (selectedNewAsset) {
                            e.stopPropagation();
                            if (isMissingPhoto) {
                              performNewAssetPlacement(selectedNewAsset, {
                                kind: "interior-replace",
                                placeholderAsset: asset,
                              });
                            } else {
                              performNewAssetPlacement(selectedNewAsset, {
                                kind: "interior-swap",
                                asset,
                              });
                            }
                          }
                        }}
                        onPointerDown={(e) => {
                          // Don't trigger drag/swap if clicking on delete button
                          const target = e.target as HTMLElement;
                          if (target.closest('button')) {
                            return;
                          }

                          // Only allow drag if no new photo is selected
                          if (!selectedNewAsset) {
                            handleReorderPointerDown(asset.id, e, cardStyle === "clean");
                          }
                        }}
                      >

                        {(() => {
                          const captionInput = (
                            insetPx: number,
                            bottomExtra: number,
                          ) => (
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
                              onFocus={(e) => {
                                e.target.dataset.initialValue = cardCaption;
                              }}
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
                              onBlur={(e) => {
                                const prevText = e.target.dataset.initialValue || "";
                                const newText = e.target.value.trim();
                                if (prevText !== newText) {
                                  setHistory((prev) => [
                                    {
                                      type: "edit-card-caption",
                                      assetId: asset.id,
                                      prevText,
                                      newText,
                                      timestamp: Date.now(),
                                    },
                                    ...prev,
                                  ]);
                                }
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
                                left: insetPx,
                                right: insetPx,
                                bottom: hasCardCaption
                                  ? bottomExtra + dateStripHeight
                                  : bottomExtra,
                                height: fontSize * 1.4,
                                fontFamily: "Caveat",
                                fontWeight: 500,
                                fontSize: `${fontSize * 1.3}px`,
                                color: SCRAPBOOK.ink,
                                lineHeight: 1,
                              }}
                            />
                          );
                          const dateStrip = (
                            insetPx: number,
                            bottomExtra: number,
                          ) =>
                            showDates &&
                            asset.fileCreatedAt && (
                              <div
                                className="absolute flex items-end justify-center text-center"
                                style={{
                                  left: insetPx,
                                  right: insetPx,
                                  bottom: bottomExtra,
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
                            );

                          if (cardStyle === "clean") {
                            return (
                              <div className="absolute inset-0">
                                <div
                                  className="absolute overflow-hidden"
                                  style={{
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: bottomStripHeight,
                                  }}
                                >
                                  {isMissingPhoto ? (
                                    <div className="w-full h-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                                      <span className="text-gray-500 dark:text-gray-400 text-sm opacity-50">
                                        {t(language, "missingPhoto")}
                                      </span>
                                    </div>
                                  ) : (
                                    <img
                                      src={imageUrl}
                                      alt={asset.originalFileName}
                                      className="object-cover w-full h-full"
                                      style={{
                                        objectPosition: focalPointToCss(
                                          focalPoints.get(asset.id),
                                        ),
                                      }}
                                      loading="lazy"
                                    />
                                  )}
                                </div>
                                {captionInput(0, 0)}
                                {dateStrip(0, 0)}
                              </div>
                            );
                          }

                          return (
                            <div
                              className="absolute"
                              style={{
                                top: huggedFrameTop,
                                left: huggedFrameLeft,
                                width: huggedFrameWidth,
                                height: huggedFrameHeight,
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
                                {isMissingPhoto ? (
                                  <div className="w-full h-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                                    <span className="text-gray-500 dark:text-gray-400 text-sm opacity-50">
                                      {t(language, "missingPhoto")}
                                    </span>
                                  </div>
                                ) : (
                                  <img
                                    src={imageUrl}
                                    alt={asset.originalFileName}
                                    className="object-contain w-full h-full"
                                    loading="lazy"
                                  />
                                )}
                              </div>
                              {captionInput(frameInset, frameInset * 0.3)}
                              {dateStrip(frameInset, frameInset * 0.3)}
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
                          );
                        })()}

                        {/* Delete placeholder button - only for missing photos */}
                        {isMissingPhoto && (
                          <button
                            className="absolute top-2 left-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg z-10 flex items-center justify-center text-xs font-bold transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log(`DELETE placeholder: ${asset.id}`);
                              
                              // Reset swap mode if active
                              setSwapFirstId(null);
                              
                              // Find which page this placeholder is on
                              let placeholderPage: number | null = null;
                              for (const page of pages) {
                                if (page.photos.some(p => p.asset?.id === asset.id)) {
                                  placeholderPage = page.pageNumber;
                                  break;
                                }
                              }
                              
                              // Count photos on this page before deletion
                              const prevPageCount = placeholderPage !== null ? pageCounts.get(placeholderPage) ?? null : null;
                              
                              // Remove this asset from missing list and from the layout
                              setMissingAssetIds(prev => {
                                const next = new Set(prev);
                                next.delete(asset.id);
                                return next;
                              });
                              
                              // Remove from assets array so it disappears from the layout
                              const updatedAssets = assets.filter(a => a.id !== asset.id);
                              setAssets(updatedAssets);
                              
                              // Decrease pageCount to prevent layout shift
                              if (placeholderPage !== null) {
                                const currentPage = pages.find(p => p.pageNumber === placeholderPage);
                                if (currentPage) {
                                  const currentPhotoCount = currentPage.photos.filter(p => p.asset && !p.id.startsWith('text-')).length;
                                  const newCount = Math.max(0, currentPhotoCount - 1);
                                  console.log(`Decreasing page ${placeholderPage} count from ${currentPhotoCount} to ${newCount}`);
                                  
                                  if (newCount === 0) {
                                    // Remove the page entirely if no photos left
                                    setPageCounts(prev => {
                                      const next = new Map(prev);
                                      next.delete(placeholderPage!);
                                      return next;
                                    });
                                  } else {
                                    handleSetPageCount(placeholderPage, newCount);
                                  }
                                }
                              }
                              
                              // Add to history with page info for undo
                              setHistory(prev => [{
                                type: "delete-placeholder",
                                placeholderAsset: asset,
                                pageNumber: placeholderPage,
                                prevPageCount,
                                timestamp: Date.now(),
                              }, ...prev]);
                              
                              // Save snapshot async
                              setTimeout(() => {
                                const config: AlbumConfig = {
                                  printerId, pageWidth, pageHeight, margin, spacing,
                                  filterVideos, bleedEnabled, bleed, showDates, showCaptions,
                                  fontSize, pageBackground, cardStyle, customOrdering,
                                  layoutVariants: Object.fromEntries(layoutVariants),
                                  pageCounts: Object.fromEntries(pageCounts),
                                  pageCaptions: Object.fromEntries(pageCaptions),
                                  cardCaptions: Object.fromEntries(cardCaptions),
                                  focalPoints: Object.fromEntries(focalPoints),
                                  boundaryOverrides: Object.fromEntries(boundaryOverrides),
                                  axisOverrides: Object.fromEntries(axisOverrides),
                                  textCardCounts: Object.fromEntries(textCardCounts),
                                  textCardContents: Object.fromEntries(textCardContents),
                                  slotOverrides: Object.fromEntries(slotOverrides),
                                  manuallyMovedIds: Array.from(manuallyMovedIds),
                                  showCover, coverTitle, coverAssetId, coverLayout,
                                  backCoverAssetId, backCoverLayout,
                                  backCoverText, backCoverPlainText, excludeCoverPhotosFromPages,
                                };
                                saveAlbumConfig(album.id, config, updatedAssets);
                              }, 100);
                            }}
                            title={t(language, "deletePlaceholder")}
                          >
                            ✕
                          </button>
                        )}

                        {/* Customization indicator */}
                        {isReordered && (
                          <div
                            className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full shadow-lg z-10"
                            title={t(language, "imageReordered")}
                          />
                        )}

                        {/* Set aside - pulls this photo into the "photos
                            to place" pool, leaving a placeholder hole in
                            its slot (same look as a missing photo). Only
                            for real, present photos - a missing one
                            already has its own delete button, and
                            placement mode has its own click handling. */}
                        {!isMissingPhoto && !selectedNewAsset && (
                          <button
                            className="absolute top-2 right-2 w-6 h-6 bg-gray-900/70 hover:bg-indigo-600 text-white rounded-full shadow-lg z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSetAsidePhoto(asset.id);
                            }}
                            title={t(language, "setAsidePhoto")}
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="4" rx="1" />
                              <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                              <path d="M10 13h4" />
                            </svg>
                          </button>
                        )}

                      </div>
                    );
                  })}

                  {/* Draggable bento split boundaries - a small icon at
                      the midpoint of each boundary is the only clickable
                      target (not the full line), so two boundaries can
                      only ever compete for the same click if their
                      icons land exactly on top of each other, not just
                      anywhere along their length. Click-drag-release to
                      resize (same photos, different shapes) instead of
                      accepting the auto layout; magnet-snaps to other
                      boundaries on the same page while dragging (see the
                      boundaryDragState effect); double-click flips this
                      boundary's orientation (stacked <-> side-by-side);
                      right-click sends it behind another icon
                      overlapping it. */}
                  {page.splits.map((split) => {
                    const isVertical = split.axis === "vertical";
                    const lineOffset = isVertical
                      ? split.rect.x + split.rect.width * split.fraction
                      : split.rect.y + split.rect.height * split.fraction;
                    const midOffset = isVertical
                      ? split.rect.y + split.rect.height / 2
                      : split.rect.x + split.rect.width / 2;
                    const ICON_PT = 22;
                    const isDraggingThis =
                      boundaryDragState?.path === split.path;
                    return (
                      <div
                        key={split.path}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setBoundaryDragState({
                            path: split.path,
                            pageNumber: page.pageNumber,
                            axis: split.axis,
                            rect: split.rect,
                            startX: e.clientX,
                            startY: e.clientY,
                            startFraction: split.fraction,
                            scale,
                            prevFraction: boundaryOverrides.get(split.path),
                          });
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newAxis: "vertical" | "horizontal" =
                            isVertical ? "horizontal" : "vertical";
                          setAxisOverrides((prev) => {
                            const next = new Map(prev);
                            next.set(split.path, newAxis);
                            return next;
                          });
                          setHistory((prev) => [
                            {
                              type: "flip-split-axis",
                              path: split.path,
                              prevAxis: axisOverrides.get(split.path),
                              newAxis,
                              timestamp: Date.now(),
                            },
                            ...prev,
                          ]);
                        }}
                        onContextMenu={(e) => {
                          // Two boundary icons can end up exactly on top
                          // of each other (e.g. snapped together) -
                          // right-click toggles which one is on top, so
                          // the other one becomes reachable again
                          // instead of being permanently shadowed.
                          e.preventDefault();
                          e.stopPropagation();
                          setBoundariesSentToBack((prev) => {
                            const next = new Set(prev);
                            if (next.has(split.path)) next.delete(split.path);
                            else next.add(split.path);
                            return next;
                          });
                        }}
                        title={t(language, "flipBoundaryHint")}
                        className={`absolute rounded-full flex items-center justify-center bg-indigo-500 text-white shadow-md transition-opacity hover:opacity-100 ${
                          isDraggingThis ? "opacity-100" : "opacity-60"
                        } ${
                          boundariesSentToBack.has(split.path)
                            ? "z-10"
                            : "z-20"
                        } ${isVertical ? "cursor-col-resize" : "cursor-row-resize"}`}
                        style={
                          isVertical
                            ? {
                                left: `${toPoints(lineOffset) - ICON_PT / 2}px`,
                                top: `${toPoints(midOffset) - ICON_PT / 2}px`,
                                width: `${ICON_PT}px`,
                                height: `${ICON_PT}px`,
                                touchAction: "none",
                              }
                            : {
                                top: `${toPoints(lineOffset) - ICON_PT / 2}px`,
                                left: `${toPoints(midOffset) - ICON_PT / 2}px`,
                                width: `${ICON_PT}px`,
                                height: `${ICON_PT}px`,
                                touchAction: "none",
                              }
                        }
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="13"
                          height="13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {isVertical ? (
                            <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
                          ) : (
                            <path d="M7 8l5-5 5 5M7 16l5 5 5-5" />
                          )}
                        </svg>
                      </div>
                    );
                  })}
                </div>
                  </div>
              </div>
            );
          })}

          {showCover && !separatedCover && (
            <div data-page-number="back-cover">
            <BackCoverStandalone
              validPageWidth={validPageWidth}
              validPageHeight={validPageHeight}
              bleedEnabled={bleedEnabled}
              validBleed={validBleed}
              previewWidth={previewWidth}
              backCoverText={backCoverText}
              setBackCoverText={setBackCoverText}
              setHistory={setHistory}
              swapFirstId={swapFirstId}
              language={language}
              selectedNewAsset={selectedNewAsset}
              backCoverAsset={backCoverAsset}
              backCoverFocalPoint={backCoverFocalPoint}
              backCoverFrameSize={resolvedBackCoverFrameSize}
              onFrameResizePointerDown={handleFrameResizePointerDown}
              pageBackground={pageBackground}
              handleReorderPointerDown={handleReorderPointerDown}
              performNewAssetPlacement={performNewAssetPlacement}
              backCoverLayout={backCoverLayout}
              immichConfig={immichConfig}
              backCoverPlainText={backCoverPlainText}
              backCoverTextSize={backCoverTextSize}
            />
            </div>
          )}
        </div>

      {pdfError && (
        <p className="px-4 sm:px-0 text-sm text-red-600 dark:text-red-400">
          {pdfError}
        </p>
      )}

      {pdfUrl && (
        <div
          className="w-full mt-4 px-4 sm:px-0"
          style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}
        >
          <iframe
            src={pdfUrl}
            title="Generated PDF"
            className="w-full h-full border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm dark:shadow-black/40"
          />
        </div>
      )}
        </div> {/* Close scrollable wrapper */}

        {/* Bottom Panel - Pages with Placeholders */}
        {missingAssetIds.size > 0 && (
          <div
            ref={missingPagesScrollRef}
            onPointerDown={(e) =>
              missingPagesDragScroll.onPointerDown(e, missingPagesScrollRef.current)
            }
            onClickCapture={(e) => {
              if (missingPagesDragScroll.consumeDrag()) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            className="flex-none border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg pt-4 z-10 overflow-y-auto custom-scrollbar cursor-grab active:cursor-grabbing"
            style={{ maxHeight: '140px' }}>
            <div className="px-4 pb-4">
              <div className="flex flex-col gap-3">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t(language, "pagesWithPlaceholders")}:
                </span>
                <div className="flex flex-wrap gap-3">
                  {pages
                    .filter(page =>
                      page.photos.some(photo =>
                        photo.asset && missingAssetIds.has(photo.asset.id)
                      )
                    )
                    .map(page => (
                      <div key={page.pageNumber} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <PageThumbButton
                          pageNumber={page.pageNumber}
                          signature={pageSignature(page, missingAssetIds)}
                          photos={page.photos}
                          scale={PAGE_THUMB_WIDTH / (pages[0]?.width ?? 1)}
                          aspectRatio={`${pages[0]?.width ?? 1} / ${pages[0]?.height ?? 1}`}
                          title={`${t(language, "pageOf")} ${page.pageNumber}`}
                          immichConfig={immichConfig}
                          pageBackground={pageBackground}
                          cardStyle={cardStyle}
                          missingAssetIds={missingAssetIds}
                        />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t(language, "pageOf")} {page.pageNumber}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <PageNavRail
        pages={pages}
        showCover={showCover}
        coverAsset={coverAsset}
        backCoverAsset={backCoverAsset}
        missingAssetIds={missingAssetIds}
        immichConfig={immichConfig}
        language={language}
        pageBackground={pageBackground}
        cardStyle={cardStyle}
      />

      <HistoryPanel
        history={history}
        historyCollapsed={historyCollapsed}
        setHistoryCollapsed={setHistoryCollapsed}
        setShowResetConfirmation={setShowResetConfirmation}
        setShowFlattenConfirmation={setShowFlattenConfirmation}
        customOrdering={customOrdering}
        slotOverrides={slotOverrides}
        manuallyMovedIds={manuallyMovedIds}
        layoutVariants={layoutVariants}
        pageCounts={pageCounts}
        textCardCounts={textCardCounts}
        textCardContents={textCardContents}
        pageCaptions={pageCaptions}
        cardCaptions={cardCaptions}
        language={language}
        handleUndo={handleUndo}
      />

      {/* Swap Confirmation Dialog */}
      {swapConfirmation && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">
              {t(language, "swapConfirmTitle")}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {t(language, "swapConfirmMessage")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSwapConfirmation(null);
                  setSwapFirstId(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
              >
                {t(language, "cancel")}
              </button>
              <button
                onClick={() => {
                  if (swapConfirmation) {
                    performSwap(
                      swapConfirmation.firstId,
                      swapConfirmation.secondId
                    );
                  }
                  setSwapConfirmation(null);
                  setSwapFirstId(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
              >
                {t(language, "swapConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {newAssetPlacementConfirmation && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">
              {t(language, "swapConfirmTitle")}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {t(language, "swapConfirmMessage")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setNewAssetPlacementConfirmation(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
              >
                {t(language, "cancel")}
              </button>
              <button
                onClick={applyNewAssetPlacement}
                className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
              >
                {t(language, "swapConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirmation && (
        <ResetAllConfirmDialog
          language={language}
          onCancel={() => setShowResetConfirmation(false)}
          onConfirm={handleResetAll}
        />
      )}

      {showFlattenConfirmation && (
        <FlattenConfirmDialog
          language={language}
          onCancel={() => setShowFlattenConfirmation(false)}
          onConfirm={handleFlatten}
        />
      )}
    </div>
  );
}

export default PhotoGrid;
