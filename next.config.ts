import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      {
        source: "/i/10/stmt",
        destination: "https://www.facebook.com/",
        permanent: false,
      },
      {
        source: "/i/:slug*",
        destination: "/qr-statement/verification",
        permanent: false,
      },
      {
        source: "/verify",
        destination: "/qr-statement/verification",
        permanent: false,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
