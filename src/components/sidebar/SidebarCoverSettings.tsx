import type { Dispatch, SetStateAction } from "react";
import type { AlbumResponseDto, AssetResponseDto } from "@immich/sdk";
import { t, type Language } from "../../i18n";
import type { CoverLayout } from "../../config/albumConfig";
import type { HistoryOperation } from "../../history/editHistory";
import { COVER_LAYOUTS } from "../PhotoGrid";
import { ToggleSwitch } from "../ToggleSwitch";

export interface SidebarCoverSettingsProps {
  language: Language;
  album: AlbumResponseDto;
  separatedCover: boolean;
  setSeparatedCover: (next: boolean) => void;
  spineWidth: number;
  setSpineWidth: (n: number) => void;
  spineColor: string;
  setSpineColor: (c: string) => void;
  spineTextColor: string;
  setSpineTextColor: (c: string) => void;
  spineTextSize: number;
  setSpineTextSize: (n: number) => void;
  spineTitle: string;
  setSpineTitle: (s: string) => void;
  coverTitle: string;
  setCoverTitle: (s: string) => void;
  setHistory: Dispatch<SetStateAction<HistoryOperation[]>>;
  coverLayout: CoverLayout;
  setCoverLayout: (layout: CoverLayout) => void;
  backCoverLayout: CoverLayout;
  setBackCoverLayout: (layout: CoverLayout) => void;
  backCoverAsset: AssetResponseDto | null;
  backCoverNoPhoto: boolean;
  setBackCoverNoPhoto: (next: boolean) => void;
  backCoverPlainText: boolean;
  setBackCoverPlainText: (next: boolean) => void;
}

export function SidebarCoverSettings({
  language,
  album,
  separatedCover,
  setSeparatedCover,
  spineWidth,
  setSpineWidth,
  spineColor,
  setSpineColor,
  spineTextColor,
  setSpineTextColor,
  spineTextSize,
  setSpineTextSize,
  spineTitle,
  setSpineTitle,
  coverTitle,
  setCoverTitle,
  setHistory,
  coverLayout,
  setCoverLayout,
  backCoverLayout,
  setBackCoverLayout,
  backCoverAsset,
  backCoverNoPhoto,
  setBackCoverNoPhoto,
  backCoverPlainText,
  setBackCoverPlainText,
}: SidebarCoverSettingsProps) {
  return (
    <div className="flex flex-col gap-5">
      <ToggleSwitch
        checked={separatedCover}
        onChange={setSeparatedCover}
        label={t(language, "separatedCover")}
        sublabel={t(language, "separatedCoverHint")}
      />
      {separatedCover && (
        <>
          <div>
            <label
              htmlFor="spineWidth"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
            >
              {t(language, "spineWidth")}
            </label>
            <input
              type="number"
              id="spineWidth"
              value={spineWidth}
              onChange={(e) => setSpineWidth(Number(e.target.value))}
              min="5"
              max="50"
              step="1"
              className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-24"
            />
          </div>
          <div>
            <label
              htmlFor="spineColor"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
            >
              {t(language, "spineColor")}
            </label>
            <input
              type="color"
              id="spineColor"
              value={spineColor}
              onChange={(e) => setSpineColor(e.target.value)}
              className="h-10 w-24 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
            />
          </div>
          <div>
            <label
              htmlFor="spineTextColor"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
            >
              {t(language, "spineTextColor")}
            </label>
            <input
              type="color"
              id="spineTextColor"
              value={spineTextColor}
              onChange={(e) => setSpineTextColor(e.target.value)}
              className="h-10 w-24 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
            />
          </div>
          <div>
            <label
              htmlFor="spineTextSize"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
            >
              {t(language, "spineTextSize")}
            </label>
            <input
              type="number"
              id="spineTextSize"
              value={spineTextSize}
              onChange={(e) => setSpineTextSize(Number(e.target.value))}
              min="8"
              max="48"
              step="1"
              className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-20"
            />
            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">pt</span>
          </div>
          <div>
            <label
              htmlFor="spineTitle"
              className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
            >
              {t(language, "spineTitle")}
            </label>
            <input
              type="text"
              id="spineTitle"
              value={spineTitle}
              onChange={(e) => setSpineTitle(e.target.value)}
              placeholder={album.albumName}
              className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
            />
          </div>
        </>
      )}
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
            backCoverNoPhoto ? (
              <button
                onClick={() => {
                  console.log(`[RESTORE] Restauration de la photo de 4ème de couverture : ${backCoverAsset.originalFileName} (ID: ${backCoverAsset.id})`);
                  setBackCoverNoPhoto(false);
                  setHistory((prev) => [
                    {
                      type: "restore-back-cover-photo",
                      timestamp: Date.now(),
                    },
                    ...prev,
                  ]);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                {t(language, "restorePhoto")}
              </button>
            ) : (
              <button
                onClick={() => {
                  console.log(`[REMOVE] Retrait de la photo de 4ème de couverture : ${backCoverAsset.originalFileName} (ID: ${backCoverAsset.id})`);
                  setBackCoverNoPhoto(true);
                  setHistory((prev) => [
                    {
                      type: "remove-back-cover-photo",
                      assetId: backCoverAsset.id,
                      assetName: backCoverAsset.originalFileName,
                      timestamp: Date.now(),
                    },
                    ...prev,
                  ]);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                {t(language, "removePhoto")}
              </button>
            )
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t(language, "noPhotoHover")}
            </p>
          )}
        </div>
      )}
      {backCoverLayout === "photo-title" && (
        <ToggleSwitch
          checked={backCoverPlainText}
          onChange={setBackCoverPlainText}
          label={t(language, "plainBackCoverText")}
          sublabel={t(language, "plainBackCoverTextHint")}
        />
      )}
    </div>
  );
}
