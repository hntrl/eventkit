import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    workspace: [
      "packages/*",
      {
        test: {
          exclude: [
            "packages/_*/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/cypress/**",
            "**/.{idea,git,cache,output,temp}/**",
            "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
          ],
          include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "**/__tests__/**/*.?(c|m)[jt]s?(x)"],
        },
      },
    ],
  },
});
