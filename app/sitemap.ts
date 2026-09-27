import type { MetadataRoute } from "next";
import { getSupabaseAdmin } from "../lib/supabase-admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const staticRoutes = ["", "/library", "/tools/compress-pdf", "/tools/merge-pdf", "/tools/split-pdf", "/tools/images-to-pdf", "/privacy", "/terms"].map((path) => ({ url: `${base}${path}`, lastModified: new Date() }));
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("library_documents").select("slug,created_at").eq("status", "published").eq("is_public", true).order("created_at", { ascending: false }).limit(5000);
    const documents = (data ?? []).map((document) => ({ url: `${base}/library/${document.slug}`, lastModified: new Date(document.created_at) }));
    return [...staticRoutes, ...documents];
  } catch {
    return staticRoutes;
  }
}
