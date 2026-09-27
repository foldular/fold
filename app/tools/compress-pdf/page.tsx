"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { ProcessingProgress } from "../../../components/ProcessingProgress";
import { ResultPanel } from "../../../components/ResultPanel";
import { ToolShell } from "../../../components/ToolShell";

type CompressionLevel = "strong" | "recommended" | "low";

const compressionOptions: {
  id: CompressionLevel;
  name: string;
  description: string;
}[] = [
  { id: "strong", name: "strong", description: "smallest file · more quality loss" },
  { id: "recommended", name: "recommended", description: "good balance · best for most PDFs" },
  { id: "low", name: "low", description: "larger file · preserves more quality" },
];

const progressStages = [
  { label: "preparing your PDF.", detail: "getting the original file ready.", percent: 12 },
  { label: "compressing your PDF.", detail: "reducing file size and image data.", percent: 55 },
  { label: "optimizing the result.", detail: "checking the compressed PDF.", percent: 84 },
  { label: "finishing up.", detail: "almost there.", percent: 94 },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CompressPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<CompressionLevel>("recommended");
  const [processing, setProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [result, setResult] = useState<{ size: number; url: string; compressed: boolean } | null>(null);
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

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      setError("The maximum file size is 50 MB.");
      return;
    }

    if (result) URL.revokeObjectURL(result.url);
    setFile(selected);
    setResult(null);
    setError("");
  }

  function handleLevelChange(nextLevel: CompressionLevel) {
    if (result) URL.revokeObjectURL(result.url);
    setLevel(nextLevel);
    setResult(null);
    setError("");
  }

  async function handleCompress() {
    if (!file || processing) return;

    setProcessing(true);
    setProgressStage(0);
    setFinalizing(false);
    setError("");

    const originalFile = file;
    const selectedLevel = level;

    try {
      const formData = new FormData();
      formData.append("file", originalFile);
      formData.append("level", selectedLevel);

      const response = await fetch("/api/compress", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "We couldn't compress that PDF.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setProgressStage(3);
      setFinalizing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 220));

      setResult({
        size: blob.size,
        url,
        compressed: response.headers.get("X-Compression-Applied") === "true",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setProcessing(false);
      setFinalizing(false);
    }
  }

  function reset() {
    if (result) URL.revokeObjectURL(result.url);
    setFile(null);
    setResult(null);
    setError("");
    setProgressStage(0);
    setFinalizing(false);
  }

  const reduction = file && result && file.size > 0
    ? Math.max(0, ((file.size - result.size) / file.size) * 100)
    : 0;

  return (
    <ToolShell title="compress pdf." description="make your PDF smaller without the unnecessary hassle.">
      {!file ? (
        <label className="upload-zone">
          <span className="upload-title">drop your PDF here</span>
          <span className="upload-subtitle">or choose a file from your device · max 50 MB</span>
          <span className="file-button">choose PDF</span>
          <input className="hidden-input" type="file" accept="application/pdf,.pdf" onChange={handleFile} />
        </label>
      ) : (
        <>
          <div className="file-selected">
            <span className="file-name">{file.name}</span>
            <span className="file-meta">{formatBytes(file.size)}</span>
          </div>

          {!result ? (
            <div className="compression-section">
              <span className="section-label">compression</span>

              {!processing ? (
                <>
                  <div className="compression-options">
                    {compressionOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`compression-option ${level === option.id ? "active" : ""}`}
                        onClick={() => handleLevelChange(option.id)}
                      >
                        <span className="option-name">{option.name}</span>
                        <span className="option-description">{option.description}</span>
                      </button>
                    ))}
                  </div>

                  <button type="button" className="process-button" onClick={handleCompress}>
                    compress PDF →
                  </button>
                </>
              ) : (
                <ProcessingProgress
                  stages={progressStages}
                  stage={progressStage}
                  finalizing={finalizing}
                  ariaLabel="Compressing PDF"
                />
              )}

              {error && <p className="error-message">{error}</p>}
            </div>
          ) : (
            <ResultPanel
              title="your PDF is ready."
              heading={result.compressed ? "compression complete." : "your PDF is already optimized."}
              stats={[
                { label: "original", value: formatBytes(file.size) },
                { label: "compressed", value: formatBytes(result.size) },
                { label: "saved", value: `${reduction.toFixed(1)}%` },
              ]}
              downloadHref={result.url}
              downloadName={`${file.name.replace(/\.pdf$/i, "")}-compressed.pdf`}
              publishText="want to share it? publish to library →"
              resetLabel="compress another PDF"
              onReset={reset}
            />
          )}
        </>
      )}
    </ToolShell>
  );
}
