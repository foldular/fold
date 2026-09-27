"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { libraryDocuments, libraryCategories, type LibraryDocument } from "../../lib/library-data";

type RemoteDocument = LibraryDocument & { sizeBytes?: number; fileName?: string; createdAt: string; fileUrl: string };
const PAGE_SIZE = 12;

export default function LibraryPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [documents, setDocuments] = useState<RemoteDocument[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());
      if (category !== "All") params.set("category", category);

      try {
        const response = await fetch(`/api/library?${params.toString()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load library");
        setDocuments(data.documents ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
        setTotal(data.pagination?.total ?? 0);
      } catch {
        setDocuments([]);
        setTotalPages(1);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, category, page]);

  const updateQuery = (value: string) => { setQuery(value); setPage(1); };
  const updateCategory = (value: string) => { setCategory(value); setPage(1); };
  const sampleDocuments = page === 1 && !query.trim() && category === "All" ? libraryDocuments.slice(0, Math.max(0, PAGE_SIZE - documents.length)) : [];
  const combined = [...documents, ...sampleDocuments];

  return (
    <main className="page library-page">
      <div className="shell">
        <header className="site-header">
          <Link href="/" className="logo">fold.</Link>
          <Link href="/" className="library-link">tools →</Link>
        </header>

        <section className="library-content">
          <div className="tool-heading library-heading"><h1>library.</h1><p>find a document.</p></div>

          <form className="library-search-wrap" onSubmit={(event) => event.preventDefault()}>
            <input className="library-search" type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search PDFs..." aria-label="Search PDFs" />
            <button type="submit" className="library-search-button" aria-label="Search PDFs">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            </button>
          </form>

          <div className="library-filter-row">
            <label htmlFor="library-category">category</label>
            <select id="library-category" value={category} onChange={(event) => updateCategory(event.target.value)}>
              <option value="All">All</option>
              {libraryCategories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <section className="library-section">
            <div className="library-section-heading">
              <span>recently added</span>
              {category !== "All" && <button type="button" className="library-clear-filter" onClick={() => updateCategory("All")}>clear filter</button>}
            </div>

            <div className="library-document-list">
              {loading ? <div className="library-empty">loading library...</div> : combined.length > 0 ? combined.map((document) => (
                <Link href={`/library/${document.slug}`} className="library-document-row" key={document.slug}>
                  <span className="library-document-main">
                    <span className="library-document-title">{document.title}</span>
                    <span className="library-document-meta">{document.category} · {document.pages || "—"} pages · {document.size} · uploaded {formatRelativeTime(document.createdAt)}</span>
                  </span>
                  <span className="library-document-arrow">→</span>
                </Link>
              )) : <div className="library-empty">no documents found.</div>}
            </div>

            {(totalPages > 1 || total > PAGE_SIZE) && (
              <div className="library-pagination">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>← previous</button>
                <span>page {page} of {totalPages}</span>
                <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>next →</button>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
