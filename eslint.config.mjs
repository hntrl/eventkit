import tseslint from "typescript-eslint";

export default tseslint.config(
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
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
