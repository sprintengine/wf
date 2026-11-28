/**
 * The document a crawler reads in the first HTML, before any script runs.
 * The page takes it out of the DOM as soon as its own script runs
 * (index.html), so a reader with JavaScript sees the app and not this
 * twice. Links are plain `<a href>`, the same addresses the app uses.
 *
 * Nearby places follow the spot page's own rule (spot/web/point.ts
 * `spotsAround`): the nearest, then any other within 30 km, nine at most.
 * A point on the water follows that page's shorter list (six, within 15 km).
 */

import {
  pointFromId,
  pointName,
  spotHref,
  spotIdFromPath,
} from "../../force5/src/siteNav.js";
import { SITE, type HeadSpot } from "./head.js";

/** As spot/web/point.ts `SPOT_NEARBY` and `SPOT_NEARBY_KM`. */
const SPOT_NEARBY = 9;
const SPOT_NEARBY_KM = 30;
/** As spot/web/point.ts `POINT_NEARBY` and force5/src/pointSource.ts. */
const POINT_NEARBY = 6;
const POINT_NEARBY_KM = 15;

const NI = new Set([
  "Antrim",
  "Armagh",
  "Derry",
  "Down",
  "Fermanagh",
  "Tyrone",
]);

export const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Kilometres between two points, the same earth radius as mcp/api/forecast.ts. */
function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function located(spots: ReadonlyMap<string, HeadSpot>): HeadSpot[] {
  return [...spots.values()].filter(
    (spot) => Number.isFinite(spot.lat) && Number.isFinite(spot.lon),
  );
}

/** Nearest first; the nearest always, then any other within `km`, `limit` at most. */
function around(
  spots: readonly HeadSpot[],
  here: { id?: string; lat: number; lon: number },
  limit: number,
  km: number,
): HeadSpot[] {
  return spots
    .filter((spot) => spot.id !== here.id)
    .map((spot) => ({
      spot,
      km: distanceKm(here as { lat: number; lon: number }, {
        lat: spot.lat as number,
        lon: spot.lon as number,
      }),
    }))
    .sort((a, b) => a.km - b.km || a.spot.id.localeCompare(b.spot.id))
    .filter((near, i) => i === 0 || near.km <= km)
    .slice(0, limit)
    .map((near) => near.spot);
}

function link(href: string, label: string) {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function crumbs(items: { href?: string; name: string }[]) {
  const lis = items
    .map((item) =>
      item.href
        ? `<li>${link(item.href, item.name)}</li>`
        : `<li>${escapeHtml(item.name)}</li>`,
    )
    .join("");
  return `<nav aria-label="Breadcrumb"><ol>${lis}</ol></nav>`;
}

/** Every riding place, counties A to Z, places A to Z inside each. */
function byCounty(
  spots: ReadonlyMap<string, HeadSpot>,
): [string, HeadSpot[]][] {
  const groups = new Map<string, HeadSpot[]>();
  for (const spot of [...spots.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const county = spot.county || "Elsewhere";
    groups.set(county, [...(groups.get(county) ?? []), spot]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

function countyLists(spots: ReadonlyMap<string, HeadSpot>): string {
  return byCounty(spots)
    .map(([county, places]) => {
      const items = places
        .map((spot) => `<li>${link(spotHref(spot.id), spot.name)}</li>`)
        .join("");
      return `<section><h2>${escapeHtml(county)}</h2><ul>${items}</ul></section>`;
    })
    .join("");
}

function nearbyList(places: readonly HeadSpot[]): string {
  if (!places.length)
    return `<p>No other riding place is close. ${link("/spot", "All spots by county")}</p>`;
  const items = places
    .map((spot) => {
      const where = spot.county ? `, Co. ${spot.county}` : "";
      return `<li>${link(spotHref(spot.id), `${spot.name}${where}`)}</li>`;
    })
    .join("");
  return `<h2>Nearby spots</h2><ul>${items}</ul>`;
}

function notFoundCrawl() {
  return [
    crumbs([
      { href: "/", name: "Wing foil forecast" },
      { href: "/spot", name: "All spots" },
    ]),
    `<h1>Spot not found</h1>`,
    `<p>No riding place has this address. ${link("/spot", "All spots by county")}.</p>`,
  ].join("");
}

function countPhrase(count: number, singular: string, plural: string) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/** The `#crawl` contents for a path this module knows, or "" for a stub. */
export function crawlHtml(
  pathname: string,
  spots: ReadonlyMap<string, HeadSpot>,
): string {
  const count = spots.size;
  const places = count > 0 ? countPhrase(count, "spot", "spots") : "every spot";
  const riding =
    count > 0
      ? countPhrase(count, "riding place", "riding places")
      : "Every riding place";
  if (pathname === "/" || pathname === "") {
    return [
      crumbs([{ name: "Wing foil forecast" }]),
      `<h1>Wing foil forecast Ireland</h1>`,
      `<p>Hourly wind, wave and tide forecasts for ${places} in Ireland, each hour rated in stars. ${link("/spot", count > 0 ? `All ${places} by county` : "All spots by county")}.</p>`,
      countyLists(spots),
    ].join("");
  }
  if (/^\/spot\/?$/.test(pathname)) {
    return [
      crumbs([{ href: "/", name: "Wing foil forecast" }, { name: "Spots" }]),
      `<h1>Wing foil spots in Ireland</h1>`,
      `<p>${riding} by county, each with an hourly wind, tide and star rating.</p>`,
      countyLists(spots),
    ].join("");
  }
  const rawId = /^\/spot\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (rawId !== undefined) {
    let id: string;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      return notFoundCrawl();
    }
    const point = pointFromId(id);
    if (point) {
      const name = pointName(point.lat, point.lon);
      const near = around(
        located(spots),
        { lat: point.lat, lon: point.lon },
        POINT_NEARBY,
        POINT_NEARBY_KM,
      );
      return [
        crumbs([
          { href: "/", name: "Wing foil forecast" },
          { href: "/spot", name: "Spots" },
          { name },
        ]),
        `<h1>${escapeHtml(name)} wing foil forecast</h1>`,
        `<p>Hour-by-hour wind and waves on the open water at ${escapeHtml(name)}, beside the nearest riding place.</p>`,
        nearbyList(near),
      ].join("");
    }
    const spot = spots.get(id);
    if (!spot) return notFoundCrawl();
    const where = spot.county ? `, Co. ${spot.county}` : "";
    const near =
      Number.isFinite(spot.lat) && Number.isFinite(spot.lon)
        ? around(
            located(spots),
            { id: spot.id, lat: spot.lat as number, lon: spot.lon as number },
            SPOT_NEARBY,
            SPOT_NEARBY_KM,
          )
        : [];
    return [
      crumbs([
        { href: "/", name: "Wing foil forecast" },
        { href: "/spot", name: "Spots" },
        { name: spot.name },
      ]),
      `<h1>${escapeHtml(spot.name)} wing foil forecast</h1>`,
      `<p>Hour-by-hour wind, tide and star rating at ${escapeHtml(spot.name)}${escapeHtml(where)}.</p>`,
      nearbyList(near),
      `<p>${link("/spot", "All spots by county")}</p>`,
    ].join("");
  }
  if (/^\/stars\/?$/.test(pathname)) {
    return [
      crumbs([
        { href: "/", name: "Wing foil forecast" },
        { name: "How the stars work" },
      ]),
      `<h1>How the stars work</h1>`,
      `<p>How an hour of wind, gusts and shore becomes one to five stars for wing foiling in Ireland.</p>`,
      `<p>${link("/spot", "All spots by county")}</p>`,
    ].join("");
  }
  if (/^\/ai\/?$/.test(pathname)) {
    return [
      crumbs([
        { href: "/", name: "Wing foil forecast" },
        { name: "AI assistant" },
      ]),
      `<h1>Ireland wing foil forecast for an AI assistant</h1>`,
      `<p>The same hourly wind, tide and star ratings as the site, for an assistant to read. ${link("/spot", "All spots by county")}.</p>`,
    ].join("");
  }
  return "";
}

/** JSON for a `<script type="application/ld+json">`, or "" where a page has none. */
export function jsonLd(
  pathname: string,
  spots: ReadonlyMap<string, HeadSpot>,
  description: string,
): string {
  const raw = jsonValue(pathname, spots, description);
  if (!raw) return "";
  return JSON.stringify(raw).replace(/</g, "\\u003c");
}

function jsonValue(
  pathname: string,
  spots: ReadonlyMap<string, HeadSpot>,
  description: string,
): unknown {
  if (pathname === "/" || pathname === "") {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "wingfoil.ie",
      url: `${SITE}/`,
      description,
    };
  }
  if (/^\/spot\/?$/.test(pathname)) {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        crumb(1, "Wing foil forecast", `${SITE}/`),
        crumb(2, "Spots", `${SITE}/spot`),
      ],
    };
  }
  const id = spotIdFromPath(pathname);
  if (id === null) return null;
  const spot = spots.get(id);
  if (!spot || pointFromId(id)) return null;
  const url = `${SITE}/spot/${encodeURIComponent(spot.id)}`;
  const country = spot.county && NI.has(spot.county) ? "GB" : "IE";
  const place: Record<string, unknown> = {
    "@type": "Place",
    "@id": url,
    name: spot.name,
    url,
  };
  if (spot.county) {
    place.address = {
      "@type": "PostalAddress",
      addressRegion: spot.county,
      addressCountry: country,
    };
  }
  if (Number.isFinite(spot.lat) && Number.isFinite(spot.lon)) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: spot.lat,
      longitude: spot.lon,
    };
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      place,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          crumb(1, "Wing foil forecast", `${SITE}/`),
          crumb(2, "Spots", `${SITE}/spot`),
          crumb(3, spot.name, url),
        ],
      },
    ],
  };
}

function crumb(position: number, name: string, item: string) {
  return { "@type": "ListItem", position, name, item };
}
