import { defineConfig, Format } from "tsup";
import { createBanner } from "../../scripts/utils";

import pkg from "./package.json";

const config = (format: Format) =>
  defineConfig([
    {
      clean: false,
      entry: ["lib/index.ts"],
      format,
      dts: true,
      banner: {
        js: createBanner(pkg.name, pkg.version),
      },
    },
  ]);

export default defineConfig([
  // @ts-expect-error
  ...config("esm"),
  ...config("cjs"),
]);
