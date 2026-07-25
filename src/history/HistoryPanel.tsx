import type { Dispatch, SetStateAction } from "react";
import { t, type Language } from "../i18n";
import type { HistoryOperation } from "./editHistory";

export interface ResetAllConfirmDialogProps {
  language: Language;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetAllConfirmDialog({
  language,
  onCancel,
  onConfirm,
}: ResetAllConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">
          {t(language, "resetAllConfirmTitle")}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t(language, "resetAllConfirmMessage")}
        </p>
        <ul className="text-sm text-gray-600 dark:text-gray-400 mb-6 space-y-1">
          <li>{t(language, "resetAllConfirmList1")}</li>
          <li>{t(language, "resetAllConfirmList2")}</li>
          <li>{t(language, "resetAllConfirmList3")}</li>
          <li>{t(language, "resetAllConfirmList4")}</li>
        </ul>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
          >
            {t(language, "cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors"
          >
            {t(language, "resetAll")}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface FlattenConfirmDialogProps {
  language: Language;
  onCancel: () => void;
  onConfirm: () => void;
}

export function FlattenConfirmDialog({
  language,
  onCancel,
  onConfirm,
}: FlattenConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-3">
          {t(language, "flattenConfirmTitle")}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {t(language, "flattenConfirmMessage")}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
          >
            {t(language, "cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
          >
            {t(language, "flatten")}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface HistoryPanelProps {
  history: HistoryOperation[];
  historyCollapsed: boolean;
  setHistoryCollapsed: Dispatch<SetStateAction<boolean>>;
  setShowResetConfirmation: Dispatch<SetStateAction<boolean>>;
  setShowFlattenConfirmation: Dispatch<SetStateAction<boolean>>;
  customOrdering: string[] | null;
  slotOverrides: Map<number, string[]>;
  manuallyMovedIds: Set<string>;
  layoutVariants: Map<number, number>;
  pageCounts: Map<number, number>;
  textCardCounts: Map<number, number>;
  textCardContents: Map<string, string>;
  pageCaptions: Map<number, string>;
  cardCaptions: Map<string, string>;
  language: Language;
  handleUndo: () => void;
}

export function HistoryPanel({
  history,
  historyCollapsed,
  setHistoryCollapsed,
  setShowResetConfirmation,
  setShowFlattenConfirmation,
  customOrdering,
  slotOverrides,
  manuallyMovedIds,
  layoutVariants,
  pageCounts,
  textCardCounts,
  textCardContents,
  pageCaptions,
  cardCaptions,
  language,
  handleUndo,
}: HistoryPanelProps) {
  const hasAnyModification =
    history.length > 0 ||
    customOrdering !== null ||
    slotOverrides.size > 0 ||
    manuallyMovedIds.size > 0 ||
    layoutVariants.size > 0 ||
    pageCounts.size > 0 ||
    textCardCounts.size > 0 ||
    textCardContents.size > 0 ||
    pageCaptions.size > 0 ||
    cardCaptions.size > 0;

  return (
    <aside
      className={`flex-none flex flex-col border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-200 overflow-hidden ${
        historyCollapsed ? "w-16" : "w-80"
      }`}
    >
      {historyCollapsed ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col items-center gap-3 py-4">
          <button
            onClick={() => setHistoryCollapsed(false)}
            title={t(language, "history")}
            className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors relative"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M3 7v6h6M21 17v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8m18 8l-2.64 2.36A9 9 0 0 1 3.51 15" />
            </svg>
            {history.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {history.length}
              </span>
            )}
          </button>

          <div className="w-8 border-t border-gray-200 dark:border-gray-800" />

          {/* Reset All button (collapsed) */}
          {history.length > 0 && (
            <button
              onClick={() => setShowResetConfirmation(true)}
              title={t(language, "resetAll")}
              className="w-9 h-9 rounded-lg border-2 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}

          {/* Flatten button (collapsed) */}
          {hasAnyModification && (
            <button
              onClick={() => setShowFlattenConfirmation(true)}
              title={t(language, "flatten")}
              className="w-9 h-9 rounded-lg border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-center transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M7 10v12M21 10v12M5 4h16v6H5zM3 4h2M3 22h18" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Header - Sticky */}
          <div className="flex-none p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                {t(language, "historyTitle")}
              </h2>
              <button
                onClick={() => setHistoryCollapsed(true)}
                title={t(language, "closePanel")}
                className="w-7 h-7 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>

            {/* Reset All and Flatten buttons */}
            {hasAnyModification && (
              <div className="flex flex-col gap-2">
                {history.length > 0 && (
                  <button
                    onClick={() => setShowResetConfirmation(true)}
                    className="w-full px-4 py-2 rounded-lg border-2 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    {t(language, "resetAll")}
                  </button>
                )}
                <button
                  onClick={() => setShowFlattenConfirmation(true)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M7 10v12M21 10v12M5 4h16v6H5zM3 4h2M3 22h18" />
                  </svg>
                  {t(language, "flatten")}
                </button>
              </div>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4">
            {history.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                {t(language, "noOperations")}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar -mx-4 px-4 space-y-2">
                {history.map((op, index) => {
                  const timeAgo = Math.floor((Date.now() - op.timestamp) / 1000);
                  const timeStr =
                    timeAgo < 60
                      ? `${timeAgo}${t(language, "timeAgo_seconds")}`
                      : timeAgo < 3600
                        ? `${Math.floor(timeAgo / 60)}${t(language, "timeAgo_minutes")}`
                        : `${Math.floor(timeAgo / 3600)}${t(language, "timeAgo_hours")}`;

                  let description = "";
                  switch (op.type) {
                    case "swap-same-page":
                      description = `${t(language, "historySwapSamePage")} ${op.pageNumber}`;
                      break;
                    case "swap-text-cards":
                      description = t(language, "historySwapTextCards");
                      break;
                    case "swap-cross-page":
                      description = `${t(language, "historySwapCrossPage")} ${op.draggedPage} ${t(language, "historySwapCrossPageDetail")} ${op.targetPage}`;
                      break;
                    case "shuffle-layout":
                      description = `${t(language, "historyShuffleLayout")} ${op.pageNumber}`;
                      break;
                    case "set-page-count":
                      description = `${t(language, "historySetPageCount")} ${op.pageNumber} ${t(language, "historySetPageCountTo")} ${op.newCount ?? t(language, "historySetPageCountAuto")}`;
                      break;
                    case "set-text-card-count":
                      description = `${t(language, "historySetTextCardCount")} ${op.pageNumber} ${t(language, "historySetPageCountTo")} ${op.newCount}`;
                      break;
                    case "edit-page-caption":
                      description = `${t(language, "historyEditPageCaption")} ${op.pageNumber}`;
                      break;
                    case "edit-card-caption":
                      description = t(language, "historyEditCardCaption");
                      break;
                    case "edit-text-card":
                      description = t(language, "historyEditTextCard");
                      break;
                    case "set-cover":
                      description = t(language, "historySetCover");
                      break;
                    case "swap-cover-slots":
                      description = t(language, "historySwapCoverSlots");
                      break;
                    case "set-back-cover":
                      description = t(language, "historySetBackCover");
                      break;
                    case "edit-cover-title":
                      description = t(language, "historyEditCoverTitle");
                      break;
                    case "edit-back-cover-text":
                      description = t(language, "historyEditBackCoverText");
                      break;
                    case "swap-new-photo":
                      description = t(language, "historySwapNewPhoto");
                      break;
                    case "replace-placeholder":
                      description = t(language, "historyReplacePlaceholder");
                      break;
                    case "insert-new-photo":
                      description = t(language, "historyInsertNewPhoto");
                      break;
                    case "delete-placeholder":
                      description = t(language, "historyDeletePlaceholder");
                      break;
                    case "pan-focal-point":
                      description = t(language, "historyPanFocalPoint");
                      break;
                  }

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        index === 0
                          ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30"
                          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30"
                      }`}
                    >
                      <div className="text-sm text-gray-900 dark:text-gray-50 font-medium">
                        {description}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {timeStr}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Undo button - Sticky at bottom */}
      {history.length > 0 && (
        <div className="flex-none border-t border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-950">
          {historyCollapsed ? (
            <button
              onClick={handleUndo}
              title={t(language, "undoLastAction")}
              className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7v6h6M21 17v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8m18 8l-2.64 2.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleUndo}
              className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7v6h6M21 17v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8m18 8l-2.64 2.36A9 9 0 0 1 3.51 15" />
              </svg>
              {t(language, "undoLastAction")}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
