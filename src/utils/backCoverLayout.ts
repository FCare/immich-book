import type { FrameSize } from "../config/albumConfig";

// Geometry of the back cover's "photo-title" card, shared by all four
// places that draw it: the standalone web preview
// (components/cover/BackCoverStandalone.tsx), the separated-cover web
// spread (components/cover/CoverSpread.tsx) and both of the PDF's back
// cover paths (pdf/buildPdfDocument.tsx). Each of them used to carry its
// own copy of these numbers and they had drifted apart - the strip under
// the photo alone was `textSize * 1.4` in one, `cardHeight * 0.22` in
// another and `textSize * 1.6`-or-zero in the PDF, so the same book's
// last page came out with a differently-sized photo on screen than in
// the exported file.
//
// The web preview is the reference: it is what the user composes and
// validates, so the PDF follows it rather than the other way round.

// Default card size, as a fraction of the full page - the size it had
// before the card was made resizable.
export const DEFAULT_BACK_COVER_FRAME_WIDTH = 0.42;
export const DEFAULT_BACK_COVER_FRAME_HEIGHT = 0.3;

// The card always gives up this much of its height to the closing note,
// whether or not there is one yet - the preview has always reserved it,
// so reserving it is what the photo's shape is built around, and an
// empty note stays clickable in the preview instead of collapsing.
const CAPTION_STRIP_FACTOR = 1.4;

export function backCoverCaptionStripHeight(textSize: number): number {
  return textSize * CAPTION_STRIP_FACTOR;
}

// The note's own box is deliberately taller than the strip it sits in:
// react-pdf drops a Text entirely when its box is only ~1.1x the font
// size, and needs ~1.6x to render reliably (confirmed by isolated
// testing, same constant as the interior cards' captions). An HTML input
// would happily take the strip's own 1.4x, but it uses this height too -
// both centre their text in the same box, so the note lands in the same
// place on screen and in print. The 0.2x it overhangs the strip by
// reaches up over the bottom of the photo, where nothing is drawn.
export function backCoverCaptionTextBoxHeight(textSize: number): number {
  return Math.max(backCoverCaptionStripHeight(textSize), textSize * 1.6);
}

export interface BackCoverCardGeometry {
  cardWidth: number;
  cardHeight: number;
  cardTop: number;
  cardLeft: number;
  frameInset: number;
  // Height the photo gives up to the closing note.
  captionStripHeight: number;
  // The photo's box inside the card, relative to the card's own corner.
  photoTop: number;
  photoLeft: number;
  photoWidth: number;
  photoHeight: number;
  // Where the note sits, relative to the card's bottom edge.
  captionBottom: number;
  captionTextBoxHeight: number;
}

// `pageWidth`/`pageHeight`/`textSize` must all be in the same unit and
// coordinate space as the caller draws in - points for the PDF and the
// standalone web preview (which shrinks itself with CSS `zoom`), already
// scaled-down pixels for the separated-cover spread (which sizes its own
// boxes down instead).
export function backCoverCardGeometry(
  pageWidth: number,
  pageHeight: number,
  frameSize: FrameSize | null | undefined,
  textSize: number,
): BackCoverCardGeometry {
  const cardWidth =
    pageWidth * (frameSize?.width ?? DEFAULT_BACK_COVER_FRAME_WIDTH);
  const cardHeight =
    pageHeight * (frameSize?.height ?? DEFAULT_BACK_COVER_FRAME_HEIGHT);
  const frameInset = Math.max(4, cardWidth * 0.045);
  const captionStripHeight = backCoverCaptionStripHeight(textSize);
  return {
    cardWidth,
    cardHeight,
    cardTop: (pageHeight - cardHeight) / 2,
    cardLeft: (pageWidth - cardWidth) / 2,
    frameInset,
    captionStripHeight,
    photoTop: frameInset,
    photoLeft: frameInset,
    photoWidth: Math.max(0, cardWidth - frameInset * 2),
    photoHeight: Math.max(
      0,
      cardHeight - frameInset * 2 - captionStripHeight,
    ),
    captionBottom: frameInset * 0.3,
    captionTextBoxHeight: backCoverCaptionTextBoxHeight(textSize),
  };
}
