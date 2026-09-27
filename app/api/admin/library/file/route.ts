import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, LIBRARY_BUCKET } from "../../../../../lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const configured = process.env.FOLD_ADMIN_TOKEN;
  const provided = request.headers.get("x-fold-admin-token");
  return Boolean(configured && provided && provided === configured);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Document id is required." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: document, error } = await supabase
      .from("library_documents")
      .select("id,storage_path,file_name")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const { data, error: downloadError } = await supabase.storage
      .from(LIBRARY_BUCKET)
      .download(document.storage_path);

    if (downloadError) throw downloadError;

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeHeaderName(document.file_name)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Admin PDF download error:", error);
    return NextResponse.json({ error: "Unable to download this PDF." }, { status: 500 });
  }
}

function safeHeaderName(value: string) {
  return value
    .replace(/[\r\n"\\]/g, "-")
    .replace(/[^\x20-\x7E]/g, "-")
    .slice(0, 180) || "document.pdf";
}
