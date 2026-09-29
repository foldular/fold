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
        fs.unlinkSync(destination);

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
  console.log(
    "Architecture:",
    process.arch
  );

  if (process.arch !== "x64") {
    throw new Error(
      `This Ghostscript package requires x86_64. Detected: ${process.arch}`
    );
  }

  /*
   * Start clean.
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
   * 1. Download Ghostscript
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
   * 2. Extract Ghostscript
   * ------------------------------------------------------------
   */

  console.log("Extracting Ghostscript...");

  run(
    `tar -xJf "${ARCHIVE}" -C "${GS_DIR}"`
  );

  /*
   * Actual Ghostscript binary path discovered from the archive:
   *
   * .ghostscript/
   * └── ghostscript_linux/
   *     └── usr/
   *         └── local/
   *             └── bin/
   *                 └── gs
   */

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

  /*
   * ------------------------------------------------------------
   * 3. Find a real libidn.so.11
   * ------------------------------------------------------------
   *
   * The Ghostscript archive contains a 17-byte text placeholder
   * called libidn.so.11. We MUST NOT use that file.
   *
   * Amazon Linux 2023 provides the real libidn package for
   * x86_64, so we download its RPM using dnf's repository
   * metadata and extract the real shared library.
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
      .split("\n")[0];
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
   * 4. Extract the RPM
   * ------------------------------------------------------------
   *
   * We extract it into the Ghostscript root instead of installing
   * anything into the Vercel operating system.
   */

console.log("Extracting libidn...");

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
   * The RPM should place the library here:
   *
   * ghostscript_linux/usr/lib64/libidn.so.11
   *
   * Depending on the RPM layout, locate it dynamically.
   */

  let libidnPath = null;

  try {
const result = execSync(
  `find "${GS_DIR}" -type f -name "libidn.so.11*"`,
      {
        encoding: "utf8",
      }
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    if (result.length > 0) {
      /*
       * Prefer the actual SONAME file rather than a versioned
       * library file.
       */
      libidnPath =
        result.find((file) =>
          file.endsWith("/libidn.so.11")
        ) || result[0];
    }
  } catch (error) {
    console.error(
      "Could not search for extracted libidn."
    );
    throw error;
  }

  if (!libidnPath) {
    throw new Error(
      "Real libidn.so.11 was not found after extracting the Amazon Linux RPM."
    );
  }

  console.log("Real libidn found:");
  console.log(libidnPath);

  /*
   * Verify that the file is actually a shared library.
   */
  const libidnSize = fs.statSync(
    libidnPath
  ).size;

  console.log(
    "libidn size:",
    libidnSize,
    "bytes"
  );

  if (libidnSize < 1000) {
    throw new Error(
      `libidn.so.11 looks invalid. File size is only ${libidnSize} bytes.`
    );
  }

  /*
   * ------------------------------------------------------------
   * 5. Determine the directory containing libidn
   * ------------------------------------------------------------
   */

  const gsLibDir = path.dirname(
    libidnPath
  );

  console.log(
    "Ghostscript library directory:"
  );

  console.log(gsLibDir);

  /*
   * ------------------------------------------------------------
   * 6. Make Ghostscript executable
   * ------------------------------------------------------------
   */

  if (!fs.existsSync(gsBinary)) {
    throw new Error(
      `Ghostscript binary was not found at ${gsBinary}`
    );
  }

  fs.chmodSync(
    gsBinary,
    0o755
  );

  /*
   * ------------------------------------------------------------
   * 7. Configure runtime library search path
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
   * 8. Test Ghostscript
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
   * 9. Clean temporary files
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
   * 10. Final verification
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
    "libidn.so.11:"
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