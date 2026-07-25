import type { Dispatch, SetStateAction } from "react";
import type { AssetResponseDto } from "@immich/sdk";
import type { ImmichConfig } from "../../types";
import { t, type Language } from "../../i18n";
import type { CoverLayout, PageBackground } from "../../config/albumConfig";
import type { HistoryOperation } from "../../history/editHistory";
import { pageBackgroundCss, SCRAPBOOK, toPoints, type NewAssetTarget } from "../PhotoGrid";

export interface BackCoverStandaloneProps {
  validPageWidth: number;
  validPageHeight: number;
  bleedEnabled: boolean;
  validBleed: number;
  previewWidth: number;
  backCoverText: string;
  setBackCoverText: (text: string) => void;
  setHistory: Dispatch<SetStateAction<HistoryOperation[]>>;
  swapFirstId: string | null;
  language: Language;
  selectedNewAsset: AssetResponseDto | null;
  backCoverAsset: AssetResponseDto | null;
  pageBackground: PageBackground;
  handleReorderPointerDown: (id: string, e: React.PointerEvent) => void;
  performNewAssetPlacement: (
    newAsset: AssetResponseDto,
    target: NewAssetTarget,
  ) => void;
  backCoverLayout: CoverLayout;
  immichConfig: ImmichConfig;
  backCoverPlainText: boolean;
  fontSize: number;
}

export function BackCoverStandalone({
  validPageWidth,
  validPageHeight,
  bleedEnabled,
  validBleed,
  previewWidth,
  backCoverText,
  setBackCoverText,
  setHistory,
  swapFirstId,
  language,
  selectedNewAsset,
  backCoverAsset,
  pageBackground,
  handleReorderPointerDown,
  performNewAssetPlacement,
  backCoverLayout,
  immichConfig,
  backCoverPlainText,
  fontSize,
}: BackCoverStandaloneProps) {
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
      onPointerDown={(e) => e.stopPropagation()}
      className={`text-center bg-transparent focus:outline-none rounded w-[90%] ${extraClassName}`}
      style={{
        fontFamily: "Caveat",
        fontWeight: 500,
        fontSize: `${fontSizePx}px`,
        color,
      }}
    />
  );
  const isBackCoverSwapSelected = swapFirstId === "back-cover";
  return (
    <div className="relative">
      <div className="text-center mb-2">
        <span className="inline-block px-3 py-1 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 text-sm rounded-full font-medium">
          {t(language, "backCoverLabel")}
        </span>
      </div>
      <div
        className={`mx-auto relative shadow-lg dark:shadow-black/40 border border-gray-200 dark:border-gray-800 ${selectedNewAsset && backCoverAsset ? "ring-4 ring-green-400 ring-offset-2" : ""}`}
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
           data-reorder-asset-id="back-cover"
           className={`absolute ${selectedNewAsset ? "cursor-pointer" : "cursor-move"} ${selectedNewAsset && backCoverAsset ? "hover:ring-2 hover:ring-green-400" : ""} ${isBackCoverSwapSelected ? "ring-4 ring-indigo-500 ring-offset-2" : ""}`}
           style={{
             top: bleedPreviewPt,
             left: bleedPreviewPt,
             width: displayWidth,
             height: displayHeight,
             touchAction: "none",
           }}
           onPointerDown={(e) => {
             if (!selectedNewAsset) handleReorderPointerDown("back-cover", e);
           }}
           onClick={() => {
             if (selectedNewAsset && backCoverAsset) {
               performNewAssetPlacement(selectedNewAsset, { kind: "back-cover" });
             }
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
                  onPointerDown={(e) => e.stopPropagation()}
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
                  onPointerDown={(e) => e.stopPropagation()}
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
}
