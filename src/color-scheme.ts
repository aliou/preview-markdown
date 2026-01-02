import * as fs from "node:fs";

export type ColorScheme = "light" | "dark";

const DEBUG_LOG = "/tmp/pmd-debug.log";

function log(msg: string): void {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(DEBUG_LOG, `[${timestamp}] ${msg}\n`);
  } catch {
    // Ignore write errors
  }
}

/**
 * Parse RGB values from OSC response.
 * Format: rgb:RRRR/GGGG/BBBB (16-bit per channel)
 */
function parseOscRgb(
  response: string,
): { r: number; g: number; b: number } | null {
  // Match OSC 11 response: ESC]11;rgb:RRRR/GGGG/BBBB (terminated by BEL or ST)
  const match = response.match(
    /\x1b\]11;rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/,
  );
  if (match?.[1] && match[2] && match[3]) {
    // Convert from 16-bit to 8-bit
    const r = parseInt(match[1], 16) >> 8;
    const g = parseInt(match[2], 16) >> 8;
    const b = parseInt(match[3], 16) >> 8;
    return { r, g, b };
  }
  return null;
}

/**
 * Calculate perceived luminance (0-1) from RGB.
 * Uses sRGB luminance formula.
 */
function getLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Query the terminal for background color using OSC 11.
 * Returns null if the terminal doesn't respond or times out.
 */
async function queryTerminalColorScheme(
  timeoutMs = 200,
): Promise<ColorScheme | null> {
  // Clear previous log
  fs.writeFileSync(DEBUG_LOG, "");
  log("queryTerminalColorScheme started (OSC 11)");
  log(`stdin.isTTY: ${process.stdin.isTTY}`);
  log(`stdout.isTTY: ${process.stdout.isTTY}`);

  // Only works if stdin is a TTY
  if (!process.stdin.isTTY) {
    log("stdin is not a TTY, returning null");
    return null;
  }

  return new Promise((resolve) => {
    let buffer = "";

    // Set raw mode to read response
    const wasRaw = process.stdin.isRaw;
    log(`wasRaw: ${wasRaw}`);
    process.stdin.setRawMode(true);
    log("set raw mode to true");

    // Timeout handler
    const timeout = setTimeout(() => {
      log(`timeout after ${timeoutMs}ms, buffer: ${JSON.stringify(buffer)}`);
      cleanup();
      resolve(null);
    }, timeoutMs);

    const cleanup = () => {
      log("cleanup called");
      clearTimeout(timeout);
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
    };

    const onData = (data: Buffer) => {
      const str = data.toString();
      log(
        `received data: ${JSON.stringify(str)} (hex: ${data.toString("hex")})`,
      );
      buffer += str;
      log(`buffer now: ${JSON.stringify(buffer)}`);

      // Try to parse OSC 11 response
      const rgb = parseOscRgb(buffer);
      if (rgb) {
        const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
        log(`parsed RGB: r=${rgb.r}, g=${rgb.g}, b=${rgb.b}`);
        log(`luminance: ${luminance}`);
        const scheme: ColorScheme = luminance > 0.5 ? "light" : "dark";
        log(`determined scheme: ${scheme}`);
        cleanup();
        resolve(scheme);
      } else {
        log("no OSC 11 match yet");
      }
    };

    process.stdin.on("data", onData);
    process.stdin.resume();
    log("stdin listener attached, resuming");

    // Send OSC 11 query (query background color)
    // Format: ESC]11;?BEL or ESC]11;?ST
    log("sending query: OSC 11 (ESC]11;?BEL)");
    process.stdout.write("\x1b]11;?\x07");
    log("query sent");
  });
}

/**
 * Detect color scheme using environment variables and heuristics.
 */
function detectColorSchemeFromEnv(): ColorScheme {
  // Check COLORFGBG (set by some terminals like xterm, rxvt)
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(";");
    if (parts.length >= 2) {
      const bg = parseInt(parts[parts.length - 1] ?? "", 10);
      if (!Number.isNaN(bg)) {
        // Standard 16-color: 0-6 dark, 7+ light
        if (bg < 7) return "dark";
        if (bg >= 7) return "light";
      }
    }
  }

  // Check for explicit dark mode indicators
  if (process.env.DARKMODE === "1") return "dark";
  if (process.env.DARKMODE === "0") return "light";

  // Check TERM_PROGRAM for known defaults
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram === "Apple_Terminal") return "light";

  // iTerm2 sets this
  const itermProfile = process.env.ITERM_PROFILE;
  if (itermProfile) {
    const lower = itermProfile.toLowerCase();
    if (lower.includes("light")) return "light";
    if (lower.includes("dark")) return "dark";
  }

  // Default to dark (most common for terminal users)
  return "dark";
}

/**
 * Detect color scheme, trying OSC 997 first with fallback to env vars.
 */
export async function detectColorScheme(): Promise<ColorScheme> {
  log("detectColorScheme called");

  // Try OSC 997 query first
  const oscResult = await queryTerminalColorScheme(200);
  log(`oscResult: ${oscResult}`);

  if (oscResult) {
    log(`returning OSC result: ${oscResult}`);
    return oscResult;
  }

  // Fall back to environment variable detection
  const envResult = detectColorSchemeFromEnv();
  log(`returning env result: ${envResult}`);
  return envResult;
}

/**
 * Synchronous color scheme detection (env vars only, no OSC query).
 * Use this when you can't await.
 */
export function detectColorSchemeSync(): ColorScheme {
  return detectColorSchemeFromEnv();
}
