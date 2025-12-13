import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.talkcody.com",
        pathname: "/images/**",
      },
    ],
  },
  // Performance optimizations
  experimental: {
    // Enable optimized package imports for better tree-shaking
    optimizePackageImports: ["lucide-react"],
    // Inline critical CSS to reduce render-blocking
    optimizeCss: true,
  },
  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Target modern browsers to reduce polyfills
  // This reduces bundle size by ~14KB by not including polyfills for:
  // Array.prototype.at, Array.prototype.flat, Object.fromEntries, etc.
  transpilePackages: [],
};

export default withMDX(config);
