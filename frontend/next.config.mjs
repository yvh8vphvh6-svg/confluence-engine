/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a fully static site to `out/` so the FastAPI backend can serve it
  // as a single service (one URL, no CORS, no Node runtime in production).
  output: "export",
  // next/image optimization needs a server; disable it for static export.
  images: { unoptimized: true },
};

export default nextConfig;
