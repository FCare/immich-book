import type { AssetResponseDto } from "@immich/sdk";

export type PageStyle = "bento" | "masonry" | "collage";

export const PAGE_STYLES: PageStyle[] = ["bento", "masonry", "collage"];

export interface PhotoBox {
  // Stable id: the asset's own id for a photo, or a synthetic
  // "text-{pageNumber}-{index}" id for a text card (see LayoutOptions.
  // textCardCounts) - text cards have no backing asset.
  id: string;
  asset: AssetResponseDto | null;
  x: number;
  y: number;
  width: number;
  height: number;
  style: PageStyle;
}

// A text card has no natural photo shape to match, so it gets a fixed,
// readable-for-text default (slightly wide, like an index card).
const TEXT_CARD_ASPECT_RATIO = 1.2;

// What the layout/split algorithms actually place - either a real photo
// or a text card placeholder, so both can be tiled by the same code.
interface LayoutItem {
  id: string;
  asset: AssetResponseDto | null;
}

function itemAspectRatio(item: LayoutItem): number {
  return item.asset ? naturalAspectRatio(item.asset) : TEXT_CARD_ASPECT_RATIO;
}

export interface Page {
  pageNumber: number;
  photos: PhotoBox[];
  width: number;
  height: number;
}

// Convert millimeters to pixels (assuming 300 DPI)
// 1 inch = 25.4 mm = 300 pixels
// 1 mm = 300/25.4 = 11.811023622047244 pixels
export function mmToPixels(mm: number): number {
  return Math.round(mm * 11.811023622047244);
}

export function pixelsToMm(px: number): number {
  return px / 11.811023622047244;
}

export interface LayoutOptions {
  pageWidth: number; // in pixels
  pageHeight: number; // in pixels
  margin: number; // in pixels
  spacing: number; // in pixels
  combinePages?: boolean; // combine two pages into one PDF page
  pageStyles?: Map<number, PageStyle>; // manual style override per page number
  // Bumping a page's variant reshuffles its bento/collage/masonry
  // arrangement (same photos, different split/column pattern) without
  // changing anything else - lets a user "try another layout" per page.
  layoutVariants?: Map<number, number>;
  // Force how many photos land on a given page number, instead of the
  // automatically picked count. Always honored exactly for bento/collage
  // (a gap-free tiling has no "doesn't fit" case); capped by available
  // height for masonry, to avoid pushing content off the page.
  pageCounts?: Map<number, number>;
  // Number of text cards (0-3) to swap in for photo slots in a page's
  // tiling, keyed by page number - carved out of the page's photo count,
  // not added on top of it.
  textCardCounts?: Map<number, number>;
  // Manual override of which card id occupies which slot on a page,
  // keyed by page number. The auto layout (bento/collage especially)
  // groups cards by aspect ratio for a tidy tiling, which doesn't
  // preserve a specific drag-and-drop position - this lets a user's
  // explicit swap win outright: the slot's rect/shape stays exactly what
  // the auto layout computed, but the requested card renders there
  // instead, cropped-to-fit via object-fit:contain in the UI layer. Must
  // be a permutation of the page's natural card ids, in natural slot
  // order, or it's ignored.
  slotOverrides?: Map<number, string[]>;
}

// Deterministic pseudo-random number in [0, 1) from a string seed - stable
// across re-renders/re-layouts (unlike Math.random()), so a page's split
// pattern or column count doesn't jitter every time unrelated state changes.
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return (((hash % 10000) + 10000) % 10000) / 10000;
}

// Bento is the default look for every page; masonry/collage are only used
// when explicitly picked per page via the style switcher.
export function defaultPageStyle(_pageNumber: number): PageStyle {
  return "bento";
}

function naturalAspectRatio(asset: AssetResponseDto): number {
  const width = asset.exifInfo?.exifImageWidth || 1;
  const height = asset.exifInfo?.exifImageHeight || 1;
  if (asset.exifInfo?.orientation == "6") {
    return height / width;
  }
  return width / height;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SplitConfig {
  minCount: number;
  maxCount: number;
  ratioMin: number;
  ratioMax: number;
}

// Bento: fewer, larger tiles for a clean magazine feel.
const BENTO_CONFIG: SplitConfig = {
  minCount: 3,
  maxCount: 6,
  ratioMin: 0.25,
  ratioMax: 0.75,
};

// Collage: more, smaller tiles and a wider size spread for a busier,
// scrapbook-like page.
const COLLAGE_CONFIG: SplitConfig = {
  minCount: 5,
  maxCount: 9,
  ratioMin: 0.22,
  ratioMax: 0.78,
};

function averageAspectRatio(items: LayoutItem[]): number {
  const sum = items.reduce((acc, item) => acc + itemAspectRatio(item), 0);
  return sum / items.length;
}

// A split fraction is never allowed outside this range, and is further
// clamped so neither side drops below MIN_CELL_PX - without this, a deep
// enough recursion (many photos, several levels of splitting) could shrink
// a rect's remaining dimension below the spacing itself, producing a
// negative width/height cell that renders outside the page.
const MIN_FRACTION = 0.2;
const MIN_CELL_PX = 60;

function clampFraction(fraction: number, total: number, spacing: number) {
  const usable = total - spacing;
  const lo = Math.max(MIN_FRACTION, MIN_CELL_PX / Math.max(usable, 1));
  const hi = 1 - lo;
  if (lo >= hi) return 0.5; // usable space too small to split meaningfully
  return Math.min(hi, Math.max(lo, fraction));
}

// How well a candidate split (axis + fraction) matches the two photo
// groups' own aspect ratios - lower is better. Comparing in log space
// because aspect ratio mismatches are naturally multiplicative (a cell
// twice as wide as it should be is just as bad as one twice as narrow).
function splitFitError(
  rect: Rect,
  spacing: number,
  vertical: boolean,
  fraction: number,
  r1: number,
  r2: number,
): number {
  const w1 = vertical ? rect.width * fraction - spacing / 2 : rect.width;
  const h1 = vertical ? rect.height : rect.height * fraction - spacing / 2;
  const w2 = vertical ? rect.width - spacing - w1 : rect.width;
  const h2 = vertical ? rect.height : rect.height - spacing - h1;
  if (w1 <= 0 || h1 <= 0 || w2 <= 0 || h2 <= 0) return Infinity;
  return Math.abs(Math.log(w1 / h1 / r1)) + Math.abs(Math.log(w2 / h2 / r2));
}

// Recursively split a rectangle to tile it exactly among the given assets.
// The axis and split fraction are chosen to match the actual aspect ratios
// of the photos being placed - a group of landscape photos gets wide
// cells, a group of portraits gets tall ones - instead of a shape picked
// independently of the content. Zero wasted space, and (thanks to
// clampFraction) never a degenerate cell.
function splitRect(
  rect: Rect,
  items: LayoutItem[],
  spacing: number,
  config: SplitConfig,
  style: PageStyle,
  path: string,
): PhotoBox[] {
  if (items.length === 1) {
    return [{ id: items[0].id, asset: items[0].asset, ...rect, style }];
  }

  // Group photos by aspect ratio so each side of the split is shape-
  // homogeneous - which side is "first" alternates for variety.
  const sorted = [...items].sort(
    (a, b) => itemAspectRatio(a) - itemAspectRatio(b),
  );
  const countRatio =
    config.ratioMin +
    seededRandom(path + "-count") * (config.ratioMax - config.ratioMin);
  const firstCount = Math.max(
    1,
    Math.min(items.length - 1, Math.round(items.length * countRatio)),
  );
  const portraitFirst = seededRandom(path + "-side") < 0.5;
  const firstItems = portraitFirst
    ? sorted.slice(0, firstCount)
    : sorted.slice(-firstCount);
  const secondItems = portraitFirst
    ? sorted.slice(firstCount)
    : sorted.slice(0, sorted.length - firstCount);

  const r1 = averageAspectRatio(firstItems);
  const r2 = averageAspectRatio(secondItems);

  // Proportional split fraction for each axis: side-by-side cells share
  // width in proportion to their target aspect ratio (at the shared
  // height); stacked cells share height in inverse proportion (at the
  // shared width). Whichever axis fits the two groups' shapes best wins.
  const vFraction = clampFraction(r1 / (r1 + r2), rect.width, spacing);
  const hFraction = clampFraction(
    1 / r1 / (1 / r1 + 1 / r2),
    rect.height,
    spacing,
  );
  const vError = splitFitError(rect, spacing, true, vFraction, r1, r2);
  const hError = splitFitError(rect, spacing, false, hFraction, r1, r2);
  const jitter = (seededRandom(path + "-axis") - 0.5) * 0.15; // avoid rigid ties
  const splitVertically = vError + jitter <= hError;
  const fraction = splitVertically ? vFraction : hFraction;

  // Absolute final guard, on top of clampFraction: never emit a
  // zero/negative-size rect, no matter how extreme the inputs are.
  let firstRect: Rect;
  let secondRect: Rect;
  if (splitVertically) {
    const firstWidth = Math.max(1, rect.width * fraction - spacing / 2);
    const secondWidth = Math.max(1, rect.width - spacing - firstWidth);
    firstRect = { ...rect, width: firstWidth };
    secondRect = {
      ...rect,
      x: rect.x + firstWidth + spacing,
      width: secondWidth,
    };
  } else {
    const firstHeight = Math.max(1, rect.height * fraction - spacing / 2);
    const secondHeight = Math.max(1, rect.height - spacing - firstHeight);
    firstRect = { ...rect, height: firstHeight };
    secondRect = {
      ...rect,
      y: rect.y + firstHeight + spacing,
      height: secondHeight,
    };
  }

  return [
    ...splitRect(firstRect, firstItems, spacing, config, style, path + "A"),
    ...splitRect(secondRect, secondItems, spacing, config, style, path + "B"),
  ];
}

function layoutSplitPage(
  assets: AssetResponseDto[],
  startIndex: number,
  pageNumber: number,
  contentRect: Rect,
  spacing: number,
  style: "bento" | "collage",
  variant: number,
  forcedCount: number | undefined,
  textCardCount: number,
): { photos: PhotoBox[]; consumed: number } {
  const config = style === "bento" ? BENTO_CONFIG : COLLAGE_CONFIG;
  const seedBase = `${style}-${pageNumber}-v${variant}`;
  let totalSlots: number;
  if (forcedCount !== undefined) {
    totalSlots = Math.max(1, forcedCount);
  } else {
    const seed = seededRandom(`count-${seedBase}`);
    totalSlots =
      config.minCount +
      Math.floor(seed * (config.maxCount - config.minCount + 1));
  }
  // Text cards replace photo slots rather than adding to them - the total
  // card count on the page stays whatever "auto"/forced would have
  // produced alone. Always leave room for at least one real photo when
  // there are still photos left to place.
  const cappedTextCardCount = Math.min(
    textCardCount,
    Math.max(0, totalSlots - 1),
  );
  const photoSlots = totalSlots - cappedTextCardCount;
  const consumed = Math.min(photoSlots, assets.length - startIndex);
  const pageAssets = assets.slice(startIndex, startIndex + consumed);

  const items: LayoutItem[] = [
    ...pageAssets.map((asset) => ({ id: asset.id, asset })),
    ...Array.from({ length: cappedTextCardCount }, (_, i) => ({
      id: `text-${pageNumber}-${i}`,
      asset: null,
    })),
  ];

  const photos = splitRect(contentRect, items, spacing, config, style, seedBase);
  return { photos, consumed };
}

// Masonry: fixed-width columns, each photo goes in the shortest column at
// its natural height - a Pinterest-style layout with no forced row grid.
function layoutMasonryPage(
  assets: AssetResponseDto[],
  startIndex: number,
  pageNumber: number,
  contentRect: Rect,
  spacing: number,
  variant: number,
  forcedCount: number | undefined,
  textCardCount: number,
): { photos: PhotoBox[]; consumed: number } {
  const numColumns =
    2 + Math.floor(seededRandom(`cols-${pageNumber}-v${variant}`) * 3); // 2..4
  const columnWidth =
    (contentRect.width - spacing * (numColumns - 1)) / numColumns;
  const columnHeights = new Array(numColumns).fill(0);
  const photos: PhotoBox[] = [];
  let i = startIndex;

  const shortestColumn = () => {
    let col = 0;
    for (let c = 1; c < numColumns; c++) {
      if (columnHeights[c] < columnHeights[col]) col = c;
    }
    return col;
  };

  const place = (
    id: string,
    asset: AssetResponseDto | null,
    aspectRatio: number,
  ): boolean => {
    const height = columnWidth / aspectRatio;
    const col = shortestColumn();
    const y = columnHeights[col];
    const newHeight = y === 0 ? height : y + spacing + height;

    if (photos.length > 0 && newHeight > contentRect.height) {
      return false; // doesn't fit
    }

    const top = y === 0 ? 0 : y + spacing;
    photos.push({
      id,
      asset,
      x: contentRect.x + col * (columnWidth + spacing),
      y: contentRect.y + top,
      width: columnWidth,
      height,
      style: "masonry",
    });
    columnHeights[col] = top + height;
    return true;
  };

  // Text cards replace photo slots rather than adding to them, so a forced
  // count is split between the two: forcedCount - textCardCount photos,
  // then the text cards. Auto mode has no fixed target count to carve
  // out of (it fills by height), so text cards there just claim column
  // space alongside the naturally-filled photos.
  const photoCap =
    forcedCount !== undefined
      ? Math.max(0, forcedCount - textCardCount)
      : Infinity;

  while (i < assets.length) {
    if (i - startIndex >= photoCap) break;
    const asset = assets[i];
    // A forced count is a cap, not a guarantee: never push content off
    // the page to satisfy it, so this can legitimately stop early.
    if (!place(asset.id, asset, naturalAspectRatio(asset))) break;
    i++;
  }

  const consumed = i - startIndex;

  for (let t = 0; t < textCardCount; t++) {
    if (!place(`text-${pageNumber}-${t}`, null, TEXT_CARD_ASPECT_RATIO)) break;
  }

  return { photos, consumed };
}

/**
 * Calculate page-based layout for photos
 * This is the single source of truth for layout - used by both web and PDF
 */
export function calculatePageLayout(
  assets: AssetResponseDto[],
  options: LayoutOptions,
): Page[] {
  if (assets.length === 0) return [];

  const {
    pageWidth,
    pageHeight,
    margin,
    spacing,
    pageStyles,
    layoutVariants,
    pageCounts,
    textCardCounts,
    slotOverrides,
  } = options;

  const pageDimensions = { width: pageWidth, height: pageHeight };

  const contentRect: Rect = {
    x: margin,
    y: margin,
    width: pageDimensions.width - margin * 2,
    height: pageDimensions.height - margin * 2,
  };

  const pages: Page[] = [];
  let index = 0;
  let pageNumber = 1;

  while (index < assets.length) {
    const style = pageStyles?.get(pageNumber) || defaultPageStyle(pageNumber);
    const variant = layoutVariants?.get(pageNumber) || 0;
    const forcedCount = pageCounts?.get(pageNumber);
    const textCardCount = textCardCounts?.get(pageNumber) || 0;
    const result =
      style === "masonry"
        ? layoutMasonryPage(
            assets,
            index,
            pageNumber,
            contentRect,
            spacing,
            variant,
            forcedCount,
            textCardCount,
          )
        : layoutSplitPage(
            assets,
            index,
            pageNumber,
            contentRect,
            spacing,
            style,
            variant,
            forcedCount,
            textCardCount,
          );

    // A manual slot override wins outright over the auto-computed
    // assignment: same rects/shapes (so the tiling stays a gap-free tile),
    // but whichever card ids the user swapped into place render there
    // instead. Ignored (falls back to natural order) unless it's an exact
    // permutation of this page's natural card ids - a stale override left
    // over from before a page-count/style/text-card change, for example.
    let photos = result.photos;
    const override = slotOverrides?.get(pageNumber);
    if (override && override.length === photos.length) {
      const naturalById = new Map(photos.map((p) => [p.id, p]));
      if (override.every((id) => naturalById.has(id))) {
        photos = photos.map((naturalSlot, i) => {
          const source = naturalById.get(override[i])!;
          return { ...naturalSlot, id: source.id, asset: source.asset };
        });
      }
    }

    pages.push({
      pageNumber,
      photos,
      width: pageDimensions.width,
      height: pageDimensions.height,
    });

    index += Math.max(1, result.consumed);
    pageNumber++;
  }

  // Combine pages if requested
  if (options.combinePages) {
    const combinedPages: Page[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      const leftPage = pages[i];
      const rightPage = pages[i + 1];

      if (rightPage) {
        // Combine two pages side-by-side
        const combinedPage: Page = {
          pageNumber: Math.floor(i / 2) + 1,
          photos: [
            // Left page photos - keep as is
            ...leftPage.photos,
            // Right page photos - shift horizontally by page width
            ...rightPage.photos.map((photo) => ({
              ...photo,
              x: photo.x + pageDimensions.width,
            })),
          ],
          width: pageDimensions.width * 2,
          height: pageDimensions.height,
        };
        combinedPages.push(combinedPage);
      } else {
        // Odd number of pages - last page stays single
        combinedPages.push({
          ...leftPage,
          pageNumber: Math.floor(i / 2) + 1,
          width: pageDimensions.width * 2, // Keep same width for consistency
        });
      }
    }
    return combinedPages;
  }

  return pages;
}
