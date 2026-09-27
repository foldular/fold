import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

const execFileAsync = promisify(execFile);

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type CompressionLevel = "strong" | "recommended" | "low";

const settings: Record<CompressionLevel, string> = {
  strong: "/screen",
  recommended: "/ebook",
  low: "/printer",
};

async function tryGhostscript(
  input: Buffer,
  level: CompressionLevel
): Promise<Buffer | null> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "fold-compress-")
  );

  const inputPath = path.join(tempDir, "input.pdf");
  const outputPath = path.join(tempDir, "output.pdf");

  const gsExecutable =
    process.platform === "win32" ? "gswin64c" : "gs";

  try {
    await fs.writeFile(inputPath, input);

    console.log("Fold compression:");
    console.log("Ghostscript:", gsExecutable);
    console.log("Compression level:", level);
    console.log("Ghostscript setting:", settings[level]);

    await execFileAsync(gsExecutable, [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${settings[level]}`,

      "-dDownsampleColorImages=true",
      "-dColorImageDownsampleType=/Bicubic",
      "-dColorImageResolution=100",

      "-dDownsampleGrayImages=true",
      "-dGrayImageDownsampleType=/Bicubic",
      "-dGrayImageResolution=100",

      "-dDownsampleMonoImages=true",
      "-dMonoImageDownsampleType=/Subsample",
      "-dMonoImageResolution=150",

      "-dAutoFilterColorImages=false",
      "-dColorImageFilter=/DCTEncode",

      "-dAutoFilterGrayImages=false",
      "-dGrayImageFilter=/DCTEncode",

      "-dJPEGQ=60",

      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",

      `-sOutputFile=${outputPath}`,
      inputPath,
    ]);

    const output = await fs.readFile(outputPath);

    console.log("Original:", input.length, "bytes");
    console.log("Ghostscript output:", output.length, "bytes");

    if (!output.length) {
      console.log("Ghostscript produced an empty file.");
      return null;
    }

    if (output.length >= input.length) {
      console.log(
        "Ghostscript output is not smaller. Keeping original."
      );
      return null;
    }

    return output;
  } catch (error) {
    console.error("Ghostscript compression failed:", error);
    return null;
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

async function fallbackCompression(
  input: Buffer
): Promise<Buffer | null> {
  try {
    const pdf = await PDFDocument.load(input);
    const outputPdf = await PDFDocument.create();

    const pages = await outputPdf.copyPages(
      pdf,
      pdf.getPageIndices()
    );

    for (const page of pages) {
      outputPdf.addPage(page);
    }

    outputPdf.setTitle("");
    outputPdf.setAuthor("");
    outputPdf.setSubject("");
    outputPdf.setKeywords([]);
    outputPdf.setProducer("");
    outputPdf.setCreator("");

    const output = await outputPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    if (output.length >= input.length) {
      return null;
    }

    return Buffer.from(output);
  } catch (error) {
    console.error("Fallback compression failed:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const uploadedFile = formData.get("file");
    const levelValue = formData.get("level");

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(
        { error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (!uploadedFile.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported." },
        { status: 400 }
      );
    }

    if (uploadedFile.size === 0) {
      return NextResponse.json(
        { error: "The uploaded PDF is empty." },
        { status: 400 }
      );
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "PDFs must be 50 MB or smaller." },
        { status: 413 }
      );
    }

    const level: CompressionLevel =
      levelValue === "strong" ||
      levelValue === "recommended" ||
      levelValue === "low"
        ? levelValue
        : "recommended";

    const input = Buffer.from(await uploadedFile.arrayBuffer());

    console.log("=================================");
    console.log("Fold PDF compression started");
    console.log("File:", uploadedFile.name);
    console.log("Original size:", input.length, "bytes");
    console.log("Level:", level);
    console.log("=================================");

    let output = await tryGhostscript(input, level);

    if (!output) {
      console.log("Trying pdf-lib fallback...");
      output = await fallbackCompression(input);
    }

    if (!output || output.length >= input.length) {
      console.log(
        "No smaller version produced. Returning original PDF."
      );
      output = input;
    }

    const wasReduced = output.length < input.length;

    const baseName = uploadedFile.name.replace(/\.pdf$/i, "");
    const outputName = `${baseName}-compressed.pdf`;

    const reductionPercent = wasReduced
      ? ((1 - output.length / input.length) * 100).toFixed(1)
      : "0.0";

    console.log("=================================");
    console.log("Final output:", output.length, "bytes");
    console.log("Reduced:", wasReduced);
    console.log("Reduction:", `${reductionPercent}%`);
    console.log("=================================");

    return new NextResponse(output, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Cache-Control": "no-store",
        "X-Original-Size": String(input.length),
        "X-Compressed-Size": String(output.length),
        "X-Compression-Applied": String(wasReduced),
        "X-Compression-Level": level,
        "X-Compression-Reduction": reductionPercent,
      },
    });
  } catch (error) {
    console.error("Fold compression error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while compressing the PDF.",
      },
      { status: 500 }
    );
  }
}