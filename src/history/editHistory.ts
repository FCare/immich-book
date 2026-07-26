import type { AssetResponseDto } from "@immich/sdk";
import type { Dispatch, SetStateAction } from "react";
import type { FocalPoint, FrameSize } from "../config/albumConfig";

// History of operations for undo functionality
export type HistoryOperation =
  | {
      type: "swap-same-page";
      pageNumber: number;
      order: string[];
      prevOrder: string[];
      assetIds: [string, string];
      timestamp: number;
    }
  | {
      type: "swap-text-cards";
      assetIds: [string, string];
      prevContents: [string, string];
      timestamp: number;
    }
  | {
      type: "swap-cross-page";
      assetIds: [string, string];
      prevOrder: string[];
      draggedPage: number;
      targetPage: number;
      timestamp: number;
    }
  | {
      type: "shuffle-layout";
      pageNumber: number;
      prevVariant: number;
      newVariant: number;
      timestamp: number;
    }
  | {
      type: "set-page-count";
      pageNumber: number;
      prevCount: number | null;
      newCount: number | null;
      timestamp: number;
    }
  | {
      type: "set-text-card-count";
      pageNumber: number;
      prevCount: number;
      newCount: number;
      timestamp: number;
    }
  | {
      type: "edit-page-caption";
      pageNumber: number;
      prevText: string;
      newText: string;
      timestamp: number;
    }
  | {
      type: "edit-card-caption";
      assetId: string;
      prevText: string;
      newText: string;
      timestamp: number;
    }
  | {
      type: "edit-text-card";
      cardId: string;
      prevText: string;
      newText: string;
      timestamp: number;
    }
  | {
      type: "set-cover";
      prevAssetId: string | null;
      newAssetId: string | null;
      timestamp: number;
    }
  | {
      // Front cover <-> back cover: bundles both field changes into one
      // entry (like swap-cross-page bundles its two field changes) so a
      // single Undo reverses both atomically.
      type: "swap-cover-slots";
      prevCoverAssetId: string;
      prevBackCoverAssetId: string;
      timestamp: number;
    }
  | {
      type: "set-back-cover";
      prevAssetId: string | null;
      newAssetId: string | null;
      timestamp: number;
    }
  | {
      type: "edit-cover-title";
      prevText: string;
      newText: string;
      timestamp: number;
    }
  | {
      type: "edit-back-cover-text";
      prevText: string;
      newText: string;
      timestamp: number;
    }
  | {
      type: "swap-new-photo";
      newAsset: AssetResponseDto;
      replacedAsset: AssetResponseDto;
      timestamp: number;
    }
  | {
      type: "replace-placeholder";
      newAsset: AssetResponseDto;
      placeholderAsset: AssetResponseDto;
      timestamp: number;
    }
  | {
      type: "insert-new-photo";
      newAsset: AssetResponseDto;
      pageNumber: number;
      prevPageCount: number | null;
      timestamp: number;
    }
  | {
      type: "delete-placeholder";
      placeholderAsset: AssetResponseDto;
      pageNumber: number | null;
      prevPageCount: number | null;
      timestamp: number;
    }
  | {
      // Manual smart-crop adjustment (dragging a croppable card) - see
      // the pointermove/pointerup effect in PhotoGrid.tsx. prevPoint is
      // null when the card had no focal point yet (auto-detection never
      // ran, or found no face).
      type: "pan-focal-point";
      assetId: string;
      prevPoint: FocalPoint | null;
      newPoint: FocalPoint;
      timestamp: number;
    }
  | {
      // Manual bento split-boundary drag - see SplitInfo in
      // pageLayout.ts. prevFraction is undefined when this boundary had
      // never been dragged before (the auto-computed fraction was in
      // effect).
      type: "drag-split-boundary";
      path: string;
      prevFraction: number | undefined;
      newFraction: number;
      timestamp: number;
    }
  | {
      // Manual bento split-axis flip (stacked <-> side-by-side) - see
      // SplitInfo in pageLayout.ts. prevAxis is undefined when this
      // boundary had never been flipped before (the auto-computed axis
      // was in effect).
      type: "flip-split-axis";
      path: string;
      prevAxis: "vertical" | "horizontal" | undefined;
      newAxis: "vertical" | "horizontal";
      timestamp: number;
    }
  | {
      // Manual resize of a "photo-title" cover's white mat/card frame -
      // see FrontCoverStandalone.tsx/BackCoverStandalone.tsx. prevSize is
      // null when the frame had never been resized before (the built-in
      // default size was in effect).
      type: "resize-cover-frame";
      target: "cover" | "back-cover";
      prevSize: FrameSize | null;
      newSize: FrameSize;
      timestamp: number;
    }
  | {
      // Manually pulling a still-in-the-album photo out of its slot into
      // the "photos to place" pool - see handleSetAsidePhoto in
      // PhotoGrid.tsx. Undo restores it to a normal card in place.
      type: "set-aside-photo";
      assetId: string;
      timestamp: number;
    }
  | {
      // Inserting a brand new page at an arbitrary point (see
      // handleInsertPageAt in PhotoGrid.tsx) shifts every page-number-keyed
      // override for pages at/after the insertion point up by one, which
      // isn't cheaply reversible key-by-key - so this stores a full
      // snapshot of every such map from just before the insert and undo
      // simply restores it wholesale, the same way "Reset All"'s
      // FlattenedState does.
      type: "insert-page";
      pageNumber: number;
      asset: AssetResponseDto;
      wasNew: boolean;
      prevAssets: AssetResponseDto[];
      prevPageCounts: Record<number, number>;
      prevTextCardCounts: Record<number, number>;
      prevLayoutVariants: Record<number, number>;
      prevSlotOverrides: Record<number, string[]>;
      prevBoundaryOverrides: Record<string, number>;
      prevAxisOverrides: Record<string, "vertical" | "horizontal">;
      prevPageCaptions: Record<number, string>;
      prevTextCardContents: Record<string, string>;
      timestamp: number;
    };

// Baseline snapshot captured by "flatten" - everything a Reset All
// reverts to, instead of the book's original unedited state.
export interface FlattenedState {
  customOrdering: string[] | null;
  slotOverrides: Record<number, string[]>;
  manuallyMovedIds: string[];
  layoutVariants: Record<number, number>;
  pageCounts: Record<number, number>;
  textCardCounts: Record<number, number>;
  textCardContents: Record<string, string>;
  pageCaptions: Record<number, string>;
  cardCaptions: Record<string, string>;
}

export interface UseEditHistoryParams {
  history: HistoryOperation[];
  setHistory: Dispatch<SetStateAction<HistoryOperation[]>>;
  setSlotOverrides: Dispatch<SetStateAction<Map<number, string[]>>>;
  setManuallyMovedIds: Dispatch<SetStateAction<Set<string>>>;
  setTextCardContents: Dispatch<SetStateAction<Map<string, string>>>;
  setCustomOrdering: Dispatch<SetStateAction<string[] | null>>;
  setLayoutVariants: Dispatch<SetStateAction<Map<number, number>>>;
  setPageCounts: Dispatch<SetStateAction<Map<number, number>>>;
  setTextCardCounts: Dispatch<SetStateAction<Map<number, number>>>;
  setPageCaptions: Dispatch<SetStateAction<Map<number, string>>>;
  setCardCaptions: Dispatch<SetStateAction<Map<string, string>>>;
  setFocalPoints: Dispatch<SetStateAction<Map<string, FocalPoint | null>>>;
  setBoundaryOverrides: Dispatch<SetStateAction<Map<string, number>>>;
  setAxisOverrides: Dispatch<
    SetStateAction<Map<string, "vertical" | "horizontal">>
  >;
  setCoverAssetId: Dispatch<SetStateAction<string | null>>;
  setCoverFrameSize: Dispatch<SetStateAction<FrameSize | null>>;
  setBackCoverAssetId: Dispatch<SetStateAction<string | null>>;
  setBackCoverFrameSize: Dispatch<SetStateAction<FrameSize | null>>;
  setCoverTitle: Dispatch<SetStateAction<string>>;
  setBackCoverText: Dispatch<SetStateAction<string>>;
  setAssets: Dispatch<SetStateAction<AssetResponseDto[]>>;
  setNewAssets: Dispatch<SetStateAction<AssetResponseDto[]>>;
  setMissingAssetIds: Dispatch<SetStateAction<Set<string>>>;
  setSetAsideAssetIds: Dispatch<SetStateAction<Set<string>>>;
  setFlattenedState: Dispatch<SetStateAction<FlattenedState | null>>;
  setShowFlattenConfirmation: Dispatch<SetStateAction<boolean>>;
  setShowResetConfirmation: Dispatch<SetStateAction<boolean>>;
  defaultFilteredAssets: AssetResponseDto[];
  customOrdering: string[] | null;
  slotOverrides: Map<number, string[]>;
  manuallyMovedIds: Set<string>;
  layoutVariants: Map<number, number>;
  pageCounts: Map<number, number>;
  textCardCounts: Map<number, number>;
  textCardContents: Map<string, string>;
  pageCaptions: Map<number, string>;
  cardCaptions: Map<string, string>;
}

// Undo/reset handlers for the edit history - kept as one hook (rather
// than free functions) so the JSX call sites can keep using them as
// plain event handlers (onClick={handleUndo}), same as when they were
// defined inline in PhotoGridEditor. `history` itself stays owned by
// PhotoGridEditor (nearly every other edit handler pushes onto it), so
// it's threaded in here as a param rather than owned by this hook.
export function useEditHistory(params: UseEditHistoryParams) {
  const {
    history,
    setHistory,
    setSlotOverrides,
    setManuallyMovedIds,
    setTextCardContents,
    setCustomOrdering,
    setLayoutVariants,
    setPageCounts,
    setTextCardCounts,
    setPageCaptions,
    setCardCaptions,
    setFocalPoints,
    setBoundaryOverrides,
    setAxisOverrides,
    setCoverAssetId,
    setCoverFrameSize,
    setBackCoverAssetId,
    setBackCoverFrameSize,
    setCoverTitle,
    setBackCoverText,
    setAssets,
    setNewAssets,
    setMissingAssetIds,
    setSetAsideAssetIds,
    setFlattenedState,
    setShowFlattenConfirmation,
    setShowResetConfirmation,
    defaultFilteredAssets,
    customOrdering,
    slotOverrides,
    manuallyMovedIds,
    layoutVariants,
    pageCounts,
    textCardCounts,
    textCardContents,
    pageCaptions,
    cardCaptions,
  } = params;

  // Undo the last operation from history
  const handleUndo = () => {
    if (history.length === 0) return;

    const [lastOp, ...remainingHistory] = history;

    switch (lastOp.type) {
      case "swap-same-page":
        setSlotOverrides((prev) =>
          new Map(prev).set(lastOp.pageNumber, lastOp.prevOrder)
        );
        setManuallyMovedIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetIds[0]);
          next.delete(lastOp.assetIds[1]);
          return next;
        });
        break;

      case "swap-text-cards":
        setTextCardContents((prev) => {
          const next = new Map(prev);
          const [id1, id2] = lastOp.assetIds;
          const [text1, text2] = lastOp.prevContents;
          if (text1) next.set(id1, text1);
          else next.delete(id1);
          if (text2) next.set(id2, text2);
          else next.delete(id2);
          return next;
        });
        setManuallyMovedIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetIds[0]);
          next.delete(lastOp.assetIds[1]);
          return next;
        });
        break;

      case "swap-cross-page":
        setCustomOrdering(lastOp.prevOrder);
        setSlotOverrides((prev) => {
          const next = new Map(prev);
          next.delete(lastOp.draggedPage);
          next.delete(lastOp.targetPage);
          return next;
        });
        setManuallyMovedIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetIds[0]);
          next.delete(lastOp.assetIds[1]);
          return next;
        });
        break;

      case "shuffle-layout":
        setLayoutVariants((prev) =>
          new Map(prev).set(lastOp.pageNumber, lastOp.prevVariant)
        );
        break;

      case "set-page-count":
        setPageCounts((prev) => {
          const next = new Map(prev);
          if (lastOp.prevCount === null) {
            next.delete(lastOp.pageNumber);
          } else {
            next.set(lastOp.pageNumber, lastOp.prevCount);
          }
          return next;
        });
        break;

      case "set-text-card-count":
        setTextCardCounts((prev) => {
          const next = new Map(prev);
          if (lastOp.prevCount === 0) {
            next.delete(lastOp.pageNumber);
          } else {
            next.set(lastOp.pageNumber, lastOp.prevCount);
          }
          return next;
        });
        break;

      case "edit-page-caption":
        setPageCaptions((prev) => {
          const next = new Map(prev);
          if (lastOp.prevText) {
            next.set(lastOp.pageNumber, lastOp.prevText);
          } else {
            next.delete(lastOp.pageNumber);
          }
          return next;
        });
        break;

      case "edit-card-caption":
        setCardCaptions((prev) => {
          const next = new Map(prev);
          if (lastOp.prevText) {
            next.set(lastOp.assetId, lastOp.prevText);
          } else {
            next.delete(lastOp.assetId);
          }
          return next;
        });
        break;

      case "pan-focal-point":
        setFocalPoints((prev) => {
          const next = new Map(prev);
          next.set(lastOp.assetId, lastOp.prevPoint);
          return next;
        });
        break;

      case "drag-split-boundary":
        setBoundaryOverrides((prev) => {
          const next = new Map(prev);
          if (lastOp.prevFraction === undefined) {
            next.delete(lastOp.path);
          } else {
            next.set(lastOp.path, lastOp.prevFraction);
          }
          return next;
        });
        break;

      case "flip-split-axis":
        setAxisOverrides((prev) => {
          const next = new Map(prev);
          if (lastOp.prevAxis === undefined) {
            next.delete(lastOp.path);
          } else {
            next.set(lastOp.path, lastOp.prevAxis);
          }
          return next;
        });
        break;

      case "resize-cover-frame":
        if (lastOp.target === "cover") setCoverFrameSize(lastOp.prevSize);
        else setBackCoverFrameSize(lastOp.prevSize);
        break;

      case "set-aside-photo":
        setMissingAssetIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetId);
          return next;
        });
        setSetAsideAssetIds((prev) => {
          const next = new Set(prev);
          next.delete(lastOp.assetId);
          return next;
        });
        setNewAssets((prev) => prev.filter((a) => a.id !== lastOp.assetId));
        break;

      case "insert-page":
        setAssets(() => lastOp.prevAssets);
        if (lastOp.wasNew) {
          setNewAssets((prev) => [...prev, lastOp.asset]);
        }
        setPageCounts(
          () => new Map(Object.entries(lastOp.prevPageCounts).map(([k, v]) => [Number(k), v])),
        );
        setTextCardCounts(
          () => new Map(Object.entries(lastOp.prevTextCardCounts).map(([k, v]) => [Number(k), v])),
        );
        setLayoutVariants(
          () => new Map(Object.entries(lastOp.prevLayoutVariants).map(([k, v]) => [Number(k), v])),
        );
        setSlotOverrides(
          () => new Map(Object.entries(lastOp.prevSlotOverrides).map(([k, v]) => [Number(k), v])),
        );
        setBoundaryOverrides(() => new Map(Object.entries(lastOp.prevBoundaryOverrides)));
        setAxisOverrides(() => new Map(Object.entries(lastOp.prevAxisOverrides)));
        setPageCaptions(
          () => new Map(Object.entries(lastOp.prevPageCaptions).map(([k, v]) => [Number(k), v])),
        );
        setTextCardContents(() => new Map(Object.entries(lastOp.prevTextCardContents)));
        break;

      case "edit-text-card":
        setTextCardContents((prev) => {
          const next = new Map(prev);
          if (lastOp.prevText) {
            next.set(lastOp.cardId, lastOp.prevText);
          } else {
            next.delete(lastOp.cardId);
          }
          return next;
        });
        break;

      case "set-cover":
        setCoverAssetId(lastOp.prevAssetId);
        break;

      case "swap-cover-slots":
        setCoverAssetId(lastOp.prevCoverAssetId);
        setBackCoverAssetId(lastOp.prevBackCoverAssetId);
        break;

      case "set-back-cover":
        setBackCoverAssetId(lastOp.prevAssetId);
        break;

      case "edit-cover-title":
        setCoverTitle(lastOp.prevText);
        break;

      case "edit-back-cover-text":
        setBackCoverText(lastOp.prevText);
        break;

      case "swap-new-photo":
        // Undo swap: put back the replaced asset, add new asset to newAssets
        setAssets(prev => prev.map(a => a.id === lastOp.newAsset.id ? lastOp.replacedAsset : a));
        setNewAssets(prev => [...prev, lastOp.newAsset]);
        break;

      case "replace-placeholder":
        // Undo replace: restore placeholder, add new asset to newAssets
        setAssets(prev => prev.map(a => a.id === lastOp.newAsset.id ? lastOp.placeholderAsset : a));
        setNewAssets(prev => [...prev, lastOp.newAsset]);
        setMissingAssetIds(prev => new Set([...prev, lastOp.placeholderAsset.id]));
        break;

      case "insert-new-photo":
        // Undo insert: remove the new asset, restore pageCount, add back to newAssets
        setAssets(prev => prev.filter(a => a.id !== lastOp.newAsset.id));
        setNewAssets(prev => [...prev, lastOp.newAsset]);
        // Restore previous pageCount
        setPageCounts(prev => {
          const next = new Map(prev);
          if (lastOp.prevPageCount === null) {
            next.delete(lastOp.pageNumber);
          } else {
            next.set(lastOp.pageNumber, lastOp.prevPageCount);
          }
          return next;
        });
        break;

      case "delete-placeholder":
        // Undo delete: restore the placeholder and pageCount
        setAssets(prev => [...prev, lastOp.placeholderAsset]);
        setMissingAssetIds(prev => new Set([...prev, lastOp.placeholderAsset.id]));
        // Restore previous pageCount
        if (lastOp.pageNumber !== null) {
          setPageCounts(prev => {
            const next = new Map(prev);
            if (lastOp.prevPageCount === null) {
              next.delete(lastOp.pageNumber!);
            } else {
              next.set(lastOp.pageNumber!, lastOp.prevPageCount);
            }
            return next;
          });
        }
        break;
    }

    setHistory(remainingHistory);
  };

  // Undo a manual swap for one card: un-flag it, drop its page's slot
  // override (that whole page falls back to fresh auto tiling - a manual
  // arrangement only makes sense as the set the user actually placed, not
  // a partial remnant of it), and if it was swapped across pages, restore
  // its default position in the master sequence too.
  const handleResetCard = (assetId: string) => {
    setManuallyMovedIds((prev) => {
      if (!prev.has(assetId)) return prev;
      const next = new Set(prev);
      next.delete(assetId);
      return next;
    });
    setSlotOverrides((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [pageNumber, ids] of prev) {
        if (ids.includes(assetId)) {
          next.delete(pageNumber);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setCustomOrdering((prev) => {
      if (!prev || !prev.includes(assetId)) return prev;
      const defaultIndex = defaultFilteredAssets.findIndex(
        (a) => a.id === assetId,
      );
      const next = prev.filter((id) => id !== assetId);
      next.splice(defaultIndex, 0, assetId);
      return next;
    });
  };

  // Reset ordering to default
  const handleResetOrdering = () => {
    setCustomOrdering(null);
    setSlotOverrides(new Map());
    setManuallyMovedIds(new Set());
  };

  // Reset ALL modifications
  const handleFlatten = () => {
    // Capture current state as the new baseline
    setFlattenedState({
      customOrdering,
      slotOverrides: Object.fromEntries(slotOverrides),
      manuallyMovedIds: Array.from(manuallyMovedIds),
      layoutVariants: Object.fromEntries(layoutVariants),
      pageCounts: Object.fromEntries(pageCounts),
      textCardCounts: Object.fromEntries(textCardCounts),
      textCardContents: Object.fromEntries(textCardContents),
      pageCaptions: Object.fromEntries(pageCaptions),
      cardCaptions: Object.fromEntries(cardCaptions),
    });

    // Clear history AND manuallyMovedIds since this is now the new baseline
    setHistory([]);
    setManuallyMovedIds(new Set());

    // Close confirmation dialog
    setShowFlattenConfirmation(false);
  };

  const handleResetAll = () => {
    // Undo all operations by processing the entire history
    const currentHistory = [...history];

    // Process all operations in reverse (from most recent to oldest)
    currentHistory.forEach((op) => {
      switch (op.type) {
        case "swap-same-page":
          setSlotOverrides((prev) =>
            new Map(prev).set(op.pageNumber, op.prevOrder)
          );
          setManuallyMovedIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetIds[0]);
            next.delete(op.assetIds[1]);
            return next;
          });
          break;

        case "swap-text-cards":
          setTextCardContents((prev) => {
            const next = new Map(prev);
            const [id1, id2] = op.assetIds;
            const [text1, text2] = op.prevContents;
            if (text1) next.set(id1, text1);
            else next.delete(id1);
            if (text2) next.set(id2, text2);
            else next.delete(id2);
            return next;
          });
          setManuallyMovedIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetIds[0]);
            next.delete(op.assetIds[1]);
            return next;
          });
          break;

        case "swap-cross-page":
          setCustomOrdering(op.prevOrder);
          setSlotOverrides((prev) => {
            const next = new Map(prev);
            next.delete(op.draggedPage);
            next.delete(op.targetPage);
            return next;
          });
          setManuallyMovedIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetIds[0]);
            next.delete(op.assetIds[1]);
            return next;
          });
          break;

        case "shuffle-layout":
          setLayoutVariants((prev) =>
            new Map(prev).set(op.pageNumber, op.prevVariant)
          );
          break;

        case "set-page-count":
          setPageCounts((prev) => {
            const next = new Map(prev);
            if (op.prevCount === null) {
              next.delete(op.pageNumber);
            } else {
              next.set(op.pageNumber, op.prevCount);
            }
            return next;
          });
          break;

        case "set-text-card-count":
          setTextCardCounts((prev) => {
            const next = new Map(prev);
            if (op.prevCount === 0) {
              next.delete(op.pageNumber);
            } else {
              next.set(op.pageNumber, op.prevCount);
            }
            return next;
          });
          break;

        case "edit-page-caption":
          setPageCaptions((prev) => {
            const next = new Map(prev);
            if (op.prevText) {
              next.set(op.pageNumber, op.prevText);
            } else {
              next.delete(op.pageNumber);
            }
            return next;
          });
          break;

        case "edit-card-caption":
          setCardCaptions((prev) => {
            const next = new Map(prev);
            if (op.prevText) {
              next.set(op.assetId, op.prevText);
            } else {
              next.delete(op.assetId);
            }
            return next;
          });
          break;

        case "pan-focal-point":
          setFocalPoints((prev) => {
            const next = new Map(prev);
            next.set(op.assetId, op.prevPoint);
            return next;
          });
          break;

        case "drag-split-boundary":
          setBoundaryOverrides((prev) => {
            const next = new Map(prev);
            if (op.prevFraction === undefined) {
              next.delete(op.path);
            } else {
              next.set(op.path, op.prevFraction);
            }
            return next;
          });
          break;

        case "flip-split-axis":
          setAxisOverrides((prev) => {
            const next = new Map(prev);
            if (op.prevAxis === undefined) {
              next.delete(op.path);
            } else {
              next.set(op.path, op.prevAxis);
            }
            return next;
          });
          break;

        case "resize-cover-frame":
          if (op.target === "cover") setCoverFrameSize(op.prevSize);
          else setBackCoverFrameSize(op.prevSize);
          break;

        case "set-aside-photo":
          setMissingAssetIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetId);
            return next;
          });
          setSetAsideAssetIds((prev) => {
            const next = new Set(prev);
            next.delete(op.assetId);
            return next;
          });
          setNewAssets((prev) => prev.filter((a) => a.id !== op.assetId));
          break;

        case "insert-page":
          setAssets(() => op.prevAssets);
          if (op.wasNew) {
            setNewAssets((prev) => [...prev, op.asset]);
          }
          setPageCounts(
            () => new Map(Object.entries(op.prevPageCounts).map(([k, v]) => [Number(k), v])),
          );
          setTextCardCounts(
            () => new Map(Object.entries(op.prevTextCardCounts).map(([k, v]) => [Number(k), v])),
          );
          setLayoutVariants(
            () => new Map(Object.entries(op.prevLayoutVariants).map(([k, v]) => [Number(k), v])),
          );
          setSlotOverrides(
            () => new Map(Object.entries(op.prevSlotOverrides).map(([k, v]) => [Number(k), v])),
          );
          setBoundaryOverrides(() => new Map(Object.entries(op.prevBoundaryOverrides)));
          setAxisOverrides(() => new Map(Object.entries(op.prevAxisOverrides)));
          setPageCaptions(
            () => new Map(Object.entries(op.prevPageCaptions).map(([k, v]) => [Number(k), v])),
          );
          setTextCardContents(() => new Map(Object.entries(op.prevTextCardContents)));
          break;

        case "edit-text-card":
          setTextCardContents((prev) => {
            const next = new Map(prev);
            if (op.prevText) {
              next.set(op.cardId, op.prevText);
            } else {
              next.delete(op.cardId);
            }
            return next;
          });
          break;

        case "set-cover":
          setCoverAssetId(op.prevAssetId);
          break;

        case "swap-cover-slots":
          setCoverAssetId(op.prevCoverAssetId);
          setBackCoverAssetId(op.prevBackCoverAssetId);
          break;

        case "set-back-cover":
          setBackCoverAssetId(op.prevAssetId);
          break;

        case "edit-cover-title":
          setCoverTitle(op.prevText);
          break;

        case "edit-back-cover-text":
          setBackCoverText(op.prevText);
          break;

        case "swap-new-photo":
          // Undo swap: put back the replaced asset, add new asset to newAssets
          setAssets(prev => prev.map(a => a.id === op.newAsset.id ? op.replacedAsset : a));
          setNewAssets(prev => [...prev, op.newAsset]);
          break;

        case "replace-placeholder":
          // Undo replace: restore placeholder, add new asset to newAssets
          setAssets(prev => prev.map(a => a.id === op.newAsset.id ? op.placeholderAsset : a));
          setNewAssets(prev => [...prev, op.newAsset]);
          setMissingAssetIds(prev => new Set([...prev, op.placeholderAsset.id]));
          break;

        case "insert-new-photo":
          // Undo insert: remove the new asset, restore pageCount, add back to newAssets
          setAssets(prev => prev.filter(a => a.id !== op.newAsset.id));
          setNewAssets(prev => [...prev, op.newAsset]);
          // Restore previous pageCount
          setPageCounts(prev => {
            const next = new Map(prev);
            if (op.prevPageCount === null) {
              next.delete(op.pageNumber);
            } else {
              next.set(op.pageNumber, op.prevPageCount);
            }
            return next;
          });
          break;

        case "delete-placeholder":
          // Undo delete: restore the placeholder and pageCount
          setAssets(prev => [...prev, op.placeholderAsset]);
          setMissingAssetIds(prev => new Set([...prev, op.placeholderAsset.id]));
          // Restore previous pageCount
          if (op.pageNumber !== null) {
            setPageCounts(prev => {
              const next = new Map(prev);
              if (op.prevPageCount === null) {
                next.delete(op.pageNumber!);
              } else {
                next.set(op.pageNumber!, op.prevPageCount);
              }
              return next;
            });
          }
          break;
      }
    });

    // Clear history after undoing everything
    setHistory([]);

    // Close confirmation dialog
    setShowResetConfirmation(false);
  };

  return {
    handleUndo,
    handleResetCard,
    handleResetOrdering,
    handleFlatten,
    handleResetAll,
  };
}
