const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");

const GS_DIR = path.join(ROOT, ".ghostscript");
const ARCHIVE = path.join(ROOT, "ghostscript_linux.tar.xz");
const LIBIDN_RPM = path.join(ROOT, "libidn.x86_64.rpm");

const GHOSTSCRIPT_URL =
  "https://github.com/victorsoares96/compress-pdf/releases/download/binaries/ghostscript_linux.tar.xz";

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    const request = https.get(url, (response) => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close();

        if (fs.existsSync(destination)) {
          fs.unlinkSync(destination);
        }

        return download(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();

        if (fs.existsSync(destination)) {
          fs.unlinkSync(destination);
        }

        reject(
          new Error(
            `Download failed with HTTP ${response.statusCode}`
          )
        );

        return;
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close(resolve);
      });
    });

    request.on("error", (error) => {
      file.close();

      if (fs.existsSync(destination)) {
        fs.unlinkSync(destination);
      }

      reject(error);
    });
  });
}

function run(command, options = {}) {
  console.log(`> ${command}`);

  return execSync(command, {
    stdio: "inherit",
    ...options,
  });
}

async function main() {
  /*
   * Ghostscript is only installed during the Linux/Vercel build.
   * Windows development continues to use the locally installed
   * gswin64c executable.
   */

  if (process.platform !== "linux") {
    console.log(
      "Ghostscript download skipped: not running on Linux."
    );
    return;
  }

  console.log("========================================");
  console.log("INSTALLING GHOSTSCRIPT FOR VERCEL");
  console.log("========================================");

  console.log("Platform:", process.platform);
  console.log("Architecture:", process.arch);

  if (process.arch !== "x64") {
    throw new Error(
      `This Ghostscript package requires x86_64. Detected: ${process.arch}`
    );
  }

  /*
   * ------------------------------------------------------------
   * 1. Clean previous installation
   * ------------------------------------------------------------
   */

  if (fs.existsSync(GS_DIR)) {
    fs.rmSync(GS_DIR, {
      recursive: true,
      force: true,
    });
  }

  if (fs.existsSync(ARCHIVE)) {
    fs.unlinkSync(ARCHIVE);
  }

  if (fs.existsSync(LIBIDN_RPM)) {
    fs.unlinkSync(LIBIDN_RPM);
  }

  fs.mkdirSync(GS_DIR, {
    recursive: true,
  });

  /*
   * ------------------------------------------------------------
   * 2. Download Ghostscript
   * ------------------------------------------------------------
   */

  console.log("Downloading Linux Ghostscript...");

  await download(
    GHOSTSCRIPT_URL,
    ARCHIVE
  );

  console.log(
    "Ghostscript archive downloaded."
  );

  /*
   * ------------------------------------------------------------
   * 3. Extract Ghostscript
   * ------------------------------------------------------------
   */

  console.log("Extracting Ghostscript...");

  run(
    `tar -xJf "${ARCHIVE}" -C "${GS_DIR}"`
  );

  const gsRoot = path.join(
    GS_DIR,
    "ghostscript_linux"
  );

  const gsBinary = path.join(
    gsRoot,
    "usr",
    "local",
    "bin",
    "gs"
  );

  if (!fs.existsSync(gsBinary)) {
    throw new Error(
      `Ghostscript binary was not found at ${gsBinary}`
    );
  }

  console.log("Ghostscript binary found:");
  console.log(gsBinary);

  /*
   * ------------------------------------------------------------
   * 4. Download Amazon Linux libidn RPM
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log("GETTING AMAZON LINUX libidn");
  console.log("========================================");

  let rpmUrl;

  try {
    rpmUrl = execSync(
      "dnf repoquery --location --arch=x86_64 libidn",
      {
        encoding: "utf8",
      }
    )
      .trim()
      .split("\n")
      .filter(Boolean)[0];
  } catch (error) {
    console.error(
      "Could not locate the Amazon Linux libidn RPM."
    );

    throw error;
  }

  if (!rpmUrl) {
    throw new Error(
      "Amazon Linux libidn RPM URL was not found."
    );
  }

  console.log("libidn RPM:");
  console.log(rpmUrl);

  console.log("Downloading libidn RPM...");

  await download(
    rpmUrl,
    LIBIDN_RPM
  );

  console.log(
    "libidn RPM downloaded."
  );

  /*
   * ------------------------------------------------------------
   * 5. Extract RPM into a completely separate directory
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log("EXTRACTING libidn RPM");
  console.log("========================================");

  const libExtractDir = path.join(
    GS_DIR,
    "libidn-root"
  );

  if (fs.existsSync(libExtractDir)) {
    fs.rmSync(libExtractDir, {
      recursive: true,
      force: true,
    });
  }

  fs.mkdirSync(libExtractDir, {
    recursive: true,
  });

  run(
    `rpm --root="${libExtractDir}" --initdb`
  );

  run(
    `rpm -Uvh --root="${libExtractDir}" --nodeps "${LIBIDN_RPM}"`
  );

  /*
   * ------------------------------------------------------------
   * 6. Find ONLY the libidn installed by the RPM
   * ------------------------------------------------------------
   */

  let libidnPath = null;

  try {
    const result = execSync(
      `find "${libExtractDir}" -type f -name "libidn.so.11*"`,
      {
        encoding: "utf8",
      }
    )
      .trim()
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    console.log("Files found inside RPM root:");

    for (const file of result) {
      console.log(file);
    }

    /*
     * Only accept a real file that is larger than 1 KB.
     * This prevents the 17-byte placeholder from ever being used.
     */

    const validLibraries = result.filter((file) => {
      try {
        const size = fs.statSync(file).size;

        console.log(
          "Checking:",
          file,
          "size:",
          size
        );

        return size >= 1000;
      } catch {
        return false;
      }
    });

    libidnPath =
      validLibraries.find((file) =>
        file.endsWith("/libidn.so.11")
      ) ||
      validLibraries[0] ||
      null;
  } catch (error) {
    console.error(
      "Could not search for extracted libidn."
    );

    throw error;
  }

  if (!libidnPath) {
    throw new Error(
      "A valid libidn.so.11 was not found inside the extracted Amazon Linux RPM."
    );
  }

  console.log("========================================");
  console.log("REAL libidn FOUND");
  console.log("========================================");

  console.log(libidnPath);

  const libidnSize = fs.statSync(
    libidnPath
  ).size;

  console.log(
    "libidn size:",
    libidnSize,
    "bytes"
  );

  /*
   * ------------------------------------------------------------
   * 7. Determine library directory
   * ------------------------------------------------------------
   */

  const gsLibDir = path.dirname(
    libidnPath
  );

  console.log("Library directory:");
  console.log(gsLibDir);

  /*
   * ------------------------------------------------------------
   * 8. Make Ghostscript executable
   * ------------------------------------------------------------
   */

  fs.chmodSync(
    gsBinary,
    0o755
  );

  /*
   * ------------------------------------------------------------
   * 9. Configure LD_LIBRARY_PATH
   * ------------------------------------------------------------
   */

  process.env.LD_LIBRARY_PATH = [
    gsLibDir,
    process.env.LD_LIBRARY_PATH || "",
  ]
    .filter(Boolean)
    .join(":");

  console.log("========================================");
  console.log("GHOSTSCRIPT CONFIGURATION");
  console.log("========================================");

  console.log(
    "Ghostscript:"
  );

  console.log(gsBinary);

  console.log(
    "LD_LIBRARY_PATH:"
  );

  console.log(
    process.env.LD_LIBRARY_PATH
  );

  /*
   * ------------------------------------------------------------
   * 10. Test Ghostscript
   * ------------------------------------------------------------
   */

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

    console.log(
      "Ghostscript version:"
    );

    console.log(
      version.trim()
    );
  } catch (error) {
    console.error(
      "Ghostscript could not start."
    );

    throw error;
  }

  /*
   * ------------------------------------------------------------
   * 11. Remove temporary archives
   * ------------------------------------------------------------
   */

  if (fs.existsSync(ARCHIVE)) {
    fs.unlinkSync(ARCHIVE);
  }

  if (fs.existsSync(LIBIDN_RPM)) {
    fs.unlinkSync(LIBIDN_RPM);
  }

  /*
   * ------------------------------------------------------------
   * 12. Final output
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log(
    "GHOSTSCRIPT INSTALLATION COMPLETE"
  );
  console.log("========================================");

  console.log(
    "Ghostscript binary:"
  );

  console.log(gsBinary);

  console.log(
    "Real libidn.so.11:"
  );

  console.log(libidnPath);

  console.log(
    "Library directory:"
  );

  console.log(gsLibDir);
}

main().catch((error) => {
  console.error(
    "Ghostscript installation failed:"
  );

  console.error(error);

  process.exit(1);
});