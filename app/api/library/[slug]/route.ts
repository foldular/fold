import { NextResponse } from "next/server";
import { getSupabaseAdmin, LIBRARY_BUCKET } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("library_documents")
      .select("slug,title,category,pages,size_bytes,description,file_name,created_at,storage_path,status")
      .eq("slug", slug)
      .eq("status", "published")
      .eq("is_public", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const { data: publicUrl } = supabase.storage
      .from(LIBRARY_BUCKET)
      .getPublicUrl(data.storage_path);

    return NextResponse.json({
      document: {
        slug: data.slug,
        title: data.title,
        category: data.category,
        pages: data.pages,
        size: formatBytes(Number(data.size_bytes)),
        sizeBytes: Number(data.size_bytes),
        description: data.description,
        fileName: data.file_name,
        createdAt: data.created_at,
        fileUrl: publicUrl.publicUrl,
      },
    });
  } catch (error) {
    console.error("Library document error:", error);
    return NextResponse.json({ error: "Unable to load this document." }, { status: 500 });
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
