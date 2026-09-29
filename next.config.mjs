/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-lib"],

  outputFileTracingIncludes: {
  "/api/compress": [
     "./.ghostscript/**/*",
  ],
},
};

export default nextConfig;
