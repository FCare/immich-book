import { useState, useEffect, useMemo, useRef } from "react";
import {
  getAlbumInfo,
  type AlbumResponseDto,
  type AssetResponseDto,
} from "@immich/sdk";
import {
  PDFViewer,
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
  PAGE_STYLES,
  defaultPageStyle,
  mmToPixels,
  pixelsToMm,
  type PageStyle,
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

const PAGE_STYLE_LABELS: Record<PageStyle, string> = {
  bento: "Bento",
  masonry: "Columns",
  collage: "Collage",
};

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
}

interface AlbumConfig extends GlobalConfig {
  // Customizations (album-specific only)
  customOrdering: string[] | null;
  // Manual page-style overrides, keyed by logical page number (same
  // numbering as pageCaptions - see the logicalPages memo below). Pages
  // without an entry use the automatically assigned style.
  pageStyles: Record<number, PageStyle>;
  // Bumped each time a page's "shuffle" control is used, to reroll its
  // bento/collage/masonry arrangement without changing anything else.
  layoutVariants: Record<number, number>;
  // Forces how many photos land on a given page number, overriding the
  // automatically picked count. Keyed by logical page number.
  pageCounts: Record<number, number>;
  // LLM-generated page captions, keyed by logical page number
  pageCaptions: Record<number, string>;
  // User-written captions per photo (polaroid card), keyed by asset id
  cardCaptions: Record<string, string>;
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
};

// Helper functions for config persistence
function loadGlobalConfig(): GlobalConfig {
  try {
    const stored = localStorage.getItem("immich-book-global-config");
    if (stored) {
      return { ...DEFAULT_GLOBAL_CONFIG, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load global config:", e);
  }
  return DEFAULT_GLOBAL_CONFIG;
}

function saveGlobalConfig(config: GlobalConfig) {
  try {
    localStorage.setItem("immich-book-global-config", JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save global config:", e);
  }
}

function loadAlbumConfig(albumId: string): AlbumConfig {
  const globalConfig = loadGlobalConfig();

  try {
    const stored = localStorage.getItem(`immich-book-config-${albumId}`);
    if (stored) {
      const albumSpecific = JSON.parse(stored);
      return {
        ...globalConfig,
        customOrdering: null,
        pageStyles: {},
        layoutVariants: {},
        pageCounts: {},
        pageCaptions: {},
        cardCaptions: {},
        ...albumSpecific,
      };
    }
  } catch (e) {
    console.error("Failed to load album config:", e);
  }

  return {
    ...globalConfig,
    customOrdering: null,
    pageStyles: {},
    layoutVariants: {},
    pageCounts: {},
    pageCaptions: {},
    cardCaptions: {},
  };
}

function saveAlbumConfig(albumId: string, config: AlbumConfig) {
  try {
    localStorage.setItem(
      `immich-book-config-${albumId}`,
      JSON.stringify(config),
    );

    // Also update global config with page and layout settings
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
    };
    saveGlobalConfig(globalConfig);
  } catch (e) {
    console.error("Failed to save album config:", e);
  }
}

// Convert 300 DPI pixels to 72 DPI points for PDF
// At 300 DPI: 1 inch = 300 pixels
// At 72 DPI: 1 inch = 72 points
// Conversion: points = pixels * (72/300)
const toPoints = (pixels: number) => pixels * (72 / 300);

// Static styles for the PDF
const staticStyles = StyleSheet.create({
  page: {
    backgroundColor: "white",
  },
});

function PhotoGrid({ immichConfig, album, onBack }: PhotoGridProps) {
  const [assets, setAssets] = useState<AssetResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "pdf">("preview");

  // Load config on mount
  const initialConfig = useMemo(() => loadAlbumConfig(album.id), [album.id]);

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

  // Customizations
  const [customOrdering, setCustomOrdering] = useState<string[] | null>(
    initialConfig.customOrdering,
  );
  const [pageStyles, setPageStyles] = useState<Map<number, PageStyle>>(
    () =>
      new Map(
        Object.entries(initialConfig.pageStyles).map(([k, v]) => [
          Number(k),
          v as PageStyle,
        ]),
      ),
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
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionProgress, setCaptionProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [captionError, setCaptionError] = useState<string | null>(null);

  // Drag state for reordering
  const [reorderDragState, setReorderDragState] = useState<{
    draggedAssetId: string;
    draggedIndex: number;
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

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
      customOrdering,
      pageStyles: Object.fromEntries(pageStyles),
      layoutVariants: Object.fromEntries(layoutVariants),
      pageCounts: Object.fromEntries(pageCounts),
      pageCaptions: Object.fromEntries(pageCaptions),
      cardCaptions: Object.fromEntries(cardCaptions),
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
    customOrdering,
    pageStyles,
    layoutVariants,
    pageCounts,
    pageCaptions,
    cardCaptions,
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

  // Set the style for a given logical page number, overriding the
  // automatically assigned one
  const handleSetPageStyle = (logicalPageNumber: number, style: PageStyle) => {
    setPageStyles((prev) => {
      const next = new Map(prev);
      next.set(logicalPageNumber, style);
      return next;
    });
  };

  // Reroll a page's bento/collage/masonry arrangement - same photos and
  // style, different split/column pattern (e.g. a 3-photo page can be
  // tiled several different ways depending on their formats).
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

  // Drag & drop handlers for reordering
  const handleReorderDragStart = (
    assetId: string,
    index: number,
    event: React.DragEvent,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    setReorderDragState({ draggedAssetId: assetId, draggedIndex: index });
  };

  const handleReorderDragOver = (index: number, event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  };

  const handleReorderDragEnd = () => {
    setReorderDragState(null);
    setDropTargetIndex(null);
  };

  const handleReorderDrop = (targetIndex: number, event: React.DragEvent) => {
    event.preventDefault();

    if (!reorderDragState) return;

    const { draggedIndex } = reorderDragState;

    if (draggedIndex === targetIndex) {
      handleReorderDragEnd();
      return;
    }

    // Create new ordering based on current filtered assets
    const currentOrder = filteredAssets.map((asset) => asset.id);
    const newOrder = [...currentOrder];

    // Remove from old position
    const [removed] = newOrder.splice(draggedIndex, 1);
    // Insert at new position
    newOrder.splice(targetIndex, 0, removed);

    setCustomOrdering(newOrder);
    handleReorderDragEnd();
  };

  // Reset ordering to default
  const handleResetOrdering = () => {
    setCustomOrdering(null);
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

  // Calculate unified page layout - single source of truth!
  const pages = useMemo(() => {
    return calculatePageLayout(filteredAssets, {
      pageWidth: validPageWidth,
      pageHeight: validPageHeight,
      margin: validMargin,
      spacing: validSpacing,
      combinePages,
      pageStyles,
      layoutVariants,
      pageCounts,
    });
  }, [
    filteredAssets,
    validMargin,
    validSpacing,
    validPageWidth,
    validPageHeight,
    combinePages,
    pageStyles,
    layoutVariants,
    pageCounts,
  ]);

  // Group page photos by logical page number - matches the numbering
  // already used for pageStyles/pageCaptions/the "Page X of Y" UI: in
  // combined mode each physical (spread) page holds two logical pages side
  // by side, split at the horizontal midpoint.
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

  // Small button group to view/change which layout style a logical page
  // uses - falls back to the automatically assigned style when untouched.
  const renderStyleSwitcher = (logicalPageNumber: number) => {
    const currentStyle =
      logicalPages.find((lp) => lp.number === logicalPageNumber)?.photos[0]
        ?.style || defaultPageStyle(logicalPageNumber);
    return (
      <div className="flex gap-1">
        {PAGE_STYLES.map((style) => (
          <button
            key={style}
            onClick={() => handleSetPageStyle(logicalPageNumber, style)}
            className={`px-2 py-1 text-xs border rounded transition-colors ${
              currentStyle === style
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
            title={`${PAGE_STYLE_LABELS[style]} layout`}
          >
            {PAGE_STYLE_LABELS[style]}
          </button>
        ))}
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
          .map((p) => p.asset.exifInfo?.description)
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

          {/* Generate PDF / Back to Edit button */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {mode === "preview" ? (
              <button
                onClick={() => setMode("pdf")}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
              >
                Generate PDF
              </button>
            ) : (
              <button
                onClick={() => setMode("preview")}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors shadow-sm"
              >
                Back to Edit
              </button>
            )}
            {mode === "preview" && (
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
            )}
          </div>
          {captionError && (
            <p className="mt-2 text-xs text-red-600 max-w-xs">
              {captionError}
            </p>
          )}
        </div>

        <div className="space-y-2 w-full lg:w-auto">
          {/* 1. Page Setup */}
          <div className="p-2 bg-gray-50 rounded border border-gray-300">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                Page
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-1">
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
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                  title="Quick format - width/height stay editable below"
                >
                  <option value="custom">Custom</option>
                  {PAGE_FORMAT_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <label htmlFor="pageWidth" className="text-gray-600 text-xs">
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
                    className={`px-1 py-0.5 w-16 text-xs border rounded ${
                      isPageWidthValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">mm</span>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="pageHeight" className="text-gray-600 text-xs">
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
                    className={`px-1 py-0.5 w-16 text-xs border rounded ${
                      isPageHeightValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">mm</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="combinePages"
                    checked={combinePages}
                    onChange={(e) => setCombinePages(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor="combinePages"
                    className="text-xs text-gray-700"
                  >
                    Combine Pages
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Layout */}
          <div className="p-2 bg-gray-50 rounded border border-gray-300">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                Layout
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-1">
                <div className="flex items-center gap-1">
                  <label htmlFor="margin" className="text-gray-600 text-xs">
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
                    className={`px-1 py-0.5 w-14 text-xs border rounded ${
                      isMarginValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">mm</span>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="spacing" className="text-gray-600 text-xs">
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
                    className={`px-1 py-0.5 w-12 text-xs border rounded ${
                      isSpacingValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">mm</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Presentation */}
          <div className="p-2 bg-gray-50 rounded border border-gray-300">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                Presentation
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="filterVideos"
                    checked={filterVideos}
                    onChange={(e) => setFilterVideos(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor="filterVideos"
                    className="text-xs text-gray-700"
                  >
                    Exclude Videos
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="showDates"
                    checked={showDates}
                    onChange={(e) => setShowDates(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label htmlFor="showDates" className="text-xs text-gray-700">
                    Show Dates
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="showCaptions"
                    checked={showCaptions}
                    onChange={(e) => setShowCaptions(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor="showCaptions"
                    className="text-xs text-gray-700"
                  >
                    Page Captions
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="fontSize" className="text-gray-600 text-xs">
                    Font Size:
                  </label>
                  <select
                    id="fontSize"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="px-1 py-0.5 text-xs border border-gray-300 rounded"
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
            </div>
          </div>

          {/* 4. Customizations (only shown when there are any) */}
          {customOrdering !== null && (
            <div className="p-2 bg-gray-50 rounded border border-gray-300">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                  Customizations
                </h3>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-gray-600">
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

      {mode === "pdf" ? (
        /* PDF Viewer */
        <div
          className="w-full"
          style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}
        >
          <PDFViewer width="100%" height="100%" showToolbar={true}>
            <Document pageLayout={pageLayout}>
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
                    style={staticStyles.page}
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
                        const bandHeight = toPoints(validMargin);
                        // Text size is the priority; padding just fills
                        // whatever room is left around it, so a small page
                        // margin shrinks the padding rather than crushing
                        // the caption down to an unreadable size.
                        const captionFontSize = Math.min(
                          fontSize * 1.9,
                          bandHeight * 0.7,
                        );
                        const captionPaddingVertical = Math.max(
                          4,
                          Math.min(
                            (bandHeight - captionFontSize) * 0.4,
                            bandHeight * 0.25,
                          ),
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
                      // Full original resolution for print quality (the
                      // web preview below uses the much lighter "preview"
                      // thumbnail instead - this only matters for the PDF).
                      // Requires the Immich API key to have the
                      // asset.download permission.
                      const imageUrl = `${immichConfig.baseUrl}/assets/${photoBox.asset.id}/original?apiKey=${immichConfig.apiKey}`;
                      const width = toPoints(photoBox.width);
                      const height = toPoints(photoBox.height);
                      const frameInset = Math.max(4, width * 0.035);
                      const dateStripHeight = showDates
                        ? fontSize * 1.6
                        : 0;
                      const cardCaption = cardCaptions.get(photoBox.asset.id);
                      // Only cards that actually have a caption reserve the
                      // extra strip - an empty card keeps its full image.
                      const captionStripHeight = cardCaption
                        ? fontSize * 1.4
                        : 0;
                      const bottomStripHeight =
                        dateStripHeight + captionStripHeight;
                      const tilt = photoTiltDeg(photoBox.asset.id);
                      const tape = tapeStyle(photoBox.asset.id);
                      const tapeWidth = width * 0.22;

                      return (
                        <View
                          key={photoBox.asset.id}
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
                              <Image
                                src={imageUrl}
                                style={{
                                  position: "absolute",
                                  top: frameInset,
                                  left: frameInset,
                                  right: frameInset,
                                  bottom: frameInset + bottomStripHeight,
                                  objectFit: "contain",
                                }}
                              />
                              {cardCaption && (
                                <View
                                  style={{
                                    position: "absolute",
                                    left: frameInset,
                                    right: frameInset,
                                    bottom: frameInset * 0.3 + dateStripHeight,
                                    height: captionStripHeight,
                                    display: "flex",
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
                              {showDates && photoBox.asset.fileCreatedAt && (
                                <View
                                  style={{
                                    position: "absolute",
                                    left: frameInset,
                                    right: frameInset,
                                    bottom: frameInset * 0.3,
                                    height: dateStripHeight,
                                    display: "flex",
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
                                      photoBox.asset.fileCreatedAt,
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
            </Document>
          </PDFViewer>
        </div>
      ) : (
        /* Live Preview */
        <div
          ref={previewContainerRef}
          className="space-y-8 pb-8 px-4 sm:px-0"
        >
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

                {/* Page container - rendered at its true (unscaled) size,
                    then visually scaled down to fit the preview column via
                    the clipping wrapper below, so every absolute-positioned
                    child (captions, photos) keeps using displayWidth-based
                    coordinates unchanged. */}
                <div
                  className="mx-auto overflow-hidden"
                  style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
                >
                <div
                  className="relative bg-white shadow-lg border border-gray-200"
                  style={{
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
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
                      const bandHeight = toPoints(validMargin);
                      // Text size is the priority; padding just fills
                      // whatever room is left around it, so a small page
                      // margin shrinks the padding rather than crushing the
                      // caption down to an unreadable size.
                      const captionFontSize = Math.min(
                        fontSize * 1.9,
                        bandHeight * 0.7,
                      );
                      const captionPaddingVertical = Math.max(
                        4,
                        Math.min(
                          (bandHeight - captionFontSize) * 0.4,
                          bandHeight * 0.25,
                        ),
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
                    const imageUrl = `${immichConfig.baseUrl}/assets/${photoBox.asset.id}/thumbnail?size=preview&apiKey=${immichConfig.apiKey}`;

                    // Find global index in filtered assets for drag & drop
                    const globalIndex = filteredAssets.findIndex(
                      (a) => a.id === photoBox.asset.id,
                    );
                    const isBeingDragged =
                      reorderDragState?.draggedAssetId === photoBox.asset.id;
                    const isDropTarget = dropTargetIndex === globalIndex;

                    // Check if this asset has been reordered (compare to default filtered order)
                    const defaultIndex = defaultFilteredAssets.findIndex(
                      (a) => a.id === photoBox.asset.id,
                    );
                    const isReordered =
                      customOrdering !== null && globalIndex !== defaultIndex;

                    const containerWidth = toPoints(photoBox.width);
                    const containerHeight = toPoints(photoBox.height);
                    const frameInset = Math.max(6, containerWidth * 0.035);
                    const dateStripHeight = showDates ? fontSize * 1.6 : 0;
                    const cardCaption = cardCaptions.get(photoBox.asset.id) || "";
                    const hasCardCaption = cardCaption.length > 0;
                    // Only cards that actually have a caption reserve the
                    // extra strip - an empty card keeps its full image, with
                    // just a hover-only "+ caption" hint overlaid on it.
                    const captionStripHeight = hasCardCaption
                      ? fontSize * 1.4
                      : 0;
                    const bottomStripHeight =
                      dateStripHeight + captionStripHeight;
                    const tilt = photoTiltDeg(photoBox.asset.id);
                    const tape = tapeStyle(photoBox.asset.id);
                    const tapeWidth = containerWidth * 0.22;

                    return (
                      <div
                        key={photoBox.asset.id}
                        className={`absolute group cursor-move ${isBeingDragged ? "opacity-50" : ""}`}
                        style={{
                          left: `${toPoints(photoBox.x)}px`,
                          top: `${toPoints(photoBox.y)}px`,
                          width: `${containerWidth}px`,
                          height: `${containerHeight}px`,
                        }}
                        draggable
                        onDragStart={(e) =>
                          handleReorderDragStart(
                            photoBox.asset.id,
                            globalIndex,
                            e,
                          )
                        }
                        onDragOver={(e) =>
                          handleReorderDragOver(globalIndex, e)
                        }
                        onDragEnd={handleReorderDragEnd}
                        onDrop={(e) => handleReorderDrop(globalIndex, e)}
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
                              alt={photoBox.asset.originalFileName}
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
                                    next.set(photoBox.asset.id, e.target.value);
                                  } else {
                                    next.delete(photoBox.asset.id);
                                  }
                                  return next;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              placeholder="+ caption"
                              className={`absolute text-center focus:outline-none rounded transition-opacity ${
                                hasCardCaption
                                  ? "bg-transparent focus:bg-white/70"
                                  : "opacity-0 group-hover:opacity-70 focus:opacity-100 bg-white/80"
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
                          {showDates && photoBox.asset.fileCreatedAt && (
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
                                photoBox.asset.fileCreatedAt,
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

                        {/* Customization indicator */}
                        {isReordered && (
                          <div
                            className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full shadow-lg z-10"
                            title="Image reordered"
                          />
                        )}

                        {/* Reset button - shown on hover for reordered images */}
                        {isReordered && customOrdering && (
                          <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded shadow-lg text-xs font-medium"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Reset custom ordering by rebuilding the array without this asset
                              // This moves the asset back to its default position
                              const assetId = photoBox.asset.id;
                              const defaultIndex = defaultFilteredAssets.findIndex(
                                (a) => a.id === assetId,
                              );

                              // Remove asset from custom ordering
                              const newOrdering = customOrdering.filter(
                                (id) => id !== assetId,
                              );

                              // Insert it back at its default position
                              newOrdering.splice(defaultIndex, 0, assetId);

                              setCustomOrdering(newOrdering);
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PhotoGrid;
