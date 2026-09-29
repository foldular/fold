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

  const entries = fs.readdirSync(dir, { withFileTypes: true });

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
    console.log("Ghostscript download skipped: not running on Linux.");
    return;
  }

  console.log("========================================");
  console.log("GHOSTSCRIPT DIAGNOSTIC");
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

  if (fs.existsSync(GS_DIR)) {
    fs.rmSync(GS_DIR, { recursive: true, force: true });
  }

  fs.mkdirSync(GS_DIR, { recursive: true });

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
    { stdio: "inherit" }
  );

  console.log("========================================");
  console.log("EXTRACTED FILE TREE");
  console.log("========================================");

  printTree(GS_DIR);

  console.log("========================================");
  console.log("SEARCHING FOR GHOSTSCRIPT EXECUTABLE");
  console.log("========================================");

  try {
    const result = execSync(
      `find "${GS_DIR}" -type f -name "gs" -o -name "gswin64c.exe"`,
      { encoding: "utf8" }
    );

    console.log("FOUND:");
    console.log(result || "Nothing found");
  } catch (error) {
    console.log("find command returned no matches.");
  }

  console.log("========================================");
  console.log("DIAGNOSTIC COMPLETE");
  console.log("========================================");

  const gsBinary = path.join(
  GS_DIR,
  "ghostscript_linux",
  "usr",
  "local",
  "bin",
  "gs"
);

console.log("========================================");
console.log("CHECKING GHOSTSCRIPT");
console.log("========================================");

console.log("Expected Ghostscript path:");
console.log(gsBinary);

if (!fs.existsSync(gsBinary)) {
  throw new Error(
    `Ghostscript binary was not found at ${gsBinary}`
  );
}

fs.chmodSync(gsBinary, 0o755);

console.log("Ghostscript found successfully:");
console.log(gsBinary);

console.log("========================================");
console.log("CHECKING GHOSTSCRIPT DEPENDENCIES");
console.log("========================================");

try {
  const dependencies = execSync(`ldd "${gsBinary}"`, {
    encoding: "utf8",
  });

  console.log("Ghostscript dependencies:");
  console.log(dependencies);
} catch (error) {
  console.error("Could not run ldd:");
  console.error(error);
}

fs.unlinkSync(ARCHIVE);

console.log("========================================");
console.log("Ghostscript installation complete.");
console.log("========================================");
}

main().catch((error) => {
  console.error("Ghostscript diagnostic failed:");
  console.error(error);
  process.exit(1);
});