import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, LIBRARY_BUCKET } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const configured = process.env.FOLD_ADMIN_TOKEN;
  const provided = request.headers.get("x-fold-admin-token");
  return Boolean(configured && provided && provided === configured);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_documents")
    .select("id,slug,title,category,pages,size_bytes,description,file_name,created_at,status,reviewed_at,reviewed_reason,storage_path")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Unable to load moderation queue." }, { status: 500 });

  const documents = (data ?? []).map((document) => {
    const { data: publicUrl } = supabase.storage
      .from(LIBRARY_BUCKET)
      .getPublicUrl(document.storage_path);

    return {
      ...document,
      file_url: publicUrl.publicUrl,
    };
  });

  return NextResponse.json({ documents });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const action = typeof body.action === "string" ? body.action : "";

    if (!id || action !== "remove") {
      return NextResponse.json({ error: "Only document removal is available." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: document, error: lookupError } = await supabase
      .from("library_documents")
      .select("id,storage_path")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const { error: storageError } = await supabase.storage
      .from(LIBRARY_BUCKET)
      .remove([document.storage_path]);

    if (storageError) {
      console.error("Storage removal error:", storageError);
    }

    const { error } = await supabase
      .from("library_documents")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin moderation error:", error);
    return NextResponse.json({ error: "Unable to update this document." }, { status: 500 });
  }
}
