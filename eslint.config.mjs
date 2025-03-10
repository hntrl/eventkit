import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import importHelpersPlugin from "eslint-plugin-import-helpers";
import commentLengthPlugin from "eslint-plugin-comment-length";
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
      "packages/**/eslint.config.mjs",
      "eslint.config.mjs",
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "import-helpers": importHelpersPlugin,
      "comment-length": commentLengthPlugin,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: true },
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
      "comment-length/limit-single-line-comments": ["warn", { maxLength: 100 }],
      "comment-length/limit-multi-line-comments": ["warn", { maxLength: 100 }],
    },
  }
);
