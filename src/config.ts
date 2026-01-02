import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { APP_NAME, LOCAL_CONFIG_FILE } from "./constants.js";

/**
 * Theme configuration - either a single theme name or dark/light pair
 */
export type ThemeConfig = string | { dark: string; light: string };

/**
 * Application configuration
 */
export interface Config {
  showLineNumbers?: boolean;
  theme?: ThemeConfig;
}

const SCHEMA_URL =
  "https://raw.githubusercontent.com/aliou/preview-markdown/main/schema.json";

const defaultConfig: Config = {
  showLineNumbers: false,
  theme: {
    dark: "jellybeans-dark",
    light: "jellybeans-light",
  },
};

function getGlobalConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, APP_NAME);
  }
  return path.join(os.homedir(), ".config", APP_NAME);
}

function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), "config.json");
}

function getLocalConfigPath(): string {
  return path.join(process.cwd(), LOCAL_CONFIG_FILE);
}

function loadConfigFromPath(configPath: string): Config | null {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8");
      const userConfig = JSON.parse(content) as Partial<Config>;
      return {
        showLineNumbers:
          userConfig.showLineNumbers ?? defaultConfig.showLineNumbers,
        theme: userConfig.theme ?? defaultConfig.theme,
      };
    }
  } catch {
    // Fall back to next option on error
  }
  return null;
}

export function loadConfig(): Config {
  // Check local config first
  const localConfig = loadConfigFromPath(getLocalConfigPath());
  if (localConfig) {
    return localConfig;
  }

  // Fall back to global config
  const globalConfig = loadConfigFromPath(getGlobalConfigPath());
  if (globalConfig) {
    return globalConfig;
  }

  return defaultConfig;
}

export function saveDefaultConfig(): string {
  const configDir = getGlobalConfigDir();
  const configPath = getGlobalConfigPath();

  const configWithSchema = {
    $schema: SCHEMA_URL,
    ...defaultConfig,
  };

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(configWithSchema, null, 2));

  return configPath;
}

/**
 * Get the theme name for a given color scheme from config
 */
export function getThemeName(
  config: Config,
  isDark: boolean,
): string | undefined {
  if (!config.theme) {
    return undefined;
  }

  if (typeof config.theme === "string") {
    // Single theme for both modes
    return config.theme;
  }

  // Dark/light pair
  return isDark ? config.theme.dark : config.theme.light;
}
