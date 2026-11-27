/**
 * Each page's own title and description, in the HTML Pages sends, so a search
 * engine and a link preview read "Dollymount wing foil forecast, Co. Dublin:
 * wind, tide & stars | wingfoil.ie" and not the map's head on every spot
 * page. The site is one index.html for every path (public/_redirects); the
 * worker (worker.ts) hands the paths named here that file with its head
 * rewritten, and a short document in the body (crawl.ts) for a crawler that
 * does not run JavaScript. Nothing in the app reads these tags, so the page
 * a reader sees is the same either way. The titles are site/shared/pageTitle.ts,
 * which the app sets again once it runs.
 */

import {
  pointFromId,
  pointId,
  pointName,
  spotIdFromPath,
} from "../../force5/src/siteNav.js";
import {
  AI_TITLE,
  MISSING_PAGE_TITLE,
  MISSING_SPOT_TITLE,
  STARS_TITLE,
  homeTitle,
  pointForecastTitle,
  spotForecastTitle,
  spotIndexTitle,
} from "../../site/shared/pageTitle.js";

/** Where the site is, whichever host served it: staging points here too. */
export const SITE = "https://wingfoil.ie";

/** The share image every page names (public/og.png). */
export const SHARE_IMAGE = `${SITE}/og.png`;

/** As much of a riding place as its head and the crawlable list need. */
export interface HeadSpot {
  id: string;
  name: string;
  county?: string | null;
  lat?: number;
  lon?: number;
}

export interface PageHead {
  title: string;
  description: string;
  /** The page's address on the site, its canonical URL. */
  url: string;
  /**
   * Kept out of search: a point on the water's page, one of countless, is
   * for the rider who tapped it, not for an index. So is a spot no place has,
   * and the site's missing page.
   */
  noindex?: boolean;
}

const homeDescription = (count: number) =>
  `Hourly wing foil forecast for ${
    count > 0 ? `${count} spots` : "every spot"
  } in Ireland: wind, waves, tide and a star rating for each hour.`;

const indexDescription = (count: number) =>
  `${
    count > 0 ? `All ${count} wing foil spots` : "Every wing foil spot"
  } in Ireland, by county, each with an hourly wind, tide and star rating.`;

/**
 * The map, the spot index, a spot, /stars and /ai. /spot with nothing after
 * it is the list of every place. A trailing slash is the same page.
 */
export const isPagePath = (pathname: string) =>
  /^\/(?:|spot|stars|ai)\/?$/.test(pathname) ||
  /^\/spot\/[^/]+\/?$/.test(pathname);

/**
 * /market and /community are the marketplace and the community when those
 * are switched on, and otherwise the map under another address. Either way
 * the file behind them is the map's HTML, so a crawler would file them as
 * copies of the home page. They stay the app (the script still runs) and
 * are kept out of search.
 */
export const isStubPath = (pathname: string) =>
  /^\/(?:market|community)(?:\/|$)/.test(pathname);

/**
 * Whether `pathname` is the page of a riding place `spots` does not hold:
 * /spot/<id> for an id no place has, or one that does not decode. The app
 * says so on the page, with the places it might have meant; the address
 * answers 404 as any other with nothing behind it does, so a search engine
 * or a link checker does not keep it (#225). /spot, the list of every place,
 * is not one, and nor is any spot while the places are unknown (none read).
 */
export function isMissingSpot(
  pathname: string,
  spots: ReadonlyMap<string, HeadSpot>,
): boolean {
  const raw = /^\/spot\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (raw === undefined || !spots.size) return false;
  try {
    const id = decodeURIComponent(raw);
    // A point on the water (/spot/@53.3412,-6.1520) is a page of its own,
    // never a place gone missing. An id that does not decode is not a page.
    return !spots.has(id) && !pointFromId(id);
  } catch {
    return true;
  }
}

/** The head of a spot page with no place behind it, as the app titles it. */
export const MISSING_SPOT: PageHead = {
  title: MISSING_SPOT_TITLE,
  description: "No riding place has this address on wingfoil.ie.",
  url: `${SITE}/spot`,
  noindex: true,
};

/** The head of the site's missing page, which every unknown address gets. */
export const MISSING_PAGE: PageHead = {
  title: MISSING_PAGE_TITLE,
  description: "This address is not a page on wingfoil.ie.",
  url: SITE,
  noindex: true,
};

/**
 * The head for `pathname`, or null where the map's own (index.html) would
 * stand because the path is not one of these pages, or the places could not
 * be read and this path needs them. / and /spot are pages of their own.
 */
export function pageHead(
  pathname: string,
  spots: ReadonlyMap<string, HeadSpot>,
): PageHead | null {
  if (pathname === "/" || pathname === "") {
    return {
      title: homeTitle(spots.size),
      description: homeDescription(spots.size),
      url: `${SITE}/`,
    };
  }
  if (/^\/spot\/?$/.test(pathname)) {
    return {
      title: spotIndexTitle(spots.size),
      description: indexDescription(spots.size),
      url: `${SITE}/spot`,
    };
  }
  const id = spotIdFromPath(pathname);
  if (id !== null) {
    const point = pointFromId(id);
    if (point) {
      const name = pointName(point.lat, point.lon);
      return {
        title: pointForecastTitle(name),
        description: `Hour-by-hour wind and waves on the open water at ${name}, beside the nearest riding place.`,
        url: `${SITE}/spot/${pointId(point.lat, point.lon)}`,
        noindex: true,
      };
    }
    const spot = spots.get(id);
    if (!spot) return null;
    const where = spot.county ? `, Co. ${spot.county}` : "";
    return {
      title: spotForecastTitle(spot.name, spot.county),
      description: `Hourly wing foil forecast for ${spot.name}${where}: wind, gusts, tide and a star rating for each hour.`,
      url: `${SITE}/spot/${encodeURIComponent(spot.id)}`,
    };
  }
  if (/^\/stars\/?$/.test(pathname))
    return {
      title: STARS_TITLE,
      description:
        "How wingfoil.ie rates a wing foil hour from one to five stars: the wind, the gusts, the shore and the daylight.",
      url: `${SITE}/stars`,
    };
  if (/^\/ai\/?$/.test(pathname))
    return {
      title: AI_TITLE,
      description:
        "Add the Ireland wing foil forecast to an AI assistant and ask where and when the wind, tide and stars line up.",
      url: `${SITE}/ai`,
    };
  return null;
}

/**
 * The head a stub keeps: the map's own, so a section that is switched off
 * (and sent on to the map) is not titled as a missing page, with the address
 * of the map as its canonical.
 */
export function stubHead(spots: ReadonlyMap<string, HeadSpot>): PageHead {
  return { ...pageHead("/", spots)!, noindex: true };
}

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * index.html with `head` in place of the map's: its title, and each meta and
 * link that says the page's title, description or address. Tags it does not
 * have are left absent, not added: index.html is the one place they are said.
 */
export function withHead(html: string, head: PageHead): string {
  const title = escape(head.title);
  const description = escape(head.description);
  const url = escape(head.url);
  const content =
    (attr: "name" | "property", key: string, value: string) => (out: string) =>
      out.replace(
        new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`),
        `$1${value}$2`,
      );
  const steps = [
    (out: string) =>
      out.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`),
    content("name", "description", description),
    content("property", "og:title", title),
    content("property", "og:description", description),
    content("property", "og:url", url),
    content("name", "twitter:title", title),
    content("name", "twitter:description", description),
    (out: string) =>
      out.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${url}$2`),
  ];
  return steps.reduce((out, step) => step(out), html);
}
