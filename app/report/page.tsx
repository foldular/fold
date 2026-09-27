"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useEffect } from "react";

const reasons = [
  ["copyright", "Copyright"],
  ["spam", "Spam"],
  ["malware", "Malware"],
  ["illegal", "Illegal content"],
  ["misleading", "Wrong or misleading"],
  ["other", "Other"],
] as const;

export default function ReportPage() {
  const [slug, setSlug] = useState("");
  useEffect(() => {
    setSlug(new URLSearchParams(window.location.search).get("slug") ?? "");
  }, []);
  const [reason, setReason] = useState("copyright");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slug) {
      setError("This report is missing a document.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/library/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason, details }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to submit report.");
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit report.");
      setStatus("error");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="site-header">
          <Link href="/" className="logo">fold.</Link>
          <Link href="/library" className="library-link">library →</Link>
        </header>

        <section className="tool-page">
          <div className="tool-heading">
            <h1>report.</h1>
            <p>tell us what needs attention.</p>
          </div>

          {status === "done" ? (
            <div className="result">
              <span className="result-label">report received.</span>
              <h2>thanks for flagging this.</h2>
              <p className="report-copy">We&apos;ll review the document and take appropriate action.</p>
              <Link href={slug ? `/library/${slug}` : "/library"} className="download-button">
                back to library →
              </Link>
            </div>
          ) : (
            <form className="report-form" onSubmit={submit}>
              <label className="publish-field">
                <span>reason</span>
                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <label className="publish-field">
                <span>details <em>optional</em></span>
                <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} rows={5} placeholder="Tell us what is wrong." />
              </label>

              {error && <p className="error-message">{error}</p>}
              <button type="submit" className="process-button" disabled={status === "sending"}>
                {status === "sending" ? "sending..." : "submit report →"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
