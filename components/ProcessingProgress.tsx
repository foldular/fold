"use client";

import { useEffect, useState } from "react";

type ProgressStage = {
  label: string;
  detail: string;
  percent: number;
};

type ProcessingProgressProps = {
  stages: ProgressStage[];
  stage: number;
  finalizing?: boolean;
  ariaLabel: string;
};

export function ProcessingProgress({
  stages,
  stage,
  finalizing = false,
  ariaLabel,
}: ProcessingProgressProps) {
  const [displayPercent, setDisplayPercent] = useState(0);

  const activeStage = stages[Math.min(stage, stages.length - 1)] ?? stages[0];
  const targetPercent = finalizing ? 100 : activeStage?.percent ?? 0;

  useEffect(() => {
    let frame = 0;

    const animate = () => {
      setDisplayPercent((current) => {
        const difference = targetPercent - current;
        if (Math.abs(difference) < 0.5) return targetPercent;
        return current + difference * 0.12;
      });
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [targetPercent]);

  const percent = Math.round(displayPercent);

  return (
    <div
      className="processing-progress"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-live="polite"
    >
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="progress-copy">
        <span>{finalizing ? "finishing up." : activeStage?.label}</span>
        <span>{percent}%</span>
      </div>

      {!finalizing && <div className="progress-detail">{activeStage?.detail}</div>}
    </div>
  );
}
