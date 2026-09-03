import type { NextConfig } from "next";

const config: NextConfig = {
  // The vacancy answer depends on "now", so it cannot be prerendered — the page ships as a
  // static shell and computes status client-side against the visitor's clock.
  output: "export",
  reactStrictMode: true,
  transpilePackages: ["@vacantneu/core"],

  webpack: (config) => {
    // @vacantneu/core is consumed both by Node (tsx, vitest) and by this bundler. Node ESM
    // requires the ".js" extension in relative imports, so its source uses them; this maps those
    // specifiers back onto the TypeScript sources rather than forcing a build step on core.
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default config;
