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

/**
 * @returns {void}
 */
function ensureCleanWorkingDirectory() {
  const { execSync } = require("node:child_process");
  let status = execSync(`git status --porcelain`).toString().trim();
  let lines = status.split("\n");
  invariant(
    lines.every((line) => line === "" || line.startsWith("?")),
    "Working directory is not clean. Please commit or stash your changes."
  );
}

/**
 * @param {*} cond
 * @param {string} message
 * @returns {asserts cond}
 */
function invariant(cond, message) {
  if (!cond) throw new Error(message);
}

/**
 * @param {string} packageName
 * @param {(json: import('type-fest').PackageJson) => any} transform
 */
async function updatePackageConfig(packageName, transform) {
  let file = packageJson(packageName, "packages");
  let json = await jsonfile.readFile(file);
  transform(json);
  await jsonfile.writeFile(file, json, { spaces: 2 });
}

module.exports = {
  createBanner,
  ensureCleanWorkingDirectory,
  invariant,
  updatePackageConfig,
};
