import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

const MAX_FILES = 30;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

function isAllowedImage(file: File) {
  const lower = file.name.toLowerCase();
  return (
    ALLOWED_TYPES.has(file.type) ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png")
  );
}

function getImageType(file: File): "jpg" | "png" | null {
  const lower = file.name.toLowerCase();

  if (
    file.type === "image/jpeg" ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg")
  ) {
    return "jpg";
  }

  if (
    file.type === "image/png" ||
    lower.endsWith(".png")
  ) {
    return "png";
  }

  return null;
}

function fitImageToPage(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number
) {
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;

  const scale = Math.min(
    maxWidth / imageWidth,
    maxHeight / imageHeight
  );

  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const entries = formData.getAll("files");

    const files = entries.filter(
      (entry: FormDataEntryValue): entry is File => entry instanceof File
    );

    if (!files.length) {
      return NextResponse.json(
        { error: "Please upload at least one image." },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `You can convert up to ${MAX_FILES} images at once.` },
        { status: 400 }
      );
    }

    const invalid = files.find((file: File) => !isAllowedImage(file));

    if (invalid) {
      return NextResponse.json(
        {
          error: `"${invalid.name}" is not supported. Use JPG, JPEG, or PNG images.`,
        },
        { status: 400 }
      );
    }

    const oversized = files.find(
      (file: File) => file.size === 0 || file.size > MAX_FILE_SIZE
    );

    if (oversized) {
      return NextResponse.json(
        {
          error:
            oversized.size > MAX_FILE_SIZE
              ? `"${oversized.name}" is larger than 20 MB.`
              : `"${oversized.name}" is empty.`,
        },
        { status: 400 }
      );
    }

    const totalSize = files.reduce(
      (sum: number, file: File) => sum + file.size,
      0
    );

    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { error: "The total image size must be 100 MB or smaller." },
        { status: 413 }
      );
    }

    const pdf = await PDFDocument.create();

    // A4 page in PDF points, with a comfortable margin.
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 28;

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const imageType = getImageType(file);

      if (!imageType) {
        throw new Error(`Unsupported image type for "${file.name}".`);
      }

      const image =
        imageType === "jpg"
          ? await pdf.embedJpg(bytes)
          : await pdf.embedPng(bytes);

      const page = pdf.addPage([
        pageWidth,
        pageHeight,
      ]);

      const dimensions = fitImageToPage(
        image.width,
        image.height,
        pageWidth,
        pageHeight,
        margin
      );

      page.drawImage(image, dimensions);
    }

    pdf.setTitle("Images to PDF");
    pdf.setAuthor("Fold");
    pdf.setSubject("Images converted to PDF");
    pdf.setProducer("Fold");
    pdf.setCreator("Fold");

    const output = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    return new NextResponse(Buffer.from(output), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="images.pdf"',
        "Cache-Control": "no-store",
        "X-Image-Count": String(files.length),
        "X-Pdf-Pages": String(files.length),
      },
    });
  } catch (error) {
    console.error("Images to PDF error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while creating the PDF.",
      },
      { status: 500 }
    );
  }
}
