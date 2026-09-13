import type { Dispatch, SetStateAction } from "react";
import type { AlbumResponseDto, AssetResponseDto } from "@immich/sdk";
import type { ImmichConfig } from "../../types";
import { t, type Language } from "../../i18n";
import type { CoverLayout, FocalPoint, FrameSize, PageBackground } from "../../config/albumConfig";
import type { HistoryOperation } from "../../history/editHistory";
import { mmToPixels } from "../../utils/pageLayout";
import {
  backCoverCardGeometry,
  DEFAULT_BACK_COVER_FRAME_WIDTH,
  DEFAULT_BACK_COVER_FRAME_HEIGHT,
} from "../../utils/backCoverLayout";
import { focalPointToCss, pageBackgroundCss, SCRAPBOOK, toPoints, type NewAssetTarget } from "../PhotoGrid";

export interface CoverSpreadProps {
  validPageWidth: number;
  validPageHeight: number;
  spineWidth: number;
  bleedEnabled: boolean;
  validBleed: number;
  previewWidth: number;
  coverAsset: AssetResponseDto | null;
  backCoverAsset: AssetResponseDto | null;
  coverFocalPoint: FocalPoint | null;
  backCoverFocalPoint: FocalPoint | null;
  coverFrameSize: FrameSize | null;
  backCoverFrameSize: FrameSize | null;
  onFrameResizePointerDown: (
    target: "cover" | "back-cover",
    e: React.PointerEvent,
    currentWidth: number,
    currentHeight: number,
    availWidth: number,
    availHeight: number,
    scale: number,
  ) => void;
  pageBackground: PageBackground;
  immichConfig: ImmichConfig;
  selectedNewAsset: AssetResponseDto | null;
  swapFirstId: string | null;
  handleReorderPointerDown: (id: string, e: React.PointerEvent, croppable?: boolean) => void;
  performNewAssetPlacement: (
    newAsset: AssetResponseDto,
    target: NewAssetTarget,
  ) => void;
  backCoverLayout: CoverLayout;
  backCoverText: string;
  setBackCoverText: (text: string) => void;
  backCoverTextSize: number;
  setHistory: Dispatch<SetStateAction<HistoryOperation[]>>;
  language: Language;
  spineColor: string;
  spineTextSize: number;
  spineTextColor: string;
  spineTitle: string;
  album: AlbumResponseDto;
  coverLayout: CoverLayout;
  coverTitle: string;
  setCoverTitle: (title: string) => void;
  coverTextSize: number;
}

export function CoverSpread({
  validPageWidth,
  validPageHeight,
  spineWidth,
  bleedEnabled,
  validBleed,
  previewWidth,
  coverAsset,
  backCoverAsset,
  coverFocalPoint,
  backCoverFocalPoint,
  coverFrameSize,
  backCoverFrameSize,
  onFrameResizePointerDown,
  pageBackground,
  immichConfig,
  selectedNewAsset,
  swapFirstId,
  handleReorderPointerDown,
  performNewAssetPlacement,
  backCoverLayout,
  backCoverText,
  setBackCoverText,
  backCoverTextSize,
  setHistory,
  language,
  spineColor,
  spineTextSize,
  spineTextColor,
  spineTitle,
  album,
  coverLayout,
  coverTitle,
  setCoverTitle,
  coverTextSize,
}: CoverSpreadProps) {
  const displayWidth = toPoints(validPageWidth);
  const displayHeight = toPoints(validPageHeight);
  const spineWidthPt = toPoints(mmToPixels(spineWidth)); // Convert mm → px → points
  const separatedWidth = displayWidth * 2 + spineWidthPt;
  const bleedPreviewPt = bleedEnabled ? toPoints(validBleed) : 0;
  // Force scale to 0.5 so the wide combined page doesn't push everything aside
  const baseScale = previewWidth > 0
    ? Math.min(1, previewWidth / (displayWidth + bleedPreviewPt * 2))
    : 1;
  const scale = baseScale * 0.5;

  const coverImageUrl = coverAsset
    ? `${immichConfig.baseUrl}/assets/${coverAsset.id}/thumbnail?size=preview`
    : null;
  // A note of pure whitespace prints as nothing, so it reserves no
  // strip under the photo either - see backCoverCaptionStripHeight.
  const hasBackCoverText = backCoverText.trim().length > 0;
  const backCoverImageUrl = backCoverAsset
    ? `${immichConfig.baseUrl}/assets/${backCoverAsset.id}/thumbnail?size=preview`
    : null;

  // On a separated cover the two panels bleed outwards only: the front
  // panel's left edge and the back panel's right edge butt against the
  // spine, where there is nothing to trim. Same split the PDF makes
  // (renderBackCoverContent's "outer" bleed mode).
  const bleedPx = bleedPreviewPt * scale;

  return (
    <div
      className="relative flex-shrink-0 shadow-lg mx-auto"
      style={{
        width: `${(separatedWidth + bleedPreviewPt * 2) * scale}px`,
        height: `${(displayHeight + bleedPreviewPt * 2) * scale}px`,
        backgroundColor: bleedEnabled ? "#E5E7EB" : "transparent",
      }}
    >
      <div
        className="absolute bg-white dark:bg-gray-900"
        style={{
          top: `${bleedPreviewPt * scale}px`,
          left: `${bleedPreviewPt * scale}px`,
          width: `${separatedWidth * scale}px`,
          height: `${displayHeight * scale}px`,
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Back Cover (left) */}
        <div
          data-reorder-asset-id="back-cover"
          className={`relative border-r border-gray-300 dark:border-gray-700 ${selectedNewAsset ? "cursor-pointer" : "cursor-move"} ${selectedNewAsset && backCoverAsset ? "hover:ring-2 hover:ring-green-400" : ""} ${swapFirstId === "back-cover" ? "ring-4 ring-indigo-500 ring-offset-2 z-10" : ""}`}
          style={{
            width: `${displayWidth * scale}px`,
            height: `${displayHeight * scale}px`,
            touchAction: "none",
            ...pageBackgroundCss(pageBackground),
          }}
          onPointerDown={(e) => {
            if (!selectedNewAsset) handleReorderPointerDown("back-cover", e, backCoverLayout === "full-bleed");
          }}
          onClick={() => {
            if (selectedNewAsset && backCoverAsset) {
              performNewAssetPlacement(selectedNewAsset, { kind: "back-cover" });
            }
          }}
        >
          {backCoverLayout === "text-only" && (
            // The two rules framing the note were missing from this view
            // entirely - the standalone preview and the PDF both draw
            // them, so a separated-cover book showed a bare note here
            // and a framed one once exported.
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{
                gap: `${16 * scale}px`,
                paddingLeft: "10%",
                paddingRight: "10%",
              }}
            >
              <div
                style={{
                  width: displayWidth * scale * 0.3,
                  height: 1,
                  backgroundColor: SCRAPBOOK.ink,
                  opacity: 0.3,
                }}
              />
              <input
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
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-center bg-transparent focus:outline-none rounded w-[90%]"
                style={{
                  fontFamily: "Caveat",
                  fontWeight: 500,
                  fontSize: `${backCoverTextSize * scale}px`,
                  color: SCRAPBOOK.ink,
                }}
              />
              <div
                style={{
                  width: displayWidth * scale * 0.3,
                  height: 1,
                  backgroundColor: SCRAPBOOK.ink,
                  opacity: 0.3,
                }}
              />
            </div>
          )}

          {backCoverLayout === "photo-title" &&
            (backCoverImageUrl || backCoverText) &&
            (() => {
              // A small centered card, matching BackCoverStandalone.tsx's
              // "photo-title" layout exactly (this used to be the front
              // cover's full mat convention instead - inconsistent with
              // how the back cover actually looks outside separated-cover
              // mode). Positions are in this panel's own already-scaled
              // pixel space (this component sizes its boxes down via
              // `scale` directly rather than CSS zoom, unlike the
              // standalone cover components).
              // This panel sizes its own boxes down by `scale` rather
              // than leaving it to CSS `zoom`, so every length handed to
              // the shared geometry has to be in that same already-
              // scaled space. The strip under the photo used to be
              // `cardHeight * 0.22` here - a third rule, agreeing with
              // neither the standalone preview nor the PDF.
              const cardWidthFrac =
                backCoverFrameSize?.width ?? DEFAULT_BACK_COVER_FRAME_WIDTH;
              const cardHeightFrac =
                backCoverFrameSize?.height ?? DEFAULT_BACK_COVER_FRAME_HEIGHT;
              const {
                cardWidth,
                cardHeight,
                cardTop,
                cardLeft,
                frameInset,
                captionStripHeight,
                captionTextBoxHeight,
              } = backCoverCardGeometry(
                displayWidth * scale,
                displayHeight * scale,
                backCoverFrameSize,
                backCoverTextSize * scale,
                hasBackCoverText,
              );
              return (
                <div
                  className="group absolute shadow-lg"
                  style={{
                    top: `${cardTop}px`,
                    left: `${cardLeft}px`,
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                    backgroundColor: SCRAPBOOK.mat,
                  }}
                >
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onFrameResizePointerDown(
                        "back-cover",
                        e,
                        cardWidthFrac,
                        cardHeightFrac,
                        validPageWidth,
                        validPageHeight,
                        scale,
                      );
                    }}
                    title={t(language, "resizeCoverFrameHint")}
                    className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-indigo-500 text-white shadow-md flex items-center justify-center cursor-nwse-resize"
                    style={{ touchAction: "none" }}
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M6 18L18 6M10 18h8v-8" />
                    </svg>
                  </div>
                  {backCoverImageUrl && (
                    <div
                      className="absolute overflow-hidden"
                      style={{
                        top: `${frameInset}px`,
                        left: `${frameInset}px`,
                        right: `${frameInset}px`,
                        bottom: `${frameInset + captionStripHeight}px`,
                      }}
                    >
                      <img
                        src={backCoverImageUrl}
                        alt="Back cover"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <input
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
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    // See BackCoverStandalone: always mounted, and a
                    // hover-only overlay claiming no layout space while
                    // the note is empty.
                    className={`absolute text-center focus:outline-none rounded transition-opacity ${
                      hasBackCoverText
                        ? "bg-transparent focus:bg-white/70"
                        : "opacity-0 pointer-events-none group-hover:opacity-70 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto bg-white/80"
                    }`}
                    style={{
                      left: `${frameInset}px`,
                      right: `${frameInset}px`,
                      bottom: backCoverImageUrl ? `${frameInset * 0.3}px` : undefined,
                      top: backCoverImageUrl ? undefined : 0,
                      height: `${backCoverImageUrl ? captionTextBoxHeight : cardHeight}px`,
                      fontFamily: "Caveat",
                      fontWeight: 500,
                      fontSize: `${backCoverTextSize * scale}px`,
                      color: SCRAPBOOK.ink,
                    }}
                  />
                </div>
              );
            })()}

          {backCoverLayout === "full-bleed" && backCoverImageUrl && (
            <>
              <img
                src={backCoverImageUrl}
                alt="Back cover"
                className="absolute object-cover max-w-none"
                style={{
                  top: -bleedPx,
                  left: -bleedPx,
                  width: `${displayWidth * scale + bleedPx}px`,
                  height: `${displayHeight * scale + bleedPx * 2}px`,
                  objectPosition: focalPointToCss(backCoverFocalPoint),
                }}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  left: -bleedPx,
                  bottom: -bleedPx,
                  width: `${displayWidth * scale + bleedPx}px`,
                  height: `${displayHeight * scale * 0.28 + bleedPx}px`,
                  background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
                }}
              />
              <div
                className="absolute inset-x-0 bottom-0 flex items-center justify-center"
                style={{ height: `${displayHeight * scale * 0.28}px` }}
              >
                <input
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
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-center bg-transparent focus:outline-none rounded w-[90%] text-white"
                  style={{
                    fontFamily: "Caveat",
                    fontWeight: 600,
                    fontSize: `${backCoverTextSize * scale}px`,
                  }}
                />
              </div>
            </>
          )}

          {!backCoverImageUrl && backCoverLayout !== "text-only" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gray-400 text-xs">{t(language, "backCover")}</span>
            </div>
          )}
        </div>

        {/* Spine (middle) */}
        <div
          className="relative flex items-center justify-center"
          style={{
            width: `${spineWidthPt * scale}px`,
            height: `${displayHeight * scale}px`,
            backgroundColor: spineColor,
          }}
        >
          <span
            className="font-semibold whitespace-nowrap"
            style={{
              transform: "rotate(-90deg)",
              fontFamily: "Caveat",
              fontSize: `${spineTextSize * scale}px`,
              color: spineTextColor,
            }}
          >
            {spineTitle || album.albumName}
          </span>
        </div>

        {/* Front Cover (right) */}
        <div
          data-reorder-asset-id="cover"
          className={`relative border-l border-gray-300 dark:border-gray-700 ${selectedNewAsset ? "cursor-pointer" : "cursor-move"} ${selectedNewAsset && coverAsset ? "hover:ring-2 hover:ring-green-400" : ""} ${swapFirstId === "cover" ? "ring-4 ring-indigo-500 ring-offset-2 z-10" : ""}`}
          style={{
            width: `${displayWidth * scale}px`,
            height: `${displayHeight * scale}px`,
            touchAction: "none",
            ...pageBackgroundCss(pageBackground),
          }}
          onPointerDown={(e) => {
            // Every layout that crops its photo is pannable - only
            // "text-only" has no photo to pan.
            if (!selectedNewAsset) handleReorderPointerDown("cover", e, coverLayout !== "text-only");
          }}
          onClick={() => {
            if (selectedNewAsset && coverAsset) {
              performNewAssetPlacement(selectedNewAsset, { kind: "cover" });
            }
          }}
        >
          {coverLayout === "text-only" && (
            <div className="absolute inset-0 flex items-center justify-center">
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
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-center bg-transparent focus:outline-none rounded w-[80%] text-gray-700 dark:text-gray-300"
                style={{
                  fontFamily: "Caveat",
                  fontWeight: 600,
                  fontSize: `${coverTextSize * scale}px`,
                }}
              />
            </div>
          )}

          {coverLayout === "photo-title" && coverImageUrl && (() => {
            // Same mat convention as FrontCoverStandalone.tsx, including
            // the even-padding fix (see there for why plain CSS
            // `padding: %` reads as an uneven border on a non-square
            // frame) and the configurable frame size.
            const frameWidthFrac = coverFrameSize?.width ?? 0.84;
            const frameHeightFrac = coverFrameSize?.height ?? 0.68;
            const availTopFrac = 0.08;
            const availHeightFrac = 0.68;
            const frameLeftFrac = (1 - frameWidthFrac) / 2;
            const frameTopFrac = availTopFrac + (availHeightFrac - frameHeightFrac) / 2;
            const frameWidthPx = displayWidth * frameWidthFrac * scale;
            const frameHeightPx = displayHeight * frameHeightFrac * scale;
            const matPaddingPx = Math.min(frameWidthPx, frameHeightPx) * 0.03;
            return (
              <>
                {/* Outer wrapper carries no overflow clipping, so the
                    resize handle (deliberately positioned half outside the
                    frame's own corner) stays visible/clickable - only the
                    inner mat clips the photo. */}
                <div
                  className="absolute"
                  style={{
                    top: `${frameTopFrac * 100}%`,
                    left: `${frameLeftFrac * 100}%`,
                    width: `${frameWidthFrac * 100}%`,
                    height: `${frameHeightFrac * 100}%`,
                  }}
                >
                  <div
                    className="absolute inset-0 shadow-lg overflow-hidden"
                    style={{
                      backgroundColor: SCRAPBOOK.mat,
                      padding: `${matPaddingPx}px`,
                    }}
                  >
                    {/* Cropped to fill the mat window around the focal
                        point, as the standalone preview and the PDF both
                        do - see FrontCoverStandalone for why. */}
                    <img
                      src={coverImageUrl}
                      alt="Front cover"
                      className="w-full h-full object-cover"
                      style={{
                        objectPosition: focalPointToCss(coverFocalPoint),
                      }}
                    />
                  </div>
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onFrameResizePointerDown(
                        "cover",
                        e,
                        frameWidthFrac,
                        frameHeightFrac,
                        validPageWidth,
                        validPageHeight,
                        scale,
                      );
                    }}
                    title={t(language, "resizeCoverFrameHint")}
                    className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-indigo-500 text-white shadow-md flex items-center justify-center cursor-nwse-resize"
                    style={{ touchAction: "none" }}
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M6 18L18 6M10 18h8v-8" />
                    </svg>
                  </div>
                </div>
                <div
                  className="absolute inset-x-0 bottom-0 flex items-center justify-center"
                  style={{ height: "20%" }}
                >
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
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-center bg-transparent focus:outline-none focus:bg-white/60 rounded w-[90%]"
                    style={{
                      fontFamily: "Caveat",
                      fontWeight: 600,
                      fontSize: `${coverTextSize * scale}px`,
                      color: SCRAPBOOK.ink,
                    }}
                  />
                </div>
              </>
            );
          })()}

          {coverLayout === "full-bleed" && coverImageUrl && (
            <>
              <img
                src={coverImageUrl}
                alt="Front cover"
                className="absolute object-cover max-w-none"
                style={{
                  top: -bleedPx,
                  left: 0,
                  width: `${displayWidth * scale + bleedPx}px`,
                  height: `${displayHeight * scale + bleedPx * 2}px`,
                  objectPosition: focalPointToCss(coverFocalPoint),
                }}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  left: 0,
                  bottom: -bleedPx,
                  width: `${displayWidth * scale + bleedPx}px`,
                  height: `${displayHeight * scale * 0.28 + bleedPx}px`,
                  background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
                }}
              />
              <div
                className="absolute inset-x-0 bottom-0 flex items-center justify-center"
                style={{ height: `${displayHeight * scale * 0.28}px` }}
              >
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
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-center bg-transparent focus:outline-none rounded w-[90%] text-white"
                  style={{
                    fontFamily: "Caveat",
                    fontWeight: 600,
                    fontSize: `${coverTextSize * scale}px`,
                  }}
                />
              </div>
            </>
          )}

          {!coverImageUrl && coverLayout !== "text-only" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gray-400 text-xs">{t(language, "frontCover")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Label */}
      <div className="absolute -top-8 left-0 right-0 text-center">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {t(language, "separatedCover")}
        </span>
      </div>
    </div>
  );
}
