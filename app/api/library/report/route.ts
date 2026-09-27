import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase-admin";
import { getClientIp, rateLimit } from "../../../../lib/rate-limit";

const REASONS = ["copyright", "spam", "malware", "illegal", "misleading", "other"] as const;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`report:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many reports. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const body = await request.json();
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason : "";
    const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";

    if (!slug || !REASONS.includes(reason as (typeof REASONS)[number])) {
      return NextResponse.json({ error: "Choose a valid report reason." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: document, error: lookupError } = await supabase
      .from("library_documents")
      .select("id")
      .eq("slug", slug)
      .eq("status", "published")
      .eq("is_public", true)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const { error } = await supabase.from("library_reports").insert({
      document_id: document.id,
      reason,
      details,
    });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Library report error:", error);
    return NextResponse.json({ error: "Unable to submit this report." }, { status: 500 });
  }
}
