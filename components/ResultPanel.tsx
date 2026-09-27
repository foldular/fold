"use client";

import { ReactNode, useState } from "react";
import { PublishPanel } from "./PublishPanel";

type ResultStat = {
  label: string;
  value: ReactNode;
};

type ResultPanelProps = {
  title: string;
  heading: string;
  stats: ResultStat[];
  downloadHref: string;
  downloadName: string;
  publishText: string;
  resetLabel: string;
  onReset: () => void;
  children?: ReactNode;
  publishable?: boolean;
  downloadLabel?: string;
};

export function ResultPanel({
  title,
  heading,
  stats,
  downloadHref,
  downloadName,
  publishText,
  resetLabel,
  onReset,
  children,
  publishable = true,
  downloadLabel = "download PDF →",
}: ResultPanelProps) {
  const [publishing, setPublishing] = useState(false);

  if (publishing) {
    return (
      <div className="result">
        <PublishPanel
          downloadHref={downloadHref}
          downloadName={downloadName}
          onClose={() => setPublishing(false)}
        />
      </div>
    );
  }

  return (
    <div className="result">
      <span className="result-label">{title}</span>
      <h2>{heading}</h2>

      <div className="result-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {children}

      <a
        href={downloadHref}
        download={downloadName}
        className="download-button"
      >
        {downloadLabel}
      </a>

      {publishable && (
        <button
          type="button"
          className="publish-link"
          onClick={() => setPublishing(true)}
        >
          {publishText}
        </button>
      )}

      <button
        type="button"
        className="start-over-button"
        onClick={onReset}
      >
        {resetLabel}
      </button>
    </div>
  );
}
