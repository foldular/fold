import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import { PDFDocument } from "pdf-lib";

const execFileAsync =
  promisify(execFile);

const MAX_FILE_SIZE =
  50 * 1024 * 1024;

type CompressionLevel =
  | "strong"
  | "recommended"
  | "low";

type CompressionProfile = {
  pdfSettings: string;
  colorDpi: number;
  grayDpi: number;
  monoDpi: number;
  jpegQuality: number;
};

const settings: Record<CompressionLevel, CompressionProfile> = {
  strong: { pdfSettings: "/screen", colorDpi: 72, grayDpi: 72, monoDpi: 150, jpegQuality: 45 },
  recommended: { pdfSettings: "/ebook", colorDpi: 120, grayDpi: 120, monoDpi: 200, jpegQuality: 65 },
  low: { pdfSettings: "/printer", colorDpi: 200, grayDpi: 200, monoDpi: 300, jpegQuality: 80 },
};

const GHOSTSCRIPT_VERSION =
  "10.08.0";

/*
 * Count PDF font objects.
 *
 * This is intentionally a lightweight safety check.
 * We are not trying to parse the complete PDF here.
 *
 * The important case:
 *
 *   original PDF -> has fonts
 *   compressed PDF -> has zero fonts
 *
 * That means Ghostscript has almost certainly lost
 * important text/font content.
 */
function countPdfFonts(
  pdf: Buffer
): number {
  const content =
    pdf.toString("latin1");

  const matches =
    content.match(
      /\/Type\s*\/Font\b/g
    );

  return matches?.length ?? 0;
}

/*
 * Validate basic PDF structure before returning the result.
 * The raw-byte font check is optional because it is not a complete PDF parser.
 */
async function validatePdfOutput(
  input: Buffer,
  output: Buffer,
  checkFonts = true
): Promise<boolean> {
  try {
    const inputPdf = await PDFDocument.load(input);
    const outputPdf = await PDFDocument.load(output);

    if (inputPdf.getPageCount() !== outputPdf.getPageCount()) {
      console.error("Compression safety check failed: page count changed.", {
        inputPages: inputPdf.getPageCount(),
        outputPages: outputPdf.getPageCount(),
      });
      return false;
    }

    const inputFonts = countPdfFonts(input);
    const outputFonts = countPdfFonts(output);
    console.log("Font safety check:", { inputFonts, outputFonts, checkFonts });

    if (checkFonts && inputFonts > 0 && outputFonts === 0) {
      console.error("Compression safety check failed: all font resources disappeared.");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Compression safety validation failed:", error);
    return false;
  }
}

async function tryGhostscript(
  input: Buffer,
  level: CompressionLevel
): Promise<Buffer | null> {
  const tempDir =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "fold-compress-"
      )
    );

  const inputPath =
    path.join(
      tempDir,
      "input.pdf"
    );

  const outputPath =
    path.join(
      tempDir,
      "output.pdf"
    );

  /*
   * Windows:
   *
   * Use locally installed gswin64c.
   *
   * Linux/Vercel:
   *
   * Use our bundled Ghostscript build.
   */
  const gsRoot =
    process.platform === "win32"
      ? null
      : path.join(
          process.cwd(),
          ".ghostscript",
          "runtime"
        );

  const gsExecutable =
    process.platform === "win32"
      ? "gswin64c"
      : path.join(
          gsRoot!,
          "bin",
          "gs"
        );

  /*
   * Bundled shared libraries.
   */
  const gsLibDir =
    process.platform === "win32"
      ? null
      : path.join(
          gsRoot!,
          "lib"
        );

  /*
   * Ghostscript resource directory.
   */
  const gsShareDir =
    process.platform === "win32"
      ? null
      : path.join(
          gsRoot!,
          "share",
          "ghostscript",
          GHOSTSCRIPT_VERSION
        );

  /*
   * Ghostscript fonts.
   */
  const gsFontsDir =
    process.platform === "win32"
      ? null
      : path.join(
          gsRoot!,
          "share",
          "ghostscript",
          "fonts"
        );

  try {
    await fs.writeFile(
      inputPath,
      input
    );

    console.log(
      "================================="
    );

    console.log(
      "Fold PDF compression"
    );

    console.log(
      "================================="
    );

    console.log(
      "Platform:",
      process.platform
    );

    console.log(
      "Ghostscript:",
      gsExecutable
    );

    console.log(
      "Compression level:",
      level
    );

    const profile = settings[level];

    console.log("Ghostscript setting:", profile.pdfSettings);
    console.log("Compression profile:", profile);

    /*
     * ----------------------------------------------------------
     * Environment
     * ----------------------------------------------------------
     */

    const env =
      process.platform === "win32"
        ? process.env
        : {
            ...process.env,

            /*
             * Find our bundled shared libraries.
             */
            LD_LIBRARY_PATH: [
              gsLibDir,
              process.env
                .LD_LIBRARY_PATH || "",
            ]
              .filter(Boolean)
              .join(":"),

            /*
             * Find Ghostscript's initialization
             * and resource files.
             */
            GS_LIB: [
              gsShareDir,

              gsShareDir
                ? path.join(
                    gsShareDir,
                    "lib"
                  )
                : "",

              gsShareDir
                ? path.join(
                    gsShareDir,
                    "Resource"
                  )
                : "",

              process.env.GS_LIB || "",
            ]
              .filter(Boolean)
              .join(":"),

            /*
             * Give Ghostscript access to fonts
             * installed by our runtime and common
             * Linux font locations.
             */
            GS_FONTPATH: [
              gsFontsDir,

              "/usr/share/fonts",

              "/usr/local/share/fonts",

              process.env.GS_FONTPATH || "",
            ]
              .filter(Boolean)
              .join(":"),
          };

    console.log(
      "LD_LIBRARY_PATH:",
      process.platform === "win32"
        ? "Windows"
        : env.LD_LIBRARY_PATH
    );

    console.log(
      "GS_LIB:",
      process.platform === "win32"
        ? "Windows"
        : env.GS_LIB
    );

    console.log(
      "GS_FONTPATH:",
      process.platform === "win32"
        ? "Windows"
        : env.GS_FONTPATH
    );

    /*
     * ----------------------------------------------------------
     * Ghostscript
     * ----------------------------------------------------------
     */

    await execFileAsync(
      gsExecutable,
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        `-dPDFSETTINGS=${profile.pdfSettings}`,

        // Preserve text and font resources where possible.
        "-dEmbedAllFonts=true",
        "-dEmbedSubstituteFonts=true",
        "-dSubsetFonts=true",
        "-dCompressFonts=true",

        // Different image settings for each compression level.
        "-dDownsampleColorImages=true",
        "-dColorImageDownsampleType=/Bicubic",
        `-dColorImageResolution=${profile.colorDpi}`,
        "-dDownsampleGrayImages=true",
        "-dGrayImageDownsampleType=/Bicubic",
        `-dGrayImageResolution=${profile.grayDpi}`,
        "-dDownsampleMonoImages=true",
        "-dMonoImageDownsampleType=/Subsample",
        `-dMonoImageResolution=${profile.monoDpi}`,

        "-dAutoFilterColorImages=false",
        "-dColorImageFilter=/DCTEncode",
        "-dAutoFilterGrayImages=false",
        "-dGrayImageFilter=/DCTEncode",
        `-dJPEGQ=${profile.jpegQuality}`,

        "-dPreserveAnnots=true",
        "-dPreserveMarkedContent=true",
        "-dWantsOptionalContent=true",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      {
        env,

        maxBuffer:
          20 * 1024 * 1024,
      }
    );

    /*
     * ----------------------------------------------------------
     * Read output
     * ----------------------------------------------------------
     */

    const output =
      await fs.readFile(
        outputPath
      );

    console.log(
      "Original:",
      input.length,
      "bytes"
    );

    console.log(
      "Ghostscript output:",
      output.length,
      "bytes"
    );

    if (!output.length) {
      console.log(
        "Ghostscript produced an empty file."
      );

      return null;
    }

    /*
     * Must actually be smaller.
     */
    if (
      output.length >=
      input.length
    ) {
      console.log(
        "Ghostscript output is not smaller. Keeping original."
      );

      return null;
    }

    /*
     * ----------------------------------------------------------
     * SAFETY CHECK
     * ----------------------------------------------------------
     */

    const valid =
      await validatePdfOutput(
        input,
        output
      );

    if (!valid) {
      console.error(
        "Ghostscript produced an unsafe PDF. Rejecting output."
      );

      return null;
    }

    console.log(
      "Ghostscript output passed safety validation."
    );

    return output;
  } catch (error) {
    console.error(
      "Ghostscript compression failed:",
      error
    );

    return null;
  } finally {
    await fs.rm(
      tempDir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

async function fallbackCompression(
  input: Buffer
): Promise<Buffer | null> {
  try {
    const pdf =
      await PDFDocument.load(
        input
      );

    const outputPdf =
      await PDFDocument.create();

    const pages =
      await outputPdf.copyPages(
        pdf,
        pdf.getPageIndices()
      );

    for (const page of pages) {
      outputPdf.addPage(page);
    }

    /*
     * Remove unnecessary metadata.
     */
    outputPdf.setTitle("");
    outputPdf.setAuthor("");
    outputPdf.setSubject("");
    outputPdf.setKeywords([]);
    outputPdf.setProducer("");
    outputPdf.setCreator("");

    const output =
      await outputPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

    if (
      output.length >=
      input.length
    ) {
      return null;
    }

    const outputBuffer =
      Buffer.from(output);

    /*
     * Apply exactly the same safety check
     * to the fallback.
     */
    const valid =
      await validatePdfOutput(
        input,
        outputBuffer,
        false
      );

    if (!valid) {
      console.error(
        "pdf-lib fallback failed safety validation."
      );

      return null;
    }

    return outputBuffer;
  } catch (error) {
    console.error(
      "Fallback compression failed:",
      error
    );

    return null;
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const formData =
      await request.formData();

    const uploadedFile =
      formData.get("file");

    const levelValue =
      formData.get("level");

    /*
     * ----------------------------------------------------------
     * File validation
     * ----------------------------------------------------------
     */

    if (
      !(uploadedFile instanceof File)
    ) {
      return NextResponse.json(
        {
          error:
            "Please upload a PDF file.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !uploadedFile.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      return NextResponse.json(
        {
          error:
            "Only PDF files are supported.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      uploadedFile.size === 0
    ) {
      return NextResponse.json(
        {
          error:
            "The uploaded PDF is empty.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      uploadedFile.size >
      MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "PDFs must be 50 MB or smaller.",
        },
        {
          status: 413,
        }
      );
    }

    /*
     * ----------------------------------------------------------
     * Compression level
     * ----------------------------------------------------------
     */

    const level: CompressionLevel =
      levelValue === "strong" ||
      levelValue === "recommended" ||
      levelValue === "low"
        ? levelValue
        : "recommended";

    /*
     * ----------------------------------------------------------
     * Input buffer
     * ----------------------------------------------------------
     */

    const input =
      Buffer.from(
        await uploadedFile.arrayBuffer()
      );

    console.log(
      "================================="
    );

    console.log(
      "Fold PDF compression started"
    );

    console.log(
      "File:",
      uploadedFile.name
    );

    console.log(
      "Original size:",
      input.length,
      "bytes"
    );

    console.log(
      "Original font resources:",
      countPdfFonts(input)
    );

    console.log(
      "Level:",
      level
    );

    console.log(
      "================================="
    );

    /*
     * ----------------------------------------------------------
     * First attempt: Ghostscript
     * ----------------------------------------------------------
     */

    let output =
      await tryGhostscript(
        input,
        level
      );

    /*
     * ----------------------------------------------------------
     * Second attempt: pdf-lib
     * ----------------------------------------------------------
     */

    if (!output) {
      console.log(
        "Trying pdf-lib fallback..."
      );

      output =
        await fallbackCompression(
          input
        );
    }

    /*
     * ----------------------------------------------------------
     * Final fallback: original
     * ----------------------------------------------------------
     *
     * We would rather return the original PDF than
     * ever give the user a damaged document.
     */

    if (
      !output ||
      output.length >=
        input.length
    ) {
      console.log(
        "No safe smaller version produced. Returning original PDF."
      );

      output = input;
    }

    const wasReduced =
      output.length <
      input.length;

    /*
     * ----------------------------------------------------------
     * Download filename
     * ----------------------------------------------------------
     */

    const baseName =
      uploadedFile.name.replace(
        /\.pdf$/i,
        ""
      );

    const outputName =
      `${baseName}-compressed.pdf`;

    /*
     * ----------------------------------------------------------
     * Reduction
     * ----------------------------------------------------------
     */

    const reductionPercent =
      wasReduced
        ? (
            (1 -
              output.length /
                input.length) *
            100
          ).toFixed(1)
        : "0.0";

    console.log(
      "================================="
    );

    console.log(
      "Final output:",
      output.length,
      "bytes"
    );

    console.log(
      "Final font resources:",
      countPdfFonts(output)
    );

    console.log(
      "Reduced:",
      wasReduced
    );

    console.log(
      "Reduction:",
      `${reductionPercent}%`
    );

    console.log(
      "================================="
    );

    /*
     * ----------------------------------------------------------
     * Response
     * ----------------------------------------------------------
     */

    return new Response(
      new Uint8Array(output),
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `attachment; filename="${outputName}"`,

          "Cache-Control":
            "no-store",

          "X-Original-Size":
            String(input.length),

          "X-Compressed-Size":
            String(output.length),

          "X-Compression-Applied":
            String(wasReduced),

          "X-Compression-Level":
            level,

          "X-Compression-Reduction":
            reductionPercent,
        },
      }
    );
  } catch (error) {
    console.error(
      "Fold compression error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while compressing the PDF.",
      },
      {
        status: 500,
      }
    );
  }
}
