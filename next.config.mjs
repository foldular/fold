/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-lib"],

  outputFileTracingIncludes: {
  "/api/compress": [
    "./node_modules/compress-pdf/bin/gs/**/*",
  ],
},
};

export default nextConfig;
