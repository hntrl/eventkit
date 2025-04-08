import { defineConfig } from "tsup";

// @ts-expect-error - build tools are out of scope
import { createBanner } from "../../scripts/banner";
import pkg from "./package.json";

export default defineConfig([
  {
    clean: true,
    entry: ["lib/index.ts"],
    format: ["cjs", "esm"],
    outDir: "dist",
    dts: true,
    noExternal: [/(.*)/],
    splitting: false,
    banner: {
      js: createBanner(pkg.name, pkg.version),
    },
  },
]);
