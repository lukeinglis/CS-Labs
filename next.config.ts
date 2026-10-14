import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A downscaled scoreboard reaches the extract action base64 encoded, which is a
    // third larger than the ~450KB JPEG. The 1MB default leaves no headroom for a
    // screenshot that compresses worse than the one this was tuned against.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
