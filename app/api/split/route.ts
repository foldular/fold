import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type SplitMode = "extract" | "every-page";

function parsePages(input: string, pageCount: number) {
  const pages = new Set<number>();

  for (const rawPart of input.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part.includes("-")) {
      const [startValue, endValue] = part.split("-").map((value) => value.trim());
      const start = Number(startValue);
      const end = Number(endValue);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > pageCount) {
        throw new Error(`Page range "${part}" is invalid. This PDF has ${pageCount} pages.`);
      }

      for (let page = start; page <= end; page += 1) pages.add(page);
    } else {
      const page = Number(part);
      if (!Number.isInteger(page) || page < 1 || page > pageCount) {
        throw new Error(`Page "${part}" is invalid. This PDF has ${pageCount} pages.`);
      }
      pages.add(page);
    }
  }

  return [...pages].sort((a, b) => a - b);
}

async function createPdf(source: PDFDocument, pageNumbers: number[]) {
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, pageNumbers.map((page) => page - 1));
  pages.forEach((page) => output.addPage(page));
  return Buffer.from(await output.save({ useObjectStreams: true, addDefaultPage: false }));
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode: SplitMode = formData.get("mode") === "every-page" ? "every-page" : "extract";
    const pagesValue = formData.get("pages");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "The uploaded PDF is empty." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "PDFs must be 50 MB or smaller." }, { status: 413 });
    }

    const source = await PDFDocument.load(Buffer.from(await file.arrayBuffer()));
    const pageCount = source.getPageCount();
    const baseName = file.name.replace(/\.pdf$/i, "");

    if (mode === "extract") {
      if (typeof pagesValue !== "string" || !pagesValue.trim()) {
        return NextResponse.json({ error: "Please enter the pages you want to extract." }, { status: 400 });
      }

      let selectedPages: number[];
      try {
        selectedPages = parsePages(pagesValue, pageCount);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid page selection." }, { status: 400 });
      }

      if (!selectedPages.length) {
        return NextResponse.json({ error: "Please select at least one page." }, { status: 400 });
      }

      const output = await createPdf(source, selectedPages);
      return new NextResponse(output, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${baseName}-split.pdf"`,
          "Cache-Control": "no-store",
          "X-Split-Files": "1",
          "X-Split-Pages": String(selectedPages.length),
          "X-Original-Pages": String(pageCount),
        },
      });
    }

    const zip = new JSZip();
    for (let page = 1; page <= pageCount; page += 1) {
      const output = await createPdf(source, [page]);
      zip.file(`${baseName}-page-${String(page).padStart(3, "0")}.pdf`, output);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${baseName}-split.zip"`,
        "Cache-Control": "no-store",
        "X-Split-Files": String(pageCount),
        "X-Split-Pages": String(pageCount),
        "X-Original-Pages": String(pageCount),
      },
    });
  } catch (error) {
    console.error("Split PDF error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something went wrong while splitting the PDF." }, { status: 500 });
  }
}