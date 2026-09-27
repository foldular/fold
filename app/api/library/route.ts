import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, LIBRARY_BUCKET } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 12;
const PAGE_SIZE_MAX = 30;
const CATEGORIES = ["Education", "Business", "Documents", "Government", "Other"];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim() ?? "";
    const category = searchParams.get("category")?.trim() ?? "All";
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, Number(searchParams.get("pageSize") || PAGE_SIZE_DEFAULT))
    );

    const supabase = getSupabaseAdmin();
    let builder = supabase
      .from("library_documents")
      .select(
        "id,slug,title,category,pages,size_bytes,description,file_name,created_at,storage_path",
        { count: "exact" }
      )
      .eq("status", "published")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    if (category !== "All") {
      if (!CATEGORIES.includes(category)) {
        return NextResponse.json({ error: "Invalid category." }, { status: 400 });
      }
      builder = builder.eq("category", category);
    }

    if (query) {
      const safe = escapePostgrestSearch(query);
      builder = builder.or(
        `title.ilike.%${safe}%,category.ilike.%${safe}%,description.ilike.%${safe}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await builder.range(from, to);

    if (error) throw error;

    const documents = (data ?? []).map((document) => {
      const { data: publicUrl } = supabase.storage
        .from(LIBRARY_BUCKET)
        .getPublicUrl(document.storage_path);

      return {
        slug: document.slug,
        title: document.title,
        category: document.category,
        pages: document.pages,
        size: formatBytes(Number(document.size_bytes)),
        sizeBytes: Number(document.size_bytes),
        description: document.description,
        fileName: document.file_name,
        createdAt: document.created_at,
        fileUrl: publicUrl.publicUrl,
      };
    });

    const total = count ?? 0;

    return NextResponse.json({
      documents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("Library fetch error:", error);
    return NextResponse.json(
      { error: "Unable to load the library." },
      { status: 500 }
    );
  }
}

function escapePostgrestSearch(value: string) {
  return value
    .replace(/[%_]/g, (character) => `\\${character}`)
    .replace(/,/g, " ")
    .slice(0, 100);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
