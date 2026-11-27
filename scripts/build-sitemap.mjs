/**
 * Write OUTDIR/sitemap.xml and OUTDIR/llms.txt.
 *
 * The sitemap is the map, the spot index, /stars, /ai and every riding
 * place's page, at the address search engines are to know them by
 * (mcp/pages/head.ts `SITE`, the same as each page's canonical link). Each
 * URL carries lastmod, the UTC day of this build: the pages are regenerated
 * with the deploy, which is as fresh as the file can honestly say.
 *
 * llms.txt is a short guide for an agent that reads the site: what the
 * forecast is, then every place by county. public/robots.txt names both.
 *
 * Run by `npm run build` after Vite, from public/riding-locations.json, so
 * the list is the places this build has.
 *
 *   node scripts/build-sitemap.mjs [OUTDIR]
 *
 * OUTDIR defaults to Vite's: dist, or .e2e/dist for the e2e build.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://wingfoil.ie";
const out = process.argv[2] ?? (process.env.E2E_SITE ? ".e2e/dist" : "dist");

const places = JSON.parse(
  readFileSync(
    new URL("../public/riding-locations.json", import.meta.url),
    "utf8",
  ),
);
const paths = [
  "/",
  "/spot",
  "/stars",
  "/ai",
  ...places.map((place) => `/spot/${encodeURIComponent(place.id)}`),
];
const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lastmod = new Date().toISOString().slice(0, 10);
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...paths.map(
    (path) =>
      `  <url><loc>${escape(SITE + path)}</loc><lastmod>${lastmod}</lastmod></url>`,
  ),
  "</urlset>",
  "",
].join("\n");
writeFileSync(join(out, "sitemap.xml"), xml);
console.log(`${join(out, "sitemap.xml")}: ${paths.length} pages`);

const byCounty = new Map();
for (const place of [...places].sort((a, b) => a.name.localeCompare(b.name))) {
  const county = place.county || "Elsewhere";
  byCounty.set(county, [...(byCounty.get(county) ?? []), place]);
}
const counties = [...byCounty].sort(([a], [b]) => a.localeCompare(b));
const spotLines = counties.flatMap(([county, list]) => [
  "",
  `### ${county}`,
  "",
  ...list.map(
    (place) =>
      `- [${place.name.replace(/]/g, "")}](${SITE}/spot/${encodeURIComponent(place.id)}): Co. ${place.county || county}`,
  ),
]);
const llms = [
  "# wingfoil.ie",
  "",
  `> Hourly wing foil forecasts for ${places.length} spots in Ireland, the Republic and Northern Ireland. Each hour is rated in stars from the wind, the gusts and the shore. Speeds are knots. Times on the site are Irish local time.`,
  "",
  "The forecast is one model's own: HARMONIE, from Met Éireann, for about the next 60 hours, then ECMWF. It is not bias-corrected against observations, and it is never a statement that conditions are safe. Offshore wind, an official warning or a bathing-water notice can rule a session out whatever the stars say. Last light ends a session.",
  "",
  "## Pages",
  "",
  `- [Wing foil forecast](${SITE}/): the spots nearest you, rated hour by hour`,
  `- [All spots by county](${SITE}/spot): every riding place`,
  `- [How the stars work](${SITE}/stars): from too light, through the sweet spot, to too much`,
  `- [For an AI assistant](${SITE}/ai): the same forecast over MCP at ${SITE}/api/mcp`,
  "",
  "## Spots",
  "",
  ...spotLines,
  "",
].join("\n");
writeFileSync(join(out, "llms.txt"), llms);
console.log(`${join(out, "llms.txt")}: ${places.length} spots`);
