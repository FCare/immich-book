import { memo, useMemo } from "react";
import type { AssetResponseDto } from "@immich/sdk";
import type { ImmichConfig } from "../types";
import { t, type Language } from "../i18n";
import type { Page } from "../utils/pageLayout";
import type {
  CardStyle,
  CoverLayout,
  FrameSize,
  PageBackground,
} from "../config/albumConfig";
import { pageBackgroundCss, SCRAPBOOK } from "./PhotoGrid";

export const PAGE_THUMB_WIDTH = 56;

// Same defaults as FrontCoverStandalone.tsx/BackCoverStandalone.tsx -
// keeps the "photo-title" thumbnail's card the same shape as the real
// one when the user hasn't resized it.
const DEFAULT_COVER_FRAME: FrameSize = { width: 0.84, height: 0.68 };
const DEFAULT_BACK_COVER_FRAME: FrameSize = { width: 0.42, height: 0.3 };

// "Scrapbook" cards sit inset from their own bento box (a mat border,
// tilt, tape - see the real page render in PhotoGrid.tsx), leaving the
// page background visible between photos; "clean" cards fill their box
// edge to edge. This is a plain pixel inset rather than a proportional
// one, and skips the tilt/tape entirely - at 56px wide neither would
// read as anything but noise - just enough to show the background
// showing through, which is the point being approximated here.
const SCRAPBOOK_THUMB_GAP = 1.5;

export interface PageNavRailProps {
  pages: Page[];
  showCover: boolean;
  coverAsset: AssetResponseDto | null;
  backCoverAsset: AssetResponseDto | null;
  coverLayout: CoverLayout;
  backCoverLayout: CoverLayout;
  coverFrameSize: FrameSize | null;
  backCoverFrameSize: FrameSize | null;
  missingAssetIds: Set<string>;
  immichConfig: ImmichConfig;
  language: Language;
  pageBackground: PageBackground;
  cardStyle: CardStyle;
}

function scrollToAnchor(anchor: string) {
  // Separated-cover mode renders front and back cover as a single
  // combined spread element, which can't carry two different
  // data-page-number values at once - data-page-nav-alt covers that
  // second anchor so "back cover" still resolves to the right element.
  document
    .querySelector(
      `[data-page-number="${anchor}"], [data-page-nav-alt="${anchor}"]`,
    )
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// A photo whose asset was detected missing from Immich has no valid
// thumbnail to load - showing an X instead of a broken-image icon
// matches the full-size placeholder used elsewhere for the same case
// (see isMissingPhoto in PhotoGrid.tsx).
function MissingPhotoMark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-red-100/70 dark:bg-red-950/40">
      <span className="text-red-500 dark:text-red-400 text-[10px] font-bold leading-none">
        ✕
      </span>
    </div>
  );
}

// `calculatePageLayout` rebuilds every Page (and nested photo/split
// array) from scratch on every call, even for pages whose content didn't
// actually change - so object identity is useless for caching here. This
// string is the real "did this page's thumbnail change" signal: two
// pages with the same photos in the same slots (missing-from-Immich
// status included) produce the same signature, letting PageThumbButton's
// memo skip re-rendering that thumbnail even though it received a
// brand-new `page` object.
export function pageSignature(page: Page, missingAssetIds: Set<string>): string {
  return page.photos
    .map((p) => {
      const missing = p.asset && missingAssetIds.has(p.asset.id) ? "M" : "";
      return `${p.id}:${Math.round(p.x)}:${Math.round(p.y)}:${Math.round(p.width)}:${Math.round(p.height)}${missing}`;
    })
    .join("|");
}

// A single page's bento layout, in miniature - reused both by the
// always-visible nav rail and by PhotoGrid's "pages with missing photos"
// panel, so the two read as the same object rather than two differently
// sized/styled approximations of the same page.
export const PageThumbButton = memo(
  function PageThumbButton({
    pageNumber,
    photos,
    scale,
    aspectRatio,
    title,
    immichConfig,
    pageBackground,
    cardStyle,
    missingAssetIds,
  }: {
    pageNumber: number;
    signature: string;
    photos: Page["photos"];
    scale: number;
    aspectRatio: string;
    title: string;
    immichConfig: ImmichConfig;
    pageBackground: PageBackground;
    cardStyle: CardStyle;
    missingAssetIds: Set<string>;
  }) {
    const gap = cardStyle === "scrapbook" ? SCRAPBOOK_THUMB_GAP : 0;
    return (
      <button
        onClick={() => scrollToAnchor(String(pageNumber))}
        title={title}
        className="flex-none rounded ring-1 ring-inset ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-indigo-500 transition-all overflow-hidden relative"
        style={{
          width: PAGE_THUMB_WIDTH,
          aspectRatio,
          ...pageBackgroundCss(pageBackground),
        }}
      >
        {photos.map((photo) => {
          if (!photo.asset) return null;
          const w = Math.max(1, photo.width * scale - gap * 2);
          const h = Math.max(1, photo.height * scale - gap * 2);
          const style = {
            left: photo.x * scale + gap,
            top: photo.y * scale + gap,
            width: w,
            height: h,
          };
          if (missingAssetIds.has(photo.asset.id)) {
            return (
              <div key={photo.id} className="absolute" style={style}>
                <MissingPhotoMark />
              </div>
            );
          }
          return (
            <img
              key={photo.id}
              src={`${immichConfig.baseUrl}/assets/${photo.asset.id}/thumbnail?size=thumbnail`}
              alt=""
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              className="absolute object-cover rounded-[1px]"
              style={style}
              // A photo can fail to load for reasons the missing-photo
              // sync hasn't caught yet - hide it rather than show the
              // browser's broken-image icon; the page background shows
              // through in its place.
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          );
        })}
      </button>
    );
  },
  // Ignores the `photos`/`immichConfig`/`missingAssetIds` object
  // references entirely - only re-renders when the page's actual content
  // (or the shared scale/aspect ratio/background/card style) changed.
  // This is the cache: as long as `signature` matches, React reuses last
  // render's output for this thumbnail untouched, however many other
  // pages were just edited.
  (prev, next) =>
    prev.signature === next.signature &&
    prev.scale === next.scale &&
    prev.aspectRatio === next.aspectRatio &&
    prev.pageBackground === next.pageBackground &&
    prev.cardStyle === next.cardStyle,
);

const CoverThumbButton = memo(
  function CoverThumbButton({
    anchor,
    assetId,
    isMissing,
    layout,
    frameSize,
    defaultFrame,
    aspectRatio,
    title,
    label,
    immichConfig,
    pageBackground,
  }: {
    anchor: string;
    assetId: string | null;
    isMissing: boolean;
    layout: CoverLayout;
    frameSize: FrameSize | null;
    defaultFrame: FrameSize;
    aspectRatio: string;
    title: string;
    label: string;
    immichConfig: ImmichConfig;
    pageBackground: PageBackground;
  }) {
    const missingMark = assetId && isMissing && <MissingPhotoMark />;
    const photoSrc = assetId && !isMissing
      ? `${immichConfig.baseUrl}/assets/${assetId}/thumbnail?size=thumbnail`
      : null;

    // "photo-title" mounts the photo on a small centered card, not full
    // bleed - mirroring that here (instead of always filling the whole
    // thumbnail) is the difference between a thumbnail that looks like
    // the real cover and one that just looks wrong for that layout.
    let content;
    if (layout === "full-bleed") {
      content = photoSrc ? (
        <img
          src={photoSrc}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : (
        missingMark || (
          <span className="absolute inset-0 flex items-center justify-center text-[8px] text-gray-400 dark:text-gray-500 text-center px-1 leading-tight">
            {label}
          </span>
        )
      );
    } else if (layout === "photo-title") {
      const { width, height } = frameSize ?? defaultFrame;
      const cardWidthPx = PAGE_THUMB_WIDTH * width;
      // Same formula as FrontCoverStandalone.tsx/BackCoverStandalone.tsx
      // (a pixel-based mat border, floored at 4px so it doesn't vanish
      // at small sizes) - matters more than usual here, since the real
      // card can be this small too.
      const insetFrac = Math.max(4, cardWidthPx * 0.045) / cardWidthPx;
      // The real card also reserves a caption strip below the photo,
      // whether or not there's a caption - approximated as a fixed
      // fraction rather than threading the actual text size through,
      // since at this scale a caption is never legible anyway.
      const captionFrac = 0.18;
      content = (
        <div
          className="absolute shadow-sm"
          style={{
            top: `${((1 - height) / 2) * 100}%`,
            left: `${((1 - width) / 2) * 100}%`,
            width: `${width * 100}%`,
            height: `${height * 100}%`,
            backgroundColor: SCRAPBOOK.mat,
          }}
        >
          {(photoSrc || missingMark) && (
            <div
              className="absolute overflow-hidden"
              style={{
                top: `${insetFrac * 100}%`,
                left: `${insetFrac * 100}%`,
                right: `${insetFrac * 100}%`,
                bottom: `${(insetFrac + captionFrac) * 100}%`,
              }}
            >
              {photoSrc ? (
                <img
                  src={photoSrc}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : (
                missingMark
              )}
            </div>
          )}
        </div>
      );
    } else {
      // "text-only" never mounts a photo, whether or not one is assigned.
      content = null;
    }

    return (
      <button
        onClick={() => scrollToAnchor(anchor)}
        title={title}
        className="flex-none rounded ring-1 ring-inset ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-indigo-500 transition-all overflow-hidden relative"
        style={{
          width: PAGE_THUMB_WIDTH,
          aspectRatio,
          ...pageBackgroundCss(pageBackground),
        }}
      >
        {content}
      </button>
    );
  },
  // Only the asset id (and its missing status) actually drive what
  // renders - coverAsset/backCoverAsset can be a new object reference on
  // unrelated re-renders even when they still point at the same photo.
  (prev, next) =>
    prev.assetId === next.assetId &&
    prev.isMissing === next.isMissing &&
    prev.layout === next.layout &&
    prev.frameSize === next.frameSize &&
    prev.aspectRatio === next.aspectRatio &&
    prev.pageBackground === next.pageBackground,
);

// Always-visible vertical rail of page thumbnails, docked to the right
// of the preview column - click one to jump straight to that page
// instead of scrolling through a long book. The front/back cover anchors
// stay pinned at the very top/bottom of the rail (they aren't part of
// `pages`, and shouldn't scroll away in a long book) - only the interior
// page thumbnails scroll, in their own middle section.
export function PageNavRail({
  pages,
  showCover,
  coverAsset,
  backCoverAsset,
  coverLayout,
  backCoverLayout,
  coverFrameSize,
  backCoverFrameSize,
  missingAssetIds,
  immichConfig,
  language,
  pageBackground,
  cardStyle,
}: PageNavRailProps) {
  // Recomputed only when the set of pages (or missing-photo status)
  // actually changes - cheap on its own, but its real job is handing
  // each PageThumbButton a stable primitive to compare against instead
  // of an ever-changing `page` object.
  const signatures = useMemo(
    () => pages.map((p) => pageSignature(p, missingAssetIds)),
    [pages, missingAssetIds],
  );
  if (pages.length === 0 && !showCover) return null;

  // Every page shares the same trim size - expressed as a CSS aspect
  // ratio (rather than a computed pixel height) so every thumbnail,
  // cover included, is guaranteed the exact same shape as the real page.
  const referenceWidth = pages[0]?.width ?? 1;
  const referenceHeight = pages[0]?.height ?? 1;
  const thumbAspectRatio = `${referenceWidth} / ${referenceHeight}`;
  const thumbScale = PAGE_THUMB_WIDTH / referenceWidth;

  return (
    <aside className="flex-none w-24 h-full border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col items-center">
      {showCover && (
        <div className="flex-none flex justify-center px-2 pt-3 pb-2">
          <CoverThumbButton
            anchor="cover"
            assetId={coverAsset?.id ?? null}
            isMissing={!!coverAsset && missingAssetIds.has(coverAsset.id)}
            layout={coverLayout}
            frameSize={coverFrameSize}
            defaultFrame={DEFAULT_COVER_FRAME}
            aspectRatio={thumbAspectRatio}
            title={t(language, "cover")}
            label={t(language, "cover")}
            immichConfig={immichConfig}
            pageBackground={pageBackground}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col items-center gap-2 px-2 py-2">
        {pages.map((page, i) => (
          <PageThumbButton
            key={page.pageNumber}
            pageNumber={page.pageNumber}
            signature={signatures[i]}
            photos={page.photos}
            scale={thumbScale}
            aspectRatio={thumbAspectRatio}
            title={`${t(language, "pageOf")} ${page.pageNumber}`}
            immichConfig={immichConfig}
            pageBackground={pageBackground}
            cardStyle={cardStyle}
            missingAssetIds={missingAssetIds}
          />
        ))}
      </div>

      {showCover && (
        <div className="flex-none flex justify-center px-2 pt-2 pb-3">
          <CoverThumbButton
            anchor="back-cover"
            assetId={backCoverAsset?.id ?? null}
            isMissing={
              !!backCoverAsset && missingAssetIds.has(backCoverAsset.id)
            }
            layout={backCoverLayout}
            frameSize={backCoverFrameSize}
            defaultFrame={DEFAULT_BACK_COVER_FRAME}
            aspectRatio={thumbAspectRatio}
            title={t(language, "backCoverLabel")}
            label={t(language, "backCoverLabel")}
            immichConfig={immichConfig}
            pageBackground={pageBackground}
          />
        </div>
      )}
    </aside>
  );
}
