import { useEffect, useRef } from "react";

const DRAG_THRESHOLD_PX = 4;
// Safety net for consumeDrag() - if no click event ever follows the drag
// (common: browsers don't reliably fire one after real mouse movement),
// the "just dragged" flag would otherwise never get cleared and could
// wrongly swallow a much later, unrelated click.
const JUST_DRAGGED_RESET_MS = 300;

interface ScrollTarget {
  el: HTMLElement;
  startScroll: number;
  // Multiplies the raw drag distance before applying it to this target -
  // lets a short drag on a compact proxy (e.g. the nav rail's own
  // thumbnail list) sweep a much taller target (the main preview) through
  // its whole range, the way dragging a scrollbar thumb does. 1 (the
  // default for whichever element the drag started on) is a direct,
  // no-lag drag.
  scale: number;
}

export interface DragToScrollOptions {
  // Only starts a scroll-drag when the pointer came down on the
  // container itself, not a descendant - for containers whose children
  // already handle their own pointer-drag (e.g. the "new photos"
  // strip's thumbnails, which drag-to-place), so the two gestures never
  // both fire for the same press.
  restrictToSelf?: boolean;
  scale?: number;
  // A second element to scroll in lockstep with the first (its own
  // scale defaults to 1) - e.g. the nav rail's own thumbnail list, kept
  // moving for visual feedback while it's actually the main preview
  // being driven through a much larger range.
  syncEl?: HTMLElement | null;
  syncScale?: number;
}

// Click-and-drag-to-scroll - the browser only scrolls a div like this
// via wheel/trackpad or by grabbing the actual scrollbar thumb, never by
// dragging the content itself the way a touch screen would. This adds
// that "grab and scroll" gesture with the mouse. The element being
// scrolled doesn't have to be the same element the drag started on -
// it's passed in explicitly on pointerdown, so a compact rail can scroll
// a completely different (and much taller) content area.
export function useDragToScroll(axis: "x" | "y") {
  const dragRef = useRef<{
    startPos: number;
    dragged: boolean;
    primary: ScrollTarget;
    secondary: ScrollTarget | null;
  } | null>(null);
  const justDraggedRef = useRef(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const apply = (target: ScrollTarget, delta: number) => {
      const value = target.startScroll - delta * target.scale;
      if (axis === "y") target.el.scrollTop = value;
      else target.el.scrollLeft = value;
    };
    const handleMove = (e: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const pos = axis === "y" ? e.clientY : e.clientX;
      const rawDelta = pos - state.startPos;
      if (!state.dragged && Math.abs(rawDelta) > DRAG_THRESHOLD_PX) {
        state.dragged = true;
      }
      if (state.dragged) {
        apply(state.primary, rawDelta);
        if (state.secondary) apply(state.secondary, rawDelta);
      }
    };
    const handleUp = () => {
      const state = dragRef.current;
      if (state?.dragged) {
        justDraggedRef.current = true;
        if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = setTimeout(() => {
          justDraggedRef.current = false;
        }, JUST_DRAGGED_RESET_MS);
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, [axis]);

  const onPointerDown = (
    e: React.PointerEvent,
    scrollEl: HTMLElement | null,
    options?: DragToScrollOptions,
  ) => {
    if (e.button !== 0) return;
    if (options?.restrictToSelf && e.target !== e.currentTarget) return;
    if (!scrollEl) return;
    dragRef.current = {
      startPos: axis === "y" ? e.clientY : e.clientX,
      dragged: false,
      primary: {
        el: scrollEl,
        startScroll: axis === "y" ? scrollEl.scrollTop : scrollEl.scrollLeft,
        scale: options?.scale ?? 1,
      },
      secondary: options?.syncEl
        ? {
            el: options.syncEl,
            startScroll:
              axis === "y"
                ? options.syncEl.scrollTop
                : options.syncEl.scrollLeft,
            scale: options?.syncScale ?? 1,
          }
        : null,
    };
  };

  // Call from a click handler for anything inside a drag-scrollable
  // container: returns (and immediately clears) whether the click being
  // handled is actually the tail end of a scroll-drag, so it can be
  // ignored instead of also triggering navigation/selection. Scoped to
  // this hook instance and self-clearing, unlike swallowing the next
  // click globally, which can leak and eat a later, unrelated click if
  // no click event happens to follow the drag.
  const consumeDrag = () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      return true;
    }
    return false;
  };

  return { onPointerDown, consumeDrag };
}
