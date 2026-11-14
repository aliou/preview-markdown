import {
  colorToOklch,
  rgbColor,
  type TuiAltScreen,
} from "@earendil-works/pi-tui";

export type ColorScheme = "light" | "dark";

const QUERY_TIMEOUT_MS = 200;
const LIGHT_BACKGROUND_LIGHTNESS = 0.6;

function colorSchemeFromEnv(): ColorScheme {
  const background = Number.parseInt(
    process.env.COLORFGBG?.split(";").at(-1) ?? "",
    10,
  );
  if (!Number.isNaN(background))
    return background >= 7 && background !== 8 ? "light" : "dark";
  if (process.env.TERM_PROGRAM === "Apple_Terminal") return "light";
  return /light/i.test(process.env.ITERM_PROFILE ?? "") ? "light" : "dark";
}

export async function detectColorScheme(
  tui: TuiAltScreen,
): Promise<ColorScheme> {
  const { background } = await tui.queryTerminalColors({
    timeoutMs: QUERY_TIMEOUT_MS,
  });
  if (!background) return colorSchemeFromEnv();
  const { l } = colorToOklch(
    rgbColor(background.r, background.g, background.b),
  );
  return l > LIGHT_BACKGROUND_LIGHTNESS ? "light" : "dark";
}
