import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";

function authorized(request: NextRequest) {
  const configured = process.env.FOLD_ADMIN_TOKEN;
  const provided = request.headers.get("x-fold-admin-token");
  return Boolean(configured && provided && provided === configured);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("library_reports")
    .select("id,reason,details,created_at,library_documents!inner(id,slug,title,status)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Unable to load reports." }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}
