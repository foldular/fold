const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const GS_DIR = path.join(ROOT, ".ghostscript");
const ARCHIVE = path.join(ROOT, "ghostscript-10.08.0.tar.xz");

const GHOSTSCRIPT_VERSION = "10.08.0";

const GHOSTSCRIPT_URL =
  `https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10080/ghostscript-${GHOSTSCRIPT_VERSION}.tar.xz`;

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

function run(command, args, options = {}) {
  console.log(
    `> ${command} ${args
      .map((arg) => JSON.stringify(String(arg)))
      .join(" ")}`
  );

  return execFileSync(command, args, {
    stdio: "inherit",
    ...options,
  });
}

function runCapture(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

async function main() {
  /*
   * Ghostscript is built only during Linux/Vercel builds.
   *
   * Windows development continues to use the local
   * gswin64c installation.
   */
  if (process.platform !== "linux") {
    console.log(
      "Ghostscript build skipped: not running on Linux."
    );
    return;
  }

  if (process.arch !== "x64") {
    throw new Error(
      `This Ghostscript build requires x86_64. Detected: ${process.arch}`
    );
  }

  console.log("========================================");
  console.log("BUILDING GHOSTSCRIPT FOR VERCEL");
  console.log("========================================");

  console.log("Platform:", process.platform);
  console.log("Architecture:", process.arch);
  console.log(
    "Ghostscript:",
    GHOSTSCRIPT_VERSION
  );

  /*
   * ------------------------------------------------------------
   * 1. Clean old installation
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

  fs.mkdirSync(GS_DIR, {
    recursive: true,
  });

  /*
   * ------------------------------------------------------------
   * 2. Download official Ghostscript source
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log(
    "DOWNLOADING OFFICIAL GHOSTSCRIPT SOURCE"
  );
  console.log("========================================");

  console.log(GHOSTSCRIPT_URL);

  await download(
    GHOSTSCRIPT_URL,
    ARCHIVE
  );

  console.log(
    "Ghostscript source downloaded."
  );

  /*
   * ------------------------------------------------------------
   * 3. Extract
   * ------------------------------------------------------------
   */

  const sourceParent = path.join(
    GS_DIR,
    "source"
  );

  fs.mkdirSync(sourceParent, {
    recursive: true,
  });

  console.log("========================================");
  console.log("EXTRACTING GHOSTSCRIPT");
  console.log("========================================");

  run(
    "tar",
    [
      "-xJf",
      ARCHIVE,
      "-C",
      sourceParent,
    ]
  );

  const sourceDir = path.join(
    sourceParent,
    `ghostscript-${GHOSTSCRIPT_VERSION}`
  );

  if (!fs.existsSync(sourceDir)) {
    throw new Error(
      `Ghostscript source directory not found: ${sourceDir}`
    );
  }

  /*
   * ------------------------------------------------------------
   * 4. Installation directory
   * ------------------------------------------------------------
   */

  const installDir = path.join(
    GS_DIR,
    "runtime"
  );

  /*
   * ------------------------------------------------------------
   * 5. Configure
   * ------------------------------------------------------------
   *
   * IMPORTANT:
   *
   * We deliberately DO NOT use:
   *
   *   --disable-fontconfig
   *
   * Ghostscript should configure itself based on the
   * libraries available in the Vercel build environment.
   *
   * We still disable unrelated optional components that
   * are not required by Fold.
   */

  console.log("========================================");
  console.log("CONFIGURING GHOSTSCRIPT");
  console.log("========================================");

  run(
    "./configure",
    [
      `--prefix=${installDir}`,

      /*
       * Avoid the old libidn.so.11 dependency.
       */
      "--without-libidn",

      /*
       * Features Fold does not need.
       */
      "--without-tesseract",
      "--disable-cups",
      "--disable-dbus",
      "--disable-gtk",
      "--disable-x",
      "--disable-contrib",

      /*
       * Use Ghostscript's bundled copies where supported.
       */
      "--with-local-zlib",
      "--with-local-brotli",
    ],
    {
      cwd: sourceDir,
    }
  );

  /*
   * ------------------------------------------------------------
   * 6. Compile
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log("COMPILING GHOSTSCRIPT");
  console.log("========================================");

  run(
    "make",
    [
      "-j2",
    ],
    {
      cwd: sourceDir,
    }
  );

  /*
   * ------------------------------------------------------------
   * 7. Install
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log("INSTALLING GHOSTSCRIPT");
  console.log("========================================");

  run(
    "make",
    [
      "install",
    ],
    {
      cwd: sourceDir,
    }
  );

  const gsBinary = path.join(
    installDir,
    "bin",
    "gs"
  );

  const gsLibDir = path.join(
    installDir,
    "lib"
  );

  if (!fs.existsSync(gsBinary)) {
    throw new Error(
      `Ghostscript binary was not installed at ${gsBinary}`
    );
  }

  fs.chmodSync(
    gsBinary,
    0o755
  );

  /*
   * ------------------------------------------------------------
   * 8. Check runtime dependencies
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log(
    "CHECKING GHOSTSCRIPT DEPENDENCIES"
  );
  console.log("========================================");

  const env = {
    ...process.env,

    LD_LIBRARY_PATH: [
      gsLibDir,
      process.env.LD_LIBRARY_PATH || "",
    ]
      .filter(Boolean)
      .join(":"),
  };

  /*
   * Ghostscript version test.
   */
  const version = runCapture(
    gsBinary,
    [
      "--version",
    ],
    {
      env,
    }
  ).trim();

  console.log(
    "Ghostscript version:",
    version
  );

  /*
   * Shared-library test.
   */
  const lddOutput = runCapture(
    "ldd",
    [
      gsBinary,
    ],
    {
      env,
    }
  );

  console.log(lddOutput);

  if (/not found/i.test(lddOutput)) {
    throw new Error(
      "Ghostscript has unresolved shared-library dependencies."
    );
  }

  /*
   * ------------------------------------------------------------
   * 9. Verify installed runtime files
   * ------------------------------------------------------------
   */

  const shareDir = path.join(
    installDir,
    "share",
    "ghostscript",
    GHOSTSCRIPT_VERSION
  );

  const fontsDir = path.join(
    installDir,
    "share",
    "ghostscript",
    "fonts"
  );

  console.log(
    "Ghostscript share directory:"
  );

  console.log(shareDir);

  console.log(
    "Ghostscript fonts directory:"
  );

  console.log(fontsDir);

  /*
   * The share directory should exist after make install.
   */
  if (!fs.existsSync(shareDir)) {
    console.warn(
      "Warning: Ghostscript share directory was not found."
    );
  }

  /*
   * ------------------------------------------------------------
   * 10. Clean source/archive
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log("CLEANING BUILD FILES");
  console.log("========================================");

  fs.rmSync(
    sourceParent,
    {
      recursive: true,
      force: true,
    }
  );

  if (fs.existsSync(ARCHIVE)) {
    fs.unlinkSync(ARCHIVE);
  }

  /*
   * ------------------------------------------------------------
   * 11. Final output
   * ------------------------------------------------------------
   */

  console.log("========================================");
  console.log("GHOSTSCRIPT BUILD COMPLETE");
  console.log("========================================");

  console.log(
    "Binary:",
    gsBinary
  );

  console.log(
    "Libraries:",
    gsLibDir
  );

  console.log(
    "Share:",
    shareDir
  );

  console.log(
    "Fonts:",
    fontsDir
  );
}

main().catch((error) => {
  console.error(
    "Ghostscript build failed:"
  );

  console.error(error);

  process.exit(1);
});
