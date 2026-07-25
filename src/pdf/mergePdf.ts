// Concatenates several already-rendered PDFs (in order) into one file.
// Done server-side (see backend/main.py's /pdf/merge) rather than in the
// browser: a large book's combined size (several GB at full image
// quality) can exceed what a browser tab can allocate as one contiguous
// buffer, even though each individual chunk (rendered client-side by
// react-pdf, kept small enough for its WASM layout engine) is fine on
// its own. The server just concatenates pages - no re-encoding, so this
// step costs nothing in image quality.
//
// Uses XMLHttpRequest, not fetch: this is the only way to get real
// upload-progress events in the browser (fetch has no equivalent to
// XHR's `upload.onprogress`), which matters here because uploading the
// chunk parts is the slow, silent-looking leg of a large export -
// without it, the UI has no way to show real 0-100% progress and just
// sits on a static "generating..." for as long as the transfer takes.
//
// Generous, but bounded: without a timeout, a request that hangs (a
// proxy misconfiguration, a dropped connection, anything short of an
// explicit HTTP error) leaves handleGeneratePdf's await stuck forever -
// isGeneratingPdf never clears and no error ever surfaces, which looks
// exactly like a silent freeze instead of a diagnosable failure.
const MERGE_TIMEOUT_MS = 5 * 60 * 1000;

export function mergePdfBlobs(
  blobs: Blob[],
  // 0-1. Upload (sending the parts) is treated as the first half of the
  // visible progress and download (receiving the merged file back) as
  // the second half - both legs move real, comparable amounts of data
  // for a large book, so splitting evenly reads better than pretending
  // only one of them exists.
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    blobs.forEach((blob, i) => {
      formData.append("files", blob, `part-${i}.pdf`);
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/pdf/merge");
    xhr.responseType = "blob";
    xhr.timeout = MERGE_TIMEOUT_MS;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 0.5);
    };
    xhr.onprogress = (e) => {
      onProgress?.(e.lengthComputable ? 0.5 + (e.loaded / e.total) * 0.5 : 0.5);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(xhr.response as Blob);
      } else {
        reject(new Error(`PDF merge failed: HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("PDF merge failed: network error"));
    xhr.ontimeout = () =>
      reject(new Error(`PDF merge timed out after ${MERGE_TIMEOUT_MS / 1000}s`));

    xhr.send(formData);
  });
}
