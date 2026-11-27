/**
 * `Sell your gear — wingfoil.ie Market`: the page, then the site and section.
 * The marketplace and the community keep this shape.
 *
 * The forecast pages (the map, the spot index, a riding place, the stars and
 * the AI page) lead with the words a search is made of and end with the site,
 * `Wing foil forecast Ireland: 149 spots rated hourly | wingfoil.ie`. The
 * Pages worker writes that same string into the HTML it sends
 * (mcp/pages/head.ts), and the page sets it again once it runs, so the two
 * never disagree.
 */
export const pageTitle = (title: string, section: string) =>
  `${title} — wingfoil.ie ${section}`;

/** A forecast page's title: the subject, then the site. */
export const forecastTitle = (lead: string) => `${lead} | wingfoil.ie`;

export const homeTitle = (count: number) =>
  forecastTitle(
    count > 0
      ? `Wing foil forecast Ireland: ${count} spots rated hourly`
      : "Wing foil forecast Ireland: spots rated hourly",
  );

export const spotIndexTitle = (count: number) =>
  forecastTitle(
    count > 0
      ? `Wing foil spots in Ireland: ${count} places by county`
      : "Wing foil spots in Ireland by county",
  );

/** A riding place: "Dollymount wing foil forecast, Co. Dublin: wind, tide & stars". */
export const spotForecastTitle = (name: string, county?: string | null) =>
  forecastTitle(
    `${name} wing foil forecast${county ? `, Co. ${county}` : ""}: wind, tide & stars`,
  );

/** A point on the water, which is kept out of search. */
export const pointForecastTitle = (name: string) =>
  forecastTitle(`${name} wing foil forecast: wind and waves`);

export const STARS_TITLE = forecastTitle(
  "How the stars work: wing foil ratings for Ireland",
);

export const AI_TITLE = forecastTitle(
  "Ireland wing foil forecast for an AI assistant",
);

export const MISSING_SPOT_TITLE = forecastTitle("Spot not found");

export const MISSING_PAGE_TITLE = forecastTitle("Page not found");
