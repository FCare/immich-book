import { t, type Language } from "../../i18n";
import { mmToPixels, pixelsToMm } from "../../utils/pageLayout";
import type { Printer } from "../PhotoGrid";
import { ToggleSwitch } from "../ToggleSwitch";

export interface SidebarLayoutSettingsProps {
  language: Language;
  margin: number;
  setMargin: (px: number) => void;
  isMarginValid: boolean;
  pageWidth: number;
  pageHeight: number;
  spacing: number;
  setSpacing: (px: number) => void;
  isSpacingValid: boolean;
  selectedPrinter: Printer;
  bleedEnabled: boolean;
  setBleedEnabled: (next: boolean) => void;
  bleed: number;
  setBleed: (px: number) => void;
  isBleedValid: boolean;
}

export function SidebarLayoutSettings({
  language,
  margin,
  setMargin,
  isMarginValid,
  pageWidth,
  pageHeight,
  spacing,
  setSpacing,
  isSpacingValid,
  selectedPrinter,
  bleedEnabled,
  setBleedEnabled,
  bleed,
  setBleed,
  isBleedValid,
}: SidebarLayoutSettingsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-5">
      <div>
        <label
          htmlFor="margin"
          className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
        >
          {t(language, "margin")}
        </label>
        <div className="flex items-center gap-1.5">
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
            className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
              isMarginValid
                ? "border-gray-200 dark:border-gray-700"
                : "border-red-500 bg-red-50 dark:bg-red-950/40"
            }`}
          />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            mm
          </span>
        </div>
      </div>
      <div>
        <label
          htmlFor="spacing"
          className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
        >
          {t(language, "spacing")}
        </label>
        <div className="flex items-center gap-1.5">
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
            className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
              isSpacingValid
                ? "border-gray-200 dark:border-gray-700"
                : "border-red-500 bg-red-50 dark:bg-red-950/40"
            }`}
          />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            mm
          </span>
        </div>
      </div>
      </div>
        <div>
          <ToggleSwitch
            checked={bleedEnabled}
            onChange={setBleedEnabled}
            disabled={selectedPrinter.constrained}
            label={t(language, "bleed")}
            sublabel={
              selectedPrinter.constrained
                ? selectedPrinter.bleedMm !== null
                  ? `${selectedPrinter.label} ${t(language, "bleedRequired")} ${selectedPrinter.bleedMm}${t(language, "bleedUnit")}`
                  : `${selectedPrinter.label} ${t(language, "bleedNotRequired")}`
                : t(language, "bleedHint")
            }
          />
        {bleedEnabled && (
          <div className="mt-3 flex items-center gap-1.5">
            <input
              type="number"
              id="bleed"
              value={Math.round(pixelsToMm(bleed))}
              disabled={selectedPrinter.constrained}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (!isNaN(value)) {
                  setBleed(mmToPixels(value));
                }
              }}
              min="0"
              max={Math.round(
                pixelsToMm(Math.min(pageWidth, pageHeight)) / 4,
              )}
              step="1"
              className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                isBleedValid
                  ? "border-gray-200 dark:border-gray-700"
                  : "border-red-500 bg-red-50 dark:bg-red-950/40"
              }`}
            />
            <span className="text-xs text-gray-400 dark:text-gray-500">
              mm
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
