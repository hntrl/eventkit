/**
 * @type {import('prettier').Options}
 */
module.exports = {
  trailingComma: "es5",
  singleQuote: false,
  printWidth: 100,
  overrides: [
    {
      files: ["__tests__/**/*.ts"],
      options: {
        requirePragma: true,
      },
    },
  ],
};
