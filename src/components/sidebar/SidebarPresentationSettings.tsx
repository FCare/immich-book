import { t, type Language } from "../../i18n";
import type { CardStyle, PageBackground } from "../../config/albumConfig";
import {
  CARD_STYLES,
  PAGE_BACKGROUNDS,
  PAGE_BACKGROUND_GROUPS,
  SCRAPBOOK,
} from "../PhotoGrid";
import { ToggleSwitch } from "../ToggleSwitch";

export interface SidebarPresentationSettingsProps {
  language: Language;
  forceTimeline: boolean;
  setForceTimeline: (next: boolean) => void;
  showDates: boolean;
  setShowDates: (next: boolean) => void;
  showCaptions: boolean;
  setShowCaptions: (next: boolean) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  cardStyle: CardStyle;
  setCardStyle: (style: CardStyle) => void;
  pageBackground: PageBackground;
  setPageBackground: (bg: PageBackground) => void;
}

export function SidebarPresentationSettings({
  language,
  forceTimeline,
  setForceTimeline,
  showDates,
  setShowDates,
  showCaptions,
  setShowCaptions,
  fontSize,
  setFontSize,
  cardStyle,
  setCardStyle,
  pageBackground,
  setPageBackground,
}: SidebarPresentationSettingsProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <ToggleSwitch
          checked={forceTimeline}
          onChange={setForceTimeline}
          label={t(language, "forceTimeline")}
        />
        <ToggleSwitch
          checked={showDates}
          onChange={setShowDates}
          label={t(language, "showDates")}
        />
        <ToggleSwitch
          checked={showCaptions}
          onChange={setShowCaptions}
          label={t(language, "showCaptions")}
        />
      </div>
      <div className="flex flex-wrap items-end gap-5">
        <div>
          <label
            htmlFor="fontSize"
            className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2"
          >
            {t(language, "fontSize")}
          </label>
          <select
            id="fontSize"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="8">8 pt</option>
            <option value="9">9 pt</option>
            <option value="10">10 pt</option>
            <option value="11">11 pt</option>
            <option value="12">12 pt</option>
            <option value="14">14 pt</option>
            <option value="16">16 pt</option>
            <option value="18">18 pt</option>
            <option value="20">20 pt</option>
            <option value="22">22 pt</option>
            <option value="24">24 pt</option>
          </select>
        </div>
      </div>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          {t(language, "cardStyle")}
        </span>
        <div className="flex flex-wrap gap-3">
          {CARD_STYLES.map((style) => (
            <button
              key={style.value}
              onClick={() => setCardStyle(style.value)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ${
                cardStyle === style.value
                  ? "bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {/* Mini mockup of the actual card treatment, not
                  just a label - the tilt/tape vs. flush-edge
                  difference is much clearer to see than to read. */}
              <div className="relative w-16 h-16 rounded-md bg-gray-100 dark:bg-gray-900 overflow-hidden">
                {style.value === "scrapbook" ? (
                  <div
                    className="absolute"
                    style={{
                      top: 10,
                      left: 11,
                      right: 11,
                      bottom: 10,
                      transform: "rotate(-7deg)",
                      backgroundColor: SCRAPBOOK.mat,
                      boxShadow: "1px 2px 4px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div
                      className="absolute"
                      style={{
                        inset: 3,
                        backgroundColor: "#93A0C2",
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        top: -3,
                        left: "50%",
                        width: 14,
                        height: 6,
                        transform: "translateX(-50%) rotate(5deg)",
                        backgroundColor: SCRAPBOOK.tape[2],
                        opacity: 0.9,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="absolute"
                    style={{
                      inset: 6,
                      backgroundColor: "#93A0C2",
                    }}
                  />
                )}
              </div>
              <span
                className={`text-xs font-semibold ${
                  cardStyle === style.value
                    ? "text-indigo-700 dark:text-indigo-300"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {style.label}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          {t(language, "pageBackground")}
        </span>
        <div className="flex flex-col gap-2.5">
          {PAGE_BACKGROUND_GROUPS.map((group) => (
            <div
              key={group.label}
              className="flex items-center gap-2.5 flex-wrap"
            >
              <span className="text-[11px] text-gray-400 dark:text-gray-500 w-16 flex-none">
                {group.label}
              </span>
              <div className="flex gap-1.5">
                {group.keys.map((key) => {
                  const preset = PAGE_BACKGROUNDS[key];
                  const active = pageBackground === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setPageBackground(key)}
                      title={preset.label}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        active
                          ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900 scale-105"
                          : "ring-1 ring-inset ring-black/10 dark:ring-white/10 hover:scale-105"
                      }`}
                      style={{ backgroundColor: preset.base }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
