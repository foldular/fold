import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 20;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const entries = formData.getAll("files");

    const files = entries.filter(
      (entry): entry is File => entry instanceof File
    );

    if (files.length < 2) {
      return NextResponse.json(
        { error: "Please choose at least 2 PDF files." },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `You can merge up to ${MAX_FILES} PDFs at once.` },
        { status: 400 }
      );
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: "The combined file size must be 100 MB or smaller." },
        { status: 413 }
      );
    }

    for (const file of files) {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      if (!isPdf) {
        return NextResponse.json(
          { error: `"${file.name}" is not a PDF.` },
          { status: 400 }
        );
      }

      if (file.size === 0) {
        return NextResponse.json(
          { error: `"${file.name}" is empty.` },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `"${file.name}" is larger than 50 MB.` },
          { status: 413 }
        );
      }
    }

    const merged = await PDFDocument.create();

    for (const file of files) {
      const source = await PDFDocument.load(
        Buffer.from(await file.arrayBuffer()),
        { ignoreEncryption: false }
      );

      const pages = await merged.copyPages(
        source,
        source.getPageIndices()
      );

      for (const page of pages) {
        merged.addPage(page);
      }
    }

    merged.setTitle("");
    merged.setAuthor("");
    merged.setSubject("");
    merged.setKeywords([]);
    merged.setProducer("Fold");
    merged.setCreator("Fold");

    const output = await merged.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    return new NextResponse(Buffer.from(output), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="merged.pdf"',
        "Cache-Control": "no-store",
        "X-Merged-Files": String(files.length),
        "X-Merged-Pages": String(merged.getPageCount()),
      },
    });
  } catch (error) {
    console.error("Fold merge error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while merging the PDFs.",
      },
      { status: 500 }
    );
  }
}
