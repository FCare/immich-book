import type { AssetResponseDto } from "@immich/sdk";

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
}

// A text card has no natural photo shape to match, so it gets a fixed,
// readable-for-text default (slightly wide, like an index card).
const TEXT_CARD_ASPECT_RATIO = 1.2;

// What the layout/split algorithm actually places - either a real photo
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
  forceTimeline?: boolean; // preserve chronological order instead of grouping by aspect ratio
  // Bumping a page's variant reshuffles its bento arrangement (same
  // photos, different split pattern) without changing anything else -
  // lets a user "try another layout" per page.
  layoutVariants?: Map<number, number>;
  // Force how many photos land on a given page number, instead of the
  // automatically picked count. Always honored exactly - a gap-free
  // tiling has no "doesn't fit" case.
  pageCounts?: Map<number, number>;
  // Number of text cards (0-3) to swap in for photo slots in a page's
  // tiling, keyed by page number - carved out of the page's photo count,
  // not added on top of it.
  textCardCounts?: Map<number, number>;
  // Manual override of which card id occupies which slot on a page,
  // keyed by page number. The auto layout groups cards by aspect ratio
  // for a tidy tiling, which doesn't preserve a specific drag-and-drop
  // position - this lets a user's explicit swap win outright: the slot's
  // rect/shape stays exactly what the auto layout computed, but the
  // requested card renders there instead, cropped-to-fit via
  // object-fit:contain in the UI layer. Must be a permutation of the
  // page's natural card ids, in natural slot order, or it's ignored.
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

function naturalAspectRatio(asset: AssetResponseDto): number {
  const width = asset.exifInfo?.exifImageWidth || 1;
  const height = asset.exifInfo?.exifImageHeight || 1;
  // Orientations 6 and 8 are the two 90-degree rotations - either way the
  // displayed shape is width/height swapped from the stored pixels. 3
  // (180 degrees) doesn't change the shape, only 6/8 do. Normalized to a
  // string first since Immich doesn't consistently type this field
  // (string in some responses, number in others).
  const orientation = String(asset.exifInfo?.orientation ?? "");
  if (orientation === "6" || orientation === "8") {
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
  minCount: 2,
  maxCount: 4,
  ratioMin: 0.25,
  ratioMax: 0.75,
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
  path: string,
  forceTimeline: boolean = false,
): PhotoBox[] {
  if (items.length === 1) {
    return [{ id: items[0].id, asset: items[0].asset, ...rect }];
  }

  let firstItems: LayoutItem[];
  let secondItems: LayoutItem[];

  if (forceTimeline) {
    // Preserve chronological order: split items in sequence, not by aspect ratio
    const firstCount = Math.max(1, Math.floor(items.length / 2));
    firstItems = items.slice(0, firstCount);
    secondItems = items.slice(firstCount);
  } else {
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
    firstItems = portraitFirst
      ? sorted.slice(0, firstCount)
      : sorted.slice(-firstCount);
    secondItems = portraitFirst
      ? sorted.slice(firstCount)
      : sorted.slice(0, sorted.length - firstCount);
  }

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
    ...splitRect(firstRect, firstItems, spacing, config, path + "A", forceTimeline),
    ...splitRect(secondRect, secondItems, spacing, config, path + "B", forceTimeline),
  ];
}

// The recursive split produces exact, gap-free tiling, but cells from
// different branches of the tree can end up with almost - but not quite
// - the same y and height (e.g. two independently-computed stacked
// splits under sibling columns of a shared-height parent). A large size
// difference reads as intentional mosaic variety; a few-percent
// difference just reads as a misaligned row. This snaps only the
// latter: contiguous runs of cells sharing close-but-not-equal y/height
// are forced to a common y/height, with the delta absorbed by whatever
// sits directly below them - which may itself be more than one cell
// (e.g. a single tall neighbor's own mate is two stacked cells one
// level down). The swap only happens when the region below is a
// complete, gap-free cover of the row's combined width, so the overall
// tiling never grows a gap or an overlap; anything that doesn't tile
// that cleanly is left alone.
function equalizeNearMatchingRows(
  photos: PhotoBox[],
  spacing: number,
): PhotoBox[] {
  const boxes = photos.map((p) => ({ ...p }));
  const GEOMETRY_EPS = 2;
  const ALREADY_EQUAL_EPS = 1;
  // Two cells that are genuinely meant to align (e.g. the top cells of
  // two independently-stacked columns under a shared side-by-side
  // split) inherit the *exact* same y from that shared parent - only
  // their height can drift apart, from each column computing its own
  // split fraction independently. So this only needs to absorb
  // rounding, not "roughly the same row": a wider tolerance starts
  // matching cells from unrelated rows that just happen to land nearby,
  // which is exactly the kind of mismatch this is supposed to prevent,
  // not create.
  const Y_TOLERANCE = GEOMETRY_EPS;
  const CLOSE_HEIGHT_RATIO = 0.85;

  // Group boxes into y-bands (close top edge), then split each band
  // into sub-groups of mutually close heights - two bento tiles can
  // share a y-band (e.g. a full-height tile next to two stacked ones)
  // without being anywhere near the same height, and those must stay
  // untouched.
  const byY = [...boxes].sort((a, b) => a.y - b.y);
  const bands: PhotoBox[][] = [];
  for (const box of byY) {
    const band = bands.find((b) => Math.abs(b[0].y - box.y) <= Y_TOLERANCE);
    if (band) band.push(box);
    else bands.push([box]);
  }

  const groups: PhotoBox[][] = [];
  for (const band of bands) {
    const byHeight = [...band].sort((a, b) => a.height - b.height);
    let current: PhotoBox[] = [];
    for (const box of byHeight) {
      const prev = current[current.length - 1];
      const closeToRun =
        current.length === 0 ||
        Math.min(prev.height, box.height) / Math.max(prev.height, box.height) >=
          CLOSE_HEIGHT_RATIO;
      if (closeToRun) {
        current.push(box);
      } else {
        if (current.length >= 2) groups.push(current);
        current = [box];
      }
    }
    if (current.length >= 2) groups.push(current);
  }

  // Groups are found once, up front, from the original geometry - but
  // applying one group mutates boxes in place. A box touched by one
  // group's resize (whether as a member or as part of what absorbed the
  // delta below it) must not be touched again by a later group: its
  // recorded height/position would already be stale relative to when
  // that later group was classified, and reusing it could silently
  // reintroduce a gap or overlap instead of preventing one.
  const touched = new Set<string>();

  for (const group of groups) {
    if (group.some((b) => touched.has(b.id))) continue;

    // Already matching (within rounding) - nothing to do.
    const heights = group.map((b) => b.height);
    if (Math.max(...heights) - Math.min(...heights) < ALREADY_EQUAL_EPS) {
      continue;
    }

    const sorted = [...group].sort((a, b) => a.x - b.x);
    const combinedMinX = sorted[0].x;
    const combinedMaxX = Math.max(...sorted.map((b) => b.x + b.width));
    // Group members must themselves tile the combined width with no
    // gaps - otherwise this isn't really "one row".
    let contiguous = true;
    for (let i = 1; i < sorted.length; i++) {
      const prevRight = sorted[i - 1].x + sorted[i - 1].width;
      if (Math.abs(sorted[i].x - (prevRight + spacing)) > GEOMETRY_EPS) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;

    const targetY = Math.min(...group.map((b) => b.y));
    const targetHeight =
      group.reduce((sum, b) => sum + b.height, 0) / group.length;
    const groupIds = new Set(group.map((b) => b.id));

    // Collect whatever sits directly below any group member and within
    // the combined width - possibly several cells, if the region below
    // is itself split further.
    const belowSet = new Map<string, PhotoBox>();
    for (const member of group) {
      const expectedY = member.y + member.height + spacing;
      for (const candidate of boxes) {
        if (groupIds.has(candidate.id)) continue;
        if (Math.abs(candidate.y - expectedY) > GEOMETRY_EPS) continue;
        if (
          candidate.x < combinedMinX - GEOMETRY_EPS ||
          candidate.x + candidate.width > combinedMaxX + GEOMETRY_EPS
        ) {
          continue;
        }
        belowSet.set(candidate.id, candidate);
      }
    }
    const below = [...belowSet.values()].sort((a, b) => a.x - b.x);
    if (below.length === 0) continue; // nothing to absorb the delta into
    if (below.some((b) => touched.has(b.id))) continue;

    // The below region must itself be a complete, gap-free cover of the
    // combined width - otherwise resizing it would open a gap or an
    // overlap next to whatever it doesn't cover.
    let belowContiguous =
      below.length > 0 &&
      Math.abs(below[0].x - combinedMinX) <= GEOMETRY_EPS &&
      Math.abs(
        below[below.length - 1].x + below[below.length - 1].width - combinedMaxX,
      ) <= GEOMETRY_EPS;
    for (let i = 1; belowContiguous && i < below.length; i++) {
      const prevRight = below[i - 1].x + below[i - 1].width;
      if (Math.abs(below[i].x - (prevRight + spacing)) > GEOMETRY_EPS) {
        belowContiguous = false;
      }
    }
    if (!belowContiguous) continue;

    // Safe to apply: snap the row to a shared y/height, and resize
    // whatever sits below it by the opposite delta, keeping each of
    // those cells' own bottom edge fixed.
    for (const member of group) {
      member.y = targetY;
      member.height = targetHeight;
      touched.add(member.id);
    }
    const newBelowTop = targetY + targetHeight + spacing;
    for (const cell of below) {
      const bottom = cell.y + cell.height;
      cell.y = newBelowTop;
      cell.height = bottom - newBelowTop;
      touched.add(cell.id);
    }
  }

  return boxes;
}

function layoutBentoPage(
  assets: AssetResponseDto[],
  startIndex: number,
  pageNumber: number,
  contentRect: Rect,
  spacing: number,
  variant: number,
  forcedCount: number | undefined,
  textCardCount: number,
  forceTimeline: boolean,
): { photos: PhotoBox[]; consumed: number } {
  const seedBase = `bento-${pageNumber}-v${variant}`;
  let totalSlots: number;
  if (forcedCount !== undefined) {
    totalSlots = Math.max(1, forcedCount);
  } else {
    const seed = seededRandom(`count-${seedBase}`);
    totalSlots =
      BENTO_CONFIG.minCount +
      Math.floor(seed * (BENTO_CONFIG.maxCount - BENTO_CONFIG.minCount + 1));
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

  const photos = splitRect(contentRect, items, spacing, BENTO_CONFIG, seedBase, forceTimeline);
  return { photos: equalizeNearMatchingRows(photos, spacing), consumed };
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
    forceTimeline,
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
    const variant = layoutVariants?.get(pageNumber) || 0;
    const forcedCount = pageCounts?.get(pageNumber);
    const textCardCount = textCardCounts?.get(pageNumber) || 0;
    const result = layoutBentoPage(
      assets,
      index,
      pageNumber,
      contentRect,
      spacing,
      variant,
      forcedCount,
      textCardCount,
      forceTimeline || false,
    );

    // A manual slot override wins outright over the auto-computed
    // assignment: same rects/shapes (so the tiling stays a gap-free tile),
    // but whichever card ids the user swapped into place render there
    // instead. Ignored (falls back to natural order) unless it's an exact
    // permutation of this page's natural card ids - a stale override left
    // over from before a page-count/text-card change, for example.
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
    if (combinedPages.length % 2 !== 0) {
      combinedPages.push(
        blankPage(
          combinedPages.length + 1,
          pageDimensions.width * 2,
          pageDimensions.height,
        ),
      );
    }
    return combinedPages;
  }

  if (pages.length % 2 !== 0) {
    pages.push(blankPage(pages.length + 1, pageDimensions.width, pageDimensions.height));
  }

  return pages;
}

// A plain, photo-less page appended to keep the total page count even -
// most print binderies require it, since a book is printed and bound in
// sheets rather than single leaves.
function blankPage(pageNumber: number, width: number, height: number): Page {
  return { pageNumber, photos: [], width, height };
}
