import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(process.cwd(), ".."),
  },
};

export default nextConfig;
