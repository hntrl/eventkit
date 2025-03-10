import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import importHelpersPlugin from "eslint-plugin-import-helpers";
import globals from "globals";
import tseslint from "typescript-eslint";

import shared from "../../eslint.config.mjs";

// @ts-check

const restrictedNodeGlobals = Object.keys(globals.node).filter(
  (key) => !["ReadableStream"].includes(key),
);

export default tseslint.config(
  shared,
  js.configs.recommended,
  tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    languageOptions: {
      globals: globals.commonjs,
    },
    plugins: {
      "import-helpers": importHelpersPlugin,
    },
    rules: {
      "no-restricted-globals": ["error", ...restrictedNodeGlobals],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "import/no-unresolved": "off",
      "import/no-nodejs-modules": "error",
      "import-helpers/order-imports": [
        "warn",
        {
          newlinesBetween: "always",
          groups: ["module", ["parent", "sibling", "index"]],

          alphabetize: {
            order: "asc",
            ignoreCase: true,
          },
        },
      ],
    },
  },
);
