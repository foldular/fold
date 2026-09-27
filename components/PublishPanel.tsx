"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const categories = [
  "Education",
  "Business",
  "Documents",
  "Government",
  "Other",
];

type PublishPanelProps = {
  downloadHref: string;
  downloadName: string;
  onClose: () => void;
};

export function PublishPanel({
  downloadHref,
  downloadName,
  onClose,
}: PublishPanelProps) {
  const [title, setTitle] = useState(
    downloadName.replace(/\.pdf$/i, "")
  );
  const [category, setCategory] = useState("Documents");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Give your document a title.");
      return;
    }

    if (!confirmed) {
      setError("Please confirm that you have the right to share this document.");
      return;
    }

    setPublishing(true);
    setError("");

    try {
      const fileResponse = await fetch(downloadHref, {
        cache: "no-store",
      });

      if (!fileResponse.ok) {
        throw new Error("We couldn't prepare the PDF for publishing.");
      }

      const blob = await fileResponse.blob();
      const formData = new FormData();
      formData.append("file", blob, downloadName);
      formData.append("title", title.trim());
      formData.append("category", category);
      formData.append("description", description.trim());
      formData.append("confirmed", String(confirmed));

      const response = await fetch("/api/library/publish", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || "Something went wrong while publishing."
        );
      }

      setPublishedSlug(data.document.slug);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while publishing."
      );
    } finally {
      setPublishing(false);
    }
  }

  if (publishedSlug) {
    return (
      <div className="publish-panel publish-success">
        <span className="result-label">shared with the library.</span>
        <h3>your PDF is live.</h3>
        <p>
          It is now published in Fold&apos;s library and available from any device.
        </p>
        <div className="publish-success-actions">
          <Link
            href={`/library/${publishedSlug}`}
            className="process-button"
          >
            view in library →
          </Link>
          <button
            type="button"
            className="start-over-button"
            onClick={onClose}
          >
            close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="publish-panel">
      <div className="publish-heading">
        <span className="result-label">share with the library.</span>
        <h3>help others find this document.</h3>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="publish-field">
          <span>PDF title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Physics Notes"
            maxLength={120}
          />
        </label>

        <label className="publish-field">
          <span>category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="publish-field">
          <span>description <em>optional</em></span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this document?"
            rows={3}
            maxLength={500}
          />
        </label>

        <label className="publish-consent">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I have the right to share this document and understand that it will
            be publicly available.
          </span>
        </label>

        {error && <p className="error-message">{error}</p>}

        <div className="publish-actions">
          <button
            type="submit"
            className="process-button"
            disabled={publishing}
          >
            {publishing ? "publishing..." : "publish PDF →"}
          </button>
          <button
            type="button"
            className="start-over-button"
            onClick={onClose}
            disabled={publishing}
          >
            cancel
          </button>
        </div>
      </form>
    </div>
  );
}
