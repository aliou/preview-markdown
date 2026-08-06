import { describe, expect, it } from "bun:test";
import { wrapUrlsHyperlinks } from "../src/hyperlink.js";

const OSC = (url: string) => `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\`;

describe("wrapUrlsHyperlinks", () => {
  it("wraps a bare https url", () => {
    const out = wrapUrlsHyperlinks("see https://example.com here");
    expect(out).toBe(`see ${OSC("https://example.com")} here`);
  });

  it("wraps http and ftp schemes and mailto", () => {
    expect(wrapUrlsHyperlinks("go http://foo.io/x now")).toBe(
      `go ${OSC("http://foo.io/x")} now`,
    );
    expect(wrapUrlsHyperlinks("ftp://example.org/file")).toBe(
      OSC("ftp://example.org/file"),
    );
    expect(wrapUrlsHyperlinks("mail mailto:a@b.com end")).toBe(
      `mail ${OSC("mailto:a@b.com")} end`,
    );
  });

  it("preserves query strings and fragments", () => {
    const url = "https://example.com/a?x=1&y=2#frag";
    expect(wrapUrlsHyperlinks(url)).toBe(OSC(url));
  });

  it("strips trailing sentence punctuation", () => {
    expect(wrapUrlsHyperlinks("see https://example.com.")).toBe(
      `see ${OSC("https://example.com")}.`,
    );
    expect(wrapUrlsHyperlinks("(https://example.com)")).toBe(
      `(${OSC("https://example.com")})`,
    );
  });

  it("keeps balanced parentheses inside the url", () => {
    const url = "https://en.wikipedia.org/wiki/Foo_(bar)";
    expect(wrapUrlsHyperlinks(`link ${url} done`)).toBe(
      `link ${OSC(url)} done`,
    );
  });

  it("does not double-wrap urls already inside an OSC 8 hyperlink", () => {
    const line = `Link: ${OSC("https://example.com")} trailing`;
    expect(wrapUrlsHyperlinks(line)).toBe(line);
  });

  it("ignores scheme fragments glued to a word character", () => {
    expect(wrapUrlsHyperlinks("xhttps://example.com")).toBe(
      "xhttps://example.com",
    );
  });

  it("leaves lines without urls untouched", () => {
    expect(wrapUrlsHyperlinks("just some text")).toBe("just some text");
  });

  it("wraps the url inside a pi-tui text (url) fallback", () => {
    const out = wrapUrlsHyperlinks(
      "text (\u001b[36mhttps://example.com\u001b[0m)",
    );
    // The color code stays before the link, the URL is wrapped, reset after.
    expect(out).toBe(`text (\u001b[36m${OSC("https://example.com")}\u001b[0m)`);
  });
});
