const { execSync } = require("node:child_process");
const { watch } = require("node:fs");
const td = require("typedoc");

/** @type {import("typedoc").Configuration.TypeDocOptions} */
const config = {
  entryPoints: ["packages/eventkit", "packages/eventkit-cloudflare"],
  entryPointStrategy: "packages",
  packageOptions: {
    excludeInternal: true,
    sort: ["kind", "instance-first", "alphabetical-ignoring-documents"],
    entryPoints: ["lib/index.ts"],
  },
  router: "structure",
  navigation: {
    includeGroups: true,
    includeCategories: true,
  },
  frontmatterGlobals: {
    outline: [2, 3],
  },
  disableSources: true,
  categorizeByGroup: true,
  out: "./docs/reference",
  docsRoot: "./docs",
  plugin: ["typedoc-plugin-markdown", "typedoc-vitepress-theme", "typedoc-plugin-frontmatter"],
  indexFormat: "table",
  parametersFormat: "table",
  maxTypeConversionDepth: 5,
  useCodeBlocks: true,
  sanitizeComments: true,
};

async function typedoc() {
  try {
    execSync("pnpm build", { stdio: "inherit" });
  } catch (error) {
    return false;
  }

  const app = await td.Application.bootstrapWithPlugins(config, [
    new td.TypeDocReader(),
    new td.PackageJsonReader(),
    new td.TSConfigReader(),
  ]);
  const project = await app.convert();
  if (!project) return false;
  app.validate(project);
  await app.generateOutputs(project);
  return true;
}

async function watchAndRun() {
  const success = await typedoc();
  if (!success) {
    console.error("typedoc: failed to generate documentation");
    process.exit(1);
  }

  const watcher = watch("packages/", { recursive: true }, async (eventType, filename) => {
    if (
      filename &&
      filename[0] !== "_" &&
      filename.includes("/lib/") &&
      !filename.includes("dist") &&
      !filename.includes(".wireit")
    ) {
      console.log("typedoc: rebuilding...");
      await typedoc();
    }
  });
  console.log("typedoc: listening for changes in packages/*");

  // Handle process termination
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

// If this script is run directly, run typedoc or watch based on flags
if (require.main === module) {
  const watchFlag = process.argv.includes("--watch");
  (watchFlag ? watchAndRun() : typedoc()).catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}

module.exports = {
  typedoc,
  watchAndRun,
};
