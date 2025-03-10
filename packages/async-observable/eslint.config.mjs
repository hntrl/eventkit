import globals from "globals";
import tseslint from "typescript-eslint";

import shared from "../../eslint.config.mjs";

// @ts-check

const restrictedNodeGlobals = Object.keys(globals.node).filter(
  (key) => !["ReadableStream"].includes(key)
);

export default tseslint.config(...shared, {
  languageOptions: {
    globals: globals.commonjs,
  },
  rules: {
    "no-restricted-globals": ["error", ...restrictedNodeGlobals],
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unsafe-declaration-merging": "off",
    "import/no-nodejs-modules": "error",
    "import/export": "off",
  },
});
