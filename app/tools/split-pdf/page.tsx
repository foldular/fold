"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { ProcessingProgress } from "../../../components/ProcessingProgress";
import { ResultPanel } from "../../../components/ResultPanel";
import { ToolShell } from "../../../components/ToolShell";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const progressStages = [
  { label: "preparing your PDF.", detail: "checking the file and page selection.", percent: 12 },
  { label: "reading your PDF.", detail: "loading the document pages.", percent: 30 },
  { label: "splitting your PDF.", detail: "creating the requested pages.", percent: 70 },
  { label: "finalizing the files.", detail: "writing the finished PDFs.", percent: 94 },
];

type SplitMode = "extract" | "every-page";
type Result = { url: string; fileCount: number; pageCount: number; originalPages: number; mode: SplitMode };

export default function SplitPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SplitMode>("extract");
  const [pages, setPages] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result?.url]);

  useEffect(() => {
    if (!processing) return;
    const timers = [350, 1200, 2200].map((delay, index) => window.setTimeout(() => setProgressStage(index + 1), delay));
    return () => timers.forEach(window.clearTimeout);
  }, [processing]);

  async function inspectPdf(selectedFile: File) {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(await selectedFile.arrayBuffer());
      setPageCount(pdf.getPageCount());
    } catch {
      setPageCount(null);
      setError("We couldn't read this PDF. Please try another file.");
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) return setError("Only PDF files are supported.");
    if (selected.size === 0) return setError("The uploaded PDF is empty.");
    if (selected.size > MAX_FILE_SIZE) return setError("PDFs must be 50 MB or smaller.");

    if (result?.url) URL.revokeObjectURL(result.url);
    setFile(selected);
    setResult(null);
    setError("");
    setPages("");
    inspectPdf(selected);
  }

  function validatePages() {
    if (mode === "every-page") return true;
    if (!pages.trim()) { setError("Enter the pages you want to extract."); return false; }
    if (!pageCount) { setError("We couldn't determine the PDF page count."); return false; }

    for (const rawPart of pages.split(",")) {
      const part = rawPart.trim();
      if (!part) continue;
      if (part.includes("-")) {
        const [startValue, endValue] = part.split("-").map((value) => value.trim());
        const start = Number(startValue);
        const end = Number(endValue);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > pageCount) {
          setError(`"${part}" is outside the PDF's ${pageCount} pages.`);
          return false;
        }
      } else {
        const page = Number(part);
        if (!Number.isInteger(page) || page < 1 || page > pageCount) {
          setError(`"${part}" is not a valid page number.`);
          return false;
        }
      }
    }
    return true;
  }

  async function handleSplit() {
    if (!file || processing || !validatePages()) return;
    setProcessing(true); setProgressStage(0); setFinalizing(false); setError(""); setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      if (mode === "extract") formData.append("pages", pages);

      const response = await fetch("/api/split", { method: "POST", body: formData, cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "We couldn't split that PDF.");
      }

      const url = URL.createObjectURL(await response.blob());
      setProgressStage(3); setFinalizing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 220));

      setResult({
        url,
        fileCount: Number(response.headers.get("X-Split-Files")) || 1,
        pageCount: Number(response.headers.get("X-Split-Pages")) || 0,
        originalPages: Number(response.headers.get("X-Original-Pages")) || pageCount || 0,
        mode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setProcessing(false); setFinalizing(false);
    }
  }

  function reset() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setFile(null); setMode("extract"); setPages(""); setPageCount(null); setProcessing(false); setProgressStage(0); setFinalizing(false); setResult(null); setError("");
  }

  return (
    <ToolShell title="split pdf." description="separate pages from your PDF.">
      {!file ? (
        <label className="upload-zone">
          <span className="upload-title">drop your PDF here</span>
          <span className="upload-subtitle">or choose a file from your device · max 50 MB</span>
          <span className="file-button">choose PDF</span>
          <input className="hidden-input" type="file" accept="application/pdf,.pdf" onChange={handleFile} />
        </label>
      ) : (
        <>
          <div className="selected-file">
            <div><div className="file-name">{file.name}</div><div className="file-meta">{pageCount ? `${pageCount} pages` : "reading PDF..."}</div></div>
            {!processing && <button type="button" className="remove-file" onClick={reset}>remove</button>}
          </div>

          {!result && !processing && (
            <>
              <div className="compression-options">
                <button type="button" className={`compression-option ${mode === "extract" ? "active" : ""}`} onClick={() => setMode("extract")}>
                  <span className="option-name">extract pages</span><span className="option-description">choose specific pages or ranges.</span>
                </button>
                <button type="button" className={`compression-option ${mode === "every-page" ? "active" : ""}`} onClick={() => setMode("every-page")}>
                  <span className="option-name">split every page</span><span className="option-description">create one PDF for every page.</span>
                </button>
              </div>

              {mode === "extract" && (
                <div className="split-page-input">
                  <label>pages to extract</label>
                  <input type="text" value={pages} onChange={(event) => { setPages(event.target.value); setError(""); }} placeholder="e.g. 1-3, 7, 10-12" />
                  <p>Use commas for individual pages and hyphens for ranges.</p>
                </div>
              )}

              <button type="button" className="process-button" onClick={handleSplit} disabled={!file || !pageCount || (mode === "extract" && !pages.trim())}>split PDF →</button>
            </>
          )}

          {processing && <ProcessingProgress stages={progressStages} stage={progressStage} finalizing={finalizing} ariaLabel="Splitting PDF" />}

          {result && (
            <ResultPanel
              title="your PDFs are ready."
              heading={result.mode === "every-page" ? "split complete." : "extraction complete."}
              stats={[{ label: "files", value: result.fileCount }, { label: "pages", value: result.pageCount }, { label: "original", value: result.originalPages }]}
              downloadHref={result.url}
              downloadName={result.mode === "every-page" ? "split-pages.zip" : "split.pdf"}
              publishText="want to share it? publish to library →"
              resetLabel="split another PDF"
              onReset={reset}
              publishable={result.mode !== "every-page"}
              downloadLabel={result.mode === "every-page" ? "download ZIP →" : "download PDF →"}
            />
          )}

          {error && <p className="error-message">{error}</p>}
        </>
      )}
    </ToolShell>
  );
}
