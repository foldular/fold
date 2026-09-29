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

    https.get(url, (response) => {
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
    }).on("error", (error) => {
      file.close();
      reject(error);
    });
  });
}

async function main() {
  // Only download Ghostscript on Linux/Vercel.
  if (process.platform !== "linux") {
    console.log("Ghostscript download skipped: not running on Linux.");
    return;
  }

  const gsBinary = path.join(GS_DIR, "bin", "gs");

  if (fs.existsSync(gsBinary)) {
    console.log("Ghostscript already exists:", gsBinary);
    return;
  }

  console.log("Downloading Linux Ghostscript...");

  if (!fs.existsSync(GS_DIR)) {
    fs.mkdirSync(GS_DIR, { recursive: true });
  }

  await download(URL, ARCHIVE);

  console.log("Extracting Ghostscript...");

  execSync(
    `tar -xJf "${ARCHIVE}" -C "${GS_DIR}"`,
    { stdio: "inherit" }
  );

  fs.unlinkSync(ARCHIVE);

  if (!fs.existsSync(gsBinary)) {
    throw new Error(
      `Ghostscript binary was not found at ${gsBinary}`
    );
  }

  fs.chmodSync(gsBinary, 0o755);

  console.log("Ghostscript installed successfully:");
  console.log(gsBinary);
}

main().catch((error) => {
  console.error("Ghostscript installation failed:");
  console.error(error);
  process.exit(1);
});