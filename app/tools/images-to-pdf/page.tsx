"use client";

import {
  ChangeEvent,
  useEffect,
  useState,
} from "react";
import { ProcessingProgress } from "../../../components/ProcessingProgress";
import { ResultPanel } from "../../../components/ResultPanel";
import { ToolShell } from "../../../components/ToolShell";

const MAX_FILES = 30;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

const progressStages = [
  {
    label: "preparing your images.",
    detail: "checking the files and their order.",
    percent: 12,
  },
  {
    label: "building your PDF.",
    detail: "placing each image onto its own page.",
    percent: 58,
  },
  {
    label: "optimizing the result.",
    detail: "writing the final PDF structure.",
    percent: 84,
  },
  {
    label: "finishing up.",
    detail: "almost there.",
    percent: 94,
  },
];

type ImageItem = {
  file: File;
  url: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSupportedImage(file: File) {
  const name = file.name.toLowerCase();

  return (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png")
  );
}

export default function ImagesToPdfPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    imageCount: number;
    pageCount: number;
    size: number;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (result?.url) {
        URL.revokeObjectURL(result.url);
      }
    };
  }, [result?.url]);

  useEffect(() => {
    if (!processing) return;

    const timers = [
      window.setTimeout(() => setProgressStage(1), 300),
      window.setTimeout(() => setProgressStage(2), 1200),
      window.setTimeout(() => setProgressStage(3), 2200),
    ];

    return () =>
      timers.forEach((timer) => window.clearTimeout(timer));
  }, [processing]);

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!selected.length) return;

    const invalid = selected.find(
      (file) =>
        !isSupportedImage(file) ||
        file.size === 0 ||
        file.size > MAX_FILE_SIZE
    );

    if (invalid) {
      setError(
        invalid.size > MAX_FILE_SIZE
          ? `"${invalid.name}" is larger than 20 MB.`
          : `"${invalid.name}" is not a supported image. Use JPG, JPEG, or PNG.`
      );
      return;
    }

    const remaining = MAX_FILES - images.length;

    if (selected.length > remaining) {
      setError(`You can convert up to ${MAX_FILES} images at once.`);
      return;
    }

    const currentTotal = images.reduce(
      (sum, item) => sum + item.file.size,
      0
    );

    const selectedTotal = selected.reduce(
      (sum, file) => sum + file.size,
      0
    );

    if (currentTotal + selectedTotal > MAX_TOTAL_SIZE) {
      setError("The total image size must be 100 MB or smaller.");
      return;
    }

    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }

    const newItems = selected.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));

    setImages((current) => [...current, ...newItems]);
    setResult(null);
    setError("");
  }

  function removeImage(index: number) {
    const item = images[index];
    if (item) URL.revokeObjectURL(item.url);

    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }

    setImages((current) =>
      current.filter((_, currentIndex) => currentIndex !== index)
    );
    setResult(null);
    setError("");
  }

  function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;

    if (
      nextIndex < 0 ||
      nextIndex >= images.length
    ) {
      return;
    }

    const next = [...images];
    [next[index], next[nextIndex]] = [
      next[nextIndex],
      next[index],
    ];

    setImages(next);
    setResult(null);
    setError("");
  }

  async function handleCreatePdf() {
    if (!images.length || processing) return;

    setProcessing(true);
    setProgressStage(0);
    setFinalizing(false);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();

      images.forEach((item) => {
        formData.append("files", item.file);
      });

      const response = await fetch(
        "/api/images-to-pdf",
        {
          method: "POST",
          body: formData,
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error ||
            "We couldn't create that PDF."
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setProgressStage(3);
      setFinalizing(true);

      await new Promise((resolve) =>
        window.setTimeout(resolve, 220)
      );

      setResult({
        url,
        size: blob.size,
        imageCount:
          Number(
            response.headers.get("X-Image-Count")
          ) || images.length,
        pageCount:
          Number(
            response.headers.get("X-Pdf-Pages")
          ) || images.length,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setProcessing(false);
      setFinalizing(false);
    }
  }

  function reset() {
    images.forEach((item) =>
      URL.revokeObjectURL(item.url)
    );

    if (result?.url) {
      URL.revokeObjectURL(result.url);
    }

    setImages([]);
    setResult(null);
    setError("");
    setProgressStage(0);
    setFinalizing(false);
  }

  const totalSize = images.reduce(
    (sum, item) => sum + item.file.size,
    0
  );

  return (
    <ToolShell
      title="images → pdf."
      description="turn your images into a single PDF."
    >
      {!images.length ? (
        <label className="upload-zone">
          <span className="upload-title">
            drop your images here
          </span>

          <span className="upload-subtitle">
            or choose files from your device · JPG, PNG · max 20 MB each
          </span>

          <span className="file-button">
            choose images
          </span>

          <input
            className="hidden-input"
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            multiple
            onChange={addImages}
          />
        </label>
      ) : (
        <>
          <div className="merge-file-header">
            <span>{images.length} images selected</span>
            <span>{formatBytes(totalSize)} total</span>
          </div>

          {!result ? (
            <div className="merge-section">
              <div className="image-file-list">
                {images.map((item, index) => (
                  <div
                    className="image-file"
                    key={`${item.file.name}-${index}`}
                  >
                    <div className="image-file-preview">
                      <img
                        src={item.url}
                        alt=""
                      />
                    </div>

                    <div className="image-file-info">
                      <span className="merge-file-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="merge-file-name">
                        {item.file.name}
                      </span>
                      <span className="merge-file-size">
                        {formatBytes(item.file.size)}
                      </span>
                    </div>

                    <div className="merge-file-actions">
                      <button
                        type="button"
                        onClick={() =>
                          moveImage(index, -1)
                        }
                        disabled={
                          processing || index === 0
                        }
                        aria-label={`Move ${item.file.name} up`}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          moveImage(index, 1)
                        }
                        disabled={
                          processing ||
                          index === images.length - 1
                        }
                        aria-label={`Move ${item.file.name} down`}
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeImage(index)
                        }
                        disabled={processing}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!processing ? (
                <>
                  <label className="add-files-link">
                    + add more images
                    <input
                      className="hidden-input"
                      type="file"
                      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                      multiple
                      onChange={addImages}
                    />
                  </label>

                  <button
                    type="button"
                    className="process-button"
                    onClick={handleCreatePdf}
                    disabled={!images.length}
                  >
                    create PDF →
                  </button>
                </>
              ) : (
                <ProcessingProgress
                  stages={progressStages}
                  stage={progressStage}
                  finalizing={finalizing}
                  ariaLabel="Creating PDF from images"
                />
              )}

              {error && (
                <p className="error-message">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <ResultPanel
              title="your PDF is ready."
              heading="PDF created."
              stats={[
                {
                  label: "images",
                  value: result.imageCount,
                },
                {
                  label: "pages",
                  value: result.pageCount,
                },
                {
                  label: "size",
                  value: formatBytes(result.size),
                },
              ]}
              downloadHref={result.url}
              downloadName="images.pdf"
              publishText="want to share it? publish to library →"
              resetLabel="create another PDF"
              onReset={reset}
            />
          )}
        </>
      )}
    </ToolShell>
  );
}
