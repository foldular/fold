import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getSupabaseAdmin, LIBRARY_BUCKET } from "../../../../lib/supabase-admin";
import { getClientIp, rateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_CATEGORIES = ["Education", "Business", "Documents", "Government", "Other"] as const;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`publish:${ip}`, 5, 60 * 60 * 1000);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many publish attempts. Try again in ${limit.retryAfter} seconds.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const titleValue = formData.get("title");
    const categoryValue = formData.get("category");
    const descriptionValue = formData.get("description");
    const confirmedValue = formData.get("confirmed");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please provide a PDF." }, { status: 400 });
    }

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "PDFs must be between 1 byte and 50 MB." }, { status: 400 });
    }

    if (confirmedValue !== "true") {
      return NextResponse.json(
        { error: "Please confirm that you have the right to share this document." },
        { status: 400 }
      );
    }

    const title = typeof titleValue === "string" ? titleValue.trim() : "";
    const category = typeof categoryValue === "string" ? categoryValue : "";
    const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";

    if (!title || title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: "Give your document a title up to 120 characters." }, { status: 400 });
    }

    if (!ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])) {
      return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json({ error: "The description is too long." }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    if (input.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "That file does not appear to be a valid PDF." }, { status: 400 });
    }

    const pdf = await PDFDocument.load(input, { ignoreEncryption: false });
    const pages = pdf.getPageCount();
    if (pages < 1) {
      return NextResponse.json({ error: "The PDF has no pages." }, { status: 400 });
    }

    const slug = createSlug(title);
    const storagePath = `${slug}/${slug}.pdf`;
    const safeFileName = sanitizeFileName(file.name);
    const supabase = getSupabaseAdmin();

    const { error: uploadError } = await supabase.storage
      .from(LIBRARY_BUCKET)
      .upload(storagePath, input, {
        contentType: "application/pdf",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: inserted, error: insertError } = await supabase
      .from("library_documents")
      .insert({
        slug,
        title,
        category,
        pages,
        size_bytes: file.size,
        description,
        file_name: safeFileName,
        storage_path: storagePath,
        status: "published",
        is_public: true,
      })
      .select("slug,title,category,pages,size_bytes,description,file_name,created_at,storage_path,status")
      .single();

    if (insertError) {
      await supabase.storage.from(LIBRARY_BUCKET).remove([storagePath]);
      throw insertError;
    }

    return NextResponse.json({
      document: {
        slug: inserted.slug,
        title: inserted.title,
        category: inserted.category,
        pages: inserted.pages,
        size: formatBytes(inserted.size_bytes),
        sizeBytes: inserted.size_bytes,
        description: inserted.description,
        fileName: inserted.file_name,
        createdAt: inserted.created_at,
        status: inserted.status,
      },
    });
  } catch (error) {
    console.error("Library publish error:", error);
    return NextResponse.json(
      { error: "Something went wrong while publishing. Please try another PDF." },
      { status: 500 }
    );
  }
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "document"}.pdf`;
}

function createSlug(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "document";
  return `${base}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
