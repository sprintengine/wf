import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Cloudflare Pages caches Vite's content-hashed bundle for a year only because
 * `public/_headers` says so, and applies that file only to paths its static
 * asset handler serves, never to a response from `_worker.js`. Production sent
 * `max-age=14400, must-revalidate` for them in October 2026 (issue #11).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** { path pattern: { header: value } }, as Pages reads `_headers`. */
function headerRules(text: string) {
  const rules: Record<string, Record<string, string>> = {};
  let path: string | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      rules[path] = {};
      continue;
    }
    const at = line.indexOf(":");
    if (path === null || at < 0) throw new Error(`Not a header: ${line}`);
    rules[path][line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return rules;
}

describe("the Pages headers", () => {
  const rules = headerRules(read("public/_headers"));

  it("caches the content-hashed assets for a year, immutable", () => {
    expect(rules["/assets/*"]?.["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("leaves the HTML entry to Pages' default, so a deploy is seen at once", () => {
    for (const [path, headers] of Object.entries(rules)) {
      if (path === "/assets/*") continue;
      expect(headers["Cache-Control"], path).toBeUndefined();
    }
  });

  it("is applied: the worker never answers /assets/", () => {
    const routes = JSON.parse(read("public/_routes.json")) as {
      include: string[];
    };
    const runsWorker = (path: string) =>
      routes.include.some((pattern) =>
        pattern.endsWith("*")
          ? path.startsWith(pattern.slice(0, -1))
          : path === pattern,
      );
    expect(runsWorker("/assets/index-C5f053Kk.js")).toBe(false);
    expect(runsWorker("/weather/harmonie.json")).toBe(false);
    expect(runsWorker("/")).toBe(true);
    expect(routes.include).not.toContain("/*");
    for (const path of ["/spot/", "/spots/", "/market/", "/community/"]) {
      expect(runsWorker(path), path).toBe(true);
    }
  });

  it("has no overlapping rules, which `wrangler pages deploy` refuses", () => {
    // wrangler's own test: a rule ending in /* overlaps any other rule that
    // starts with it less the *, so "/spot/*" and "/spot/" cannot both be
    // listed (the splat already covers "/spot/").
    const routes = JSON.parse(read("public/_routes.json")) as {
      include: string[];
      exclude: string[];
    };
    for (const rules of [routes.include, routes.exclude]) {
      for (const splat of rules.filter((rule) => rule.endsWith("/*"))) {
        const prefix = splat.slice(0, -1);
        const overlapping = rules.filter(
          (rule) => rule !== splat && rule.startsWith(prefix),
        );
        expect(overlapping, splat).toEqual([]);
      }
    }
  });

  it("matches the self-hosted image's Caddyfile", () => {
    expect(read("deploy/local/Caddyfile")).toContain(
      'header @asset Cache-Control "public, max-age=31536000, immutable"',
    );
  });
});
