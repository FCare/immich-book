import { t, type Language } from "../../i18n";
import { mmToPixels, pixelsToMm } from "../../utils/pageLayout";
import { PRINTERS, type Printer } from "../PhotoGrid";

export interface SidebarPageSettingsProps {
  language: Language;
  printerId: string;
  handleSelectPrinter: (id: string) => void;
  selectedPrinter: Printer;
  formatCategory: string;
  handleSelectCategory: (category: string) => void;
  pageWidth: number;
  setPageWidth: (px: number) => void;
  pageHeight: number;
  setPageHeight: (px: number) => void;
  isPageWidthValid: boolean;
  isPageHeightValid: boolean;
}

export function SidebarPageSettings({
  language,
  printerId,
  handleSelectPrinter,
  selectedPrinter,
  formatCategory,
  handleSelectCategory,
  pageWidth,
  setPageWidth,
  pageHeight,
  setPageHeight,
  isPageWidthValid,
  isPageHeightValid,
}: SidebarPageSettingsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          {t(language, "printer")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PRINTERS.map((printer) => {
            const active = printer.id === printerId;
            return (
              <button
                key={printer.id}
                onClick={() => handleSelectPrinter(printer.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                {printer.logo && (
                  <img
                    src={printer.logo}
                    alt=""
                    className="h-3.5 w-auto max-w-[60px] object-contain bg-white rounded-sm px-0.5"
                  />
                )}
                {printer.label}
              </button>
            );
          })}
        </div>
        {selectedPrinter.note && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {selectedPrinter.note}
          </p>
        )}
      </div>
      {(() => {
        const categories = Array.from(
          new Set(selectedPrinter.formats.map((f) => f.category)),
        );
        return (
          categories.length > 1 && (
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                {t(language, "category")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => handleSelectCategory(category)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      category === formatCategory
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )
        );
      })()}
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          {t(language, "format")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {selectedPrinter.formats
            .filter((p) => p.category === formatCategory)
            .map((p) => {
              const active =
                Math.abs(p.widthMm - pixelsToMm(pageWidth)) < 0.1 &&
                Math.abs(p.heightMm - pixelsToMm(pageHeight)) < 0.1;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    setPageWidth(mmToPixels(p.widthMm));
                    setPageHeight(mmToPixels(p.heightMm));
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    active
                      ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-5">
        <div>
          <label
            htmlFor="pageWidth"
            className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
          >
            {t(language, "width")}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              id="pageWidth"
              value={Math.round(pixelsToMm(pageWidth) * 1000) / 1000}
              disabled={selectedPrinter.constrained}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (!isNaN(value)) {
                  setPageWidth(mmToPixels(value));
                }
              }}
              min={Math.round(pixelsToMm(1000))}
              max={Math.round(pixelsToMm(10000))}
              step="1"
              className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                isPageWidthValid
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
            htmlFor="pageHeight"
            className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
          >
            {t(language, "height")}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              id="pageHeight"
              value={Math.round(pixelsToMm(pageHeight) * 1000) / 1000}
              disabled={selectedPrinter.constrained}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (!isNaN(value)) {
                  setPageHeight(mmToPixels(value));
                }
              }}
              min={Math.round(pixelsToMm(1000))}
              max={Math.round(pixelsToMm(10000))}
              step="1"
              className={`px-2.5 py-1.5 w-20 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                isPageHeightValid
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
    </div>
  );
}
