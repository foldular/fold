"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { ProcessingProgress } from "../../../components/ProcessingProgress";
import { ResultPanel } from "../../../components/ResultPanel";
import { ToolShell } from "../../../components/ToolShell";

const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const progressStages = [
  { label: "preparing your PDFs.", detail: "checking the files and their order.", percent: 12 },
  { label: "merging your PDFs.", detail: "combining the pages into one document.", percent: 58 },
  { label: "optimizing the result.", detail: "writing the final PDF structure.", percent: 84 },
  { label: "finishing up.", detail: "almost there.", percent: 94 },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MergePdfPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; fileCount: number; pageCount: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    };
  }, [result?.url]);

  useEffect(() => {
    if (!processing) return;
    const timers = [
      window.setTimeout(() => setProgressStage(1), 300),
      window.setTimeout(() => setProgressStage(2), 1200),
      window.setTimeout(() => setProgressStage(3), 2200),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [processing]);

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;

    const invalid = selected.find(
      (file) =>
        (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) ||
        file.size === 0 ||
        file.size > MAX_FILE_SIZE
    );

    if (invalid) {
      setError(invalid.size > MAX_FILE_SIZE ? `"${invalid.name}" is larger than 50 MB.` : `"${invalid.name}" is not a valid PDF.`);
      return;
    }

    const remaining = MAX_FILES - files.length;
    if (selected.length > remaining) {
      setError(`You can merge up to ${MAX_FILES} PDFs at once.`);
      return;
    }

    if (result?.url) URL.revokeObjectURL(result.url);
    setFiles((current) => [...current, ...selected]);
    setResult(null);
    setError("");
  }

  function removeFile(index: number) {
    if (result?.url) URL.revokeObjectURL(result.url);
    setFiles((current) => current.filter((_, i) => i !== index));
    setResult(null);
    setError("");
  }

  function moveFile(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= files.length) return;
    const next = [...files];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setFiles(next);
    setResult(null);
    setError("");
  }

  async function handleMerge() {
    if (files.length < 2 || processing) return;

    setProcessing(true);
    setProgressStage(0);
    setFinalizing(false);
    setError("");

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/merge", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "We couldn't merge those PDFs.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setProgressStage(3);
      setFinalizing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 220));

      setResult({
        url,
        size: blob.size,
        fileCount: Number(response.headers.get("X-Merged-Files")) || files.length,
        pageCount: Number(response.headers.get("X-Merged-Pages")) || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setProcessing(false);
      setFinalizing(false);
    }
  }

  function reset() {
    if (result?.url) URL.revokeObjectURL(result.url);
    setFiles([]);
    setResult(null);
    setError("");
    setProgressStage(0);
    setFinalizing(false);
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <ToolShell title="merge pdf." description="combine multiple PDFs into one clean file.">
      {!files.length ? (
        <label className="upload-zone">
          <span className="upload-title">drop your PDFs here</span>
          <span className="upload-subtitle">or choose files from your device · max 50 MB each</span>
          <span className="file-button">choose PDFs</span>
          <input className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={addFiles} />
        </label>
      ) : (
        <>
          <div className="merge-file-header">
            <span>{files.length} PDFs selected</span>
            <span>{formatBytes(totalSize)} total</span>
          </div>

          {!result ? (
            <div className="merge-section">
              <div className="merge-file-list">
                {files.map((file, index) => (
                  <div className="merge-file" key={`${file.name}-${index}`}>
                    <div className="merge-file-info">
                      <span className="merge-file-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="merge-file-name">{file.name}</span>
                      <span className="merge-file-size">{formatBytes(file.size)}</span>
                    </div>
                    <div className="merge-file-actions">
                      <button type="button" onClick={() => moveFile(index, -1)} disabled={processing || index === 0} aria-label={`Move ${file.name} up`}>↑</button>
                      <button type="button" onClick={() => moveFile(index, 1)} disabled={processing || index === files.length - 1} aria-label={`Move ${file.name} down`}>↓</button>
                      <button type="button" onClick={() => removeFile(index)} disabled={processing} aria-label={`Remove ${file.name}`}>×</button>
                    </div>
                  </div>
                ))}
              </div>

              {!processing ? (
                <>
                  <label className="add-files-link">
                    + add more PDFs
                    <input className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={addFiles} />
                  </label>
                  <button type="button" className="process-button" onClick={handleMerge} disabled={files.length < 2}>merge PDFs →</button>
                </>
              ) : (
                <ProcessingProgress
                  stages={progressStages}
                  stage={progressStage}
                  finalizing={finalizing}
                  ariaLabel="Merging PDFs"
                />
              )}

              {error && <p className="error-message">{error}</p>}
            </div>
          ) : (
            <ResultPanel
              title="your PDF is ready."
              heading="merge complete."
              stats={[
                { label: "files", value: result.fileCount },
                { label: "pages", value: result.pageCount },
                { label: "size", value: formatBytes(result.size) },
              ]}
              downloadHref={result.url}
              downloadName="merged.pdf"
              publishText="want to share it? publish to library →"
              resetLabel="merge more PDFs"
              onReset={reset}
            />
          )}
        </>
      )}
    </ToolShell>
  );
}
