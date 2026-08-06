import { extractAnsiCode } from "@earendil-works/pi-tui/dist/utils.js";

// Match URLs with an explicit scheme. Bare "www." hosts are intentionally
// excluded: marked's GFM autolinking expands them to http://... in link
// targets, so the explicit-scheme form is what shows up (and gets matched) in
// rendered output. Escape bytes are excluded from the body so a URL can never
// swallow an ANSI/OSC sequence. The word-boundary check is handled in the walk
// (via prevVisible) instead of a regex lookbehind, so an SGR code such as
// "\x1b[36m" ending in an alphanumeric does not block a URL that follows it.
const URL_REGEX = /(?:https?|ftp):\/\/[^\s<>"'\x1b`]+|mailto:[^\s<>"'\x1b`]+/iy;

// Trailing characters that commonly hug a URL but are not part of it.
const SIMPLE_TRAILING = ".,;:!?]}'\"";

/**
 * Strip trailing punctuation that is unlikely to belong to the URL. Closing
 * parentheses are only removed when they leave the URL with unbalanced parens,
 * so links such as https://en.wikipedia.org/wiki/Foo_(bar) survive intact.
 */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const char = url[end - 1];
    if (char === undefined) break;

    if (char === ")") {
      const opens = countChar(url, "(", end);
      const closes = countChar(url, ")", end);
      if (closes > opens) {
        end--;
        continue;
      }
      break;
    }

    if (SIMPLE_TRAILING.includes(char)) {
      end--;
      continue;
    }

    break;
  }
  return url.slice(0, end);
}

function countChar(text: string, char: string, end: number): number {
  let count = 0;
  for (let i = 0; i < end; i++) {
    if (text[i] === char) count++;
  }
  return count;
}

function wrapSingleUrl(url: string): string {
  // Visible text equals the URL, so terminals that ignore OSC 8 still render it.
  return `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`;
}

/**
 * Wrap bare URLs in OSC 8 hyperlink sequences so they are clickable in
 * terminals that support it (Ghostty, Kitty, WezTerm, iTerm2, ...). Terminals
 * that ignore OSC 8 still render the URL text, so this never hides a link
 * target.
 *
 * URLs already inside an OSC 8 hyperlink (emitted by the markdown renderer on
 * hyperlink-capable terminals) are left untouched, as is any text the terminal
 * already considers linked.
 */
export function wrapUrlsHyperlinks(line: string): string {
  if (!line.includes("://") && !line.toLowerCase().includes("mailto:")) {
    return line;
  }

  let result = "";
  let i = 0;
  let insideHyperlink = false;
  // Last visible (non-escape) character emitted. Used to avoid matching a
  // scheme glued to a preceding word character (e.g. "xhttps://...").
  let prevVisible: string | undefined;

  while (i < line.length) {
    const escapeSeq = extractAnsiCode(line, i);
    if (escapeSeq) {
      if (escapeSeq.code.startsWith("\x1b]8;")) {
        // OSC 8 body sits between "ESC ]8;" and the terminator (BEL or ST).
        const body = escapeSeq.code.endsWith("\x07")
          ? escapeSeq.code.slice(4, -1)
          : escapeSeq.code.slice(4, -2);
        const url = body.slice(body.indexOf(";") + 1);
        // Open sequences carry a URL; close sequences ("ESC ]8;;" ST) do not.
        insideHyperlink = url.length > 0;
      }
      result += escapeSeq.code;
      i += escapeSeq.length;
      continue; // escape sequences carry no visible width
    }

    const char = line[i] ?? "";

    if (insideHyperlink) {
      result += char;
      prevVisible = char;
      i++;
      continue;
    }

    const atWordBoundary =
      prevVisible === undefined || !/[A-Za-z0-9]/.test(prevVisible);
    if (atWordBoundary) {
      URL_REGEX.lastIndex = i;
      const match = URL_REGEX.exec(line);
      if (match) {
        const url = trimTrailingPunctuation(match[0]);
        if (url.length > 0) {
          result += wrapSingleUrl(url);
          i += url.length;
          prevVisible = url[url.length - 1];
          continue;
        }
      }
    }

    result += char;
    prevVisible = char;
    i++;
  }

  return result;
}
