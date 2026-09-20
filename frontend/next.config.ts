import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing the shared contract mirror from the repo root.
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
