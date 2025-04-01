const { execSync } = require("node:child_process");
const { watch } = require("node:fs");

async function typedoc() {
  console.log("typedoc: rebuilding...");
  try {
    execSync("pnpm build", { stdio: "inherit" });
  } catch (error) {
    return false;
  }
  try {
    execSync("pnpm typedoc", { stdio: "inherit" });
  } catch (error) {
    return false;
  }
  return true;
}

async function watchAndRun() {
  const success = await typedoc();
  if (!success) {
    console.error("typedoc: failed to generate documentation");
    process.exit(1);
  }

  let watcher = null;
  let isShuttingDown = false;
  let typedocPromise = null;
  let shouldRerun = false;

  const cleanup = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (watcher) {
      console.log("typedoc: closing file watcher...");
      watcher.close();
    }

    console.log("typedoc: process terminated");
    process.exit(0);
  };

  // Handle various termination signals
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);

  watcher = watch("./", { recursive: true }, async (eventType, filename) => {
    const isSourceChange =
      filename.includes("/lib/") && !filename.includes("dist") && !filename.includes(".wireit");
    if (filename && filename[0] !== "_" && (isSourceChange || filename.includes("typedoc.json"))) {
      if (typedocPromise) shouldRerun = true;
      else {
        typedocPromise = typedoc().then(async () => {
          if (shouldRerun) {
            await typedoc();
            shouldRerun = false;
          }
          typedocPromise = null;
        });
      }
    }
  });
  console.log("typedoc: listening for changes in packages/*");
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
