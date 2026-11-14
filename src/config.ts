import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import type { ColorScheme } from "./color-scheme";
import { APP_NAME, LOCAL_CONFIG_FILE } from "./constants";
import { FailedError } from "./failed-error";

export const SCHEMA_URL =
  "https://raw.githubusercontent.com/aliou/preview-markdown/main/schema.json";

export const configSchema = z
  .strictObject({
    $schema: z
      .url()
      .optional()
      .describe("JSON Schema URL for editor validation"),
    showLineNumbers: z
      .boolean()
      .default(false)
      .describe("Show line numbers in the pager"),
    theme: z
      .union([
        z.string().describe("Theme name to use for both light and dark mode"),
        z
          .strictObject({
            dark: z.string().describe("Theme name for dark mode"),
            light: z.string().describe("Theme name for light mode"),
          })
          .describe("Separate themes for dark and light mode"),
      ])
      .default({ dark: "senzu-dark", light: "senzu-light" })
      .describe(
        "A bundled theme name, or the name of a TextMate theme file in the themes directory next to the global config",
      ),
  })
  .describe("Configuration file for pmd (preview-markdown)");

export type Config = z.infer<typeof configSchema>;

export function configDirectory(): string {
  const base =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, APP_NAME);
}

function globalConfigPath(): string {
  return path.join(configDirectory(), "config.json");
}

export function activeConfigPath(): string {
  const local = path.resolve(LOCAL_CONFIG_FILE);
  return fs.existsSync(local) ? local : globalConfigPath();
}

export function loadConfig(): Config {
  const file = activeConfigPath();
  if (!fs.existsSync(file)) return configSchema.parse({});

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new FailedError(
      `cannot read config ${file}: ${(error as Error).message}`,
    );
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new FailedError(
      `invalid config ${file}:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function initConfig(force: boolean): string {
  const file = globalConfigPath();
  if (fs.existsSync(file) && !force) {
    throw new FailedError(
      `${file} already exists; pass --force to overwrite it`,
    );
  }
  const { showLineNumbers, theme } = configSchema.parse({});
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ $schema: SCHEMA_URL, showLineNumbers, theme }, null, 2)}\n`,
  );
  return file;
}

export function themeNameFor(config: Config, scheme: ColorScheme): string {
  return typeof config.theme === "string" ? config.theme : config.theme[scheme];
}

export function configSchemaJson(): Record<string, unknown> {
  const schema = z.toJSONSchema(configSchema, {
    target: "draft-07",
    io: "input",
  });
  return {
    $schema: schema.$schema,
    $id: SCHEMA_URL,
    title: "pmd configuration",
    ...schema,
  };
}
