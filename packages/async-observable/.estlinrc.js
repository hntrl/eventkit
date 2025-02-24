let restrictedGlobalsError = `Node globals are not allowed in this package.`;

module.exports = {
  env: {
    commonjs: true,
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  plugins: ["eslint-plugin-import-helpers"],
  rules: {
    strict: 0,
    "no-restricted-syntax": ["error", "LogicalExpression[operator='??']"],
    "no-restricted-globals": [
      "error",
      { name: "__dirname", message: restrictedGlobalsError },
      { name: "__filename", message: restrictedGlobalsError },
      { name: "Buffer", message: restrictedGlobalsError },
    ],
    "import/no-nodejs-modules": "error",
    "import-helpers/order-imports": [
      "warn",
      {
        newlinesBetween: "always",
        groups: ["module", ["parent", "sibling", "index"]],
        alphabetize: { order: "asc", ignoreCase: true },
      },
    ],
  },
};
