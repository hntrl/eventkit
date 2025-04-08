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

module.exports = {
  createBanner,
};
