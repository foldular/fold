import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, LIBRARY_BUCKET } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

async function getDocument(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("library_documents").select("slug,title,category,pages,size_bytes,description,file_name,created_at,storage_path").eq("slug", slug).eq("status", "published").eq("is_public", true).maybeSingle();
  if (error || !data) return null;
  const { data: publicUrl } = supabase.storage.from(LIBRARY_BUCKET).getPublicUrl(data.storage_path);
  return { ...data, size: formatBytes(Number(data.size_bytes)), fileUrl: publicUrl.publicUrl };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const document = await getDocument(slug);
  if (!document) return { title: "Document not found — fold." };
  const description = document.description || `${document.title} — ${document.pages} page PDF in the Fold library.`;
  return {
    title: `${document.title} — fold. library`,
    description,
    alternates: { canonical: `/library/${document.slug}` },
    openGraph: { title: `${document.title} — fold. library`, description, type: "article", url: `/library/${document.slug}` },
  };
}

export default async function LibraryDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = await getDocument(slug);
  if (!document) notFound();

  return (
    <main className="page library-detail-page">
      <div className="shell">
        <header className="site-header"><Link href="/" className="logo">fold.</Link><Link href="/library" className="library-link">library →</Link></header>
        <section className="library-detail">
          <Link href="/library" className="back-link">← library</Link>
          <div className="library-detail-heading">
            <span className="library-detail-category">{document.category.toLowerCase()}.</span>
            <h1>{document.title}</h1>
            <p>{document.pages} pages · {document.size} · uploaded {formatRelativeTime(document.created_at)}</p>
          </div>
          <div className="library-preview" aria-label="PDF preview"><iframe src={`${document.fileUrl}#toolbar=0&navpanes=0`} title={document.title} className="library-preview-frame" /></div>
          <div className="library-detail-actions"><a href={document.fileUrl} download={document.file_name} className="download-button">download PDF →</a></div>
          {document.description && <p className="library-detail-description">{document.description}</p>}
          <div className="library-tools-block">
            <span className="result-label">need to work with this PDF?</span>
            <div className="library-tool-links"><Link href="/tools/compress-pdf">compress →</Link><Link href="/tools/split-pdf">split →</Link><Link href="/tools/merge-pdf">merge →</Link><Link href="/tools/images-to-pdf">images → pdf →</Link></div>
          </div>
          <div className="library-detail-footer"><span>shared with the Fold community</span><Link href={`/report?slug=${encodeURIComponent(document.slug)}`}>report</Link></div>
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

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
