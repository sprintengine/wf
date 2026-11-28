/**
 * The site's own /api/mcp, on Cloudflare Pages: the MCP server of
 * mcp/api/server.ts, bundled into the built site as `_worker.js` by
 * scripts/build-pages-worker.mjs.
 *
 * Production has no API server, only the static site, so without this every
 * client the /ai page sends to https://wingfoil.ie/api/mcp got Pages' 404 page
 * for a GET and an empty 405 for a POST. `_routes.json` (public/) runs this
 * worker for /api/mcp alone; every other path is a static file, with
 * `_redirects` and `_headers` applied as before, and costs no invocation.
 *
 * Files are read where the map reads them: the ingest output (`weather/`,
 * `marine/`) from the base `configure-site` writes into index.html at deploy
 * (scripts/release/release.mjs, force5/src/urls.ts), so one build serves
 * staging's data on staging and production's in production; everything else
 * (`riding-locations.json`) from the site's own files. A site with no such tag
 * (a development build) reads both from itself.
 *
 * It also answers the map, the spot index, the spot pages, /stars and /ai
 * with index.html under their own title, description and a short document a
 * crawler can read without running the app (head.ts, document.ts).
 * `_routes.json` names those paths too, and /market, /community (the same
 * HTML as the map, kept out of search) and /spots (the finder's old address,
 * redirected to /). A spot page for a place that does not exist is index.html
 * too, for the app to say so, but answered 404: `_redirects` alone would
 * have answered it 200.
 */
import { Hono } from "hono";
import { httpSource, type ForecastSource } from "../api/httpSource.js";
import { createMcpRouter } from "../api/server.js";
import { redirectFor, renderPath } from "./document.js";
import {
  isMissingSpot,
  isPagePath,
  isStubPath,
  pageHead,
  type HeadSpot,
} from "./head.js";

/** The binding Pages gives an advanced-mode worker for the static files. */
interface Env {
  ASSETS: { fetch: typeof fetch };
}

/** The paths the forecast base serves, as force5/src/urls.ts `forecastUrl` reads them. */
const INGEST = /^(weather|marine)\//;

const FORECAST_BASE = /<meta name="wingfoil:forecast-base" content="([^"]+)"/;

/** The forecast base index.html names, or this origin's root when it names none. */
export function forecastBase(html: string, origin: string): string {
  const named = FORECAST_BASE.exec(html)?.[1]?.replace(/&amp;/g, "&");
  return new URL(named ?? "/", origin).href;
}

/**
 * One app per isolate, so the source's read cache (five minutes for the
 * pointer manifests) is shared by the requests the isolate answers. A failed
 * read of index.html is not kept: the next request tries again.
 */
let app: Promise<Hono> | undefined;

function appFor(request: Request, env: Env): Promise<Hono> {
  app ??= (async () => {
    const origin = new URL(request.url).origin;
    const index = await env.ASSETS.fetch(new URL("/", origin).href);
    if (!index.ok) throw new Error(`index.html answered ${index.status}`);
    const dataBase = forecastBase(await index.text(), origin);
    const data = httpSource(dataBase);
    const site = httpSource(origin, {
      fetch: (url, init) => env.ASSETS.fetch(url, init),
    });
    const from = (path: string) =>
      INGEST.test(path.replace(/^\/+/, "")) ? data : site;
    const source: ForecastSource = {
      json: (path) => from(path).json(path),
      forget: (path) => from(path).forget?.(path),
    };
    return new Hono().route(
      "/api/mcp",
      // The spot card links to this site, and loads its pictures from the
      // data host the map reads.
      createMcpRouter({ source, site: origin, dataBase }),
    );
  })().catch((error) => {
    app = undefined;
    throw error;
  });
  return app;
}

/**
 * The riding places, by id, for their pages' heads: the site's own
 * riding-locations.json, read once per isolate as the MCP server reads it. A
 * failed read is not kept.
 */
let spots: Promise<ReadonlyMap<string, HeadSpot>> | undefined;

function spotsFor(origin: string, env: Env) {
  spots ??= (async () => {
    const res = await env.ASSETS.fetch(
      new URL("/riding-locations.json", origin).href,
    );
    if (!res.ok)
      throw new Error(`riding-locations.json answered ${res.status}`);
    const list = (await res.json()) as HeadSpot[];
    return new Map(list.map((spot) => [spot.id, spot] as const));
  })().catch((error) => {
    spots = undefined;
    throw error;
  });
  return spots;
}

/**
 * A page this worker answers itself: index.html, as `_redirects` would have
 * served it, with that path's head and crawlable body. Its status and headers
 * are index.html's, less a length the rewrite has changed; a spot no place
 * has is a 404, and a stub or a point on the water is kept out of search.
 */
async function withPage(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (!isPagePath(url.pathname) && !isStubPath(url.pathname)) return null;
  const spots = await spotsFor(url.origin, env).catch(
    () => new Map<string, HeadSpot>(),
  );
  // A spot page whose places could not be read stays the static file, and
  // the next request reads them again. Home and the index do not need a list.
  if (
    !isStubPath(url.pathname) &&
    !isMissingSpot(url.pathname, spots) &&
    !pageHead(url.pathname, spots)
  )
    return null;
  const index = await env.ASSETS.fetch(new URL("/", url.origin).href);
  if (!index.ok) return null;
  const rendered = renderPath(await index.text(), url.pathname, spots);
  if (!rendered) return null;
  const headers = new Headers(index.headers);
  headers.delete("content-length");
  headers.delete("etag");
  if (rendered.noindex) headers.set("X-Robots-Tag", "noindex");
  return new Response(request.method === "HEAD" ? null : rendered.html, {
    status: rendered.status,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/mcp" || url.pathname === "/api/mcp/") {
      const mcp = await appFor(request, env);
      // Hono's routes have no trailing slash; a client given one still reaches it.
      url.pathname = "/api/mcp";
      return mcp.fetch(new Request(url, request));
    }
    const dest = redirectFor(url);
    if (dest) return Response.redirect(dest.toString(), 301);
    return (await withPage(request, env)) ?? env.ASSETS.fetch(request);
  },
};
