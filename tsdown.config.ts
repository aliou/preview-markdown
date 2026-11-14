import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "node",
  minify: true,
  deps: { alwaysBundle: [/./], onlyBundle: false },
  exe: {
    fileName: `pmd-${process.platform}-${process.arch}`,
    outDir: "dist",
    seaConfig: { useCodeCache: true },
  },
});
