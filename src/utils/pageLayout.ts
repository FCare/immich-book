import type { AssetResponseDto } from "@immich/sdk";

export type PageStyle = "bento" | "masonry" | "collage";

export const PAGE_STYLES: PageStyle[] = ["bento", "masonry", "collage"];

export interface PhotoBox {
  asset: AssetResponseDto;
  x: number;
  y: number;
  width: number;
  height: number;
  style: PageStyle;
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

function averageAspectRatio(assets: AssetResponseDto[]): number {
  const sum = assets.reduce((acc, a) => acc + naturalAspectRatio(a), 0);
  return sum / assets.length;
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
  assets: AssetResponseDto[],
  spacing: number,
  config: SplitConfig,
  style: PageStyle,
  path: string,
): PhotoBox[] {
  if (assets.length === 1) {
    return [{ asset: assets[0], ...rect, style }];
  }

  // Group photos by aspect ratio so each side of the split is shape-
  // homogeneous - which side is "first" alternates for variety.
  const sorted = [...assets].sort(
    (a, b) => naturalAspectRatio(a) - naturalAspectRatio(b),
  );
  const countRatio =
    config.ratioMin +
    seededRandom(path + "-count") * (config.ratioMax - config.ratioMin);
  const firstCount = Math.max(
    1,
    Math.min(assets.length - 1, Math.round(assets.length * countRatio)),
  );
  const portraitFirst = seededRandom(path + "-side") < 0.5;
  const firstAssets = portraitFirst
    ? sorted.slice(0, firstCount)
    : sorted.slice(-firstCount);
  const secondAssets = portraitFirst
    ? sorted.slice(firstCount)
    : sorted.slice(0, sorted.length - firstCount);

  const r1 = averageAspectRatio(firstAssets);
  const r2 = averageAspectRatio(secondAssets);

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
    ...splitRect(firstRect, firstAssets, spacing, config, style, path + "A"),
    ...splitRect(secondRect, secondAssets, spacing, config, style, path + "B"),
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
): { photos: PhotoBox[]; consumed: number } {
  const config = style === "bento" ? BENTO_CONFIG : COLLAGE_CONFIG;
  const seedBase = `${style}-${pageNumber}-v${variant}`;
  let desiredCount: number;
  if (forcedCount !== undefined) {
    desiredCount = Math.max(1, forcedCount);
  } else {
    const seed = seededRandom(`count-${seedBase}`);
    desiredCount =
      config.minCount +
      Math.floor(seed * (config.maxCount - config.minCount + 1));
  }
  const consumed = Math.min(desiredCount, assets.length - startIndex);
  const pageAssets = assets.slice(startIndex, startIndex + consumed);
  const photos = splitRect(
    contentRect,
    pageAssets,
    spacing,
    config,
    style,
    seedBase,
  );
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
): { photos: PhotoBox[]; consumed: number } {
  const numColumns =
    2 + Math.floor(seededRandom(`cols-${pageNumber}-v${variant}`) * 3); // 2..4
  const columnWidth =
    (contentRect.width - spacing * (numColumns - 1)) / numColumns;
  const columnHeights = new Array(numColumns).fill(0);
  const photos: PhotoBox[] = [];
  let i = startIndex;

  while (i < assets.length) {
    if (forcedCount !== undefined && i - startIndex >= forcedCount) break;

    const asset = assets[i];
    const photoHeight = columnWidth / naturalAspectRatio(asset);

    let col = 0;
    for (let c = 1; c < numColumns; c++) {
      if (columnHeights[c] < columnHeights[col]) col = c;
    }

    const y = columnHeights[col];
    const newHeight = y === 0 ? photoHeight : y + spacing + photoHeight;

    if (photos.length > 0 && newHeight > contentRect.height) {
      // Doesn't fit - this page is done, even if a forced count asked for
      // more (a forced count is a cap, not a guarantee: never push content
      // off the page to satisfy it).
      break;
    }

    const top = y === 0 ? 0 : y + spacing;
    photos.push({
      asset,
      x: contentRect.x + col * (columnWidth + spacing),
      y: contentRect.y + top,
      width: columnWidth,
      height: photoHeight,
      style: "masonry",
    });
    columnHeights[col] = top + photoHeight;
    i++;
  }

  return { photos, consumed: i - startIndex };
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
          );

    pages.push({
      pageNumber,
      photos: result.photos,
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
