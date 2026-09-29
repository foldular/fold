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

const GHOSTSCRIPT_VERSION = "10.08.0";

async function tryGhostscript(
  input: Buffer,
  level: CompressionLevel
): Promise<Buffer | null> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "fold-compress-")
  );

  const inputPath = path.join(tempDir, "input.pdf");
  const outputPath = path.join(tempDir, "output.pdf");

  /*
   * Windows:
   * Use the locally installed gswin64c executable.
   *
   * Linux/Vercel:
   * Use the Ghostscript binary built by
   * scripts/install-ghostscript.js
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
   * Ghostscript shared libraries installed by
   * `make install`.
   */
  const gsLibDir =
    process.platform === "win32"
      ? null
      : path.join(
          gsRoot!,
          "lib"
        );

  /*
   * Ghostscript initialization files/resources.
   *
   * GS_LIB allows Ghostscript to find gs_init.ps,
   * pdf_*.ps, Fontmap and related runtime files.
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

  const gsLibResourceDir =
    process.platform === "win32"
      ? null
      : path.join(
          gsShareDir!,
          "lib"
        );

  const gsResourceDir =
    process.platform === "win32"
      ? null
      : path.join(
          gsShareDir!,
          "Resource"
        );

  try {
    await fs.writeFile(inputPath, input);

    console.log("=================================");
    console.log("Fold compression");
    console.log("=================================");
    console.log("Platform:", process.platform);
    console.log("Ghostscript:", gsExecutable);
    console.log("Compression level:", level);
    console.log(
      "Ghostscript setting:",
      settings[level]
    );

    if (process.platform !== "win32") {
      console.log(
        "Ghostscript library directory:",
        gsLibDir
      );

      console.log(
        "Ghostscript share directory:",
        gsShareDir
      );
    }

    /*
     * Build environment.
     *
     * Windows:
     * Keep the existing environment.
     *
     * Linux:
     * Add our bundled Ghostscript libraries/resources.
     */
    const env =
      process.platform === "win32"
        ? process.env
        : {
            ...process.env,

            LD_LIBRARY_PATH: [
              gsLibDir,
              process.env.LD_LIBRARY_PATH || "",
            ]
              .filter(Boolean)
              .join(":"),

            GS_LIB: [
              gsLibDirResourceExists(gsLibResourceDir)
                ? gsLibResourceDir
                : "",
              gsResourceDir,
              gsShareDir,
              process.env.GS_LIB || "",
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

    /*
     * Run Ghostscript.
     */
    await execFileAsync(
      gsExecutable,
      [
        "-sDEVICE=pdfwrite",

        "-dCompatibilityLevel=1.4",

        `-dPDFSETTINGS=${settings[level]}`,

        /*
         * Color images
         */
        "-dDownsampleColorImages=true",
        "-dColorImageDownsampleType=/Bicubic",
        "-dColorImageResolution=100",

        /*
         * Grayscale images
         */
        "-dDownsampleGrayImages=true",
        "-dGrayImageDownsampleType=/Bicubic",
        "-dGrayImageResolution=100",

        /*
         * Monochrome images
         */
        "-dDownsampleMonoImages=true",
        "-dMonoImageDownsampleType=/Subsample",
        "-dMonoImageResolution=150",

        /*
         * JPEG compression
         */
        "-dAutoFilterColorImages=false",
        "-dColorImageFilter=/DCTEncode",

        "-dAutoFilterGrayImages=false",
        "-dGrayImageFilter=/DCTEncode",

        "-dJPEGQ=60",

        /*
         * Batch/non-interactive mode.
         */
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",

        /*
         * Input/output.
         */
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      {
        env,
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    /*
     * Make sure Ghostscript actually generated output.
     */
    const output = await fs.readFile(
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
     * Only use Ghostscript output if it is
     * actually smaller.
     */
    if (output.length >= input.length) {
      console.log(
        "Ghostscript output is not smaller. Keeping original."
      );

      return null;
    }

    return output;
  } catch (error) {
    console.error(
      "Ghostscript compression failed:",
      error
    );

    return null;
  } finally {
    /*
     * Remove temporary input/output files.
     */
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

/*
 * Helper used only to avoid putting a non-existent
 * directory into GS_LIB.
 */
function gsLibDirResourceExists(
  directory: string | null
): boolean {
  if (!directory) {
    return false;
  }

  try {
    return require("fs").existsSync(directory);
  } catch {
    return false;
  }
}

async function fallbackCompression(
  input: Buffer
): Promise<Buffer | null> {
  try {
    const pdf = await PDFDocument.load(
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
     * Remove unnecessary document metadata.
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

    if (output.length >= input.length) {
      return null;
    }

    return Buffer.from(output);
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
     * Validate uploaded file.
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

    /*
     * Validate extension.
     */
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

    /*
     * Validate empty file.
     */
    if (uploadedFile.size === 0) {
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

    /*
     * 50 MB limit.
     */
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
     * Validate compression level.
     */
    const level: CompressionLevel =
      levelValue === "strong" ||
      levelValue === "recommended" ||
      levelValue === "low"
        ? levelValue
        : "recommended";

    /*
     * Convert uploaded file to Buffer.
     */
    const input = Buffer.from(
      await uploadedFile.arrayBuffer()
    );

    console.log("=================================");
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
      "Level:",
      level
    );
    console.log("=================================");

    /*
     * First attempt:
     * Ghostscript.
     */
    let output =
      await tryGhostscript(
        input,
        level
      );

    /*
     * Second attempt:
     * pdf-lib fallback.
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
     * If neither method produced a
     * smaller PDF, return original.
     */
    if (
      !output ||
      output.length >= input.length
    ) {
      console.log(
        "No smaller version produced. Returning original PDF."
      );

      output = input;
    }

    const wasReduced =
      output.length < input.length;

    /*
     * Generate download filename.
     */
    const baseName =
      uploadedFile.name.replace(
        /\.pdf$/i,
        ""
      );

    const outputName =
      `${baseName}-compressed.pdf`;

    /*
     * Calculate reduction percentage.
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

    console.log("=================================");
    console.log(
      "Final output:",
      output.length,
      "bytes"
    );
    console.log(
      "Reduced:",
      wasReduced
    );
    console.log(
      "Reduction:",
      `${reductionPercent}%`
    );
    console.log("=================================");

    /*
     * Return compressed PDF.
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