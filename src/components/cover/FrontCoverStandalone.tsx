import type { Dispatch, SetStateAction } from "react";
import type { AlbumResponseDto, AssetResponseDto } from "@immich/sdk";
import type { ImmichConfig } from "../../types";
import { t, type Language } from "../../i18n";
import type { CoverLayout, FocalPoint, PageBackground } from "../../config/albumConfig";
import type { HistoryOperation } from "../../history/editHistory";
import { focalPointToCss, pageBackgroundCss, SCRAPBOOK, toPoints, type NewAssetTarget } from "../PhotoGrid";

export interface FrontCoverStandaloneProps {
  validPageWidth: number;
  validPageHeight: number;
  bleedEnabled: boolean;
  validBleed: number;
  previewWidth: number;
  coverAsset: AssetResponseDto | null;
  coverFocalPoint: FocalPoint | null;
  immichConfig: ImmichConfig;
  swapFirstId: string | null;
  coverTitle: string;
  setCoverTitle: (title: string) => void;
  setHistory: Dispatch<SetStateAction<HistoryOperation[]>>;
  album: AlbumResponseDto;
  language: Language;
  pageBackground: PageBackground;
  coverLayout: CoverLayout;
  selectedNewAsset: AssetResponseDto | null;
  handleReorderPointerDown: (id: string, e: React.PointerEvent, croppable?: boolean) => void;
  performNewAssetPlacement: (
    newAsset: AssetResponseDto,
    target: NewAssetTarget,
  ) => void;
}

export function FrontCoverStandalone({
  validPageWidth,
  validPageHeight,
  bleedEnabled,
  validBleed,
  previewWidth,
  coverAsset,
  coverFocalPoint,
  immichConfig,
  swapFirstId,
  coverTitle,
  setCoverTitle,
  setHistory,
  album,
  language,
  pageBackground,
  coverLayout,
  selectedNewAsset,
  handleReorderPointerDown,
  performNewAssetPlacement,
}: FrontCoverStandaloneProps) {
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
  const isCoverSwapSelected = swapFirstId === "cover";
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
                data-reorder-asset-id="cover"
                className={`w-full h-full object-contain ${selectedNewAsset ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-move"} ${isCoverSwapSelected ? "ring-4 ring-indigo-500 ring-offset-2" : ""}`}
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  if (!selectedNewAsset) handleReorderPointerDown("cover", e);
                }}
                onClick={(e) => {
                  if (selectedNewAsset && coverAsset) {
                    e.stopPropagation();
                    performNewAssetPlacement(selectedNewAsset, { kind: "cover" });
                  }
                }}
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
              data-reorder-asset-id="cover"
              className={`absolute inset-0 w-full h-full object-cover ${selectedNewAsset ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-move"} ${isCoverSwapSelected ? "ring-4 ring-indigo-500 ring-offset-2" : ""}`}
              style={{
                touchAction: "none",
                objectPosition: focalPointToCss(coverFocalPoint),
              }}
              onPointerDown={(e) => {
                if (!selectedNewAsset) handleReorderPointerDown("cover", e, true);
              }}
              onClick={(e) => {
                if (selectedNewAsset && coverAsset) {
                  e.stopPropagation();
                  performNewAssetPlacement(selectedNewAsset, { kind: "cover" });
                }
              }}
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
}
