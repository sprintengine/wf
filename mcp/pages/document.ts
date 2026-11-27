/**
 * index.html as one address answers it: the head for that address
 * (head.ts) and, in `#crawl`, the text and links a crawler can read without
 * running the app (crawl.ts). The preview server (vite.config.ts) and the
 * Pages worker (worker.ts) both go through here, so the two cannot disagree.
 *
 * `/spots` was the spot finder's address until 26 October 2026 and is the
 * map now (src/lastView.ts). `www` is the same site as the apex; Pages'
 * `_redirects` cannot say so, because it matches paths and not hostnames, so
 * the worker redirects the pages it serves. A zone redirect still has to
 * cover every other path (assets, the sitemap, this file's image).
 */

import { crawlHtml, jsonLd } from "./crawl.js";
import {
  MISSING_PAGE,
  MISSING_SPOT,
  isMissingSpot,
  isPagePath,
  isStubPath,
  pageHead,
  stubHead,
  withHead,
  type HeadSpot,
  type PageHead,
} from "./head.js";

const WWW = "www.wingfoil.ie";

export interface RenderedPage {
  status: number;
  noindex: boolean;
  html: string;
}

/**
 * Where a request should be sent instead, or null to answer it here.
 * `www` and `/spots` fold in one hop: `www.wingfoil.ie/spots?tab=near`
 * becomes `https://wingfoil.ie/?tab=near`. The MCP endpoint is left on
 * whichever host it was called, so a POST is not turned into a GET.
 */
export function redirectFor(url: URL): URL | null {
  if (url.pathname === "/api/mcp" || url.pathname === "/api/mcp/") return null;
  const dest = new URL(url.href);
  let changed = false;
  if (dest.hostname === WWW) {
    dest.hostname = "wingfoil.ie";
    changed = true;
  }
  if (/^\/spots(\/|$)/.test(dest.pathname)) {
    dest.pathname = "/";
    changed = true;
  }
  return changed ? dest : null;
}

/**
 * The page for `pathname`, or null where the static file stands (the path
 * is not one of these, or a spot page whose places could not be read).
 */
export function renderPath(
  template: string,
  pathname: string,
  spots: ReadonlyMap<string, HeadSpot>,
): RenderedPage | null {
  if (isStubPath(pathname)) {
    const head = stubHead(spots);
    return {
      status: 200,
      noindex: true,
      html: applyDocument(
        template,
        head,
        `<p><a href="/">Wing foil forecast for Ireland</a></p>`,
        "",
      ),
    };
  }
  if (!isPagePath(pathname)) return null;
  const missing = isMissingSpot(pathname, spots);
  const head = missing ? MISSING_SPOT : pageHead(pathname, spots);
  if (!head) return null;
  return {
    status: missing ? 404 : 200,
    noindex: Boolean(head.noindex),
    html: applyDocument(
      template,
      head,
      crawlHtml(pathname, spots),
      missing ? "" : jsonLd(pathname, spots, head.description),
    ),
  };
}

/** The site's 404.html: the app, titled as a missing page and kept out of search. */
export function renderMissing(template: string): string {
  return applyDocument(
    template,
    MISSING_PAGE,
    `<nav aria-label="Breadcrumb"><ol><li><a href="/">Wing foil forecast</a></li><li>Page not found</li></ol></nav><h1>Page not found</h1><p>This address is not a page on wingfoil.ie. <a href="/">The forecast</a>, or <a href="/spot">all spots by county</a>.</p>`,
    "",
  );
}

/**
 * `template` with this page's head, its JSON-LD and its crawlable body.
 * The markers live in index.html; a template that has not got one yet gains
 * it, so a short fixture in a test still renders.
 */
export function applyDocument(
  template: string,
  head: PageHead,
  crawl: string,
  ld: string,
): string {
  let out = withHead(template, head);
  const ldTag = `<script type="application/ld+json" id="ld-json">${ld}</script>`;
  if (/id="ld-json"/.test(out)) {
    out = out.replace(
      /\s*<script type="application\/ld\+json" id="ld-json">[\s\S]*?<\/script>/,
      ld ? `\n    ${ldTag}` : "",
    );
  } else if (ld && out.includes("</head>")) {
    out = out.replace("</head>", `${ldTag}\n  </head>`);
  }
  const crawlTag = `<div id="crawl">${crawl}</div>`;
  if (/id="crawl"/.test(out)) {
    out = out.replace(/<div id="crawl">[\s\S]*?<\/div>/, crawlTag);
  } else if (out.includes('<div id="root"></div>')) {
    out = out.replace(
      '<div id="root"></div>',
      `<div id="root"></div>\n    ${crawlTag}\n    <script>document.getElementById("crawl")?.remove()</script>`,
    );
  } else if (out.includes("</body>")) {
    out = out.replace(
      "</body>",
      `${crawlTag}<script>document.getElementById("crawl")?.remove()</script>\n</body>`,
    );
  }
  if (head.noindex && !/name="robots"/.test(out) && out.includes("</head>")) {
    out = out.replace(
      "</head>",
      `<meta name="robots" content="noindex" />\n  </head>`,
    );
  }
  return out;
}
