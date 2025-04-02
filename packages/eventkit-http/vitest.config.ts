import { defineConfig } from "vitest/config";

// Check Node.js version
const nodeVersion = process.versions.node;
const [major] = nodeVersion.split(".").map(Number);
const shouldSkip = major < 22;
if (shouldSkip) {
  console.error(
    `@eventkit/http tests require Node.js v22 or higher. You are running Node.js v${nodeVersion}.`
  );
}

export default defineConfig({
  test: {
    ...(shouldSkip ? { exclude: ["**"] } : {}),
  },
});
