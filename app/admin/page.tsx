"use client";

import { useState } from "react";

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [documents, setDocuments] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!token.trim()) {
      setError("Enter the admin token first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const headers = { "x-fold-admin-token": token.trim() };
      const [docsResponse, reportsResponse] = await Promise.all([
        fetch("/api/admin/library", { headers, cache: "no-store" }),
        fetch("/api/admin/reports", { headers, cache: "no-store" }),
      ]);

      if (!docsResponse.ok || !reportsResponse.ok) {
        setError("Invalid admin token or unable to load the library.");
        setLoaded(false);
        return;
      }

      const docs = await docsResponse.json();
      const reportData = await reportsResponse.json();

      setDocuments(docs.documents ?? []);
      setReports(reportData.reports ?? []);
      setLoaded(true);
    } catch {
      setError("Unable to connect to the admin service.");
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }

  async function removeDocument(id: string, title: string) {
    const confirmed = window.confirm(
      `Remove “${title}” from the Library? This also deletes the stored PDF.`
    );

    if (!confirmed) return;

    const response = await fetch("/api/admin/library", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-fold-admin-token": token.trim(),
      },
      body: JSON.stringify({ id, action: "remove" }),
    });

    if (!response.ok) {
      setError("Unable to remove this PDF.");
      return;
    }

    await load();
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="site-header">
          <a href="/" className="logo">fold.</a>
          <a href="/library" className="library-link">library →</a>
        </header>

        <section className="tool-page admin-page">
          <div className="tool-heading">
            <h1>admin.</h1>
            <p>manage documents published to the library.</p>
          </div>

          <div className="admin-login-card">
            <label className="admin-token-label" htmlFor="admin-token">
              admin token
            </label>

            <div className="admin-login">
              <input
                id="admin-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") load();
                }}
                placeholder="enter your admin token"
                autoComplete="current-password"
              />

              <button
                type="button"
                className="admin-load-button"
                onClick={load}
                disabled={loading}
              >
                {loading ? "loading..." : "open admin →"}
              </button>
            </div>

            {error && <p className="error-message">{error}</p>}
          </div>

          {loaded && (
            <>
              <section className="admin-section">
                <div className="library-section-heading">
                  <span>library documents</span>
                  <span>{documents.length} documents</span>
                </div>

                <div className="admin-list">
                  {documents.length === 0 ? (
                    <div className="library-empty">no documents.</div>
                  ) : (
                    documents.map((document) => (
                      <div className="admin-row" key={document.id}>
                        <div className="admin-document-info">
                          <strong>{document.title}</strong>
                          <span>
                            {document.category} · {document.pages} pages · {formatBytes(document.size_bytes)}
                          </span>
                          <span>
                            uploaded {formatDate(document.created_at)}
                          </span>
                        </div>

                        <div className="admin-document-status">
                          <span className="admin-status">{document.status}</span>
                          <div className="admin-actions">
                            <a
                              href={document.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="admin-view-button"
                            >
                              view
                            </a>
                            <a
                              href={`/api/admin/library/file?id=${encodeURIComponent(document.id)}`}
                              className="admin-download-button"
                            >
                              download
                            </a>
                            <button
                              type="button"
                              className="admin-remove-button"
                              onClick={() =>
                                removeDocument(document.id, document.title)
                              }
                            >
                              remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="admin-section">
                <div className="library-section-heading">
                  <span>reports</span>
                  <span>{reports.length} reports</span>
                </div>

                <div className="admin-list">
                  {reports.length === 0 ? (
                    <div className="library-empty">no reports.</div>
                  ) : (
                    reports.map((report) => (
                      <div className="admin-row" key={report.id}>
                        <div className="admin-document-info">
                          <strong>{report.library_documents?.title ?? "Document"}</strong>
                          <span>
                            {report.reason} · {report.details || "no details"}
                          </span>
                          <span>
                            reported {formatDate(report.created_at)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
