import { defineConfig } from "tsup";

// @ts-expect-error - build tools are out of scope
import { createBanner } from "../../scripts/banner";
import pkg from "./package.json";

const banner = createBanner(pkg.name, pkg.version);

export default defineConfig([
  {
    clean: true,
    entry: ["lib/index.ts"],
    format: ["cjs", "esm"],
    outDir: "dist",
    dts: { resolve: true, banner },
    noExternal: [/(.*)/],
    splitting: false,
    banner: { js: banner },
  },
]);
