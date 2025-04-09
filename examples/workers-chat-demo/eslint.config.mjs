import globals from "globals";
import tseslint from "typescript-eslint";

import shared from "../../eslint.config.mjs";

// @ts-check

export default tseslint.config(...shared, {
  ignores: ["**/__tests__/**"],
  languageOptions: {
    globals: globals.commonjs,
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "import/no-nodejs-modules": "error",
    "import/named": "off",
  },
});
