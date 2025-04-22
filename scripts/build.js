function createBanner(packageName, version) {
  return `/**
 * ${packageName} v${version}
 *
 * Copyright (c) Hunter Lovell <hunter@hntrl.io>
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */`;
}

export function getBuildConfig({ packageName, packageVersion, target, options }) {
  const banner = createBanner(packageName, packageVersion);
  if (target === "neutral") {
    return [
      {
        format: ["cjs", "esm"],
        outDir: "dist",
        dts: { resolve: true, banner },
        sourcemap: true,
        platform: "neutral",
        banner: { js: banner },
        ...options,
      },
    ];
  }
  if (target === "browser") {
    const commonOptions = {
      format: ["iife"],
      outDir: "dist",
      globalName: "eventkit",
      sourcemap: true,
      dts: false,
      platform: "browser",
      banner: { js: banner },
    };
    return [
      {
        ...commonOptions,
        minify: false,
        ...options,
      },
      {
        ...commonOptions,
        minify: true,
        outExtension() {
          return {
            js: `.global.min.js`,
          };
        },
        ...options,
      },
    ];
  }
  return [];
}
