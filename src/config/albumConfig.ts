import type { AssetResponseDto } from "@immich/sdk";
import { mmToPixels } from "../utils/pageLayout";

export type PageBackground =
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

// How interior-page cards (photo and text) are mounted: "scrapbook" is
// the original look - mildly tilted, matted, a piece of tape at the top;
// "clean" is a flush, unrotated card the same size as its slot, no
// mat/shadow/tape, for a plainer/more modern layout.
export type CardStyle = "scrapbook" | "clean";

export type CoverLayout = "photo-title" | "full-bleed" | "text-only";

export interface GlobalConfig {
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

export interface AlbumConfig extends GlobalConfig {
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
  // Separated cover for print services like Blurb - creates a single page
  // with back cover, spine, and front cover combined
  separatedCover: boolean;
  // Spine width in mm (typical 10mm for ~100 pages)
  spineWidth: number;
  // Background color for the spine
  spineColor: string;
  // Text color for the spine title
  spineTextColor: string;
  // Font size for spine title in points
  spineTextSize: number;
  // Title on spine (written vertically)
  spineTitle: string;
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

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
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
export async function loadGlobalConfig(): Promise<GlobalConfig> {
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

export async function saveGlobalConfig(config: GlobalConfig) {
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

export async function loadAlbumConfig(albumId: string): Promise<AlbumConfig> {
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
    separatedCover: false,
    spineWidth: 10,
    spineColor: "#000000",
    spineTextColor: "#FFFFFF",
    spineTextSize: 18,
    spineTitle: "",
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

export async function detectAlbumChanges(
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

export async function saveAlbumConfig(albumId: string, config: AlbumConfig, assets?: AssetResponseDto[]) {
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
