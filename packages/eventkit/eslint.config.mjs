import globals from "globals";
import tseslint from "typescript-eslint";

import shared from "../../eslint.config.mjs";

// @ts-check

export default tseslint.config(...shared, {
  languageOptions: {
    globals: globals.commonjs,
  },
  rules: {
    "no-restricted-globals": ["error", ...Object.keys(globals.node)],
    "@typescript-eslint/no-explicit-any": "off",
    "import/no-nodejs-modules": "error",
    "import/named": "off",
  },
});
