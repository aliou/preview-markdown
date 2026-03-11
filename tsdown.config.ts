import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const fileName = process.env.PMD_BINARY_NAME ?? "pmd";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "cjs",
  platform: "node",
  alias: {
    koffi: resolve("src/vendor/koffi-stub.ts"),
  },
  deps: {
    alwaysBundle: ["@mariozechner/pi-tui", "chalk", "shiki"],
  },
  exe: {
    fileName,
    seaConfig: {
      disableExperimentalSEAWarning: true,
      useCodeCache: true,
    },
  },
});
