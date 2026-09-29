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

function printTree(dir, prefix = "") {
  if (!fs.existsSync(dir)) {
    console.log(`DOES NOT EXIST: ${dir}`);
    return;
  }

  const entries = fs.readdirSync(dir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    console.log(
      `${prefix}${entry.isDirectory() ? "[DIR] " : "[FILE] "}${fullPath}`
    );

    if (entry.isDirectory()) {
      printTree(fullPath, prefix + "  ");
    }
  }
}

async function main() {
  if (process.platform !== "linux") {
    console.log(
      "Ghostscript download skipped: not running on Linux."
    );
    return;
  }

  console.log("========================================");
  console.log("GHOSTSCRIPT INSTALLATION");
  console.log("========================================");

  console.log("ROOT:");
  console.log(ROOT);

  console.log("GS_DIR:");
  console.log(GS_DIR);

  console.log("ARCHIVE:");
  console.log(ARCHIVE);

  console.log("DOWNLOAD URL:");
  console.log(URL);

  console.log("========================================");

  // Start clean
  if (fs.existsSync(GS_DIR)) {
    fs.rmSync(GS_DIR, {
      recursive: true,
      force: true,
    });
  }

  fs.mkdirSync(GS_DIR, {
    recursive: true,
  });

  console.log("Downloading Linux Ghostscript...");

  await download(URL, ARCHIVE);

  console.log("Archive downloaded:");
  console.log(ARCHIVE);

  console.log("Archive size:");
  console.log(fs.statSync(ARCHIVE).size, "bytes");

  console.log("========================================");
  console.log("Extracting Ghostscript...");
  console.log("========================================");

  execSync(
    `tar -xJf "${ARCHIVE}" -C "${GS_DIR}"`,
    {
      stdio: "inherit",
    }
  );

  console.log("========================================");
  console.log("EXTRACTED FILE TREE");
  console.log("========================================");

  printTree(GS_DIR);

  console.log("========================================");
  console.log("SEARCHING FOR GHOSTSCRIPT EXECUTABLE");
  console.log("========================================");

  let gsBinary = null;

  try {
    const result = execSync(
      `find "${GS_DIR}" -type f -name "gs"`,
      {
        encoding: "utf8",
      }
    ).trim();

    if (result) {
      console.log("FOUND:");
      console.log(result);

      // Use the first matching Ghostscript binary
      gsBinary = result.split("\n")[0].trim();
    } else {
      console.log("Ghostscript executable NOT FOUND.");
    }
  } catch (error) {
    console.log("Could not search for Ghostscript executable.");
  }

  console.log("========================================");
  console.log("GHOSTSCRIPT BINARY");
  console.log("========================================");

  if (!gsBinary) {
    throw new Error(
      "Ghostscript executable could not be found."
    );
  }

  console.log("Using:");
  console.log(gsBinary);

  console.log("========================================");
  console.log("CHECKING GHOSTSCRIPT DEPENDENCIES");
  console.log("========================================");

  try {
    const dependencies = execSync(
      `ldd "${gsBinary}"`,
      {
        encoding: "utf8",
      }
    );

    console.log("Ghostscript dependencies:");
    console.log(dependencies);
  } catch (error) {
    console.error("Could not run ldd:");
    console.error(error);
  }

  console.log("========================================");
  console.log("SEARCHING FOR libidn.so.11");
  console.log("========================================");

  try {
    const result = execSync(
      `find "${GS_DIR}" -name "libidn.so.11*" -type f`,
      {
        encoding: "utf8",
      }
    ).trim();

    if (result) {
      console.log("libidn.so.11 FOUND:");
      console.log(result);
    } else {
      console.log(
        "libidn.so.11 NOT FOUND inside Ghostscript package."
      );
    }
  } catch (error) {
    console.log(
      "libidn.so.11 NOT FOUND inside Ghostscript package."
    );
  }

  console.log("========================================");
  console.log("DIAGNOSTIC COMPLETE");
  console.log("========================================");

  // Remove archive to keep the project clean.
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