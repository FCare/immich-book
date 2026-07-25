// Concatenates several already-rendered PDFs (in order) into one file.
// Done server-side (see backend/main.py's /pdf/merge) rather than in the
// browser: a large book's combined size (several GB at full image
// quality) can exceed what a browser tab can allocate as one contiguous
// buffer, even though each individual chunk (rendered client-side by
// react-pdf, kept small enough for its WASM layout engine) is fine on
// its own. The server just concatenates pages - no re-encoding, so this
// step costs nothing in image quality.
// Generous, but bounded: without this, a request that hangs (a proxy
// timeout misconfiguration, a dropped connection, anything short of an
// explicit HTTP error) leaves handleGeneratePdf's await stuck forever -
// isGeneratingPdf never clears and no error ever surfaces, which looks
// exactly like a silent freeze instead of a diagnosable failure.
const MERGE_TIMEOUT_MS = 5 * 60 * 1000;

export async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  const formData = new FormData();
  blobs.forEach((blob, i) => {
    formData.append("files", blob, `part-${i}.pdf`);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MERGE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/pdf/merge", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        `PDF merge timed out after ${MERGE_TIMEOUT_MS / 1000}s`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PDF merge failed: HTTP ${res.status} ${body}`.trim());
  }
  return res.blob();
}
