const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const GS_DIR = path.join(ROOT, ".ghostscript");
const ARCHIVE = path.join(ROOT, "ghostscript_linux.tar.xz");

const URL =
  "https://github.com/victorsoares96/compress-pdf/releases/download/binaries/ghostscript_linux.tar.xz";

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          fs.unlinkSync(destination);

          return download(response.headers.location, destination)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(`Download failed with HTTP ${response.statusCode}`)
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (error) => {
        file.close();
        reject(error);
      });
  });
}

async function main() {
  // Only download Ghostscript when building on Linux.
  if (process.platform !== "linux") {
    console.log(
      "Ghostscript download skipped: not running on Linux."
    );
    return;
  }

  console.log("========================================");
  console.log("INSTALLING GHOSTSCRIPT");
  console.log("========================================");

  console.log("ROOT:");
  console.log(ROOT);

  console.log("Ghostscript directory:");
  console.log(GS_DIR);

  // Start clean.
  if (fs.existsSync(GS_DIR)) {
    fs.rmSync(GS_DIR, {
      recursive: true,
      force: true,
    });
  }

  fs.mkdirSync(GS_DIR, {
    recursive: true,
  });

  if (fs.existsSync(ARCHIVE)) {
    fs.unlinkSync(ARCHIVE);
  }

  console.log("Downloading Linux Ghostscript...");

  await download(URL, ARCHIVE);

  console.log("Ghostscript archive downloaded.");

  console.log("========================================");
  console.log("Extracting Ghostscript...");
  console.log("========================================");

  execSync(
    `tar -xJf "${ARCHIVE}" -C "${GS_DIR}"`,
    {
      stdio: "inherit",
    }
  );

  /*
   * Actual structure discovered from the archive:
   *
   * .ghostscript/
   * └── ghostscript_linux/
   *     ├── lib/
   *     │   └── x86_64-linux-gnu/
   *     │       └── libidn.so.11
   *     │
   *     └── usr/
   *         └── local/
   *             └── bin/
   *                 └── gs
   */

  const gsBinary = path.join(
    GS_DIR,
    "ghostscript_linux",
    "usr",
    "local",
    "bin",
    "gs"
  );

  const gsLibDir = path.join(
    GS_DIR,
    "ghostscript_linux",
    "lib",
    "x86_64-linux-gnu"
  );

  const libidn = path.join(
    gsLibDir,
    "libidn.so.11"
  );

  console.log("========================================");
  console.log("CHECKING GHOSTSCRIPT");
  console.log("========================================");

  console.log("Ghostscript binary:");
  console.log(gsBinary);

  console.log("Ghostscript library directory:");
  console.log(gsLibDir);

  console.log("libidn.so.11:");
  console.log(libidn);

  if (!fs.existsSync(gsBinary)) {
    throw new Error(
      `Ghostscript binary was not found at ${gsBinary}`
    );
  }

  if (!fs.existsSync(libidn)) {
    throw new Error(
      `libidn.so.11 was not found at ${libidn}`
    );
  }

  // Make sure the binary can execute.
  fs.chmodSync(gsBinary, 0o755);

  /*
   * Ghostscript requires libidn.so.11.
   * Vercel does not provide this exact library,
   * but the Ghostscript archive contains it.
   *
   * Tell Linux to search this directory for libraries.
   */
  process.env.LD_LIBRARY_PATH =
    `${gsLibDir}:${process.env.LD_LIBRARY_PATH || ""}`;

  console.log("LD_LIBRARY_PATH:");
  console.log(process.env.LD_LIBRARY_PATH);

  console.log("========================================");
  console.log("TESTING GHOSTSCRIPT");
  console.log("========================================");

  try {
    const version = execSync(
      `"${gsBinary}" --version`,
      {
        encoding: "utf8",
        env: process.env,
      }
    );

    console.log("Ghostscript version:");
    console.log(version.trim());
  } catch (error) {
    console.error(
      "Ghostscript exists but could not execute."
    );

    console.error(error);

    throw error;
  }

  console.log("========================================");
  console.log("GHOSTSCRIPT INSTALLATION COMPLETE");
  console.log("========================================");

  // Remove the downloaded archive.
  if (fs.existsSync(ARCHIVE)) {
    fs.unlinkSync(ARCHIVE);
  }

  console.log("Ghostscript archive removed.");
}

main().catch((error) => {
  console.error("Ghostscript installation failed:");
  console.error(error);
  process.exit(1);
});