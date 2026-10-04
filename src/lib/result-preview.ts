import type * as pdfjsTypes from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface PdfPreview {
  pageCount: number;
  /** Data URL of the first rendered page. */
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfPreviewOptions {
  /** Longest edge of the rendered bitmap, so a large page cannot blow up memory. */
  maxEdge?: number;
  /** Device pixel ratio cap for the render target. */
  maxScale?: number;
}

const DEFAULT_MAX_EDGE = 1400;
const DEFAULT_MAX_SCALE = 2;
const MAX_TEXT_PREVIEW_BYTES = 200_000;

let pdfjsPromise: Promise<typeof pdfjsTypes> | null = null;

/**
 * pdf.js is browser-only and prints a Node warning when it is evaluated during
 * prerendering, so it is pulled in on first use instead of at module load.
 */
function loadPdfjs(): Promise<typeof pdfjsTypes> {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    return pdfjs;
  });

  return pdfjsPromise;
}

export class PdfPreviewError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PdfPreviewError";
  }
}

/**
 * Renders the first page of a real PDF with pdf.js. The bytes handed in are the
 * exact bytes the server returned for this conversion, so the preview is the
 * produced file and not a stand-in for it.
 */
export async function renderPdfPreview(
  data: ArrayBuffer,
  options: PdfPreviewOptions = {}
): Promise<PdfPreview> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;

  const pdfjs = await loadPdfjs();

  let pdfDocument: pdfjsTypes.PDFDocumentProxy;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    // Never let pdf.js reach out to the network for fonts or CMaps: a
    // preview must not depend on anything outside the file itself.
    disableFontFace: false,
    useSystemFonts: true
  });

  try {
    pdfDocument = await loadingTask.promise;
  } catch (error) {
    throw new PdfPreviewError(
      "This PDF could not be opened in the browser.",
      { cause: error }
    );
  }

  try {
    const pageCount = pdfDocument.numPages;

    if (pageCount < 1) {
      throw new PdfPreviewError("This PDF has no pages to preview.");
    }

    const page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const fit = Math.min(
      1,
      maxEdge / Math.max(baseViewport.width, baseViewport.height)
    );
    const scale = Math.max(0.1, fit * Math.min(window.devicePixelRatio || 1, maxScale));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext("2d");

    if (!context) {
      throw new PdfPreviewError("This browser does not provide a 2D canvas.");
    }

    // PDF pages assume paper white. Without this the page renders transparent
    // and black text disappears against a dark surface.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const dataUrl = canvas.toDataURL("image/png");

    page.cleanup();

    return {
      pageCount,
      dataUrl,
      width: canvas.width,
      height: canvas.height
    };
  } catch (error) {
    if (error instanceof PdfPreviewError) {
      throw error;
    }

    throw new PdfPreviewError("This PDF could not be rendered.", {
      cause: error
    });
  } finally {
    await loadingTask.destroy();
  }
}

const TEXT_PREVIEW_LIMIT = 12_000;

/**
 * Reads a converted blob as readable text. Used for output formats whose payload
 * is genuinely text, so the panel shows the produced bytes rather than a label.
 */
export async function readTextPreview(blob: Blob): Promise<string> {
  const truncatedBlob =
    blob.size > MAX_TEXT_PREVIEW_BYTES
      ? blob.slice(0, MAX_TEXT_PREVIEW_BYTES)
      : blob;

  const text = await truncatedBlob.text();

  return blob.size > MAX_TEXT_PREVIEW_BYTES
    ? `${text}\n\n… preview truncated at ${MAX_TEXT_PREVIEW_BYTES.toLocaleString(
        "en-US"
      )} of ${blob.size.toLocaleString("en-US")} bytes.`
    : text;
}

/** Keeps long single-line payloads (SVG, JSON) readable instead of overflowing. */
export function clampPreviewText(text: string): string {
  return text.length > TEXT_PREVIEW_LIMIT
    ? `${text.slice(0, TEXT_PREVIEW_LIMIT)}\n…`
    : text;
}
