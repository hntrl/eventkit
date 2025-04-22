import { defineConfig } from "tsup";

import { getBuildConfig } from "../../scripts/build";
import pkg from "./package.json";

export default defineConfig([
  ...getBuildConfig({
    packageName: pkg.name,
    packageVersion: pkg.version,
    target: "neutral",
    options: {
      entry: ["lib/index.ts"],
    },
  }),
  ...getBuildConfig({
    packageName: pkg.name,
    packageVersion: pkg.version,
    target: "browser",
    options: {
      entry: ["lib/index.ts"],
      globalName: "eventkit.asyncObservable",
    },
  }),
]);
