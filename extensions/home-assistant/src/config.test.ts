import { describe, expect, it } from "vitest";
import { resolveHassTimeoutSeconds, resolveHassToken, resolveHassUrl } from "./config.js";

describe("resolveHassUrl", () => {
  it("returns undefined when nothing is configured", () => {
    const result = resolveHassUrl(undefined);
    expect(result).toBeUndefined();
  });

  it("strips trailing slashes from the URL", () => {
    const cfg = {
      plugins: {
        entries: {
          "home-assistant": {
            config: { url: "http://192.168.1.100:8123/" },
          },
        },
      },
    } as never;
    const result = resolveHassUrl(cfg);
    expect(result).toBe("http://192.168.1.100:8123");
  });
});

describe("resolveHassToken", () => {
  it("returns undefined when nothing is configured", () => {
    const result = resolveHassToken(undefined);
    expect(result).toBeUndefined();
  });
});

describe("resolveHassTimeoutSeconds", () => {
  it("returns default when nothing is configured", () => {
    expect(resolveHassTimeoutSeconds(undefined)).toBe(15);
  });

  it("clamps to 120 seconds max", () => {
    const cfg = {
      plugins: {
        entries: {
          "home-assistant": {
            config: { timeout: 999 },
          },
        },
      },
    } as never;
    expect(resolveHassTimeoutSeconds(cfg)).toBe(120);
  });
});
