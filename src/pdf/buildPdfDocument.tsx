import type { AlbumResponseDto, AssetResponseDto } from "@immich/sdk";
import { Document, Page, Image, View, Text, StyleSheet } from "@react-pdf/renderer";
import { mmToPixels, type Page as LayoutPage } from "../utils/pageLayout";
import type { PageBackground, CardStyle, CoverLayout, FocalPoint } from "../config/albumConfig";
import {
  SCRAPBOOK,
  PAGE_BACKGROUNDS,
  PAGE_BACKGROUND_BLOBS,
  PAGE_BACKGROUND_SPECKLES,
  toPoints,
  pageCaptionBandHeightPt,
  captionAtBottom,
  photoTiltDeg,
  tapeStyle,
} from "../components/PhotoGrid";

const staticStyles = StyleSheet.create({
  page: {
    backgroundColor: "white",
  },
});

// Plain Views instead of <Svg>/<Rect>/<Circle> (see PhotoGrid.tsx's
// pageBackgroundCss for the web equivalent) - react-pdf appears to run
// vector (Svg) drawing through a different path than regular View/Text
// content, and in testing that made a textured background paint over
// everything else on the page - including captions - regardless of where
// it sat in the JSX tree. A page-doubling bug (content "overflowing" its
// Svg box) was also traced to the same Svg usage. Plain Views share the
// exact same layout/paint pipeline as the rest of the page, which
// sidesteps both issues.
function PdfPageBackground({
  background,
  width,
  height,
}: {
  background: PageBackground;
  width: number;
  height: number;
}) {
  const preset = PAGE_BACKGROUNDS[background];
  if (preset.texture === "none") return null;

  const dotSpacing = 26;
  const lineSpacing = 30;

  const circle = (
    key: string | number,
    cx: number,
    cy: number,
    r: number,
    color: string,
    opacity: number,
  ) => (
    <View
      key={key}
      style={{
        position: "absolute",
        left: cx - r,
        top: cy - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        backgroundColor: color,
        opacity,
      }}
    />
  );

  // Approximates the web version's soft radial-gradient blob (full color
  // fading to transparent at the edge) with concentric rings of
  // increasing opacity toward the center - a single flat circle (the
  // PDF's only other option, since Svg gradients are avoided here) reads
  // as a hard, flat disc instead of a soft paper-grain blob.
  const softBlob = (
    keyPrefix: string | number,
    cx: number,
    cy: number,
    r: number,
    color: string,
    opacity: number,
  ) => {
    const rings = 5;
    return Array.from({ length: rings }, (_, i) => {
      const t = (i + 1) / rings;
      return circle(
        `${keyPrefix}-${i}`,
        cx,
        cy,
        r * t,
        color,
        (opacity / rings) * (1.6 - t),
      );
    });
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        backgroundColor: preset.base,
        overflow: "hidden",
      }}
    >
      {preset.texture === "blob" &&
        PAGE_BACKGROUND_BLOBS.map((b, i) => {
          const cx = b.cx * width;
          const cy = b.cy * height;
          const maxR = Math.min(cx, width - cx, cy, height - cy);
          const r = Math.max(
            0,
            Math.min(b.r * Math.max(width, height), maxR),
          );
          return softBlob(i, cx, cy, r, preset.accent, b.opacity);
        })}
      {preset.texture === "dots" &&
        Array.from({ length: Math.ceil(height / dotSpacing) }).flatMap(
          (_, row) =>
            Array.from({ length: Math.ceil(width / dotSpacing) }).map(
              (_, col) =>
                circle(
                  `${row}-${col}`,
                  dotSpacing / 2 + col * dotSpacing,
                  dotSpacing / 2 + row * dotSpacing,
                  0.7,
                  preset.accent,
                  0.35,
                ),
            ),
        )}
      {preset.texture === "lines" &&
        Array.from({ length: Math.ceil(height / lineSpacing) }).map(
          (_, row) => (
            <View
              key={row}
              style={{
                position: "absolute",
                left: 0,
                top: row * lineSpacing,
                width,
                height: 0.75,
                backgroundColor: preset.accent,
                opacity: 0.5,
              }}
            />
          ),
        )}
      {preset.texture === "grid" && (
        <>
          {Array.from({ length: Math.ceil(height / lineSpacing) }).map(
            (_, row) => (
              <View
                key={`h${row}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top: row * lineSpacing,
                  width,
                  height: 0.6,
                  backgroundColor: preset.accent,
                  opacity: 0.5,
                }}
              />
            ),
          )}
          {Array.from({ length: Math.ceil(width / lineSpacing) }).map(
            (_, col) => (
              <View
                key={`v${col}`}
                style={{
                  position: "absolute",
                  left: col * lineSpacing,
                  top: 0,
                  width: 0.6,
                  height,
                  backgroundColor: preset.accent,
                  opacity: 0.5,
                }}
              />
            ),
          )}
        </>
      )}
      {preset.texture === "speckle" &&
        PAGE_BACKGROUND_SPECKLES.map((sp, i) => {
          const cx = sp.x * width;
          const cy = sp.y * height;
          const r = Math.max(
            0,
            Math.min(sp.r, cx, width - cx, cy, height - cy),
          );
          return circle(i, cx, cy, r, sp.color, 0.55);
        })}
    </View>
  );
}

// Plain Blob-backed photo image for the PDF, anchored at (top, left)
// within its cell.
function PdfPhotoImage({
  src,
  containerWidth,
  containerHeight,
  top,
  left,
  focalPoint,
}: {
  src: Blob | undefined;
  containerWidth: number;
  containerHeight: number;
  top: number;
  left: number;
  focalPoint?: FocalPoint | null;
}) {
  if (!src) return null;
  return (
    <Image
      src={src}
      style={{
        position: "absolute",
        top,
        left,
        width: containerWidth,
        height: containerHeight,
        objectFit: "cover",
        ...(focalPoint
          ? {
              objectPositionX: `${focalPoint.x * 100}%`,
              objectPositionY: `${focalPoint.y * 100}%`,
            }
          : {}),
      }}
    />
  );
}

export interface BuildPdfDocumentParams {
  imageBlobs: Map<string, Blob>;
  // "front-cover-standalone"/"back-cover-standalone" render just that
  // one page - used to assemble a large book out of several small
  // pdf().toBlob() calls (front cover, interior in chunks, back cover)
  // merged afterward server-side (see mergePdfBlobs), instead of one
  // giant call: react-pdf's WASM layout engine (yoga-layout) can crash
  // the tab on a document with hundreds of pages built in a single pass.
  pdfType?:
    | "full"
    | "cover"
    | "interior"
    | "front-cover-standalone"
    | "back-cover-standalone";
  album: AlbumResponseDto;
  validPageWidth: number;
  validPageHeight: number;
  validMargin: number;
  validBleed: number;
  bleedEnabled: boolean;
  coverAsset: AssetResponseDto | null;
  backCoverAsset: AssetResponseDto | null;
  spineWidth: number;
  separatedCover: boolean;
  backCoverLayout: CoverLayout;
  backCoverText: string;
  backCoverPlainText: boolean;
  fontSize: number;
  coverLayout: CoverLayout;
  coverTitle: string;
  pageLayout: "singlePage" | "twoPageLeft";
  showCover: boolean;
  pageBackground: PageBackground;
  spineColor: string;
  spineTextSize: number;
  spineTextColor: string;
  spineTitle: string;
  pages: LayoutPage[];
  combinePages: boolean;
  showCaptions: boolean;
  pageCaptions: Map<number, string>;
  cardStyle: CardStyle;
  textCardContents: Map<string, string>;
  showDates: boolean;
  cardCaptions: Map<string, string>;
  // Smart-crop focal point per asset id (see computeFocalPointFromAsset
  // in PhotoGrid.tsx) - null means checked, no face found.
  focalPoints: Map<string, FocalPoint | null>;
}

// Builds the actual PDF document element from photo Blobs fetched ahead
// of time (see handleGeneratePdf in PhotoGrid.tsx) - react-pdf's own
// image fetching turned out to be unreliable on its own (photos
// randomly, but reproducibly, missing), so every photo is fetched
// ourselves with real error handling and handed to <Image> as a Blob
// instead of a URL.
export function buildPdfDocument(params: BuildPdfDocumentParams) {
  const {
    imageBlobs,
    pdfType = "full",
    album,
    validPageWidth,
    validPageHeight,
    validMargin,
    validBleed,
    bleedEnabled,
    coverAsset,
    backCoverAsset,
    spineWidth,
    separatedCover,
    backCoverLayout,
    backCoverText,
    backCoverPlainText,
    fontSize,
    coverLayout,
    coverTitle,
    pageLayout,
    showCover,
    pageBackground,
    spineColor,
    spineTextSize,
    spineTextColor,
    spineTitle,
    pages,
    combinePages,
    showCaptions,
    pageCaptions,
    cardStyle,
    textCardContents,
    showDates,
    cardCaptions,
    focalPoints,
  } = params;

  const coverPageWidth = toPoints(validPageWidth);
  const coverPageHeight = toPoints(validPageHeight);
  const coverImageBlob = coverAsset
    ? imageBlobs.get(coverAsset.id)
    : undefined;
  const backCoverImageBlob = backCoverAsset
    ? imageBlobs.get(backCoverAsset.id)
    : undefined;
  const coverFocalPoint = coverAsset
    ? focalPoints.get(coverAsset.id) ?? null
    : null;
  const backCoverFocalPoint = backCoverAsset
    ? focalPoints.get(backCoverAsset.id) ?? null
    : null;
  const coverScrimHeight = coverPageHeight * 0.28;
  // Bleed ("fond perdu") - extra border filled with the page
  // background, outside the trim size, so a print shop's trim line
  // doesn't reveal a white edge. All existing page content keeps
  // using the trim-size coordinates unchanged; it's just mounted
  // inside a View offset by bleedPt on an enlarged page/background.
  const bleedPt = bleedEnabled ? toPoints(validBleed) : 0;
  const coverBleedWidth = coverPageWidth + bleedPt * 2;
  const coverBleedHeight = coverPageHeight + bleedPt * 2;

  // Separated cover (for Blurb, etc.): back + spine + front in one page
  const spineWidthPt = toPoints(mmToPixels(spineWidth)); // Convert mm → px → points
  const separatedCoverWidth = separatedCover
    ? coverPageWidth * 2 + spineWidthPt
    : coverPageWidth;
  const separatedCoverBleedWidth = separatedCoverWidth + bleedPt * 2;

  // Helper to render back cover content (reused in both standalone and separated modes)
  const renderBackCoverContent = () => {
    // This is a direct extraction from the standalone back cover rendering
    // to ensure separated cover gets the same layouts
    return (
      <>
        {backCoverLayout === "text-only" && !!backCoverText && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: coverPageWidth * 0.1,
            }}
          >
            <View
              style={{
                width: coverPageWidth * 0.3,
                height: 1,
                backgroundColor: SCRAPBOOK.ink,
                opacity: 0.3,
                marginBottom: 16,
              }}
            />
            <Text
              style={{
                fontFamily: "Caveat",
                fontWeight: 600,
                fontSize: coverPageWidth * 0.09,
                color: SCRAPBOOK.ink,
                textAlign: "center",
              }}
            >
              {backCoverText}
            </Text>
            <View
              style={{
                width: coverPageWidth * 0.3,
                height: 1,
                backgroundColor: SCRAPBOOK.ink,
                opacity: 0.3,
                marginTop: 16,
              }}
            />
          </View>
        )}

        {backCoverLayout === "photo-title" &&
          Boolean(backCoverImageBlob || backCoverText) &&
          (() => {
            const hasImage = !!backCoverImageBlob;
            if (!hasImage && backCoverPlainText && backCoverText) {
              const plainWidth = coverPageWidth * 0.7;
              return (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: (coverPageWidth - plainWidth) / 2,
                    width: plainWidth,
                    height: coverPageHeight,
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Caveat",
                      fontWeight: 500,
                      fontSize: fontSize * 1.9,
                      color: SCRAPBOOK.ink,
                      textAlign: "center",
                    }}
                  >
                    {backCoverText}
                  </Text>
                </View>
              );
            }

            const cardWidth = coverPageWidth * 0.42;
            const cardHeight = coverPageHeight * 0.3;
            const cardTop = (coverPageHeight - cardHeight) / 2;
            const cardLeft = (coverPageWidth - cardWidth) / 2;
            const frameInset = Math.max(4, cardWidth * 0.045);
            const captionStripHeight = backCoverText ? fontSize * 1.3 * 1.6 : 0;

            return (
              <View
                style={{
                  position: "absolute",
                  top: cardTop,
                  left: cardLeft,
                  width: cardWidth,
                  height: cardHeight,
                }}
              >
                {hasImage && (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: cardWidth,
                      height: cardHeight - captionStripHeight,
                      backgroundColor: SCRAPBOOK.mat,
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: frameInset,
                        left: frameInset,
                        right: frameInset,
                        bottom: frameInset,
                        overflow: "hidden",
                      }}
                    >
                      <Image
                        src={backCoverImageBlob}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          ...(backCoverFocalPoint
                            ? {
                                objectPositionX: `${backCoverFocalPoint.x * 100}%`,
                                objectPositionY: `${backCoverFocalPoint.y * 100}%`,
                              }
                            : {}),
                        }}
                      />
                    </View>
                  </View>
                )}
                {!!backCoverText && (
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: captionStripHeight,
                      backgroundColor: SCRAPBOOK.mat,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Caveat",
                        fontWeight: 500,
                        fontSize: fontSize * 1.3,
                        color: SCRAPBOOK.ink,
                        textAlign: "center",
                      }}
                    >
                      {backCoverText}
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}

        {backCoverLayout === "full-bleed" && backCoverImageBlob && (
          <>
            <Image
              src={backCoverImageBlob}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: coverPageWidth,
                height: coverPageHeight,
                objectFit: "cover",
                ...(backCoverFocalPoint
                  ? {
                      objectPositionX: `${backCoverFocalPoint.x * 100}%`,
                      objectPositionY: `${backCoverFocalPoint.y * 100}%`,
                    }
                  : {}),
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: coverPageWidth,
                height: coverScrimHeight,
              }}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: (coverScrimHeight * i) / 10,
                    width: coverPageWidth,
                    height: coverScrimHeight / 10 + 0.5,
                    backgroundColor: "#000000",
                    opacity: (0.55 * (i + 1)) / 10,
                  }}
                />
              ))}
            </View>
            {!!backCoverText && (
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: coverScrimHeight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Caveat",
                    fontWeight: 600,
                    fontSize: coverPageWidth * 0.06,
                    color: "#FFFFFF",
                    textAlign: "center",
                  }}
                >
                  {backCoverText}
                </Text>
              </View>
            )}
          </>
        )}
      </>
    );
  };

  // Helper to render front cover content (reused in both standalone and separated modes)
  const renderFrontCoverContent = () => (
    <>
      {coverLayout === "text-only" && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: coverPageWidth * 0.1,
          }}
        >
          <View
            style={{
              width: coverPageWidth * 0.3,
              height: 1,
              backgroundColor: SCRAPBOOK.ink,
              opacity: 0.3,
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              fontFamily: "Caveat",
              fontWeight: 600,
              fontSize: coverPageWidth * 0.09,
              color: SCRAPBOOK.ink,
              textAlign: "center",
            }}
          >
            {coverTitle || album.albumName}
          </Text>
          <View
            style={{
              width: coverPageWidth * 0.3,
              height: 1,
              backgroundColor: SCRAPBOOK.ink,
              opacity: 0.3,
              marginTop: 16,
            }}
          />
        </View>
      )}

      {coverLayout === "photo-title" && coverImageBlob && (
        <>
          <View
            style={{
              position: "absolute",
              top: coverPageHeight * 0.08,
              left: coverPageWidth * 0.08,
              width: coverPageWidth * 0.84,
              height: coverPageHeight * 0.68,
              backgroundColor: SCRAPBOOK.mat,
            }}
          >
            <PdfPhotoImage
              src={coverImageBlob}
              top={coverPageWidth * 0.02}
              left={coverPageWidth * 0.02}
              containerWidth={coverPageWidth * 0.8}
              containerHeight={coverPageHeight * 0.64}
              focalPoint={coverFocalPoint}
            />
          </View>
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: coverPageHeight * 0.2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Caveat",
                fontWeight: 600,
                fontSize: coverPageWidth * 0.055,
                color: SCRAPBOOK.ink,
                textAlign: "center",
              }}
            >
              {coverTitle || album.albumName}
            </Text>
          </View>
        </>
      )}

      {coverLayout === "full-bleed" && coverImageBlob && (
        <>
          <Image
            src={coverImageBlob}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: coverPageWidth,
              height: coverPageHeight,
              objectFit: "cover",
              ...(coverFocalPoint
                ? {
                    objectPositionX: `${coverFocalPoint.x * 100}%`,
                    objectPositionY: `${coverFocalPoint.y * 100}%`,
                  }
                : {}),
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: coverPageWidth,
              height: coverScrimHeight,
            }}
          >
            {Array.from({ length: 10 }, (_, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  top: (coverScrimHeight * i) / 10,
                  width: coverPageWidth,
                  height: coverScrimHeight / 10 + 0.5,
                  backgroundColor: "#000000",
                  opacity: (0.55 * (i + 1)) / 10,
                }}
              />
            ))}
          </View>
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: coverScrimHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Caveat",
                fontWeight: 600,
                fontSize: coverPageWidth * 0.06,
                color: "#FFFFFF",
                textAlign: "center",
              }}
            >
              {coverTitle || album.albumName}
            </Text>
          </View>
        </>
      )}
    </>
  );

  // Determine what to include based on PDF type
  const includeFrontCover =
    pdfType === "front-cover-standalone" ||
    (pdfType === "full" && showCover && !separatedCover);
  const includeBackCover =
    pdfType === "back-cover-standalone" ||
    (pdfType === "full" && showCover && !separatedCover);
  const includeSeparatedCover = pdfType === "cover" || (pdfType === "full" && separatedCover);
  const includeInteriorPages = pdfType === "full" || pdfType === "interior";

  return (
  <Document pageLayout={pageLayout}>
    {includeFrontCover && (
      <Page
        size={{ width: coverBleedWidth, height: coverBleedHeight }}
        style={{
          ...staticStyles.page,
          backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
        }}
      >
        <PdfPageBackground
          background={pageBackground}
          width={coverBleedWidth}
          height={coverBleedHeight}
        />
        <View
          style={{
            position: "absolute",
            top: bleedPt,
            left: bleedPt,
            width: coverPageWidth,
            height: coverPageHeight,
          }}
        >

        {coverLayout === "text-only" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: coverPageWidth * 0.1,
            }}
          >
            <View
              style={{
                width: coverPageWidth * 0.3,
                height: 1,
                backgroundColor: SCRAPBOOK.ink,
                opacity: 0.3,
                marginBottom: 16,
              }}
            />
            <Text
              style={{
                fontFamily: "Caveat",
                fontWeight: 600,
                fontSize: coverPageWidth * 0.09,
                color: SCRAPBOOK.ink,
                textAlign: "center",
              }}
            >
              {coverTitle || album.albumName}
            </Text>
            <View
              style={{
                width: coverPageWidth * 0.3,
                height: 1,
                backgroundColor: SCRAPBOOK.ink,
                opacity: 0.3,
                marginTop: 16,
              }}
            />
          </View>
        )}

        {coverLayout === "photo-title" && coverImageBlob && (
          <>
            <View
              style={{
                position: "absolute",
                top: coverPageHeight * 0.08,
                left: coverPageWidth * 0.08,
                width: coverPageWidth * 0.84,
                height: coverPageHeight * 0.68,
                backgroundColor: SCRAPBOOK.mat,
              }}
            >
              <PdfPhotoImage
                src={coverImageBlob}
                top={coverPageWidth * 0.02}
                left={coverPageWidth * 0.02}
                containerWidth={coverPageWidth * 0.8}
                containerHeight={coverPageHeight * 0.64}
                focalPoint={coverFocalPoint}
              />
            </View>
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: coverPageHeight * 0.2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Caveat",
                  fontWeight: 600,
                  fontSize: coverPageWidth * 0.055,
                  color: SCRAPBOOK.ink,
                  textAlign: "center",
                }}
              >
                {coverTitle || album.albumName}
              </Text>
            </View>
          </>
        )}

        {coverLayout === "full-bleed" && coverImageBlob && (
          <>
            <Image
              src={coverImageBlob}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: coverPageWidth,
                height: coverPageHeight,
                objectFit: "cover",
                ...(coverFocalPoint
                  ? {
                      objectPositionX: `${coverFocalPoint.x * 100}%`,
                      objectPositionY: `${coverFocalPoint.y * 100}%`,
                    }
                  : {}),
              }}
            />
            {/* Approximates a top-to-bottom fade with stacked bands
                rather than an Svg gradient - see PdfPageBackground's
                comment for why Svg is avoided here. */}
            <View
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: coverPageWidth,
                height: coverScrimHeight,
              }}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: (coverScrimHeight * i) / 10,
                    width: coverPageWidth,
                    height: coverScrimHeight / 10 + 0.5,
                    backgroundColor: "#000000",
                    opacity: (0.55 * (i + 1)) / 10,
                  }}
                />
              ))}
            </View>
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: coverScrimHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Caveat",
                  fontWeight: 600,
                  fontSize: coverPageWidth * 0.06,
                  color: "#FFFFFF",
                  textAlign: "center",
                }}
              >
                {coverTitle || album.albumName}
              </Text>
            </View>
          </>
        )}

        </View>
      </Page>
    )}

    {includeSeparatedCover && showCover && (
      <Page
        size={{ width: separatedCoverBleedWidth, height: coverBleedHeight }}
        style={{
          ...staticStyles.page,
          backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
        }}
      >
        <PdfPageBackground
          background={pageBackground}
          width={separatedCoverBleedWidth}
          height={coverBleedHeight}
        />
        <View
          style={{
            position: "absolute",
            top: bleedPt,
            left: bleedPt,
            width: separatedCoverWidth,
            height: coverPageHeight,
            flexDirection: "row",
          }}
        >
          {/* Back Cover (left) */}
          <View style={{ width: coverPageWidth, height: coverPageHeight, position: "relative" }}>
            {renderBackCoverContent()}
          </View>

          {/* Spine (middle) */}
          <View
            style={{
              width: spineWidthPt,
              height: coverPageHeight,
              backgroundColor: spineColor,
              position: "relative",
            }}
          >
            {/* react-pdf's Yoga layout sizes a node BEFORE the rotation
                transform is applied - a Text centered via flex in the
                (narrow) spineWidthPt parent gets wrapped/cut to fit that
                width, same as normal (non-rotated) text would. The web
                preview avoids this with CSS white-space:nowrap, which
                react-pdf has no equivalent of. Instead, size the Text's
                own box as if it were laid out un-rotated along the
                spine's full height (plenty of room, so it never wraps),
                center that box on the spine's center point, then rotate
                it in place - rotating around an element's own center
                doesn't move that center, so it ends up centered on the
                spine post-rotation too. */}
            <Text
              style={{
                position: "absolute",
                width: coverPageHeight,
                left: spineWidthPt / 2 - coverPageHeight / 2,
                top: coverPageHeight / 2 - spineTextSize * 0.6,
                textAlign: "center",
                fontFamily: "Caveat",
                fontSize: spineTextSize,
                color: spineTextColor,
                transform: "rotate(-90deg)",
              }}
            >
              {spineTitle || album.albumName}
            </Text>
          </View>

          {/* Front Cover (right) */}
          <View style={{ width: coverPageWidth, height: coverPageHeight, position: "relative" }}>
            {renderFrontCoverContent()}
          </View>
        </View>
      </Page>
    )}

    {includeInteriorPages && pages.map((pageData) => {
      // FIXME: pdfkit (internal of react-pdf) uses 72dpi internally and we downscale everything here;
      // instead we should produce a high-quality 300 dpi pdf

      // Convert page dimensions from 300 DPI to 72 DPI
      const pageWidth = toPoints(pageData.width);
      const pageHeight = toPoints(pageData.height);
      const pageBleedWidth = pageWidth + bleedPt * 2;
      const pageBleedHeight = pageHeight + bleedPt * 2;
      return (
        <Page
          key={pageData.pageNumber}
          size={{
            width: pageBleedWidth,
            height: pageBleedHeight,
          }}
          style={{
            ...staticStyles.page,
            backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
          }}
        >
          <PdfPageBackground
            background={pageBackground}
            width={pageBleedWidth}
            height={pageBleedHeight}
          />
          <View
            style={{
              position: "absolute",
              top: bleedPt,
              left: bleedPt,
              width: pageWidth,
              height: pageHeight,
            }}
          >

          {/* Page break indicator for combined pages */}
          {combinePages && (
            <View
              style={{
                position: "absolute",
                left: pageWidth / 2,
                top: 0,
                bottom: 0,
                width: 1,
                borderLeft: "1 dashed #D1D5DB",
              }}
            />
          )}

          {/* Page caption(s) - alternating margin band, one per
              logical page (two side by side when combined) */}
          {showCaptions &&
            (combinePages
              ? [
                  {
                    key: pageData.pageNumber * 2 - 1,
                    left: 0,
                    width: pageWidth / 2,
                  },
                  {
                    key: pageData.pageNumber * 2,
                    left: pageWidth / 2,
                    width: pageWidth / 2,
                  },
                ]
              : [{ key: pageData.pageNumber, left: 0, width: pageWidth }]
            ).map((band) => {
              const caption = pageCaptions.get(band.key);
              if (!caption) return null;
              // Text size is the priority: the chosen font size is
              // always honored, and the band grows to fit it if the
              // page margin alone isn't tall enough - previously this
              // was backwards (a Math.min capped the font size to the
              // margin), which silently froze the caption at the same
              // size for most of the font size range.
              const captionFontSize = fontSize * 1.9;
              const captionPaddingVertical = Math.max(
                4,
                toPoints(validMargin) * 0.15,
              );
              const bandHeight = pageCaptionBandHeightPt(
                fontSize,
                validMargin,
              );
              return (
                <View
                  key={band.key}
                  style={{
                    position: "absolute",
                    left: band.left,
                    ...(captionAtBottom(band.key)
                      ? { bottom: 0 }
                      : { top: 0 }),
                    width: band.width,
                    height: bandHeight,
                    paddingHorizontal: Math.max(16, band.width * 0.12),
                    paddingVertical: captionPaddingVertical,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Caveat",
                      fontWeight: 600,
                      fontSize: captionFontSize,
                      color: SCRAPBOOK.ink,
                      textAlign: "center",
                    }}
                  >
                    {caption}
                  </Text>
                </View>
              );
            })}

          {pageData.photos.map((photoBox) => {
            const width = toPoints(photoBox.width);
            const height = toPoints(photoBox.height);
            const frameInset = Math.max(4, width * 0.035);
            const tilt = photoTiltDeg(photoBox.id);
            const tape = tapeStyle(photoBox.id);
            const tapeWidth = width * 0.22;

            // Text card - no backing photo, an editable note
            // mounted the same way as a photo card.
            if (!photoBox.asset) {
              if (cardStyle === "clean") {
                return (
                  <View
                    key={photoBox.id}
                    style={{
                      position: "absolute",
                      left: toPoints(photoBox.x),
                      top: toPoints(photoBox.y),
                      width,
                      height,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Caveat",
                        fontWeight: 500,
                        fontSize: fontSize * 1.5,
                        color: SCRAPBOOK.ink,
                        textAlign: "center",
                      }}
                    >
                      {textCardContents.get(photoBox.id) || ""}
                    </Text>
                  </View>
                );
              }
              return (
                <View
                  key={photoBox.id}
                  style={{
                    position: "absolute",
                    left: toPoints(photoBox.x),
                    top: toPoints(photoBox.y),
                    width,
                    height,
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width,
                      height,
                      transform: `rotate(${tilt}deg) scale(0.93)`,
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: 4,
                        left: 3,
                        width,
                        height,
                        backgroundColor: SCRAPBOOK.shadow,
                      }}
                    />
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width,
                        height,
                        backgroundColor: SCRAPBOOK.mat,
                        padding: frameInset * 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Caveat",
                          fontWeight: 500,
                          fontSize: fontSize * 1.5,
                          color: SCRAPBOOK.ink,
                          textAlign: "center",
                        }}
                      >
                        {textCardContents.get(photoBox.id) || ""}
                      </Text>
                    </View>
                    <View
                      style={{
                        position: "absolute",
                        top: -frameInset * 0.5,
                        left: (width - tapeWidth) / 2,
                        width: tapeWidth,
                        height: frameInset * 1.6,
                        backgroundColor: tape.color,
                        opacity: 0.8,
                        transform: `rotate(${tape.tiltDeg}deg)`,
                      }}
                    />
                  </View>
                </View>
              );
            }

            const asset = photoBox.asset;
            // Pre-fetched by handleGeneratePdf as a Blob ("preview"
            // size - always a plain, pre-rotated JPEG, unlike the
            // original upload which can be any format/orientation).
            const imageBlob = imageBlobs.get(asset.id);
            const cardFocalPoint = focalPoints.get(asset.id) ?? null;
            const dateStripHeight = showDates
              ? fontSize * 1.6
              : 0;
            const cardCaption = cardCaptions.get(asset.id);
            // Only cards that actually have a caption reserve the
            // extra strip - an empty card keeps its full image. The
            // strip has to be noticeably taller than the caption
            // text's own font size (not just a hair more) - confirmed
            // by testing that a strip only ~1.1x the font size makes
            // react-pdf drop the text entirely (presumably it doesn't
            // fit the line box once line-height is accounted for),
            // while ~1.6x renders reliably.
            const captionStripHeight = cardCaption
              ? fontSize * 1.3 * 1.6
              : 0;
            const bottomStripHeight =
              dateStripHeight + captionStripHeight;

            if (cardStyle === "clean") {
              return (
                <View
                  key={photoBox.id}
                  style={{
                    position: "absolute",
                    left: toPoints(photoBox.x),
                    top: toPoints(photoBox.y),
                    width,
                    height,
                  }}
                >
                  <PdfPhotoImage
                    src={imageBlob}
                    top={0}
                    left={0}
                    containerWidth={width}
                    containerHeight={height - bottomStripHeight}
                    focalPoint={cardFocalPoint}
                  />
                  {!!cardCaption && (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        width,
                        bottom: dateStripHeight,
                        height: captionStripHeight,
                        backgroundColor: "rgba(255,255,255,0.85)",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Caveat",
                          fontWeight: 500,
                          fontSize: fontSize * 1.3,
                          color: SCRAPBOOK.ink,
                          textAlign: "center",
                        }}
                      >
                        {cardCaption}
                      </Text>
                    </View>
                  )}
                  {showDates && asset.fileCreatedAt && (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        width,
                        bottom: 0,
                        height: dateStripHeight,
                        backgroundColor: "rgba(255,255,255,0.85)",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Caveat",
                          fontWeight: 500,
                          fontSize: fontSize * 1.3,
                          color: SCRAPBOOK.ink,
                        }}
                      >
                        {new Date(asset.fileCreatedAt).toLocaleDateString(
                          undefined,
                          { year: "numeric", month: "short", day: "numeric" },
                        )}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }

            return (
              <View
                key={photoBox.id}
                style={{
                  position: "absolute",
                  left: toPoints(photoBox.x),
                  top: toPoints(photoBox.y),
                  width,
                  height,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width,
                    height,
                    transform: `rotate(${tilt}deg) scale(0.93)`,
                  }}
                >
                  {/* Soft cast shadow behind the mat */}
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 3,
                      width,
                      height,
                      backgroundColor: SCRAPBOOK.shadow,
                    }}
                  />
                  {/* Polaroid mat */}
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width,
                      height,
                      backgroundColor: SCRAPBOOK.mat,
                    }}
                  >
                    <PdfPhotoImage
                      src={imageBlob}
                      top={frameInset}
                      left={frameInset}
                      containerWidth={width - frameInset * 2}
                      containerHeight={
                        height - frameInset * 2 - bottomStripHeight
                      }
                      focalPoint={cardFocalPoint}
                    />
                    {!!cardCaption && (
                      <View
                        style={{
                          position: "absolute",
                          left: frameInset,
                          width: width - frameInset * 2,
                          bottom: frameInset * 0.3 + dateStripHeight,
                          height: captionStripHeight,
                          display: "flex",
                          // react-pdf defaults to flexDirection:"column"
                          // (unlike CSS's "row" default) - without this,
                          // alignItems/justifyContent end up swapped
                          // from what they'd mean on the web, which was
                          // pushing the caption to the right instead of
                          // centering it.
                          flexDirection: "row",
                          alignItems: "flex-end",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Caveat",
                            fontWeight: 500,
                            fontSize: fontSize * 1.3,
                            color: SCRAPBOOK.ink,
                            textAlign: "center",
                          }}
                        >
                          {cardCaption}
                        </Text>
                      </View>
                    )}
                    {showDates && asset.fileCreatedAt && (
                      <View
                        style={{
                          position: "absolute",
                          left: frameInset,
                          width: width - frameInset * 2,
                          bottom: frameInset * 0.3,
                          height: dateStripHeight,
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "flex-end",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Caveat",
                            fontWeight: 500,
                            fontSize: fontSize * 1.3,
                            color: SCRAPBOOK.ink,
                          }}
                        >
                          {new Date(
                            asset.fileCreatedAt,
                          ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </Text>
                      </View>
                    )}
                  </View>
                  {/* Washi tape */}
                  <View
                    style={{
                      position: "absolute",
                      top: -frameInset * 0.5,
                      left: (width - tapeWidth) / 2,
                      width: tapeWidth,
                      height: frameInset * 1.6,
                      backgroundColor: tape.color,
                      opacity: 0.8,
                      transform: `rotate(${tape.tiltDeg}deg)`,
                    }}
                  />
                </View>
              </View>
            );
          })}
          </View>
        </Page>
      );
    })}

    {includeBackCover && (
      <Page
        size={{ width: coverBleedWidth, height: coverBleedHeight }}
        style={{
          ...staticStyles.page,
          backgroundColor: PAGE_BACKGROUNDS[pageBackground].base,
        }}
      >
        <PdfPageBackground
          background={pageBackground}
          width={coverBleedWidth}
          height={coverBleedHeight}
        />
        <View
          style={{
            position: "absolute",
            top: bleedPt,
            left: bleedPt,
            width: coverPageWidth,
            height: coverPageHeight,
          }}
        >
        {backCoverLayout === "text-only" && !!backCoverText && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: coverPageWidth * 0.1,
            }}
          >
            <View
              style={{
                width: coverPageWidth * 0.3,
                height: 1,
                backgroundColor: SCRAPBOOK.ink,
                opacity: 0.3,
                marginBottom: 16,
              }}
            />
            <Text
              style={{
                fontFamily: "Caveat",
                fontWeight: 600,
                fontSize: coverPageWidth * 0.09,
                color: SCRAPBOOK.ink,
                textAlign: "center",
              }}
            >
              {backCoverText}
            </Text>
            <View
              style={{
                width: coverPageWidth * 0.3,
                height: 1,
                backgroundColor: SCRAPBOOK.ink,
                opacity: 0.3,
                marginTop: 16,
              }}
            />
          </View>
        )}

        {backCoverLayout === "photo-title" &&
          Boolean(backCoverImageBlob || backCoverText) &&
          (() => {
            const hasImage = !!backCoverImageBlob;
            // Plain text has no photo to mount, so no card/mat either -
            // it just sits on the page background, centered on the
            // whole page (not the whole scrapbook card treatment).
            if (!hasImage && backCoverPlainText && backCoverText) {
              const plainWidth = coverPageWidth * 0.7;
              return (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: (coverPageWidth - plainWidth) / 2,
                    width: plainWidth,
                    height: coverPageHeight,
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Caveat",
                      fontWeight: 500,
                      fontSize: fontSize * 1.9,
                      color: SCRAPBOOK.ink,
                      textAlign: "center",
                    }}
                  >
                    {backCoverText}
                  </Text>
                </View>
              );
            }

            // Card mounted flat (no tilt/tape), centered on the whole
            // page, so it reads as a closing note rather than another
            // scrapbook page.
            const cardWidth = coverPageWidth * 0.42;
            const cardHeight = coverPageHeight * 0.3;
            const cardTop = (coverPageHeight - cardHeight) / 2;
            const cardLeft = (coverPageWidth - cardWidth) / 2;
            const frameInset = Math.max(4, cardWidth * 0.045);
            const captionStripHeight = backCoverText
              ? fontSize * 1.3 * 1.6
              : 0;
            return (
              <View
                style={{
                  position: "absolute",
                  top: cardTop,
                  left: cardLeft,
                  width: cardWidth,
                  height: cardHeight,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 3,
                    width: cardWidth,
                    height: cardHeight,
                    backgroundColor: SCRAPBOOK.shadow,
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: cardWidth,
                    height: cardHeight,
                    backgroundColor: SCRAPBOOK.mat,
                  }}
                >
                  {backCoverImageBlob && (
                    <PdfPhotoImage
                      src={backCoverImageBlob}
                      top={frameInset}
                      left={frameInset}
                      containerWidth={cardWidth - frameInset * 2}
                      containerHeight={
                        cardHeight - frameInset * 2 - captionStripHeight
                      }
                      focalPoint={backCoverFocalPoint}
                    />
                  )}
                  {!!backCoverText && (
                    <View
                      style={{
                        position: "absolute",
                        left: frameInset,
                        width: cardWidth - frameInset * 2,
                        bottom: backCoverImageBlob ? frameInset * 0.3 : 0,
                        height: backCoverImageBlob
                          ? captionStripHeight
                          : cardHeight,
                        display: "flex",
                        flexDirection: "row",
                        alignItems: backCoverImageBlob
                          ? "flex-end"
                          : "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Caveat",
                          fontWeight: 500,
                          fontSize: backCoverImageBlob
                            ? fontSize * 1.3
                            : fontSize * 1.5,
                          color: SCRAPBOOK.ink,
                          textAlign: "center",
                        }}
                      >
                        {backCoverText}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()}

        {backCoverLayout === "full-bleed" && backCoverImageBlob && (
          <>
            <Image
              src={backCoverImageBlob}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: coverPageWidth,
                height: coverPageHeight,
                objectFit: "cover",
                ...(backCoverFocalPoint
                  ? {
                      objectPositionX: `${backCoverFocalPoint.x * 100}%`,
                      objectPositionY: `${backCoverFocalPoint.y * 100}%`,
                    }
                  : {}),
              }}
            />
            {!!backCoverText && (
              <>
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: 0,
                    width: coverPageWidth,
                    height: coverScrimHeight,
                  }}
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <View
                      key={i}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: (coverScrimHeight * i) / 10,
                        width: coverPageWidth,
                        height: coverScrimHeight / 10 + 0.5,
                        backgroundColor: "#000000",
                        opacity: (0.55 * (i + 1)) / 10,
                      }}
                    />
                  ))}
                </View>
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: coverScrimHeight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Caveat",
                      fontWeight: 600,
                      fontSize: coverPageWidth * 0.06,
                      color: "#FFFFFF",
                      textAlign: "center",
                    }}
                  >
                    {backCoverText}
                  </Text>
                </View>
              </>
            )}
          </>
        )}

        </View>
      </Page>
    )}
  </Document>
  );
}
