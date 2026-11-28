import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("the sitemap and the agent guide", () => {
  const out = mkdtempSync(join(tmpdir(), "wingfoil-sitemap-"));
  execFileSync(process.execPath, ["scripts/build-sitemap.mjs", out], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });
  const places = JSON.parse(
    readFileSync(
      new URL("../public/riding-locations.json", import.meta.url),
      "utf8",
    ),
  ) as { id: string; name: string }[];

  it("lists the spot index, with lastmod on every URL", () => {
    const xml = readFileSync(join(out, "sitemap.xml"), "utf8");
    expect(xml).toContain("<loc>https://wingfoil.ie/spot</loc>");
    expect(xml).toContain("<loc>https://wingfoil.ie/</loc>");
    expect(xml).toContain("<loc>https://wingfoil.ie/spot/dollymount</loc>");
    expect(xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)?.length).toBe(
      places.length + 4,
    );
    expect(xml).not.toContain("/spots<");
  });

  it("names every place for an agent, and the MCP endpoint", () => {
    const text = readFileSync(join(out, "llms.txt"), "utf8");
    expect(text).toContain("# wingfoil.ie");
    expect(text).toContain("https://wingfoil.ie/api/mcp");
    expect(text).toContain("https://wingfoil.ie/spot/dollymount");
    expect(text).toContain(places[0].name);
    expect(text).toContain("never a statement that conditions are safe");
  });
});
