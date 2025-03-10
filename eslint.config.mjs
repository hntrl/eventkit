import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import importHelpersPlugin from "eslint-plugin-import-helpers";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    ignores: [
      "fixtures/",
      "**/node_modules/",
      "**/pnpm-lock.yaml",
      "packages/**/dist/",
      "packages/**/.wireit/",
    ],
  },
  {
    plugins: {
      "import-helpers": importHelpersPlugin,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "import/no-unresolved": "off",
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
