import { defineConfig } from "tsup";

import { createBanner } from "../../scripts/utils";
import pkg from "./package.json";

export default defineConfig([
  {
    clean: true,
    entry: ["lib/index.ts"],
    format: ["cjs", "esm"],
    outDir: "dist",
    dts: true,
    banner: {
      js: createBanner(pkg.name, pkg.version),
    },
  },
]);
