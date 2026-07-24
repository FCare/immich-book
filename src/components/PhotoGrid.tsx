import { useState, useEffect, useMemo, useRef } from "react";
import {
  getAlbumInfo,
  getTimeBuckets,
  getTimeBucket,
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
import { t, type Language } from "../i18n";
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
        objectFit: "cover",
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

interface PageFormat {
  // Which product line this belongs to (e.g. "Photo Book", "Livre de
  // poche") - printers with more than one category get a category
  // selector above the format chips, so picking a size is two short
  // steps instead of one long, mixed list.
  category: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

interface Printer {
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
const PRINTERS: Printer[] = [
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
        widthMm: 317.5,
        heightMm: 269.88,
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

interface GlobalConfig {
  // Page settings
  // Which printer's constraints (available sizes, bleed, one-page-per-
  // PDF-page) apply - "libre" leaves every field freely editable.
  printerId: string;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  combinePages: boolean;

  // Layout settings
  spacing: number;
  filterVideos: boolean;
  forceTimeline: boolean;
  // Bleed ("fond perdu") - optional border around the trim size, filled
  // with the page background, for print production.
  bleedEnabled: boolean;
  bleed: number;

  // Display settings
  showDates: boolean;
  showCaptions: boolean;
  fontSize: number;
  pageBackground: PageBackground;
  cardStyle: CardStyle;
}

type CoverLayout = "photo-title" | "full-bleed" | "text-only";

const COVER_LAYOUTS: { value: CoverLayout; labelKey: keyof typeof translations.en }[] = [
  { value: "photo-title", labelKey: "coverLayoutPhotoTitle" },
  { value: "full-bleed", labelKey: "coverLayoutFullBleed" },
  { value: "text-only", labelKey: "coverLayoutTextOnly" },
];

// How interior-page cards (photo and text) are mounted: "scrapbook" is
// the original look - mildly tilted, matted, a piece of tape at the top;
// "clean" is a flush, unrotated card the same size as its slot, no
// mat/shadow/tape, for a plainer/more modern layout.
type CardStyle = "scrapbook" | "clean";

const CARD_STYLES: { value: CardStyle; label: string }[] = [
  { value: "scrapbook", label: "Scrapbook" },
  { value: "clean", label: "Clean" },
];

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
  // Which photo to use on the back cover - independent of the front
  // cover photo. Null falls back to the last photo in the book's
  // current order (unless backCoverNoPhoto is set).
  backCoverAssetId: string | null;
  // Same layout choices as the front cover. Defaults to "photo-title" to
  // match the back cover's original (pre-layout-picker) fixed look.
  backCoverLayout: CoverLayout;
  // Explicit "no photo" - overrides the fallback-to-last-photo default
  // so a text-only (or empty) back cover is reachable, not just
  // "haven't picked one yet".
  backCoverNoPhoto: boolean;
  // Optional short text shown on the back cover card, below its photo.
  backCoverText: string;
  // When there's no back cover photo, whether the text mounts on a
  // white card (matching the rest of the scrapbook) or sits directly
  // on the page background with no card at all.
  backCoverPlainText: boolean;
  // Whether the front/back cover photos are also left out of the
  // interior pages - on by default, since printing the same photo twice
  // (once on its cover, again inside the book) is rarely wanted.
  excludeCoverPhotosFromPages: boolean;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  printerId: "libre",
  pageWidth: 2515,
  pageHeight: 3260,
  margin: 118,
  combinePages: false,
  spacing: 20,
  filterVideos: true,
  forceTimeline: false,
  bleedEnabled: false,
  bleed: mmToPixels(3),
  showDates: true,
  showCaptions: true,
  fontSize: 12,
  pageBackground: "white",
  cardStyle: "scrapbook",
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
    backCoverAssetId: null,
    backCoverLayout: "photo-title",
    backCoverNoPhoto: false,
    backCoverText: "",
    backCoverPlainText: false,
    excludeCoverPhotosFromPages: true,
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

async function detectAlbumChanges(
  albumId: string,
  currentAssetIds: string[]
): Promise<{ missingAssets: AssetResponseDto[]; newAssetIds: string[] }> {
  try {
    const res = await fetch(
      `/photobooks/${encodeURIComponent(albumId)}/detect-changes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAssetIds }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return {
        missingAssets: data.missingAssets || [],
        newAssetIds: data.newAssetIds || [],
      };
    }
  } catch (e) {
    console.error("Failed to detect album changes:", e);
  }
  return { missingAssets: [], newAssetIds: [] };
}

async function saveAlbumConfig(albumId: string, config: AlbumConfig, assets?: AssetResponseDto[]) {
  try {
    const payload: any = { config };
    
    // Only include assets snapshot if explicitly provided
    if (assets && assets.length > 0) {
      payload.assets = assets.map(a => ({
        id: a.id,
        type: a.type,
        originalFileName: a.originalFileName,
        fileCreatedAt: a.fileCreatedAt,
        localDateTime: a.localDateTime,
      }));
    }
    
    await fetch(`/photobooks/${encodeURIComponent(albumId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Also update global config with page and layout settings, used to
    // seed the defaults for the next album that has no photobook yet.
    const globalConfig: GlobalConfig = {
      printerId: config.printerId,
      pageWidth: config.pageWidth,
      pageHeight: config.pageHeight,
      margin: config.margin,
      combinePages: config.combinePages,
      spacing: config.spacing,
      filterVideos: config.filterVideos,
      forceTimeline: config.forceTimeline,
      bleedEnabled: config.bleedEnabled,
      bleed: config.bleed,
      showDates: config.showDates,
      showCaptions: config.showCaptions,
      fontSize: config.fontSize,
      pageBackground: config.pageBackground,
      cardStyle: config.cardStyle,
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

function ToggleSwitch({
  checked,
  onChange,
  label,
  sublabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0 border-b border-gray-100 dark:border-gray-800 last:border-none ${disabled ? "opacity-50" : ""}`}
    >
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
          {label}
        </span>
        {sublabel && (
          <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {sublabel}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[22px] w-9 flex-none items-center rounded-full transition-colors ${
          disabled ? "cursor-not-allowed" : ""
        } ${checked ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-700"}`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
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
  const [printerId, setPrinterId] = useState(initialConfig.printerId);
  const [pageWidth, setPageWidth] = useState(initialConfig.pageWidth);
  const [pageHeight, setPageHeight] = useState(initialConfig.pageHeight);
  const [margin, setMargin] = useState(initialConfig.margin);
  const [combinePages, setCombinePages] = useState(initialConfig.combinePages);

  // Layout settings
  const [spacing, setSpacing] = useState(initialConfig.spacing);
  const [filterVideos, setFilterVideos] = useState(initialConfig.filterVideos);
  const [forceTimeline, setForceTimeline] = useState(initialConfig.forceTimeline);
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
      setCombinePages(false);
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
  const [changesDetected, setChangesDetected] = useState(false);
  const [isDetectingChanges, setIsDetectingChanges] = useState(true);
  // New photos - assets in the album but not in the photobook yet
  const [newAssets, setNewAssets] = useState<AssetResponseDto[]>([]);
  const [selectedNewAsset, setSelectedNewAsset] = useState<AssetResponseDto | null>(null);
  const [loadedNewAssetIds, setLoadedNewAssetIds] = useState<Set<string>>(new Set());
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
  const [backCoverAssetId, setBackCoverAssetId] = useState<string | null>(
    initialConfig.backCoverAssetId,
  );
  const [backCoverLayout, setBackCoverLayout] = useState<CoverLayout>(
    initialConfig.backCoverLayout,
  );
  const [backCoverNoPhoto, setBackCoverNoPhoto] = useState(
    initialConfig.backCoverNoPhoto,
  );
  const [backCoverText, setBackCoverText] = useState(
    initialConfig.backCoverText,
  );
  const [backCoverPlainText, setBackCoverPlainText] = useState(
    initialConfig.backCoverPlainText,
  );
  const [excludeCoverPhotosFromPages, setExcludeCoverPhotosFromPages] =
    useState(initialConfig.excludeCoverPhotosFromPages);
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

  // History of operations for undo functionality
  type HistoryOperation =
    | {
        type: "swap-same-page";
        pageNumber: number;
        order: string[];
        prevOrder: string[];
        assetIds: [string, string];
        timestamp: number;
      }
    | {
        type: "swap-text-cards";
        assetIds: [string, string];
        prevContents: [string, string];
        timestamp: number;
      }
    | {
        type: "swap-cross-page";
        assetIds: [string, string];
        prevOrder: string[];
        draggedPage: number;
        targetPage: number;
        timestamp: number;
      }
    | {
        type: "shuffle-layout";
        pageNumber: number;
        prevVariant: number;
        newVariant: number;
        timestamp: number;
      }
    | {
        type: "set-page-count";
        pageNumber: number;
        prevCount: number | null;
        newCount: number | null;
        timestamp: number;
      }
    | {
        type: "set-text-card-count";
        pageNumber: number;
        prevCount: number;
        newCount: number;
        timestamp: number;
      }
    | {
        type: "edit-page-caption";
        pageNumber: number;
        prevText: string;
        newText: string;
        timestamp: number;
      }
    | {
        type: "edit-card-caption";
        assetId: string;
        prevText: string;
        newText: string;
        timestamp: number;
      }
    | {
        type: "edit-text-card";
        cardId: string;
        prevText: string;
        newText: string;
        timestamp: number;
      }
    | {
        type: "set-cover";
        prevAssetId: string | null;
        newAssetId: string | null;
        timestamp: number;
      }
    | {
        type: "set-back-cover";
        prevAssetId: string | null;
        newAssetId: string | null;
        timestamp: number;
      }
    | {
        type: "edit-cover-title";
        prevText: string;
        newText: string;
        timestamp: number;
      }
    | {
        type: "edit-back-cover-text";
        prevText: string;
        newText: string;
        timestamp: number;
      }
    | {
        type: "swap-new-photo";
        newAsset: AssetResponseDto;
        replacedAsset: AssetResponseDto;
        timestamp: number;
      }
    | {
        type: "replace-placeholder";
        newAsset: AssetResponseDto;
        placeholderAsset: AssetResponseDto;
        timestamp: number;
      }
    | {
        type: "insert-new-photo";
        newAsset: AssetResponseDto;
        pageNumber: number;
        prevPageCount: number | null;
        timestamp: number;
      }
    | {
        type: "delete-placeholder";
        placeholderAsset: AssetResponseDto;
        pageNumber: number | null;
        prevPageCount: number | null;
        timestamp: number;
      };

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
  const [flattenedState, setFlattenedState] = useState<{
    customOrdering: string[] | null;
    slotOverrides: Record<number, string[]>;
    manuallyMovedIds: string[];
    layoutVariants: Record<number, number>;
    pageCounts: Record<number, number>;
    textCardCounts: Record<number, number>;
    textCardContents: Record<string, string>;
    pageCaptions: Record<number, string>;
    cardCaptions: Record<string, string>;
  } | null>(null);

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
      combinePages,
      spacing,
      filterVideos,
      forceTimeline,
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
      textCardCounts: Object.fromEntries(textCardCounts),
      textCardContents: Object.fromEntries(textCardContents),
      slotOverrides: Object.fromEntries(slotOverrides),
      manuallyMovedIds: Array.from(manuallyMovedIds),
      showCover,
      coverTitle,
      coverAssetId,
      coverLayout,
      backCoverAssetId,
      backCoverLayout,
      backCoverNoPhoto,
      backCoverText,
      backCoverPlainText,
      excludeCoverPhotosFromPages,
    };
    // Save config (without assets snapshot - that's saved separately after resolving placeholders)
    saveAlbumConfig(album.id, config);
  }, [
    album.id,
    printerId,
    pageWidth,
    pageHeight,
    margin,
    combinePages,
    spacing,
    filterVideos,
    forceTimeline,
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
    showCover,
    coverTitle,
    coverAssetId,
    coverLayout,
    backCoverAssetId,
    backCoverLayout,
    backCoverNoPhoto,
    backCoverText,
    backCoverPlainText,
    excludeCoverPhotosFromPages,
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
      
      // Respect album's sort order preference (asc = oldest first, desc = newest first)
      const albumOrder = album.order || "desc";
      
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

  // Reroll a page's bento arrangement - same photos, different split
  // pattern (e.g. a 3-photo page can be tiled several different ways
  // depending on their formats).
  const handleShuffleLayout = (logicalPageNumber: number) => {
    const prevVariant = layoutVariants.get(logicalPageNumber) || 0;
    // Generate a more random variant to get significantly different layouts
    // Use a large random jump instead of just +1
    const newVariant = prevVariant + Math.floor(Math.random() * 100) + 10;
    setLayoutVariants((prev) => {
      const next = new Map(prev);
      next.set(logicalPageNumber, newVariant);
      return next;
    });
    // Record in history
    setHistory((prev) => [
      {
        type: "shuffle-layout",
        pageNumber: logicalPageNumber,
        prevVariant,
        newVariant,
        timestamp: Date.now(),
      },
      ...prev,
    ]);
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

  // Undo the last operation from history
  const handleUndo = () => {
    if (history.length === 0) return;

    const [lastOp, ...remainingHistory] = history;

    switch (lastOp.type) {
      case "swap-same-page":
        setSlotOverrides((prev) =>
          new Map(prev).set(lastOp.pageNumber, lastOp.prevOrder)
        );
        setManuallyMovedIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetIds[0]);
          next.delete(lastOp.assetIds[1]);
          return next;
        });
        break;

      case "swap-text-cards":
        setTextCardContents((prev) => {
          const next = new Map(prev);
          const [id1, id2] = lastOp.assetIds;
          const [text1, text2] = lastOp.prevContents;
          if (text1) next.set(id1, text1);
          else next.delete(id1);
          if (text2) next.set(id2, text2);
          else next.delete(id2);
          return next;
        });
        setManuallyMovedIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetIds[0]);
          next.delete(lastOp.assetIds[1]);
          return next;
        });
        break;

      case "swap-cross-page":
        setCustomOrdering(lastOp.prevOrder);
        setSlotOverrides((prev) => {
          const next = new Map(prev);
          next.delete(lastOp.draggedPage);
          next.delete(lastOp.targetPage);
          return next;
        });
        setManuallyMovedIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetIds[0]);
          next.delete(lastOp.assetIds[1]);
          return next;
        });
        break;

      case "shuffle-layout":
        setLayoutVariants((prev) =>
          new Map(prev).set(lastOp.pageNumber, lastOp.prevVariant)
        );
        break;

      case "set-page-count":
        setPageCounts((prev) => {
          const next = new Map(prev);
          if (lastOp.prevCount === null) {
            next.delete(lastOp.pageNumber);
          } else {
            next.set(lastOp.pageNumber, lastOp.prevCount);
          }
          return next;
        });
        break;

      case "set-text-card-count":
        setTextCardCounts((prev) => {
          const next = new Map(prev);
          if (lastOp.prevCount === 0) {
            next.delete(lastOp.pageNumber);
          } else {
            next.set(lastOp.pageNumber, lastOp.prevCount);
          }
          return next;
        });
        break;

      case "edit-page-caption":
        setPageCaptions((prev) => {
          const next = new Map(prev);
          if (lastOp.prevText) {
            next.set(lastOp.pageNumber, lastOp.prevText);
          } else {
            next.delete(lastOp.pageNumber);
          }
          return next;
        });
        break;

      case "edit-card-caption":
        setCardCaptions((prev) => {
          const next = new Map(prev);
          if (lastOp.prevText) {
            next.set(lastOp.assetId, lastOp.prevText);
          } else {
            next.delete(lastOp.assetId);
          }
          return next;
        });
        break;

      case "edit-text-card":
        setTextCardContents((prev) => {
          const next = new Map(prev);
          if (lastOp.prevText) {
            next.set(lastOp.cardId, lastOp.prevText);
          } else {
            next.delete(lastOp.cardId);
          }
          return next;
        });
        break;

      case "set-cover":
        setCoverAssetId(lastOp.prevAssetId);
        break;

      case "set-back-cover":
        setBackCoverAssetId(lastOp.prevAssetId);
        break;

      case "edit-cover-title":
        setCoverTitle(lastOp.prevText);
        break;

      case "edit-back-cover-text":
        setBackCoverText(lastOp.prevText);
        break;
      
      case "swap-new-photo":
        // Undo swap: put back the replaced asset, add new asset to newAssets
        setAssets(prev => prev.map(a => a.id === lastOp.newAsset.id ? lastOp.replacedAsset : a));
        setNewAssets(prev => [...prev, lastOp.newAsset]);
        break;
      
      case "replace-placeholder":
        // Undo replace: restore placeholder, add new asset to newAssets
        setAssets(prev => prev.map(a => a.id === lastOp.newAsset.id ? lastOp.placeholderAsset : a));
        setNewAssets(prev => [...prev, lastOp.newAsset]);
        setMissingAssetIds(prev => new Set([...prev, lastOp.placeholderAsset.id]));
        break;
      
      case "insert-new-photo":
        // Undo insert: remove the new asset, restore pageCount, add back to newAssets
        setAssets(prev => prev.filter(a => a.id !== lastOp.newAsset.id));
        setNewAssets(prev => [...prev, lastOp.newAsset]);
        // Restore previous pageCount
        setPageCounts(prev => {
          const next = new Map(prev);
          if (lastOp.prevPageCount === null) {
            next.delete(lastOp.pageNumber);
          } else {
            next.set(lastOp.pageNumber, lastOp.prevPageCount);
          }
          return next;
        });
        break;
      
      case "delete-placeholder":
        // Undo delete: restore the placeholder and pageCount
        setAssets(prev => [...prev, lastOp.placeholderAsset]);
        setMissingAssetIds(prev => new Set([...prev, lastOp.placeholderAsset.id]));
        // Restore previous pageCount
        if (lastOp.pageNumber !== null) {
          setPageCounts(prev => {
            const next = new Map(prev);
            if (lastOp.prevPageCount === null) {
              next.delete(lastOp.pageNumber!);
            } else {
              next.set(lastOp.pageNumber!, lastOp.prevPageCount);
            }
            return next;
          });
        }
        break;
    }

    setHistory(remainingHistory);
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

  // Reset ALL modifications
  const handleFlatten = () => {
    // Capture current state as the new baseline
    setFlattenedState({
      customOrdering,
      slotOverrides: Object.fromEntries(slotOverrides),
      manuallyMovedIds: Array.from(manuallyMovedIds),
      layoutVariants: Object.fromEntries(layoutVariants),
      pageCounts: Object.fromEntries(pageCounts),
      textCardCounts: Object.fromEntries(textCardCounts),
      textCardContents: Object.fromEntries(textCardContents),
      pageCaptions: Object.fromEntries(pageCaptions),
      cardCaptions: Object.fromEntries(cardCaptions),
    });
    
    // Clear history AND manuallyMovedIds since this is now the new baseline
    setHistory([]);
    setManuallyMovedIds(new Set());
    
    // Close confirmation dialog
    setShowFlattenConfirmation(false);
  };

  const handleResetAll = () => {
    // Undo all operations by processing the entire history
    const currentHistory = [...history];
    
    // Process all operations in reverse (from most recent to oldest)
    currentHistory.forEach((op) => {
      switch (op.type) {
        case "swap-same-page":
          setSlotOverrides((prev) =>
            new Map(prev).set(op.pageNumber, op.prevOrder)
          );
          setManuallyMovedIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetIds[0]);
            next.delete(op.assetIds[1]);
            return next;
          });
          break;

        case "swap-text-cards":
          setTextCardContents((prev) => {
            const next = new Map(prev);
            const [id1, id2] = op.assetIds;
            const [text1, text2] = op.prevContents;
            if (text1) next.set(id1, text1);
            else next.delete(id1);
            if (text2) next.set(id2, text2);
            else next.delete(id2);
            return next;
          });
          setManuallyMovedIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetIds[0]);
            next.delete(op.assetIds[1]);
            return next;
          });
          break;

        case "swap-cross-page":
          setCustomOrdering(op.prevOrder);
          setSlotOverrides((prev) => {
            const next = new Map(prev);
            next.delete(op.draggedPage);
            next.delete(op.targetPage);
            return next;
          });
          setManuallyMovedIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetIds[0]);
            next.delete(op.assetIds[1]);
            return next;
          });
          break;

        case "shuffle-layout":
          setLayoutVariants((prev) =>
            new Map(prev).set(op.pageNumber, op.prevVariant)
          );
          break;

        case "set-page-count":
          setPageCounts((prev) => {
            const next = new Map(prev);
            if (op.prevCount === null) {
              next.delete(op.pageNumber);
            } else {
              next.set(op.pageNumber, op.prevCount);
            }
            return next;
          });
          break;

        case "set-text-card-count":
          setTextCardCounts((prev) => {
            const next = new Map(prev);
            if (op.prevCount === 0) {
              next.delete(op.pageNumber);
            } else {
              next.set(op.pageNumber, op.prevCount);
            }
            return next;
          });
          break;

        case "edit-page-caption":
          setPageCaptions((prev) => {
            const next = new Map(prev);
            if (op.prevText) {
              next.set(op.pageNumber, op.prevText);
            } else {
              next.delete(op.pageNumber);
            }
            return next;
          });
          break;

        case "edit-card-caption":
          setCardCaptions((prev) => {
            const next = new Map(prev);
            if (op.prevText) {
              next.set(op.assetId, op.prevText);
            } else {
              next.delete(op.assetId);
            }
            return next;
          });
          break;

        case "edit-text-card":
          setTextCardContents((prev) => {
            const next = new Map(prev);
            if (op.prevText) {
              next.set(op.cardId, op.prevText);
            } else {
              next.delete(op.cardId);
            }
            return next;
          });
          break;

        case "set-cover":
          setCoverAssetId(op.prevAssetId);
          break;

        case "set-back-cover":
          setBackCoverAssetId(op.prevAssetId);
          break;

        case "edit-cover-title":
          setCoverTitle(op.prevText);
          break;

        case "edit-back-cover-text":
          setBackCoverText(op.prevText);
          break;
        
        case "swap-new-photo":
          // Undo swap: put back the replaced asset, add new asset to newAssets
          setAssets(prev => prev.map(a => a.id === op.newAsset.id ? op.replacedAsset : a));
          setNewAssets(prev => [...prev, op.newAsset]);
          break;
        
        case "replace-placeholder":
          // Undo replace: restore placeholder, add new asset to newAssets
          setAssets(prev => prev.map(a => a.id === op.newAsset.id ? op.placeholderAsset : a));
          setNewAssets(prev => [...prev, op.newAsset]);
          setMissingAssetIds(prev => new Set([...prev, op.placeholderAsset.id]));
          break;
        
        case "insert-new-photo":
          // Undo insert: remove the new asset, restore pageCount, add back to newAssets
          setAssets(prev => prev.filter(a => a.id !== op.newAsset.id));
          setNewAssets(prev => [...prev, op.newAsset]);
          // Restore previous pageCount
          setPageCounts(prev => {
            const next = new Map(prev);
            if (op.prevPageCount === null) {
              next.delete(op.pageNumber);
            } else {
              next.set(op.pageNumber, op.prevPageCount);
            }
            return next;
          });
          break;
        
        case "delete-placeholder":
          // Undo delete: restore the placeholder and pageCount
          setAssets(prev => [...prev, op.placeholderAsset]);
          setMissingAssetIds(prev => new Set([...prev, op.placeholderAsset.id]));
          // Restore previous pageCount
          if (op.pageNumber !== null) {
            setPageCounts(prev => {
              const next = new Map(prev);
              if (op.prevPageCount === null) {
                next.delete(op.pageNumber!);
              } else {
                next.set(op.pageNumber!, op.prevPageCount);
              }
              return next;
            });
          }
          break;
      }
    });
    
    // Clear history after undoing everything
    setHistory([]);
    
    // Close confirmation dialog
    setShowResetConfirmation(false);
  };

  // Filter assets based on user preferences (default order)
  const defaultFilteredAssets = useMemo(() => {
    // Filter out any undefined assets (safety after undo operations)
    const validAssets = assets.filter((asset) => asset !== undefined && asset !== null);
    return filterVideos
      ? validAssets.filter((asset) => asset.type === "IMAGE")
      : validAssets;
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

  // Back cover photo - explicit pick if the user made one, otherwise the
  // book's last photo in its current order, unless backCoverNoPhoto was
  // explicitly set (a text-only or empty back cover). Independent of the
  // front cover photo.
  const backCoverAsset = useMemo(() => {
    if (backCoverNoPhoto) return null;
    if (backCoverAssetId) {
      const picked = filteredAssets.find((a) => a.id === backCoverAssetId);
      if (picked) return picked;
    }
    return filteredAssets[filteredAssets.length - 1] ?? null;
  }, [filteredAssets, backCoverAssetId, backCoverNoPhoto]);

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
    return calculatePageLayout(interiorAssets, {
      pageWidth: validPageWidth,
      pageHeight: validPageHeight,
      margin: layoutMargin,
      spacing: validSpacing,
      combinePages,
      forceTimeline,
      layoutVariants,
      pageCounts,
      textCardCounts,
      slotOverrides,
    });
  }, [
    interiorAssets,
    layoutMargin,
    validSpacing,
    validPageWidth,
    validPageHeight,
    combinePages,
    forceTimeline,
    layoutVariants,
    pageCounts,
    textCardCounts,
    slotOverrides,
  ]);

  // Swaps two cards outright, wherever they are: same page swaps their
  // slot assignment directly (the auto layout's aspect-ratio-driven
  // grouping doesn't otherwise respect a specific drop position - see
  // slotOverrides in pageLayout.ts); across pages, there's no shared slot
  // list to swap within, so it swaps their positions in the master
  // sequence instead, which changes which page each naturally belongs to.
  // Shared by both the drag-and-drop reorder below and click-to-swap mode.
  const performSwap = (draggedAssetId: string, targetAssetId: string) => {
    if (targetAssetId === draggedAssetId) return;

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

  // While a reorder drag is active, track the pointer over the whole
  // window (not just the card it started on) and hit-test which card is
  // underneath via elementFromPoint - this works correctly regardless of
  // the preview's CSS zoom, since elementFromPoint uses actual rendered
  // coordinates. Both gestures are available at once, no mode switch:
  // dropping onto a *different* card swaps them immediately (drag);
  // releasing back over the *same* card (i.e. a plain click, no
  // movement) arms it instead, so a second plain click on another card
  // completes the swap - handy when the two cards are far apart and
  // dragging across the whole preview isn't practical.
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
        // Drag and drop - swap immediately without confirmation
        performSwap(draggedAssetId, targetAssetId);
        setSwapFirstId(null);
      } else if (targetAssetId === draggedAssetId) {
        if (swapFirstId === null) {
          setSwapFirstId(draggedAssetId);
        } else if (swapFirstId === draggedAssetId) {
          setSwapFirstId(null);
        } else {
          // Click-to-swap - show confirmation dialog
          setSwapConfirmation({
            firstId: swapFirstId,
            secondId: draggedAssetId,
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
  }, [reorderDragState, pages, filteredAssets, swapFirstId]);

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

  // Floating pill toolbar for per-page layout controls - shuffle the
  // bento arrangement, force a photo count, or swap some slots for text
  // cards. Icon + stepper rather than a row of bordered buttons/selects,
  // since this sits above every single page and gets used constantly.
  const renderStyleSwitcher = (logicalPageNumber: number) => {
    const currentCount = pageCounts.get(logicalPageNumber) ?? null;
    const currentText = textCardCounts.get(logicalPageNumber) ?? 0;

    const decrementPhotos = () => {
      if (currentCount === null) return;
      if (currentCount <= 1) handleSetPageCount(logicalPageNumber, null);
      else handleSetPageCount(logicalPageNumber, currentCount - 1);
    };
    const incrementPhotos = () => {
      if (currentCount === null) handleSetPageCount(logicalPageNumber, 1);
      else if (currentCount < 12)
        handleSetPageCount(logicalPageNumber, currentCount + 1);
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
        <button
          onClick={() => handleShuffleLayout(logicalPageNumber)}
          title={t(language, "shufflePageLayout")}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>

        {divider}

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
          <button
            onClick={decrementPhotos}
            disabled={currentCount === null}
            className={stepBtn}
          >
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
                    combinePages,
                    spacing,
                    filterVideos,
                    forceTimeline,
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
                    textCardCounts: Object.fromEntries(textCardCounts),
                    textCardContents: Object.fromEntries(textCardContents),
                    slotOverrides: Object.fromEntries(slotOverrides),
                    manuallyMovedIds: Array.from(manuallyMovedIds),
                    showCover,
                    coverTitle,
                    coverAssetId,
                    coverLayout,
                    backCoverAssetId,
                    backCoverLayout,
                    backCoverNoPhoto,
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

  // Builds the actual PDF document element from photo Blobs fetched
  // ahead of time (see handleGeneratePdf) - react-pdf's own image
  // fetching turned out to be unreliable on its own (photos randomly,
  // but reproducibly, missing), so every photo is fetched ourselves with
  // real error handling and handed to <Image> as a Blob instead of a URL.
  const buildPdfDocument = (imageBlobs: Map<string, Blob>) => {
    const coverPageWidth = toPoints(validPageWidth);
    const coverPageHeight = toPoints(validPageHeight);
    const coverImageBlob = coverAsset
      ? imageBlobs.get(coverAsset.id)
      : undefined;
    const backCoverImageBlob = backCoverAsset
      ? imageBlobs.get(backCoverAsset.id)
      : undefined;
    const coverScrimHeight = coverPageHeight * 0.28;
    // Bleed ("fond perdu") - extra border filled with the page
    // background, outside the trim size, so a print shop's trim line
    // doesn't reveal a white edge. All existing page content keeps
    // using the trim-size coordinates unchanged; it's just mounted
    // inside a View offset by bleedPt on an enlarged page/background.
    const bleedPt = bleedEnabled ? toPoints(validBleed) : 0;
    const coverBleedWidth = coverPageWidth + bleedPt * 2;
    const coverBleedHeight = coverPageHeight + bleedPt * 2;

    return (
    <Document pageLayout={pageLayout}>
      {showCover && (
        <Page
          size={{ width: coverBleedWidth, height: coverBleedHeight }}
          style={{
            ...staticStyles.page,
            backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
          }}
        >
          <PdfPageBackground
            background={pageBackground}
            width={coverBleedWidth}
            height={coverBleedHeight}
          />
          <View
            style={{
              position: "absolute",
              top: bleedPt,
              left: bleedPt,
              width: coverPageWidth,
              height: coverPageHeight,
            }}
          >

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

          </View>
        </Page>
      )}

      {pages.map((pageData) => {
        // FIXME: pdfkit (internal of react-pdf) uses 72dpi internally and we downscale everything here;
        // instead we should produce a high-quality 300 dpi pdf

        // Convert page dimensions from 300 DPI to 72 DPI
        const pageWidth = toPoints(pageData.width);
        const pageHeight = toPoints(pageData.height);
        const pageBleedWidth = pageWidth + bleedPt * 2;
        const pageBleedHeight = pageHeight + bleedPt * 2;
        return (
          <Page
            key={pageData.pageNumber}
            size={{
              width: pageBleedWidth,
              height: pageBleedHeight,
            }}
            style={{
              ...staticStyles.page,
              backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
            }}
          >
            <PdfPageBackground
              background={pageBackground}
              width={pageBleedWidth}
              height={pageBleedHeight}
            />
            <View
              style={{
                position: "absolute",
                top: bleedPt,
                left: bleedPt,
                width: pageWidth,
                height: pageHeight,
              }}
            >

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
                if (cardStyle === "clean") {
                  return (
                    <View
                      key={photoBox.id}
                      style={{
                        position: "absolute",
                        left: toPoints(photoBox.x),
                        top: toPoints(photoBox.y),
                        width,
                        height,
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
                  );
                }
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

              if (cardStyle === "clean") {
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
                    <PdfPhotoImage
                      src={imageBlob}
                      top={0}
                      left={0}
                      containerWidth={width}
                      containerHeight={height - bottomStripHeight}
                    />
                    {cardCaption && (
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          width,
                          bottom: dateStripHeight,
                          height: captionStripHeight,
                          backgroundColor: "rgba(255,255,255,0.85)",
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
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
                          left: 0,
                          width,
                          bottom: 0,
                          height: dateStripHeight,
                          backgroundColor: "rgba(255,255,255,0.85)",
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
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
                          {new Date(asset.fileCreatedAt).toLocaleDateString(
                            undefined,
                            { year: "numeric", month: "short", day: "numeric" },
                          )}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              }

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
            </View>
          </Page>
        );
      })}

      {showCover && (
        <Page
          size={{ width: coverBleedWidth, height: coverBleedHeight }}
          style={{
            ...staticStyles.page,
            backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
          }}
        >
          <PdfPageBackground
            background={pageBackground}
            width={coverBleedWidth}
            height={coverBleedHeight}
          />
          <View
            style={{
              position: "absolute",
              top: bleedPt,
              left: bleedPt,
              width: coverPageWidth,
              height: coverPageHeight,
            }}
          >
          {backCoverLayout === "text-only" && backCoverText && (
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
                {backCoverText}
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

          {backCoverLayout === "photo-title" &&
            (backCoverImageBlob || backCoverText) &&
            (() => {
              const hasImage = !!backCoverImageBlob;
              // Plain text has no photo to mount, so no card/mat either -
              // it just sits on the page background, centered on the
              // whole page (not the whole scrapbook card treatment).
              if (!hasImage && backCoverPlainText && backCoverText) {
                const plainWidth = coverPageWidth * 0.7;
                return (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: (coverPageWidth - plainWidth) / 2,
                      width: plainWidth,
                      height: coverPageHeight,
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Caveat",
                        fontWeight: 500,
                        fontSize: fontSize * 1.9,
                        color: SCRAPBOOK.ink,
                        textAlign: "center",
                      }}
                    >
                      {backCoverText}
                    </Text>
                  </View>
                );
              }

              // Card mounted flat (no tilt/tape), centered on the whole
              // page, so it reads as a closing note rather than another
              // scrapbook page.
              const cardWidth = coverPageWidth * 0.42;
              const cardHeight = coverPageHeight * 0.3;
              const cardTop = (coverPageHeight - cardHeight) / 2;
              const cardLeft = (coverPageWidth - cardWidth) / 2;
              const frameInset = Math.max(4, cardWidth * 0.045);
              const captionStripHeight = backCoverText
                ? fontSize * 1.3 * 1.6
                : 0;
              return (
                <View
                  style={{
                    position: "absolute",
                    top: cardTop,
                    left: cardLeft,
                    width: cardWidth,
                    height: cardHeight,
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 3,
                      width: cardWidth,
                      height: cardHeight,
                      backgroundColor: SCRAPBOOK.shadow,
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: cardWidth,
                      height: cardHeight,
                      backgroundColor: SCRAPBOOK.mat,
                    }}
                  >
                    {backCoverImageBlob && (
                      <PdfPhotoImage
                        src={backCoverImageBlob}
                        top={frameInset}
                        left={frameInset}
                        containerWidth={cardWidth - frameInset * 2}
                        containerHeight={
                          cardHeight - frameInset * 2 - captionStripHeight
                        }
                      />
                    )}
                    {backCoverText && (
                      <View
                        style={{
                          position: "absolute",
                          left: frameInset,
                          width: cardWidth - frameInset * 2,
                          bottom: backCoverImageBlob ? frameInset * 0.3 : 0,
                          height: backCoverImageBlob
                            ? captionStripHeight
                            : cardHeight,
                          display: "flex",
                          flexDirection: "row",
                          alignItems: backCoverImageBlob
                            ? "flex-end"
                            : "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Caveat",
                            fontWeight: 500,
                            fontSize: backCoverImageBlob
                              ? fontSize * 1.3
                              : fontSize * 1.5,
                            color: SCRAPBOOK.ink,
                            textAlign: "center",
                          }}
                        >
                          {backCoverText}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

          {backCoverLayout === "full-bleed" && backCoverImageBlob && (
            <>
              <Image
                src={backCoverImageBlob}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: coverPageWidth,
                  height: coverPageHeight,
                  objectFit: "cover",
                }}
              />
              {backCoverText && (
                <>
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
                      {backCoverText}
                    </Text>
                  </View>
                </>
              )}
            </>
          )}

          </View>
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

      const blob = await pdf(buildPdfDocument(imageBlobs)).toBlob();
      setPdfUrl(URL.createObjectURL(blob));
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
            <div className="flex flex-col gap-5">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                  {t(language, "printer")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRINTERS.map((printer) => {
                    const active = printer.id === printerId;
                    return (
                      <button
                        key={printer.id}
                        onClick={() => handleSelectPrinter(printer.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          active
                            ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        {printer.logo && (
                          <img
                            src={printer.logo}
                            alt=""
                            className="h-3.5 w-auto max-w-[60px] object-contain bg-white rounded-sm px-0.5"
                          />
                        )}
                        {printer.label}
                      </button>
                    );
                  })}
                </div>
                {selectedPrinter.note && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    {selectedPrinter.note}
                  </p>
                )}
              </div>
              {(() => {
                const categories = Array.from(
                  new Set(selectedPrinter.formats.map((f) => f.category)),
                );
                return (
                  categories.length > 1 && (
                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                        {t(language, "category")}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {categories.map((category) => (
                          <button
                            key={category}
                            onClick={() => handleSelectCategory(category)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                              category === formatCategory
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                            }`}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                );
              })()}
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                  {t(language, "format")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPrinter.formats
                    .filter((p) => p.category === formatCategory)
                    .map((p) => {
                      const active =
                        Math.abs(p.widthMm - pixelsToMm(pageWidth)) < 0.1 &&
                        Math.abs(p.heightMm - pixelsToMm(pageHeight)) < 0.1;
                      return (
                        <button
                          key={p.label}
                          onClick={() => {
                            setPageWidth(mmToPixels(p.widthMm));
                            setPageHeight(mmToPixels(p.heightMm));
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            active
                              ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-5">
                <div>
                  <label
                    htmlFor="pageWidth"
                    className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
                  >
                    {t(language, "width")}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      id="pageWidth"
                      value={Math.round(pixelsToMm(pageWidth) * 1000) / 1000}
                      disabled={selectedPrinter.constrained}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!isNaN(value)) {
                          setPageWidth(mmToPixels(value));
                        }
                      }}
                      min={Math.round(pixelsToMm(1000))}
                      max={Math.round(pixelsToMm(10000))}
                      step="1"
                      className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                        isPageWidthValid
                          ? "border-gray-200 dark:border-gray-700"
                          : "border-red-500 bg-red-50 dark:bg-red-950/40"
                      }`}
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      mm
                    </span>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="pageHeight"
                    className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
                  >
                    {t(language, "height")}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      id="pageHeight"
                      value={Math.round(pixelsToMm(pageHeight) * 1000) / 1000}
                      disabled={selectedPrinter.constrained}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!isNaN(value)) {
                          setPageHeight(mmToPixels(value));
                        }
                      }}
                      min={Math.round(pixelsToMm(1000))}
                      max={Math.round(pixelsToMm(10000))}
                      step="1"
                      className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                        isPageHeightValid
                          ? "border-gray-200 dark:border-gray-700"
                          : "border-red-500 bg-red-50 dark:bg-red-950/40"
                      }`}
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      mm
                    </span>
                  </div>
                </div>
              </div>
              <ToggleSwitch
                checked={combinePages}
                onChange={setCombinePages}
                disabled={selectedPrinter.constrained}
                label={t(language, "combinePages")}
                sublabel={
                  selectedPrinter.constrained
                    ? `${selectedPrinter.label} ${t(language, "combinePagesHintPrinter")}`
                    : t(language, "combinePagesHint")
                }
              />
            </div>
          )}

          {settingsTab === "layout" && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end gap-5">
              <div>
                <label
                  htmlFor="margin"
                  className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
                >
                  {t(language, "margin")}
                </label>
                <div className="flex items-center gap-1.5">
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
                    className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      isMarginValid
                        ? "border-gray-200 dark:border-gray-700"
                        : "border-red-500 bg-red-50 dark:bg-red-950/40"
                    }`}
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    mm
                  </span>
                </div>
              </div>
              <div>
                <label
                  htmlFor="spacing"
                  className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
                >
                  {t(language, "spacing")}
                </label>
                <div className="flex items-center gap-1.5">
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
                    className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      isSpacingValid
                        ? "border-gray-200 dark:border-gray-700"
                        : "border-red-500 bg-red-50 dark:bg-red-950/40"
                    }`}
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    mm
                  </span>
                </div>
              </div>
              </div>
                <div>
                  <ToggleSwitch
                    checked={bleedEnabled}
                    onChange={setBleedEnabled}
                    disabled={selectedPrinter.constrained}
                    label={t(language, "bleed")}
                    sublabel={
                      selectedPrinter.constrained
                        ? selectedPrinter.bleedMm !== null
                          ? `${selectedPrinter.label} ${t(language, "bleedRequired")} ${selectedPrinter.bleedMm}${t(language, "bleedUnit")}`
                          : `${selectedPrinter.label} ${t(language, "bleedNotRequired")}`
                        : t(language, "bleedHint")
                    }
                  />
                {bleedEnabled && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <input
                      type="number"
                      id="bleed"
                      value={Math.round(pixelsToMm(bleed))}
                      disabled={selectedPrinter.constrained}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!isNaN(value)) {
                          setBleed(mmToPixels(value));
                        }
                      }}
                      min="0"
                      max={Math.round(
                        pixelsToMm(Math.min(pageWidth, pageHeight)) / 4,
                      )}
                      step="1"
                      className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                        isBleedValid
                          ? "border-gray-200 dark:border-gray-700"
                          : "border-red-500 bg-red-50 dark:bg-red-950/40"
                      }`}
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      mm
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {settingsTab === "presentation" && (
            <div className="flex flex-col gap-5">
              <div>
                <ToggleSwitch
                  checked={filterVideos}
                  onChange={setFilterVideos}
                  label={t(language, "filterVideos")}
                />
                <ToggleSwitch
                  checked={forceTimeline}
                  onChange={setForceTimeline}
                  label={t(language, "forceTimeline")}
                />
                <ToggleSwitch
                  checked={showDates}
                  onChange={setShowDates}
                  label={t(language, "showDates")}
                />
                <ToggleSwitch
                  checked={showCaptions}
                  onChange={setShowCaptions}
                  label={t(language, "showCaptions")}
                />
              </div>
              <div className="flex flex-wrap items-end gap-5">
                <div>
                  <label
                    htmlFor="fontSize"
                    className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
                  >
                    {t(language, "fontSize")}
                  </label>
                  <select
                    id="fontSize"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                  {t(language, "cardStyle")}
                </span>
                <div className="flex flex-wrap gap-3">
                  {CARD_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setCardStyle(style.value)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ${
                        cardStyle === style.value
                          ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500"
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      {/* Mini mockup of the actual card treatment, not
                          just a label - the tilt/tape vs. flush-edge
                          difference is much clearer to see than to read. */}
                      <div className="relative w-16 h-16 rounded-md bg-gray-100 dark:bg-gray-900 overflow-hidden">
                        {style.value === "scrapbook" ? (
                          <div
                            className="absolute"
                            style={{
                              top: 10,
                              left: 11,
                              right: 11,
                              bottom: 10,
                              transform: "rotate(-7deg)",
                              backgroundColor: SCRAPBOOK.mat,
                              boxShadow: "1px 2px 4px rgba(0,0,0,0.3)",
                            }}
                          >
                            <div
                              className="absolute"
                              style={{
                                inset: 3,
                                backgroundColor: "#93A0C2",
                              }}
                            />
                            <div
                              className="absolute"
                              style={{
                                top: -3,
                                left: "50%",
                                width: 14,
                                height: 6,
                                transform: "translateX(-50%) rotate(5deg)",
                                backgroundColor: SCRAPBOOK.tape[2],
                                opacity: 0.9,
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            className="absolute"
                            style={{
                              inset: 6,
                              backgroundColor: "#93A0C2",
                            }}
                          />
                        )}
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          cardStyle === style.value
                            ? "text-indigo-700 dark:text-indigo-300"
                            : "text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {style.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                  {t(language, "pageBackground")}
                </span>
                <div className="flex flex-col gap-2.5">
                  {PAGE_BACKGROUND_GROUPS.map((group) => (
                    <div
                      key={group.label}
                      className="flex items-center gap-2.5 flex-wrap"
                    >
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 w-16 flex-none">
                        {group.label}
                      </span>
                      <div className="flex gap-1.5">
                        {group.keys.map((key) => {
                          const preset = PAGE_BACKGROUNDS[key];
                          const active = pageBackground === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setPageBackground(key)}
                              title={preset.label}
                              className={`w-7 h-7 rounded-full transition-transform ${
                                active
                                  ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900 scale-105"
                                  : "ring-1 ring-inset ring-black/10 dark:ring-white/10 hover:scale-105"
                              }`}
                              style={{ backgroundColor: preset.base }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {settingsTab === "cover" && (
            <div className="flex flex-col gap-5">
              <ToggleSwitch
                checked={showCover}
                onChange={setShowCover}
                label={t(language, "includeCoverPage")}
                sublabel={t(language, "includeCoverPageHint")}
              />
              {showCover && (
                <>
                  <ToggleSwitch
                    checked={excludeCoverPhotosFromPages}
                    onChange={setExcludeCoverPhotosFromPages}
                    label={t(language, "leaveCoverPhotosOut")}
                    sublabel={t(language, "leaveCoverPhotosOutHint")}
                  />
                  <div>
                    <label
                      htmlFor="coverTitle"
                      className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
                    >
                      {t(language, "title")}
                    </label>
                    <input
                      type="text"
                      id="coverTitle"
                      value={coverTitle}
                      onFocus={(e) => {
                        e.target.dataset.initialValue = coverTitle;
                      }}
                      onChange={(e) => setCoverTitle(e.target.value)}
                      onBlur={(e) => {
                        const prevText = e.target.dataset.initialValue || "";
                        const newText = e.target.value.trim();
                        if (prevText !== newText) {
                          setHistory((prev) => [
                            {
                              type: "edit-cover-title",
                              prevText,
                              newText,
                              timestamp: Date.now(),
                            },
                            ...prev,
                          ]);
                        }
                      }}
                      placeholder={album.albumName}
                      className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
                    />
                  </div>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                      {t(language, "layout")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {COVER_LAYOUTS.map((layout) => (
                        <button
                          key={layout.value}
                          onClick={() => setCoverLayout(layout.value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            coverLayout === layout.value
                              ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          {t(language, layout.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                      {t(language, "backCoverLayout")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {COVER_LAYOUTS.map((layout) => (
                        <button
                          key={layout.value}
                          onClick={() => setBackCoverLayout(layout.value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            backCoverLayout === layout.value
                              ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          {t(language, layout.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(backCoverLayout === "photo-title" ||
                    backCoverLayout === "full-bleed") && (
                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                        {t(language, "backCoverPhotoLabel")}
                      </span>
                      {backCoverAsset ? (
                        <button
                          onClick={() => setBackCoverNoPhoto(true)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          {t(language, "removePhoto")}
                        </button>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {t(language, "noPhotoHover")}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label
                      htmlFor="backCoverText"
                      className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
                    >
                      {t(language, "backCoverText")}
                    </label>
                    <input
                      type="text"
                      id="backCoverText"
                      value={backCoverText}
                      onFocus={(e) => {
                        e.target.dataset.initialValue = backCoverText;
                      }}
                      onChange={(e) => setBackCoverText(e.target.value)}
                      onBlur={(e) => {
                        const prevText = e.target.dataset.initialValue || "";
                        const newText = e.target.value.trim();
                        if (prevText !== newText) {
                          setHistory((prev) => [
                            {
                              type: "edit-back-cover-text",
                              prevText,
                              newText,
                              timestamp: Date.now(),
                            },
                            ...prev,
                          ]);
                        }
                      }}
                      placeholder={t(language, "backCoverTextPlaceholder")}
                      className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
                    />
                  </div>
                  {backCoverLayout === "photo-title" && (
                    <ToggleSwitch
                      checked={backCoverPlainText}
                      onChange={setBackCoverPlainText}
                      label={t(language, "plainBackCoverText")}
                      sublabel={t(language, "plainBackCoverTextHint")}
                    />
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t(language, "coverHint")}
                  </p>
                </>
              )}
            </div>
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
                      ? `${t(language, "generating")} ${pdfProgress.done}/${pdfProgress.total}`
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
              <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                  {newAssets.map((asset) => {
                    const imageLoaded = loadedNewAssetIds.has(asset.id);
                    return (
                      <button
                        key={asset.id}
                        onClick={() => setSelectedNewAsset(selectedNewAsset?.id === asset.id ? null : asset)}
                        className={`relative rounded-lg overflow-hidden transition-all flex-shrink-0 ${
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
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Live Preview - always shown; the generated PDF (if any)
              appears below once ready, rather than replacing this editor. */}
          <div
            ref={previewContainerRef}
            className="space-y-8 pb-8 px-4 sm:px-0 pt-6"
          >
          {showCover &&
            (() => {
              const displayWidth = toPoints(validPageWidth);
              const displayHeight = toPoints(validPageHeight);
              const bleedPreviewPt = bleedEnabled ? toPoints(validBleed) : 0;
              const scale =
                previewWidth > 0
                  ? Math.min(
                      1,
                      previewWidth / (displayWidth + bleedPreviewPt * 2),
                    )
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
                  onFocus={(e) => {
                    e.target.dataset.initialValue = coverTitle;
                  }}
                  onChange={(e) => setCoverTitle(e.target.value)}
                  onBlur={(e) => {
                    const prevText = e.target.dataset.initialValue || "";
                    const newText = e.target.value.trim();
                    if (prevText !== newText) {
                      setHistory((prev) => [
                        {
                          type: "edit-cover-title",
                          prevText,
                          newText,
                          timestamp: Date.now(),
                        },
                        ...prev,
                      ]);
                    }
                  }}
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
                    <span className="inline-block px-3 py-1 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 text-sm rounded-full font-medium">
                      {t(language, "cover")}
                    </span>
                  </div>
                  <div
                    className="mx-auto relative shadow-lg dark:shadow-black/40 border border-gray-200 dark:border-gray-800"
                    style={{
                      width: `${displayWidth + bleedPreviewPt * 2}px`,
                      height: `${displayHeight + bleedPreviewPt * 2}px`,
                      zoom: scale,
                      ...pageBackgroundCss(pageBackground),
                    }}
                  >
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

                    </div>
                  </div>
                </div>
              );
            })()}

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
            const scaledWidth = displayWidth * scale;

            return (
              <div key={page.pageNumber} data-page-number={page.pageNumber} className="relative">
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
                      <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm rounded-full font-medium">
                        {t(language, "pageOf")} {page.pageNumber * 2 - 1} {t(language, "of")} {totalLogicalPages}
                      </span>
                      {renderStyleSwitcher(page.pageNumber * 2 - 1)}
                    </div>

                    {/* Right page controls (only if it exists) */}
                    {page.pageNumber * 2 <= totalLogicalPages && (
                      <div
                        className="flex flex-wrap items-center justify-center gap-2"
                        style={{ width: `${scaledWidth / 2}px` }}
                      >
                        <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm rounded-full font-medium">
                          {t(language, "pageOf")} {page.pageNumber * 2} {t(language, "of")} {totalLogicalPages}
                        </span>
                        {renderStyleSwitcher(page.pageNumber * 2)}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Single page mode - center everything */
                  <div className="text-center mb-2 flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm rounded-full font-medium">
                      {t(language, "pageOf")} {page.pageNumber} {t(language, "of")} {totalLogicalPages}
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
                  className="mx-auto relative shadow-lg dark:shadow-black/40 border border-gray-200 dark:border-gray-800"
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
                      const isDropTarget = dropTargetAssetId === photoBox.id;
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
                          {/* Drop indicator - shown on left edge when hovering during drag */}
                          {isDropTarget && reorderDragState && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-lg z-10" />
                          )}

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

                    const isBeingDragged =
                      reorderDragState?.draggedAssetId === asset.id;
                    const isDropTarget = dropTargetAssetId === asset.id;
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
                              // REPLACE: new photo replaces the placeholder
                              console.log(`REPLACE: ${asset.id} with ${selectedNewAsset.id}`);
                              const updatedAssets = assets.map(a => a.id === asset.id ? selectedNewAsset : a);
                              setAssets(updatedAssets);
                              setNewAssets(prev => prev.filter(a => a.id !== selectedNewAsset.id));
                              setMissingAssetIds(prev => {
                                const next = new Set(prev);
                                next.delete(asset.id);
                                return next;
                              });
                              setHistory(prev => [{
                                type: "replace-placeholder",
                                newAsset: selectedNewAsset,
                                placeholderAsset: asset,
                                timestamp: Date.now(),
                              }, ...prev]);
                              setSelectedNewAsset(null);
                              
                              // Save snapshot async
                              setTimeout(() => {
                                const config: AlbumConfig = {
                                  printerId, pageWidth, pageHeight, margin, combinePages, spacing,
                                  filterVideos, forceTimeline, bleedEnabled, bleed, showDates, showCaptions,
                                  fontSize, pageBackground, cardStyle, customOrdering,
                                  layoutVariants: Object.fromEntries(layoutVariants),
                                  pageCounts: Object.fromEntries(pageCounts),
                                  pageCaptions: Object.fromEntries(pageCaptions),
                                  cardCaptions: Object.fromEntries(cardCaptions),
                                  textCardCounts: Object.fromEntries(textCardCounts),
                                  textCardContents: Object.fromEntries(textCardContents),
                                  slotOverrides: Object.fromEntries(slotOverrides),
                                  manuallyMovedIds: Array.from(manuallyMovedIds),
                                  showCover, coverTitle, coverAssetId, coverLayout,
                                  backCoverAssetId, backCoverLayout, backCoverNoPhoto,
                                  backCoverText, backCoverPlainText, excludeCoverPhotosFromPages,
                                };
                                saveAlbumConfig(album.id, config, updatedAssets);
                              }, 100);
                            } else {
                              // SWAP: new photo takes this position, this photo goes to newAssets
                              console.log(`SWAP: ${asset.id} with ${selectedNewAsset.id}`);
                              const updatedAssets = assets.map(a => a.id === asset.id ? selectedNewAsset : a);
                              setAssets(updatedAssets);
                              setNewAssets(prev => [...prev.filter(a => a.id !== selectedNewAsset.id), asset]);
                              setHistory(prev => [{
                                type: "swap-new-photo",
                                newAsset: selectedNewAsset,
                                replacedAsset: asset,
                                timestamp: Date.now(),
                              }, ...prev]);
                              setSelectedNewAsset(null);
                              
                              // Save snapshot async
                              setTimeout(() => {
                                const config: AlbumConfig = {
                                  printerId, pageWidth, pageHeight, margin, combinePages, spacing,
                                  filterVideos, forceTimeline, bleedEnabled, bleed, showDates, showCaptions,
                                  fontSize, pageBackground, cardStyle, customOrdering,
                                  layoutVariants: Object.fromEntries(layoutVariants),
                                  pageCounts: Object.fromEntries(pageCounts),
                                  pageCaptions: Object.fromEntries(pageCaptions),
                                  cardCaptions: Object.fromEntries(cardCaptions),
                                  textCardCounts: Object.fromEntries(textCardCounts),
                                  textCardContents: Object.fromEntries(textCardContents),
                                  slotOverrides: Object.fromEntries(slotOverrides),
                                  manuallyMovedIds: Array.from(manuallyMovedIds),
                                  showCover, coverTitle, coverAssetId, coverLayout,
                                  backCoverAssetId, backCoverLayout, backCoverNoPhoto,
                                  backCoverText, backCoverPlainText, excludeCoverPhotosFromPages,
                                };
                                saveAlbumConfig(album.id, config, updatedAssets);
                              }, 100);
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
                            handleReorderPointerDown(asset.id, e);
                          }
                        }}
                      >
                        {/* Drop indicator - shown on left edge when hovering during drag */}
                        {isDropTarget && reorderDragState && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-lg z-10" />
                        )}

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

                        {/* Cover picker */}
                        {coverAsset?.id === asset.id ? (
                          <div
                            className="absolute top-2 right-2 bg-amber-500 text-white px-2 py-0.5 rounded shadow text-xs font-medium z-10"
                            title={language === "fr" ? "Ceci est la photo de couverture" : "This is the cover photo"}
                          >
                            ★ {t(language, "cover")}
                          </div>
                        ) : (
                          <div
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded shadow text-xs font-medium z-10"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const prevAssetId = coverAssetId;
                              setCoverAssetId(asset.id);
                              setHistory((prev) => [
                                {
                                  type: "set-cover",
                                  prevAssetId,
                                  newAssetId: asset.id,
                                  timestamp: Date.now(),
                                },
                                ...prev,
                              ]);
                            }}
                            title="Set as cover photo"
                          >
                            Set as cover
                          </div>
                        )}

                        {/* Back cover picker */}
                        {backCoverAsset?.id === asset.id ? (
                          <div
                            className="absolute top-9 right-2 cursor-pointer bg-indigo-500 hover:bg-red-600 text-white px-2 py-0.5 rounded shadow text-xs font-medium z-10 transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setBackCoverNoPhoto(true);
                            }}
                            title="Remove as back cover photo"
                          >
                            ★ Back cover ✕
                          </div>
                        ) : (
                          <div
                            className="absolute top-9 right-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-indigo-500 hover:bg-indigo-600 text-white px-2 py-0.5 rounded shadow text-xs font-medium z-10"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const prevAssetId = backCoverAssetId;
                              setBackCoverAssetId(asset.id);
                              setBackCoverNoPhoto(false);
                              setHistory((prev) => [
                                {
                                  type: "set-back-cover",
                                  prevAssetId,
                                  newAssetId: asset.id,
                                  timestamp: Date.now(),
                                },
                                ...prev,
                              ]);
                            }}
                            title="Set as back cover photo"
                          >
                            Set as back cover
                          </div>
                        )}

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
                                  printerId, pageWidth, pageHeight, margin, combinePages, spacing,
                                  filterVideos, forceTimeline, bleedEnabled, bleed, showDates, showCaptions,
                                  fontSize, pageBackground, cardStyle, customOrdering,
                                  layoutVariants: Object.fromEntries(layoutVariants),
                                  pageCounts: Object.fromEntries(pageCounts),
                                  pageCaptions: Object.fromEntries(pageCaptions),
                                  cardCaptions: Object.fromEntries(cardCaptions),
                                  textCardCounts: Object.fromEntries(textCardCounts),
                                  textCardContents: Object.fromEntries(textCardContents),
                                  slotOverrides: Object.fromEntries(slotOverrides),
                                  manuallyMovedIds: Array.from(manuallyMovedIds),
                                  showCover, coverTitle, coverAssetId, coverLayout,
                                  backCoverAssetId, backCoverLayout, backCoverNoPhoto,
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


                      </div>
                    );
                  })}
                </div>
                  </div>
              </div>
            );
          })}

          {showCover &&
            (() => {
              const displayWidth = toPoints(validPageWidth);
              const displayHeight = toPoints(validPageHeight);
              const bleedPreviewPt = bleedEnabled ? toPoints(validBleed) : 0;
              const scale =
                previewWidth > 0
                  ? Math.min(
                      1,
                      previewWidth / (displayWidth + bleedPreviewPt * 2),
                    )
                  : 1;
              // No placeholder hint here - unlike the front cover's title,
              // there's no meaningful fallback text for a back cover note,
              // so an empty one just stays visually blank (still clickable
              // to type into) rather than showing stray hint text over a
              // photo the user never asked to see.
              const backCoverTextInput = (
                fontSizePx: number,
                color: string,
                extraClassName = "",
              ) => (
                <input
                  type="text"
                  value={backCoverText}
                  onFocus={(e) => {
                    e.target.dataset.initialValue = backCoverText;
                  }}
                  onChange={(e) => setBackCoverText(e.target.value)}
                  onBlur={(e) => {
                    const prevText = e.target.dataset.initialValue || "";
                    const newText = e.target.value.trim();
                    if (prevText !== newText) {
                      setHistory((prev) => [
                        {
                          type: "edit-back-cover-text",
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
                  className={`text-center bg-transparent focus:outline-none rounded w-[90%] ${extraClassName}`}
                  style={{
                    fontFamily: "Caveat",
                    fontWeight: 500,
                    fontSize: `${fontSizePx}px`,
                    color,
                  }}
                />
              );
              return (
                <div className="relative">
                  <div className="text-center mb-2">
                    <span className="inline-block px-3 py-1 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 text-sm rounded-full font-medium">
                      {t(language, "backCoverLabel")}
                    </span>
                  </div>
                  <div
                    className="mx-auto relative shadow-lg dark:shadow-black/40 border border-gray-200 dark:border-gray-800"
                    style={{
                      width: `${displayWidth + bleedPreviewPt * 2}px`,
                      height: `${displayHeight + bleedPreviewPt * 2}px`,
                      zoom: scale,
                      ...pageBackgroundCss(pageBackground),
                    }}
                  >
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
                    {backCoverLayout === "text-only" && (
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
                        {backCoverTextInput(displayWidth * 0.09, SCRAPBOOK.ink)}
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

                    {backCoverLayout === "photo-title" &&
                      (backCoverAsset || backCoverText !== "") &&
                      (() => {
                        const imageUrl = backCoverAsset
                          ? `${immichConfig.baseUrl}/assets/${backCoverAsset.id}/thumbnail?size=preview`
                          : null;

                        // Plain text has no photo to mount, so no
                        // card/mat either - it just sits on the page
                        // background, centered on the whole page.
                        if (!imageUrl && backCoverPlainText) {
                          const plainWidth = displayWidth * 0.7;
                          return (
                            <input
                              type="text"
                              value={backCoverText}
                              onFocus={(e) => {
                                e.target.dataset.initialValue = backCoverText;
                              }}
                              onChange={(e) =>
                                setBackCoverText(e.target.value)
                              }
                              onBlur={(e) => {
                                const prevText = e.target.dataset.initialValue || "";
                                const newText = e.target.value.trim();
                                if (prevText !== newText) {
                                  setHistory((prev) => [
                                    {
                                      type: "edit-back-cover-text",
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
                              className="absolute text-center bg-transparent focus:outline-none focus:bg-white/40 rounded"
                              style={{
                                top: 0,
                                left: (displayWidth - plainWidth) / 2,
                                width: plainWidth,
                                height: displayHeight,
                                fontFamily: "Caveat",
                                fontWeight: 500,
                                fontSize: `${fontSize * 1.9}px`,
                                color: SCRAPBOOK.ink,
                              }}
                            />
                          );
                        }

                        // Card mounted flat (no tilt), centered on the
                        // whole page, so it reads as a closing note.
                        const cardWidth = displayWidth * 0.42;
                        const cardHeight = displayHeight * 0.3;
                        const cardTop = (displayHeight - cardHeight) / 2;
                        const cardLeft = (displayWidth - cardWidth) / 2;
                        const frameInset = Math.max(4, cardWidth * 0.045);
                        const captionStripHeight = fontSize * 1.4;
                        return (
                          <div
                            className="absolute"
                            style={{
                              top: cardTop,
                              left: cardLeft,
                              width: cardWidth,
                              height: cardHeight,
                              boxShadow: `2px 5px 10px ${SCRAPBOOK.shadow}`,
                              backgroundColor: SCRAPBOOK.mat,
                            }}
                          >
                            {imageUrl && (
                              <div
                                className="absolute overflow-hidden"
                                style={{
                                  top: frameInset,
                                  left: frameInset,
                                  right: frameInset,
                                  bottom: frameInset + captionStripHeight,
                                }}
                              >
                                <img
                                  src={imageUrl}
                                  alt={backCoverAsset?.originalFileName}
                                  className="object-contain w-full h-full"
                                  loading="lazy"
                                />
                              </div>
                            )}
                            <input
                              type="text"
                              value={backCoverText}
                              onFocus={(e) => {
                                e.target.dataset.initialValue = backCoverText;
                              }}
                              onChange={(e) =>
                                setBackCoverText(e.target.value)
                              }
                              onBlur={(e) => {
                                const prevText = e.target.dataset.initialValue || "";
                                const newText = e.target.value.trim();
                                if (prevText !== newText) {
                                  setHistory((prev) => [
                                    {
                                      type: "edit-back-cover-text",
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
                              className="absolute text-center bg-transparent focus:outline-none focus:bg-white/70 rounded"
                              style={{
                                left: frameInset,
                                right: frameInset,
                                bottom: imageUrl ? frameInset * 0.3 : 0,
                                top: imageUrl ? undefined : 0,
                                height: imageUrl
                                  ? captionStripHeight
                                  : cardHeight,
                                fontFamily: "Caveat",
                                fontWeight: 500,
                                fontSize: `${imageUrl ? fontSize * 1.3 : fontSize * 1.5}px`,
                                color: SCRAPBOOK.ink,
                              }}
                            />
                          </div>
                        );
                      })()}

                    {backCoverLayout === "full-bleed" &&
                      backCoverAsset &&
                      (() => {
                        const imageUrl = `${immichConfig.baseUrl}/assets/${backCoverAsset.id}/thumbnail?size=preview`;
                        return (
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
                              {backCoverTextInput(
                                displayWidth * 0.06,
                                "#FFFFFF",
                              )}
                            </div>
                          </>
                        );
                      })()}

                    </div>
                  </div>
                </div>
              );
            })()}
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
          <div className="flex-none border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg pt-4 z-10 overflow-y-auto custom-scrollbar" style={{ maxHeight: '140px' }}>
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
                    .map(page => {
                      // Get up to 4 photos from this page for thumbnail
                      const thumbnailPhotos = page.photos.slice(0, 4).filter(p => p.asset);
                      
                      return (
                        <button
                          key={page.pageNumber}
                          onClick={() => {
                            const element = document.querySelector(`[data-page-number="${page.pageNumber}"]`);
                            element?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="w-20 h-24 bg-gray-200 dark:bg-gray-700 rounded border-2 border-red-400 dark:border-red-600 overflow-hidden relative">
                            {thumbnailPhotos.length > 0 ? (
                              <div className={`grid h-full ${thumbnailPhotos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-0.5`}>
                                {thumbnailPhotos.map((photo, idx) => {
                                  if (!photo.asset) return null; // Safety guard
                                  const isMissing = missingAssetIds.has(photo.asset.id);
                                  return (
                                    <div key={idx} className="relative bg-gray-300 dark:bg-gray-600">
                                      {isMissing ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-gray-400 dark:bg-gray-600">
                                          <span className="text-red-500 text-xl font-bold">✕</span>
                                        </div>
                                      ) : (
                                        <img
                                          src={`${immichConfig.baseUrl}/assets/${photo.asset.id}/thumbnail?size=preview`}
                                          alt=""
                                          className="w-full h-full object-cover"
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Empty</span>
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            Page {page.pageNumber}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* History Panel - Right Side */}
      <aside
        className={`flex-none flex flex-col border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-200 overflow-hidden ${
          historyCollapsed ? "w-16" : "w-80"
        }`}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col">
          {historyCollapsed ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <button
                onClick={() => setHistoryCollapsed(false)}
                title={t(language, "history")}
                className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors relative"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M3 7v6h6M21 17v-6h-6" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8m18 8l-2.64 2.36A9 9 0 0 1 3.51 15" />
                </svg>
                {history.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {history.length}
                  </span>
                )}
              </button>
              
              <div className="w-8 border-t border-gray-200 dark:border-gray-800" />
              
              {/* Reset All button (collapsed) */}
              {history.length > 0 && (
                <button
                  onClick={() => setShowResetConfirmation(true)}
                  title={t(language, "resetAll")}
                  className="w-9 h-9 rounded-lg border-2 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
              
              {/* Flatten button (collapsed) */}
              {(history.length > 0 ||
                customOrdering !== null ||
                slotOverrides.size > 0 ||
                manuallyMovedIds.size > 0 ||
                layoutVariants.size > 0 ||
                pageCounts.size > 0 ||
                textCardCounts.size > 0 ||
                textCardContents.size > 0 ||
                pageCaptions.size > 0 ||
                cardCaptions.size > 0) && (
                <button
                  onClick={() => setShowFlattenConfirmation(true)}
                  title={t(language, "flatten")}
                  className="w-9 h-9 rounded-lg border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center transition-colors"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M7 10v12M21 10v12M5 4h16v6H5zM3 4h2M3 22h18" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4 p-4 min-h-full">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  {t(language, "historyTitle")}
                </h2>
                <button
                  onClick={() => setHistoryCollapsed(true)}
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
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>

              {/* Reset All and Flatten buttons */}
              {(history.length > 0 ||
                customOrdering !== null ||
                slotOverrides.size > 0 ||
                manuallyMovedIds.size > 0 ||
                layoutVariants.size > 0 ||
                pageCounts.size > 0 ||
                textCardCounts.size > 0 ||
                textCardContents.size > 0 ||
                pageCaptions.size > 0 ||
                cardCaptions.size > 0) && (
                <div className="flex flex-col gap-2">
                  {history.length > 0 && (
                    <button
                      onClick={() => setShowResetConfirmation(true)}
                      className="w-full px-4 py-2 rounded-lg border-2 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      {t(language, "resetAll")}
                    </button>
                  )}
                  <button
                    onClick={() => setShowFlattenConfirmation(true)}
                    className="w-full px-4 py-2 rounded-lg border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M7 10v12M21 10v12M5 4h16v6H5zM3 4h2M3 22h18" />
                    </svg>
                    {t(language, "flatten")}
                  </button>
                </div>
              )}

              {history.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                  {t(language, "noOperations")}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar -mx-4 px-4 space-y-2">
              {history.map((op, index) => {
                const timeAgo = Math.floor((Date.now() - op.timestamp) / 1000);
                const timeStr =
                  timeAgo < 60
                    ? `${timeAgo}${t(language, "timeAgo_seconds")}`
                    : timeAgo < 3600
                      ? `${Math.floor(timeAgo / 60)}${t(language, "timeAgo_minutes")}`
                      : `${Math.floor(timeAgo / 3600)}${t(language, "timeAgo_hours")}`;

                let description = "";
                switch (op.type) {
                  case "swap-same-page":
                    description = `${t(language, "historySwapSamePage")} ${op.pageNumber}`;
                    break;
                  case "swap-text-cards":
                    description = t(language, "historySwapTextCards");
                    break;
                  case "swap-cross-page":
                    description = `${t(language, "historySwapCrossPage")} ${op.draggedPage} ${t(language, "historySwapCrossPageDetail")} ${op.targetPage}`;
                    break;
                  case "shuffle-layout":
                    description = `${t(language, "historyShuffleLayout")} ${op.pageNumber}`;
                    break;
                  case "set-page-count":
                    description = `${t(language, "historySetPageCount")} ${op.pageNumber} ${t(language, "historySetPageCountTo")} ${op.newCount ?? t(language, "historySetPageCountAuto")}`;
                    break;
                  case "set-text-card-count":
                    description = `${t(language, "historySetTextCardCount")} ${op.pageNumber} ${t(language, "historySetPageCountTo")} ${op.newCount}`;
                    break;
                  case "edit-page-caption":
                    description = `${t(language, "historyEditPageCaption")} ${op.pageNumber}`;
                    break;
                  case "edit-card-caption":
                    description = t(language, "historyEditCardCaption");
                    break;
                  case "edit-text-card":
                    description = t(language, "historyEditTextCard");
                    break;
                  case "set-cover":
                    description = t(language, "historySetCover");
                    break;
                  case "set-back-cover":
                    description = t(language, "historySetBackCover");
                    break;
                  case "edit-cover-title":
                    description = t(language, "historyEditCoverTitle");
                    break;
                  case "edit-back-cover-text":
                    description = t(language, "historyEditBackCoverText");
                    break;
                  case "swap-new-photo":
                    description = t(language, "historySwapNewPhoto");
                    break;
                  case "replace-placeholder":
                    description = t(language, "historyReplacePlaceholder");
                    break;
                  case "insert-new-photo":
                    description = t(language, "historyInsertNewPhoto");
                    break;
                  case "delete-placeholder":
                    description = t(language, "historyDeletePlaceholder");
                    break;
                }

                return (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      index === 0
                        ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30"
                    }`}
                  >
                    <div className="text-sm text-gray-900 dark:text-gray-50 font-medium">
                      {description}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {timeStr}
                    </div>
                  </div>
                 );
               })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Undo button - Sticky at bottom */}
        {history.length > 0 && (
          <div className="flex-none border-t border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-950">
            {historyCollapsed ? (
              <button
                onClick={handleUndo}
                title={t(language, "undoLastAction")}
                className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 7v6h6M21 17v-6h-6" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8m18 8l-2.64 2.36A9 9 0 0 1 3.51 15" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleUndo}
                className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 7v6h6M21 17v-6h-6" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8m18 8l-2.64 2.36A9 9 0 0 1 3.51 15" />
                </svg>
                {t(language, "undoLastAction")}
              </button>
            )}
          </div>
        )}
      </aside>

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

      {/* Reset All Confirmation Dialog */}
      {/* Reset All Confirmation Dialog */}
      {showResetConfirmation && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">
              {t(language, "resetAllConfirmTitle")}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t(language, "resetAllConfirmMessage")}
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 mb-6 space-y-1">
              <li>{t(language, "resetAllConfirmList1")}</li>
              <li>{t(language, "resetAllConfirmList2")}</li>
              <li>{t(language, "resetAllConfirmList3")}</li>
              <li>{t(language, "resetAllConfirmList4")}</li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirmation(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
              >
                {t(language, "cancel")}
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors"
              >
                {t(language, "resetAll")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flatten Confirmation Dialog */}
      {showFlattenConfirmation && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">
              {t(language, "flattenConfirmTitle")}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {t(language, "flattenConfirmMessage")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFlattenConfirmation(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
              >
                {t(language, "cancel")}
              </button>
              <button
                onClick={handleFlatten}
                className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
              >
                {t(language, "flatten")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PhotoGrid;
