import {
  allSpotRows,
  barName,
  expect,
  openFromMenu,
  saveSettings,
  scrubBar,
  test,
  timeSlider,
  type Page,
} from "./fixtures";
import { SAMPLE_CLOCK, sampleStrip } from "./columns";
import { withWaves } from "./waveFixtures";

/**
 * A riding place's own page, /spot/<id>, against the synthetic sample site:
 * the spot report the approved mock-up drew.
 *
 * Every spec stands at SAMPLE_CLOCK (e2e/fixtures.ts): 21:00 UTC on 13 Sept
 * 2026, so the page opens on a night — today's rows are all dark — and the
 * daylight days follow. Tides are a fixture routed in: `public/marine` is
 * git-ignored ingest output and never part of the e2e site.
 */

const HOUR = 3600000;
const clock = SAMPLE_CLOCK.getTime();
/** Semi-diurnal turns either side of the clock, for five days. */
const events = Array.from({ length: 20 }, (_, i) => ({
  time: new Date(clock - 14 * HOUR + i * 6.21 * HOUR).toISOString(),
  kind: i % 2 ? "low" : "high",
  height: i % 2 ? 0.8 : 4.1,
}));
const tideManifest = {
  schemaVersion: 1,
  kind: "tide",
  stations: {
    Fenit: {
      name: "Fenit",
      lat: 52.27,
      lon: -9.87,
      url: "marine/tides-Fenit-spot.json",
    },
  },
  spots: { brandon: { station: "Fenit", distanceKm: 10.9 } },
  attribution: "Tidal predictions © Marine Institute, CC BY 4.0",
};
const tideCurve = {
  stepMinutes: 30,
  from: events[0].time,
  to: events.at(-1)!.time,
  datum: "LAT",
  curve: [2.2, 2.3],
  events,
};

async function withTides(page: Page) {
  await page.route("**/marine/tides.json", (route) =>
    route.fulfill({ json: tideManifest }),
  );
  await page.route("**/marine/tides-Fenit-spot.json", (route) =>
    route.fulfill({ json: tideCurve }),
  );
}

/** Every rated cell's solid stars, in order: the page's rating, as a string. */
const ratings = (page: Page) =>
  page
    .locator("[data-hour-table] [data-stars]")
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute("data-stars")).join(","),
    );

const heading = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "Brandon Bay", exact: true });

test("a spot page is a spot report: the name, now, the week, one graph, and the spot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await withTides(page);
  await page.goto("/spot/brandon");

  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveTitle(/Brandon Bay/);
  await expect(
    page.locator(`[data-top-bar] [data-view-switch="chart"]`),
  ).toHaveAttribute("href", "/?spot=brandon");
  // The hour, in small cards under the days: the next good window, then the
  // wind, the waves, the tide and the weather.
  const hero = page.locator("[data-hero]");
  await expect(hero.locator("[data-next-window]")).toContainText(
    "Next good window",
  );
  for (const card of ["wind", "waves", "tide", "weather"])
    await expect(hero.locator(`[data-card-${card}]`)).toBeVisible();
  await expect(hero).not.toContainText("Water at the launch");
  // The nearby spots come after the name, and before the days.
  const order = await page.evaluate(() => {
    const top = (sel: string) =>
      document.querySelector(sel)!.getBoundingClientRect().top;
    return {
      name: top("h1"),
      near: top("[data-nearby-strip]"),
      days: top("[data-day-card]"),
    };
  });
  expect(order.near).toBeGreaterThan(order.name);
  expect(order.days).toBeGreaterThan(order.near);
  // The week, a card a day, and the graph on one clock.
  const days = page.locator("[data-day-card]");
  await expect.poll(() => days.count()).toBeGreaterThan(2);
  // As many days as the forecast reaches, up to ECMWF's fifteen.
  expect(await days.count()).toBeLessThanOrEqual(15);
  await expect(page.locator("[data-graph-svg]")).toBeVisible();
  // No bar of readings over the graph on a desktop: the label says the hour.
  await expect(page.locator("[data-readout]")).toHaveCount(0);
  // The spot's own notes, and the small print.
  await expect(page.getByRole("heading", { name: "The spot" })).toBeVisible();
  await expect(page.getByText(/not a safety statement/)).toBeVisible();
  // Two faces: Fraunces for the name, Inter for the rest.
  const faces = await page.evaluate(() => ({
    name: getComputedStyle(document.querySelector("h1")!).fontFamily,
    body: getComputedStyle(document.querySelector("[data-hero]")!).fontFamily,
  }));
  expect(faces.name).toMatch(/Fraunces/);
  expect(faces.body).toMatch(/Inter/);
  expect(errors).toEqual([]);
});

test("hovering the graph puts the hour on the cursor; a day card moves to its day", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-graph-svg]")).toBeVisible();
  // The graph's window, not its whole width: it scrolls along the week.
  await page.locator("[data-spot-graph]").scrollIntoViewIfNeeded();
  const box = (await page.locator("[data-spot-graph]").boundingBox())!;
  const tag = page.locator("[data-cursor-tag]");
  await page.mouse.move(box.x + box.width * 0.6, box.y + 80);
  await expect(tag).toHaveText(/^\w{3} \d{2}:\d{2}$/);
  await page.mouse.move(box.x + box.width + 50, box.y - 50);
  await expect(tag).toHaveCount(0);
  const second = page.locator("[data-day-card]").nth(1);
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
});

test("the label beside the pointer names the row under it, the hour first", async ({
  page,
}) => {
  await allSpotRows(page);
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const graph = page.locator("[data-spot-graph]");
  await graph.scrollIntoViewIfNeeded();
  const box = (await graph.boundingBox())!;
  const svg = (await page.locator("[data-graph-svg]").boundingBox())!;
  const card = page.locator('[data-card="wind"]');
  const x = box.x + box.width * 0.6;
  // The bands of WIND_BANDS: the wind's figures, the models, the tide.
  await page.mouse.move(x, svg.y + 163);
  await expect(card).toHaveAttribute("data-card-band", "dir");
  await expect(card.locator("[data-card-hour]")).toHaveText(/\d{2}:\d{2}/);
  await expect(card).toContainText("Gust factor");
  await expect(card).not.toContainText("Wind blend");
  await page.mouse.move(x, svg.y + 213);
  await expect(card).toHaveAttribute("data-card-band", "blend");
  await expect(card.locator("[data-card-model]").first()).toBeVisible();
  await page.mouse.move(x, svg.y + 353);
  await expect(card).toHaveAttribute("data-card-band", "tide");
  await expect(card).toContainText(/\d\.\d m/);
});

test("a click holds the hour until it is let go, and the strip follows the hour", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const graph = page.locator("[data-spot-graph]");
  await graph.scrollIntoViewIfNeeded();
  const box = (await graph.boundingBox())!;
  const tag = page.locator("[data-cursor-tag]");
  const y = box.y + 80;
  await page.mouse.click(box.x + box.width * 0.5, y);
  await expect(page.locator("[data-held-hour]").first()).toBeAttached();
  const held = await tag.textContent();
  // The tag and the Now tag have a lane of their own, under the day names.
  const names = (await page.locator('[data-day-heads="wind"]').boundingBox())!;
  for (const mark of [tag, page.locator('[data-now-tag="wind"]')])
    if (await mark.count())
      expect((await mark.boundingBox())!.y).toBeGreaterThanOrEqual(
        names.y + names.height - 1,
      );
  // Moving over the graph leaves the hour held, and off it too.
  await page.mouse.move(box.x + box.width * 0.8, y);
  await expect(tag).toHaveText(held!);
  await page.mouse.move(box.x + box.width + 40, box.y - 40);
  await expect(tag).toHaveText(held!);
  // Esc lets go; so does the cross.
  await graph.focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-held-hour]")).toHaveCount(0);
  await page.mouse.click(box.x + box.width * 0.5, y);
  await page.locator("[data-let-go]").click();
  await expect(page.locator("[data-held-hour]")).toHaveCount(0);
  // The strip marks the day under the pointer and outlines the days in view.
  await page.mouse.move(box.x + box.width * 0.9, y);
  const date = await page
    .locator('[data-day-card][aria-pressed="true"]')
    .getAttribute("data-day-card");
  const dayName = await tag.textContent();
  expect(dayName).toContain(
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IE", {
      weekday: "short",
    }),
  );
  const frame = await page.locator("[data-day-window]").boundingBox();
  expect(frame!.width).toBeGreaterThan(100);
  // Whole cards: the outline starts where a day's card starts.
  const lefts = await page
    .locator("[data-day-card]")
    .evaluateAll((cards) => cards.map((c) => c.getBoundingClientRect().left));
  expect(lefts.some((left) => Math.abs(left - frame!.x) < 1)).toBe(true);
});

test("the days stay pinned under the site's bar as the page scrolls, with no time slider", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-graph-svg]")).toBeVisible();
  const bar = page.locator("[data-when-bar]");
  const top = page.locator("[data-top-bar]");
  await expect(bar.locator("[data-day-card]").first()).toBeVisible();
  // The ruler of hours that once sat under the days is gone (2026-11-16).
  await expect(page.locator("[data-time-slider]")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: /^Hour/ })).toHaveCount(0);
  // Down to the Waves: the site's bar at the top, the days under it.
  await page.locator('[data-week-section="waves"]').evaluate((el) =>
    // Just under the days pinned at the top.
    scrollTo(
      0,
      scrollY +
        el.getBoundingClientRect().top -
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
    ),
  );
  const head = (await top.boundingBox())!;
  const pinned = (await bar.boundingBox())!;
  expect(head.y).toBe(0);
  expect(Math.abs(pinned.y - (head.y + head.height))).toBeLessThan(1);
  // The Waves graph's day names hold under the pinned bar, not behind it.
  const names = (await page.locator('[data-day-heads="waves"]').boundingBox())!;
  expect(names.y).toBeGreaterThanOrEqual(pinned.y + pinned.height - 1);
});

test("a day card or the pointer on the graph moves the page's hour, the days and the cards with it", async ({
  page,
}) => {
  await withPictures(page);
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-graph-svg]")).toBeVisible();
  const cursor = page.locator('[data-cursor-tag="wind"] [data-cursor-hour]');
  const tide = await page.locator("[data-card-tide]").textContent();
  // A day card chosen: the graph goes to its midday, and the card is on.
  await page.locator('[data-day-card="2026-09-15"]').click();
  await expect(cursor).toHaveText(/^Tue \d{2}:00$/);
  await expect(page.locator('[data-day-card="2026-09-15"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-card-tide]")).not.toHaveText(tide!);
  const graph = (await page.locator("[data-spot-graph]").boundingBox())!;
  const tag = (await page.locator('[data-cursor-tag="wind"]').boundingBox())!;
  expect(tag.x).toBeGreaterThan(graph.x);
  expect(tag.x + tag.width).toBeLessThan(graph.x + graph.width);
  // The pointer over the graph: the hour under it, and its day's card.
  await page.locator("[data-spot-graph]").scrollIntoViewIfNeeded();
  const over = (await page.locator("[data-spot-graph]").boundingBox())!;
  await page.mouse.move(over.x + over.width * 0.7, over.y + over.height * 0.6);
  await expect(cursor).toHaveText(/\d{2}:\d{2}/);
  // Today's card: back to now, the cards with it.
  await page.mouse.move(0, 0);
  await page.locator('[data-day-card="2026-09-13"]').click();
  await expect(page.locator('[data-day-card="2026-09-13"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-card-tide]")).toHaveText(tide!);
});

test("the graphs start where the wind does, with no empty hours before it", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const first = await page
    .locator("[data-graph-svg] rect[data-wind-bar]")
    .first()
    .evaluate((bar: SVGGraphicsElement) => bar.getBBox().x);
  expect(first).toBeLessThan(40);
});

test("a pressed day shows no focus ring when a key goes down after it, and the graph has no frame", async ({
  page,
}) => {
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-graph-svg]")).toBeVisible();
  const day = page.locator("[data-day-card]").nth(2);
  await day.click();
  await page.keyboard.press("Shift");
  expect(await day.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
  const graph = page.locator("[data-spot-graph]");
  await graph.focus();
  await page.keyboard.press("ArrowRight");
  expect(await graph.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "none",
  );
});

test("a day card takes the week to that day, and today back to now", async ({
  page,
}) => {
  await withPictures(page);
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-graph-svg]")).toBeVisible();
  const tag = page.locator("[data-cursor-tag]");
  const stars = page.locator("[data-card-wind] [data-your-stars]");
  // Now is a night: the Wind card says so.
  await expect(stars).toHaveText("Dark");
  await page.locator("[data-day-card]").nth(2).click();
  // Midday on that day: the cursor reads it, and the cards with it, in the
  // day's light.
  await expect(tag).toContainText("12:00");
  await expect(stars.locator("[data-stars]")).toBeAttached();
  await page.locator("[data-day-card]").nth(0).click();
  await expect(tag).toHaveCount(0);
  await expect(stars).toHaveText("Dark");
});

test("a wheel or a trackpad over the graph reads out the hour that comes under the pointer", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const graph = page.locator("[data-spot-graph]");
  await graph.scrollIntoViewIfNeeded();
  const box = (await graph.boundingBox())!;
  const chip = page.locator("[data-cursor-tag]");
  const x = box.x + box.width * 0.5;
  const y = box.y + 80;
  await page.mouse.move(x, y);
  await expect(chip).toBeVisible();
  const pointed = await chip.textContent();
  // The hours scroll along under a pointer that stays put.
  const left = await graph.evaluate((el) => el.scrollLeft);
  await page.mouse.wheel(box.width / 3, 0);
  await expect
    .poll(() => graph.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(left + 50);
  await expect(chip).not.toHaveText(pointed ?? "");
  // The hour read out is the one now under the pointer, as a move there says.
  await expect
    .poll(async () => {
      const scrolled = await graph.evaluate((el) => el.scrollLeft);
      await page.waitForTimeout(100);
      return scrolled === (await graph.evaluate((el) => el.scrollLeft));
    })
    .toBe(true);
  const scrolled = await chip.textContent();
  await page.mouse.move(x + 1, y);
  await page.mouse.move(x, y);
  await expect(chip).toHaveText(scrolled ?? "");
});

for (const width of [1440, 390])
  test(`the hours after dark can be left out of the week, the days side by side, at ${width}px`, async ({
    page,
  }) => {
    await withTides(page);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.goto("/spot/brandon");
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    const svg = page.locator("[data-graph-svg]");
    const graph = page.locator("[data-spot-graph]");
    const phone = width < 600;
    const playhead = page.locator('[data-cursor-tag="wind"]');
    const legend = page.locator("[data-legend]");
    const openKey = () =>
      page.locator('[data-disclosure="key"] summary').click();
    /** The hour under the cursor on a desktop, the playhead's on a phone. */
    const hourText = async () =>
      (await page.locator("[data-cursor-hour]").first().textContent()) ?? "";
    /** Moves along the hours by a fraction of the graph, as a rider would. */
    const along = async (f: number) => {
      if (phone) {
        await graph.evaluate(
          (el, part) =>
            (el.scrollLeft = (el.scrollWidth - el.clientWidth) * part),
          f,
        );
      } else {
        const box = (await graph.boundingBox())!;
        await page.mouse.move(box.x + box.width * f, box.y + 60);
      }
      await page.waitForTimeout(40);
    };
    await expect(svg).toBeVisible({ timeout: 30000 });
    await openKey();
    // Round the clock by default: the night shaded and dimmed, and said in
    // the key.
    await expect(svg.locator("[data-night]").first()).toBeAttached();
    await expect(legend).toContainText("Dark");
    if (phone) await expect(playhead).toContainText("Now");

    await openFromMenu(page, "Settings");
    const hours = page.getByRole("group", { name: "Hours", exact: true });
    await expect(
      hours.getByRole("button", { name: "Day and night" }),
    ).toHaveAttribute("aria-pressed", "true");
    await hours.getByRole("button", { name: "Daylight only" }).click();
    await saveSettings(page);

    await page.goto("/spot/brandon");
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    await expect(svg).toBeVisible();
    await openKey();
    // No night: nothing shaded, no key for it, and the days joined by their
    // lines alone.
    await expect(svg.locator("[data-night]")).toHaveCount(0);
    await expect(legend).toContainText("Wind");
    await expect(legend).not.toContainText("Dark");
    await expect(svg.locator("[data-day-line]").first()).toBeAttached();
    // None of the small hours along the foot.
    const ticks = await svg
      .locator("text")
      .evaluateAll((texts) => texts.map((t) => t.textContent ?? ""));
    for (const small of ["00", "03", "21"]) expect(ticks).not.toContain(small);
    // Now is after dark, so a phone reads Monday's first light instead.
    if (phone) {
      await expect(playhead).not.toContainText("Now");
      await expect(playhead).toContainText(/Mon \d{2}:\d{2}/);
    }
    await graph.scrollIntoViewIfNeeded();
    // And the hour never lands in the night, however far the hours go.
    for (let i = 1; i < 16; i++) {
      await along(i / 16);
      const hour = Number(
        (await hourText()).match(/ (\d{2}):\d{2}/)?.[1] ?? 12,
      );
      expect(hour).toBeGreaterThanOrEqual(5);
      expect(hour).toBeLessThanOrEqual(21);
    }
  });

test("Table shows the day's hours with their stars, wind, sea and launch", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await page.locator("[data-day-card]").nth(1).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.locator("[data-hour-table]");
  await expect(table).toBeVisible();
  await expect.poll(() => table.locator("tbody tr").count()).toBeGreaterThan(3);
  await expect(table.locator("thead")).toContainText("Wind kn");
  await expect(table.locator("[data-stars]").first()).toBeAttached();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page.locator("[data-graph-svg]")).toBeVisible();
});

test("the rider's own stars, from Settings, re-rate every hour", async ({
  page,
}) => {
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await page.locator("[data-day-card]").nth(1).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(
    page.locator("[data-hour-table] [data-stars]").first(),
  ).toBeAttached();
  const ours = await ratings(page);
  // As Settings stores them: a rider who wants more wind, and never rides
  // cross-offshore.
  await page.evaluate(() =>
    localStorage.setItem(
      "force5.prefs.v1",
      JSON.stringify({
        version: 3,
        rider: {
          weightKg: null,
          wings: [],
          custom: {
            version: 3,
            wind: { min: 16, sweetLow: 20, sweetHigh: 28, max: 38 },
            direction: {
              onshore: 0,
              crossOn: 0,
              cross: 0,
              crossOff: 5,
              offshore: 5,
            },
          },
        },
      }),
    ),
  );
  await page.reload();
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await page.locator("[data-day-card]").nth(1).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(
    page.locator("[data-hour-table] [data-stars]").first(),
  ).toBeAttached();
  await expect.poll(() => ratings(page)).not.toBe(ours);
});

test("the place from above carries the chart's loupe, at high or low tide, credited", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await withPictures(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const loupe = page.locator("[data-photo-loupe]");
  await expect(loupe).toBeVisible();
  const shown = loupe.locator("img.opacity-100");
  await expect(shown).toHaveAttribute("src", /brandon-(high|low)\.webp$/);
  await expect(loupe.locator("[data-loupe-foot]")).toBeVisible();
  await loupe.getByRole("button", { name: "Low tide" }).click();
  await expect(loupe).toHaveAttribute("data-tide", "low");
  await expect(shown).toHaveAttribute("src", /brandon-low\.webp$/);
  await loupe.getByRole("button", { name: "High tide" }).click();
  await expect(loupe).toHaveAttribute("data-tide", "high");
  await expect(page.getByText(/Copernicus Sentinel data/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("no picture leaves no gap: the cards take the room", async ({ page }) => {
  await page.route("**/satellite/spots.json", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-card-wind]")).toBeVisible();
  await expect(page.locator("[data-photo-loupe]")).toHaveCount(0);
});

test("on a phone the name, now and the picture come first, and the week scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withPictures(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-card-wind]")).toBeInViewport();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a star keeps the place where the map keeps it, and opening it counts", async ({
  page,
}) => {
  await page.goto("/spot/brandon");
  const star = page.locator("[data-keep-star]");
  await expect(star).toHaveAttribute("aria-pressed", "false", {
    timeout: 30000,
  });
  await expect(star).toHaveAccessibleName("Save Brandon Bay");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wingfoil.spots.v1") ?? "{}"),
  );
  expect(stored.starred).toEqual(["brandon"]);
  expect(stored.visits.brandon.count).toBe(1);
  await page.reload();
  await expect(page.locator("[data-keep-star]")).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 30000 },
  );
});

test("an unknown spot says so and offers what it may have meant", async ({
  page,
}) => {
  // Answered 404, as any address with nothing behind it is, so a crawler or
  // a link checker does not keep it; the page is the app all the same.
  const missing = await page.goto("/spot/brandon-bay");
  expect(missing?.status()).toBe(404);
  await expect(page.getByText("No riding place at this address")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("“brandon-bay”")).toBeVisible();
  await expect(page.locator('a[href="/spot/brandon"]')).toBeVisible();
  expect((await page.request.get("/spot/nonexistent-spot")).status()).toBe(404);
  expect((await page.request.get("/spot/brandon")).status()).toBe(200);
  const index = await page.goto("/spot");
  expect(index?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Spot forecasts" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator('a[href^="/spot/"]')).toHaveCount(149);
});

test("a map link to a spot that does not exist says so", async ({ page }) => {
  await page.goto("/?spot=does-not-exist");
  await expect(page.locator(".spot-marker")).toHaveCount(149, {
    timeout: 30000,
  });
  const status = page.locator(".frame-status");
  await expect(status).toContainText("Spot not found: “does-not-exist”.");
  await expect(barName(page)).toHaveCount(0);
  await status.getByRole("button", { name: "Dismiss" }).click();
  await expect(status).toHaveCount(0);
});

/** The hour the scrub bar is on, as the spot page's link opens it. */
async function atHour(page: Page) {
  const at = Number(await timeSlider(page).inputValue());
  return encodeURIComponent(sampleStrip[at].validTime);
}

test("the scrub bar opens the spot page at its hour, for the spot it opens on and one chosen", async ({
  page,
}) => {
  await page.goto("/?spot=brandon");
  await expect(page.locator(".spot-marker")).toHaveCount(149, {
    timeout: 30000,
  });
  // The scrub bar opens on Brandon Bay, from the link, and its Full forecast
  // (for the keys: on the screen, the spot's name on the map) is the spot's
  // page at the hour in hand.
  await expect(barName(page)).toHaveText("Brandon Bay");
  const link = scrubBar(page).locator("[data-spot-page-link]");
  await expect(link).toHaveAccessibleName("Full forecast");
  await expect(link).toHaveAttribute(
    "href",
    `/spot/brandon?at=${await atHour(page)}`,
  );
  // It follows the hour.
  await timeSlider(page).fill("20");
  await expect(link).toHaveAttribute(
    "href",
    `/spot/brandon?at=${encodeURIComponent(sampleStrip[20].validTime)}`,
  );

  // A spot chosen on the map is the scrub bar's, with no box over the chart.
  const opener = page.locator("[data-spot-search-open]");
  if (await opener.isVisible()) await opener.click();
  await page.getByRole("combobox", { name: "Search spots" }).fill("Dollymount");
  await page.locator("[data-spot-option]").first().click();
  await expect(barName(page)).toHaveText("Dollymount");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const full = scrubBar(page).getByRole("link", {
    name: "Full forecast",
    exact: true,
  });
  await expect(full).toHaveAttribute(
    "href",
    `/spot/dollymount?at=${await atHour(page)}`,
  );
  // Out of sight until the keys reach it.
  await full.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/spot\/dollymount\?at=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Dollymount", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  // And back to the map, on the same place.
  await page.locator(`[data-top-bar] [data-view-switch="chart"]`).click();
  await expect(page).toHaveURL(/\/\?spot=dollymount$/);
  await expect(barName(page)).toHaveText("Dollymount", {
    timeout: 30000,
  });
});

test("How the stars work draws the four numbers, the gusts, the shore sectors and a live hour worked through", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/stars?spot=brandon");
  await expect(
    page.getByRole("heading", { level: 1, name: "How the stars work" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveTitle(/How the stars work/);
  await expect(
    page.locator(`[data-top-bar] [data-view-switch="chart"]`),
  ).toHaveAttribute("href", "/?spot=brandon");
  // Ours, the only stars there are until the rider makes their own.
  const band = page.locator('[data-band-table] [data-band="ours"]');
  await expect(band).toContainText("11");
  await expect(band).toContainText("15–22");
  await expect(band).toContainText("35");
  await expect(band).toContainText("you");
  await expect(page.locator('[data-band="own"]')).toHaveCount(0);
  await expect(page.locator("[data-score-chart]")).toBeVisible();
  // The hours the stars were agreed on, worked out live: solid, and
  // outlined for what the gusts took.
  const agreed: [string, number, number][] = [
    ["15 kn gusting 25", 5, 5],
    ["20 kn gusting 25", 5, 5],
    ["20 kn gusting 30", 4, 5],
    ["25 kn gusting 30", 4, 4],
    ["30 kn, steady", 1, 1],
    ["22 kn gusting 35", 1, 5],
    ["32 kn or more, steady", 0, 0],
    ["10 kn, steady", 0, 0],
  ];
  const gusts = page.locator("[data-gust-table]");
  for (const [what, stars, potential] of agreed) {
    const cell = gusts
      .locator("tr", { hasText: what })
      .locator('[data-rated="ours"]');
    await expect(cell, what).toHaveAttribute(
      "data-example-stars",
      String(stars),
    );
    await expect(cell, what).toHaveAttribute(
      "data-example-potential",
      String(potential),
    );
  }
  await expect(page.locator("[data-sectors]")).toBeVisible();
  const shore = page.locator("[data-shore-table]");
  for (const range of ["0–30°", "30–70°", "70–110°", "110–150°", "150–180°"])
    await expect(shore).toContainText(range);
  // Cross-offshore costs a star; offshore is never.
  await expect(shore.locator("tr", { hasText: "110–150°" })).toContainText(
    "−1\u00a0star",
  );
  await expect(shore.locator("tr", { hasText: "150–180°" })).toContainText(
    "never",
  );
  await expect(shore.locator("tr", { hasText: "0–30°" })).toContainText("none");
  // No levels, no gusty-wind setting, no wing that costs a star.
  await expect(page.locator("main")).not.toContainText(
    /Learning|Advanced|very gusty|loses a star/,
  );
  await expect(page.locator("[data-other-table]")).toContainText(
    "Your weight, or your wings",
  );
  await expect(
    page.locator("main [data-settings-link]").first(),
  ).toHaveAttribute("href", "/?settings");
  const ledger = page.locator("[data-ledger]");
  await expect(ledger).toContainText("Steady wind");
  await expect(ledger).toContainText(/Rating(no stars|\d solid)/);
  expect(errors).toEqual([]);
});

/** A published set of spot pictures (scripts/satellite/spots.py), Brandon's only. */
const pictures = {
  schemaVersion: 1,
  kind: "satellite-spots",
  base: "satellite/v0123456789ab/",
  zoom: 14.5,
  width: 1200,
  height: 600,
  attribution:
    "Contains modified Copernicus Sentinel data 2017–2026, composited for wingfoil.ie; tide levels from the Marine Institute (CC BY 4.0)",
  spots: [
    {
      id: "brandon",
      lonLat: [-10.024, 52.276],
      high: "brandon-high.webp",
      low: "brandon-low.webp",
    },
  ],
};
/** A 12 by 6 lossless WebP: the sea, in one colour. */
const WEBP = Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvC0ABAAdQt6IUr/+BiOh/AAA=",
  "base64",
);

async function withPictures(page: Page, served = true) {
  await page.route("**/satellite/spots.json", (route) =>
    route.fulfill({ json: pictures }),
  );
  await page.route("**/satellite/v0123456789ab/*.webp", (route) =>
    served
      ? route.fulfill({ body: WEBP, contentType: "image/webp" })
      : route.fulfill({ status: 404 }),
  );
}

const picture = (page: Page) => page.locator("[data-spot-satellite]");

/*
 * Under the week graph, the rows the chart's dock used to draw: every model's
 * own wind, the gust factor, the waves' period and direction, the current
 * and the rain, on the graph's hours. The sample's wind runs (harmonie,
 * ecmwf and the rest), its hourly ICON-EU rain, its 72 hours of currents and
 * its short GFS-Wave run on 16 September all reach Brandon.
 */
test("under the week graph: the wind blend, the gusts, the waves, the current and the rain", async ({
  page,
}) => {
  await allSpotRows(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const graph = page.locator("[data-graph-svg]");
  await expect(graph).toBeVisible();

  // Wind blend: a line of its own for each model the rider blends, named
  // below, and their blend in ink.
  const lines = graph.locator('[data-band="wind-blend"] path[data-model]');
  await expect.poll(() => lines.count()).toBeGreaterThanOrEqual(2);
  for (const d of await lines.evaluateAll((paths) =>
    paths.map((path) => path.getAttribute("d") ?? ""),
  ))
    expect(d).toMatch(/^M[\d.]+,[\d.]+C/);
  // On the tens either side of the models' winds, so the lines fill the
  // band between its first dotted line and its last.
  await expect(
    graph.locator('[data-band="wind-blend"] path[data-blend]'),
  ).toHaveCount(1);
  const fill = await graph
    .locator('[data-band="wind-blend"]')
    .evaluate((band) => {
      const ys = [...band.querySelectorAll("line")].map((line) =>
        Number(line.getAttribute("y1")),
      );
      const boxes = [...band.querySelectorAll("path[data-model]")].map((path) =>
        (path as SVGGraphicsElement).getBBox(),
      );
      return {
        top: Math.min(...ys),
        bottom: Math.max(...ys),
        high: Math.min(...boxes.map((box) => box.y)),
        low: Math.max(...boxes.map((box) => box.y + box.height)),
      };
    });
  expect(fill.high).toBeGreaterThanOrEqual(fill.top - 2);
  expect(fill.low).toBeLessThanOrEqual(fill.bottom + 2);
  expect(fill.low - fill.high).toBeGreaterThan((fill.bottom - fill.top) / 3);
  await page.locator('[data-disclosure="key"] summary').click();
  const legend = page.locator("[data-models-legend]");
  await expect(legend).toContainText("HARMONIE");
  await expect(legend).toContainText("ECMWF");

  // Gusts: the gust's own figure, raised beside the wind's.
  const gusts = await graph
    .locator("[data-gust]")
    .evaluateAll((cells) =>
      cells.map((cell) => Number(cell.getAttribute("data-gust"))),
    );
  expect(gusts.length).toBeGreaterThan(5);
  for (const gust of gusts) expect(gust).toBeGreaterThan(0);
  // The gust factor's row is gone.
  await expect(graph.locator("[data-gust-factor]")).toHaveCount(0);

  // Waves, in a section of their own: a period in seconds.
  const periods = await page
    .locator("[data-wave-svg] [data-wave-period]")
    .evaluateAll((cells) =>
      cells.map((cell) => Number(cell.getAttribute("data-wave-period"))),
    );
  expect(periods.length).toBeGreaterThan(0);
  for (const period of periods) {
    expect(period).toBeGreaterThan(2);
    expect(period).toBeLessThan(25);
  }

  // Current: a speed in knots every third hour for the run's 72 hours.
  const currents = await graph
    .locator("[data-current]")
    .evaluateAll((cells) =>
      cells.map((cell) => Number(cell.getAttribute("data-current"))),
    );
  expect(currents.length).toBeGreaterThan(5);
  for (const knots of currents) expect(knots).toBeLessThan(6);

  // Rain: bars as tall as the rain, mm/h.
  const rain = await graph
    .locator('[data-band="rain"] rect[data-rain]')
    .evaluateAll((bars) =>
      bars.map((bar) => ({
        mm: Number(bar.getAttribute("data-rain")),
        tall: Number(bar.getAttribute("height")),
      })),
    );
  expect(rain.length).toBeGreaterThan(10);
  for (const bar of rain) {
    expect(bar.mm).toBeGreaterThan(0);
    expect(bar.tall).toBeGreaterThan(0);
  }
  const wettest = rain.reduce((a, b) => (b.mm > a.mm ? b : a));
  const driest = rain.reduce((a, b) => (b.mm < a.mm ? b : a));
  expect(wettest.tall).toBeGreaterThan(driest.tall);

  // The label says them for the row under the pointer, the factor with the
  // wind's own figures.
  await page.locator("[data-spot-graph]").scrollIntoViewIfNeeded();
  const box = (await page.locator("[data-spot-graph]").boundingBox())!;
  const svgBox = (await page.locator("[data-graph-svg]").boundingBox())!;
  const x = box.x + box.width * 0.6;
  const label = page.locator('[data-card="wind"]');
  await page.mouse.move(x, svgBox.y + 150);
  await expect(label.locator("[data-card-gust-factor]")).toContainText(
    /Gust factor \d\.\d×/,
  );
  await page.mouse.move(x, svgBox.y + 410);
  await expect(label).toHaveAttribute("data-card-band", "current");
  expect(errors).toEqual([]);
});

test("with no current published, the current's band says so", async ({
  page,
}) => {
  await allSpotRows(page);
  await page.route("**/weather/currents.json", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-current-note]")).toHaveText(
    "No current forecast is published just now",
  );
  await expect(page.locator('[data-band="current"]')).toHaveCount(0);
});

test("Table adds the gust factor, the wave period and the rain, and the tide with the launch", async ({
  page,
}) => {
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await page.locator("[data-day-card]").nth(1).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = page.locator("[data-hour-table]");
  await expect(table.locator("thead")).toContainText("Gust factor");
  await expect(table.locator("thead")).toContainText("Period");
  await expect(table.locator("thead")).toContainText("Waves ft");
  await expect(table.locator("thead")).toContainText("Rain mm/h");
  await expect(table.locator("[data-gust-cell]").first()).toHaveText(
    /^\d\.\d×$/,
  );
  await expect(table.locator("[data-rain-cell]").first()).toHaveText(
    /^(\d+\.\d|0|<0\.1|–)$/,
  );
});

test("?at= opens the week at that hour, as the pointer would", async ({
  page,
}) => {
  await withPictures(page);
  // 13:00 UTC on Tuesday 15 September: 14:00 in Ireland.
  await page.goto("/spot/brandon?at=2026-09-15T13:00:00Z");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const tag = page.locator("[data-cursor-tag]");
  await expect(tag).toHaveText("Tue 14:00");
  await expect(page.locator('[data-day-card="2026-09-15"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The cards read the same hour as the cursor: in the day's light.
  await expect(
    page.locator("[data-card-wind] [data-your-stars] [data-stars]"),
  ).toBeAttached();
  // The graph is scrolled along to it, past the hours before.
  const graph = page.locator("[data-spot-graph]");
  await expect
    .poll(() => graph.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(400);
  // The pointer moving off it lets the week go back to now.
  await graph.scrollIntoViewIfNeeded();
  const box = (await graph.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + 80);
  await page.mouse.move(box.x + box.width + 50, box.y - 50);
  await expect(tag).toHaveCount(0);
});

test("?at= that is no time, or not in the week, opens on now", async ({
  page,
}) => {
  for (const at of [
    "tomorrow",
    "2027-01-01T12:00:00Z",
    "2026-09-01T12:00:00Z",
  ]) {
    await page.goto(`/spot/brandon?at=${at}`);
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.locator("[data-graph-svg]")).toBeVisible();
    await expect(page.locator("[data-cursor-tag]")).toHaveCount(0);
  }
});

test("a point on the open water has a page: its wind, no stars, and the nearest spot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Off Brandon Bay, between it and the Maharees.
  const response = await page.goto("/spot/@52.3000,-10.1000");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "52.30° N, 10.10° W" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveTitle(/52\.30° N, 10\.10° W/);
  // The forecast: the point's own wind, now and across the week.
  const now = page.locator("[data-card-wind]");
  await expect(now).toContainText("Wind");
  await expect(now.locator('[data-card-figure="wind"]')).toHaveText(/^\d+/);
  await expect(page.locator("[data-graph-svg] path").first()).toBeAttached();
  // No stars anywhere: not now, not in the week, not in an hour.
  await expect(page.locator("[data-your-stars]")).toHaveCount(0);
  await expect(page.locator("[data-point-no-stars]")).toBeVisible();
  await expect(page.locator("[data-next-window]")).toHaveCount(0);
  for (const where of ["[data-hero]", "[data-day-card]"])
    await expect(page.locator(`${where} [data-stars]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(page.locator("[data-hour-table] thead")).not.toContainText(
    "Stars",
  );
  // The nearest riding place, named and linked, and no star to keep a point by.
  const nearest = page.locator("[data-point-line] a[data-nearest-spot]");
  await expect(nearest).toHaveText("Garrywilliam Point");
  await expect(nearest).toHaveAttribute("href", "/spot/garrywilliam-point");
  await expect(page.locator("[data-point-line]")).toContainText(/\d\.\d km/);
  await expect(page.locator("[data-keep-star]")).toHaveCount(0);
  // Back goes to the chart: the map has no light for a point.
  await expect(
    page.locator(`[data-top-bar] [data-view-switch="chart"]`),
  ).toHaveAttribute("href", "/?map");
  expect(errors).toEqual([]);
});

test("below the spot: the wind and the waves through the year, with their figures on hover", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await withTides(page);
  await page.goto("/spot/brandon");
  // Kept for whoever asks: nothing of it is read until it is opened.
  await expect(page.locator("[data-climate]")).toHaveCount(0);
  await page.locator('[data-disclosure="year"] summary').click();
  const year = page.locator("[data-climate]");
  await expect(year).toBeAttached({ timeout: 30000 });
  await year.scrollIntoViewIfNeeded();
  // After everything the page had: the spot's notes come first, the small print last.
  const order = await page.evaluate(() => {
    const at = (sel: string) => {
      const el = document.querySelector(sel);
      return el
        ? Array.from(document.querySelectorAll("main *")).indexOf(el)
        : -1;
    };
    return {
      spot: at("#the-spot"),
      year: at("[data-climate]"),
      print: at("[data-warnings-source]"),
    };
  });
  expect(order.spot).toBeGreaterThan(-1);
  expect(order.year).toBeGreaterThan(order.spot);
  expect(order.print).toBeGreaterThan(order.year);
  await expect(
    page.getByRole("heading", { name: "The wind through the year" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The waves through the year" }),
  ).toBeVisible();
  await expect(year).toContainText("How often it blows 12 kn or more");
  await expect(year).toContainText(
    "Generated using E.U. Copernicus Marine Service Information",
  );
  // Every figure says what it is: the whole sea's height, the swell alone, and where it was read.
  await expect(year).toContainText(
    "The whole sea, wind waves and swell together",
  );
  await expect(page.locator("[data-climate-candles]")).toContainText(
    "Bar: from 1 in 10 to 9 in 10 of those days",
  );
  await expect(year).toContainText(
    /Waves at the wave model’s point \d+\.\d km from the spot/,
  );
  // A month's column answers a hover with its figures.
  await page
    .locator("[data-climate-wind] rect[data-tip-target]")
    .first()
    .hover();
  const tip = page.locator("[data-climate-tip]");
  await expect(tip).toContainText("January");
  await expect(tip).toContainText("12 kn or more");
  // The swell's sizes: another size, another chart.
  const swell = page.locator("[data-climate-swell]");
  const before = await swell.locator("polyline").first().getAttribute("points");
  await swell.getByRole("button", { name: "1.2 to 1.8 m" }).click();
  await expect(
    swell.getByRole("button", { name: "1.2 to 1.8 m" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await swell.locator("polyline").first().getAttribute("points"),
  ).not.toBe(before);
  await page
    .locator("[data-climate-candles] rect[data-tip-target]")
    .first()
    .hover();
  await expect(tip).toContainText("Days a month");
  expect(errors).toEqual([]);
});

test("sheltered water says the open sea's waves do not reach it, rather than showing them", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/malahide-estuary");
  await page.locator('[data-disclosure="year"] summary').click();
  const year = page.locator("[data-climate]");
  await expect(year).toBeAttached({ timeout: 30000 });
  await expect(
    page.getByRole("heading", { name: "The wind through the year" }),
  ).toBeVisible();
  const sheltered = page.locator("[data-climate-sheltered]");
  await expect(sheltered).toContainText("Sheltered water");
  await expect(sheltered).toContainText(
    "The open sea’s waves don’t reach here",
  );
  await expect(page.locator("[data-climate-waves]")).toHaveCount(0);
});

test("a point on the open water has no year of its own", async ({ page }) => {
  await page.goto("/spot/@52.3000,-10.1000");
  await expect(
    page.getByRole("heading", { level: 1, name: "52.30° N, 10.10° W" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator("[data-climate]")).toHaveCount(0);
  await expect(page.locator('[data-disclosure="year"]')).toHaveCount(0);
});

/** The figures in a wind, in order: "3 g5 kn W" is ["3", "5"]. */
const figures = (text: string | null) => (text ?? "").match(/\d+/g) ?? [];
/** The compass point a wind is from, the first one in its text. */
const point = (text: string | null) =>
  (text ?? "").match(/\b[NESW]{1,3}\b/)?.[0] ?? null;

for (const [id, station] of [
  ["belmullet", "ME_03976"],
  ["brandon", null],
] as const) {
  test(`the Wind card, the phone's tag and the picture's rose say the same wind, ${station ? "as measured" : "the forecast's"} at Now, at ${id}`, async ({
    page,
  }) => {
    // A phone: its tag is the one that says the wind at the hour.
    await page.setViewportSize({ width: 390, height: 844 });
    // A picture of each place, so its rose and its foot are drawn.
    await withPictures(page);
    await page.route("**/satellite/spots.json", (route) =>
      route.fulfill({
        json: {
          ...pictures,
          spots: [
            ...pictures.spots,
            {
              id: "belmullet",
              lonLat: [-9.9919, 54.2234],
              high: "belmullet-high.webp",
              low: "belmullet-low.webp",
            },
          ],
        },
      }),
    );
    await page.goto(`/spot/${id}`);
    const readWind = page.locator('[data-cursor-tag="wind"]');
    await expect(readWind).toContainText("Now", { timeout: 30000 });
    const card = page.locator("[data-card-wind]");
    const cardWind = card.locator('[data-card-figure="wind"]');
    const picture = page.locator("[data-photo-loupe]");
    const foot = picture.locator("[data-loupe-foot]");
    await expect(cardWind).toBeVisible();
    await expect(foot).toBeVisible();
    if (station) {
      // All the station's last reading; the card says where and when.
      await expect(cardWind).toHaveAttribute("data-measured", station);
      await expect(readWind).toHaveAttribute("data-measured", station);
      await expect(picture).toHaveAttribute("data-measured", station);
      await expect(card.locator("[data-wind-source]")).toHaveText(
        "· Belmullet 1 km, 22:00",
      );
    } else {
      // No station within reach: both the forecast, from nowhere else.
      await expect(cardWind).not.toHaveAttribute("data-measured", /.*/);
      await expect(readWind).not.toHaveAttribute("data-measured", /.*/);
      await expect(picture).not.toHaveAttribute("data-measured", /.*/);
      await expect(card.locator("[data-wind-source]")).toHaveCount(0);
    }
    await expectSameWind(page);
  });
}

/**
 * The Wind card, a phone's tag at the hour and the foot of the picture's
 * loupe say one wind: its figures, the way it blows from, and the shore.
 */
async function expectSameWind(page: Page) {
  const card = page.locator("[data-card-wind]");
  const cardText = await card
    .locator('[data-card-figure="wind"]')
    .textContent();
  // The tag's reading, past its hour and its stars: "Mon 09:00 · ★4 · 15 kn".
  const readText = (
    (await page.locator('[data-cursor-tag="wind"]').textContent()) ?? ""
  )
    .replace(/^[^·]*·/, "")
    .replace(/★\d/, "");
  expect(figures(cardText).length).toBeGreaterThan(0);
  expect(figures(cardText)).toEqual(figures(readText));
  // The loupe's foot: "ENE 4 g6" and the shore, "Off".
  const footText = await page
    .locator("[data-photo-loupe] [data-loupe-foot]")
    .textContent();
  expect(figures(footText)).toEqual(figures(readText));
  const line = await card.locator('[data-card-line="wind"]').textContent();
  expect(point(footText)).toBe(point(line));
  // And the same shore as the card's, in the foot's own word.
  const relation: Record<string, string> = {
    onshore: "On",
    "cross-on": "Cross-on",
    "cross-shore": "Cross",
    "cross-off": "Cross-off",
    offshore: "Off",
  };
  const shore = (line ?? "").match(
    /(cross-shore|cross-off|cross-on|offshore|onshore)/,
  )?.[0];
  if (shore) expect(footText).toMatch(new RegExp(`${relation[shore]}$`));
}

test("the next good window takes the page to its best hour, and the cards follow the hour", async ({
  page,
}) => {
  // A phone: its tag says the wind at the hour, as the card does.
  await page.setViewportSize({ width: 390, height: 844 });
  await withPictures(page);
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const next = page.locator("[data-next-window]");
  // The first run of hours with three stars or more, its best stars as pips.
  await expect(next).toContainText("Next good window");
  await expect(next).toContainText(/\w{3} \d{2}:00–\d{2}:00/);
  const best = Number(
    await next.locator("[data-stars]").getAttribute("data-stars"),
  );
  expect(best).toBeGreaterThanOrEqual(3);
  const tide = await page.locator("[data-card-tide]").textContent();
  await next.click();
  // The page's hour goes there, the playhead, the days and the cards with it.
  const playhead = page.locator('[data-cursor-tag="wind"] [data-cursor-hour]');
  await expect(playhead).toHaveText(/^\w{3} \d{2}:00$/);
  const [from, to] = (await next.textContent())!
    .match(/\d{2}:00/g)!
    .map((t) => Number(t.slice(0, 2)));
  const hour = Number((await playhead.textContent())!.slice(4, 6));
  expect(hour).toBeGreaterThanOrEqual(from);
  expect(hour).toBeLessThan(to || 24);
  await expect(
    page.locator("[data-card-wind] [data-your-stars] [data-stars]"),
  ).toHaveAttribute("data-stars", String(best));
  await expect(page.locator("[data-card-tide]")).not.toHaveText(tide!);
  // The tide and the weather at that hour, in full.
  await expect(page.locator('[data-card-figure="tide"]')).toHaveText(
    /^\d\.\d m [↑↓] (rising|falling)$/,
  );
  await expect(page.locator('[data-card-line="tide"]')).toHaveText(
    /^(high|low) at \d{2}:\d{2}( \w{3})?$/,
  );
  // The air, then the sky glyph's own words.
  await expect(page.locator('[data-card-figure="weather"]')).toHaveText(
    /^-?\d+°\D/,
  );
  await expect(page.locator('[data-card-line="weather"]')).toHaveText(
    /^feels -?\d+° · (dry|<?\d+(\.\d)? mm\/h)$/,
  );
  await expectSameWind(page);
  // The tide in the picture is switched on its corner.
  const picture = page.locator("[data-photo-loupe]");
  await picture.getByRole("button", { name: "Low tide" }).click();
  await expect(picture).toHaveAttribute("data-tide", "low");
  // Now again, from today's card: the cards with it.
  await page.locator('[data-day-card="2026-09-13"]').click();
  await expect(playhead).toHaveText("Now");
  await expect(page.locator("[data-card-tide]")).toHaveText(tide!);
});

/**
 * A finger's drag from one point to another, as the phone's own touch events
 * (Chrome's DevTools protocol): unlike `page.touchscreen`, which only taps,
 * the browser scrolls under it as it would under a finger, by the page's own
 * `touch-action`.
 */
async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 12;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [from],
  });
  for (let i = 1; i <= steps; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

/** A graph's height on every frame for a while: a row opening or folding. */
const heightsOver = (page: Page, selector: string, ms: number) =>
  page.evaluate(
    ([sel, ms]) =>
      new Promise<number[]>((done) => {
        const seen: number[] = [];
        const start = performance.now();
        const frame = () => {
          seen.push(
            document.querySelector(sel)!.getBoundingClientRect().height,
          );
          if (performance.now() - start < ms) requestAnimationFrame(frame);
          else done(seen);
        };
        requestAnimationFrame(frame);
      }),
    [selector, ms] as const,
  );

test("over the graphs, the model tabs and the rows' switches; a row folds away and opens, and stays so", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await withTides(page);
  await withWaves(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const wind = page.locator('[data-week-section="wind"]');
  const tabs = wind.locator('[data-graph-tabs="wind"]');
  // The model the rider reads, the blend first: HARMONIE unless they chose.
  const models = tabs.getByRole("group", { name: "Model" });
  await expect(models.getByRole("button")).toHaveText([
    "Blend",
    "HARMONIE",
    "ICON-EU",
    "ECMWF",
    "GFS",
  ]);
  await expect(
    models.getByRole("button", { name: "HARMONIE" }),
  ).toHaveAttribute("aria-pressed", "true");
  // The tabs name the models: the heading no longer lists them.
  await expect(wind).not.toContainText("HARMONIE, ICON-EU");
  // The rows' switches: the models and the current start off.
  const on = (key: string) =>
    tabs.locator(`[data-row-switch="${key}"]`).getAttribute("aria-pressed");
  expect(
    await tabs
      .locator("[data-row-switch]")
      .evaluateAll((els) => els.map((el) => el.textContent)),
  ).toEqual(["Stars", "Direction", "Models", "Sky", "Rain", "Tide", "Current"]);
  for (const key of ["stars", "dir", "sky", "rain", "tide"])
    expect(await on(key)).toBe("true");
  for (const key of ["models", "current"]) expect(await on(key)).toBe("false");
  const names = wind.locator("[data-band-name]");
  await expect(names).toHaveText([
    "Stars",
    "Wind",
    "Direction",
    "Sky",
    "Rain",
    "Tide",
  ]);
  await expect(page.locator('[data-band="wind-blend"]')).toHaveCount(0);
  // The Waves graph's: the wave stars and the direction on, the models and
  // the swells off.
  const waveTabs = page.locator('[data-graph-tabs="waves"]');
  await expect(waveTabs.locator("[data-row-switch]")).toHaveText([
    "Wave stars",
    "Direction",
    "Models",
    "Swells",
  ]);
  await expect(page.locator('[data-band="wave-blend"]')).toHaveCount(0);
  await expect(
    page.locator('[data-wave-svg] [data-band="swell1"]'),
  ).toHaveCount(0);

  // Models on: the row opens, its height easing in, and the graph grows.
  const svg = "[data-graph-svg]";
  const before = (await page.locator(svg).boundingBox())!.height;
  await tabs.locator('[data-row-switch="models"]').click();
  const opening = await heightsOver(page, svg, 700);
  const after = opening.at(-1)!;
  expect(after).toBeGreaterThan(before + 40);
  // On its way, not in one jump.
  expect(
    opening.filter((h) => h > before + 1 && h < after - 1).length,
  ).toBeGreaterThan(2);
  await expect(
    page.locator('[data-band="wind-blend"] path[data-model]').first(),
  ).toBeAttached();
  await expect(names).toContainText(["Models"]);
  // Direction off: its arrows and figures fold away.
  await tabs.locator('[data-row-switch="dir"]').click();
  await expect(page.locator('[data-band="direction"]')).toHaveCount(0);
  await expect(page.locator("[data-wind-figure]")).toHaveCount(0);
  // The swells on, over the Waves graph.
  await waveTabs.locator('[data-row-switch="swells"]').click();
  await expect(
    page.locator('[data-wave-svg] [data-band="swell1"]'),
  ).toBeAttached();

  // A model chosen: the rider's, for the map and the stars too.
  await models.getByRole("button", { name: "ECMWF" }).click();
  await expect(models.getByRole("button", { name: "ECMWF" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("force5.prefs.v1")!),
  );
  expect(stored.rider.starsFrom).toEqual({ model: "ecmwf" });
  expect(stored.spotRows).toMatchObject({
    models: true,
    dir: false,
    swells: true,
  });

  // The next visit: as the rider left it.
  await page.reload();
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-band="wind-blend"]')).toBeAttached();
  await expect(page.locator('[data-band="direction"]')).toHaveCount(0);
  await expect(
    page
      .locator('[data-graph-tabs="wind"]')
      .getByRole("group", { name: "Model" })
      .getByRole("button", { name: "ECMWF" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

/**
 * Every wind model's run but ICON-EU's starting at noon on the sample's day, as
 * the real runs do start at their own hours: the hours the graph spans then
 * depend on the model chosen (the blend's and ICON-EU's start earlier).
 */
async function withLaterRuns(page: Page) {
  await page.route(
    /\/weather\/(harmonie|ecmwf|gfs|arome|arpege|aifs)-\d{10}-[^/]+\/spots\/[^/]+\.json$/,
    async (route) => {
      const response = await route.fetch();
      const square = await response.json();
      for (const id of Object.keys(square.spotForecasts ?? {}))
        square.spotForecasts[id] = square.spotForecasts[id].filter(
          (h: { validTime: string }) => h.validTime >= "2026-09-13T12:00:00Z",
        );
      await route.fulfill({ response, json: square });
    },
  );
}

/** One frame of the Wind row: the graph's width, and each hour's bar. */
interface BarFrame {
  width: number;
  /** By the hour's time: where its bar stands on screen, and its height. */
  bars: Record<string, readonly [x: number, h: number]>;
}

/**
 * The Wind row frame by frame for `ms`, from the frame after it is asked:
 * each bar by its own hour (not by its place, which moves when the hours
 * the graph spans do), where it stands on the screen inside the graph's
 * frame, and how tall it is.
 */
const barsOver = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<BarFrame[]>((done) => {
        const seen: BarFrame[] = [];
        const start = performance.now();
        const frame = () => {
          const box = document
            .querySelector("[data-spot-graph]")!
            .getBoundingClientRect();
          const bars: Record<string, [number, number]> = {};
          for (const g of document.querySelectorAll(
            "[data-wind-bars] [data-bar-hour]",
          )) {
            const bar = g.querySelector("[data-wind-bar]");
            if (!bar) continue;
            bars[g.getAttribute("data-bar-hour")!] = [
              bar.getBoundingClientRect().left - box.left,
              Number(bar.getAttribute("height")),
            ];
          }
          seen.push({
            width: Number(
              document.querySelector("[data-graph-svg]")!.getAttribute("width"),
            ),
            bars,
          });
          if (performance.now() - start < ms) requestAnimationFrame(frame);
          else done(seen);
        };
        requestAnimationFrame(frame);
      }),
    ms,
  );

/**
 * What a model chosen did to the bars on screen (`inView`, the graph's
 * width): the hours both models have, how far any of them moved across the
 * screen in all and at most in one frame, how many frames found a bar's
 * height on its way (neither where it was nor where it went), and the hours
 * that came in, each its heights in turn.
 */
const eased = (frames: BarFrame[], inView: number) => {
  const [first, last] = [frames[0], frames.at(-1)!];
  const shared = Object.keys(first.bars).filter(
    (t) => last.bars[t] && first.bars[t][0] >= 0 && first.bars[t][0] < inView,
  );
  let moved = 0;
  let step = 0;
  for (const t of shared) {
    moved = Math.max(moved, Math.abs(last.bars[t][0] - first.bars[t][0]));
    frames.forEach((f, i) => {
      const was = frames[i - 1]?.bars[t];
      if (was && f.bars[t])
        step = Math.max(step, Math.abs(f.bars[t][0] - was[0]));
    });
  }
  const grew = shared.filter(
    (t) => Math.abs(first.bars[t][1] - last.bars[t][1]) > 2,
  );
  return {
    widths: [first.width, last.width],
    shared: shared.length,
    grew: grew.length,
    moved,
    step,
    between: frames.filter((f) =>
      grew.some(
        (t) =>
          f.bars[t] &&
          Math.abs(f.bars[t][1] - first.bars[t][1]) > 0.5 &&
          Math.abs(f.bars[t][1] - last.bars[t][1]) > 0.5,
      ),
    ).length,
    came: Object.keys(last.bars)
      .filter((t) => !first.bars[t])
      .map((t) => frames.flatMap((f) => (f.bars[t] ? [f.bars[t][1]] : []))),
  };
};

test("the wind is a bar an hour, pink where it has stars; on the blend each model's dot, and a new model eases in where the hours move", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await withWaves(page);
  await withLaterRuns(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  const svg = page.locator("[data-graph-svg]");
  const bars = svg.locator("[data-wind-bars] rect[data-wind-bar]");
  await expect.poll(() => bars.count()).toBeGreaterThan(50);
  // The bars stand for the wind: no area, no line, no gust's dashes.
  await expect(svg.locator("linearGradient")).toHaveCount(0);
  await expect(svg.locator('path[stroke-dasharray="4 3"]')).toHaveCount(0);
  // An hour with stars is a pink bar: as many as the Stars row has pips.
  const pink = await svg.locator("rect[data-bar-stars]").count();
  expect(pink).toBeGreaterThan(5);
  expect(pink).toBe(
    await svg.locator('[data-band="stars"] [data-stars]').count(),
  );
  // The gust a fainter bar over the wind's, reaching higher.
  const tops = await svg.locator("[data-wind-bars] > g").evaluateAll((hours) =>
    hours.flatMap((g) => {
      const wind = g.querySelector("[data-wind-bar]");
      const gust = g.querySelector("[data-gust-bar]");
      return wind && gust
        ? [[Number(gust.getAttribute("y")), Number(wind.getAttribute("y"))]]
        : [];
    }),
  );
  expect(tops.length).toBeGreaterThan(20);
  for (const [gust, wind] of tops) expect(gust).toBeLessThan(wind);
  // HARMONIE's own wind: no models' dots.
  await expect(svg.locator("[data-model-dot]")).toHaveCount(0);

  // The blend: each model's own wind a dot on the bar, and every bar eases
  // from where it stood to the blend's, not drawn again from nothing. The
  // blend starts its hours earlier than HARMONIE does, so the graph spans
  // more of them: the hours on screen stay where they are, their bars
  // easing, and the hours put on its start grow from the foot.
  const graph = page.locator("[data-spot-graph]");
  await graph.scrollIntoViewIfNeeded();
  const inView = await graph.evaluate((el) => el.clientWidth);
  const models = page
    .locator('[data-graph-tabs="wind"]')
    .getByRole("group", { name: "Model" });
  const moving = barsOver(page, 1500);
  await models.getByRole("button", { name: "Blend" }).click();
  const blend = eased(await moving, inView);
  expect(blend.widths[1]).toBeGreaterThan(blend.widths[0]);
  expect(blend.shared).toBeGreaterThan(20);
  expect(blend.moved).toBeLessThanOrEqual(1);
  expect(blend.grew).toBeGreaterThan(5);
  expect(blend.between).toBeGreaterThan(3);
  expect(blend.came.length).toBeGreaterThan(0);
  for (const heights of blend.came) {
    expect(heights[0]).toBeLessThan(heights.at(-1)! - 0.5);
    expect(new Set(heights.map(Math.round)).size).toBeGreaterThan(2);
  }
  await expect
    .poll(() => svg.locator("[data-model-dot]").count())
    .toBeGreaterThan(50);
  for (const id of ["harmonie", "ecmwf"])
    await expect(
      svg.locator(`[data-model-dots="${id}"] circle`).first(),
    ).toBeAttached();

  // Back to HARMONIE from the graph's first hours, which HARMONIE does not
  // have: the scroll cannot keep them, so the hours glide to their place
  // rather than jump there.
  await page.waitForTimeout(600);
  await graph.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  const gliding = barsOver(page, 1500);
  await models.getByRole("button", { name: "HARMONIE" }).click();
  const back = eased(await gliding, inView);
  expect(back.widths[1]).toBeLessThan(back.widths[0]);
  expect(back.moved).toBeGreaterThan(40);
  expect(back.step).toBeLessThan(back.moved / 2);

  // With less motion asked for, a model chosen moves the bars at once: the
  // blend's hours, put on the graph's start, keep those on screen in place,
  // and back to HARMONIE from the first hours they jump in one frame.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(600);
  const still = barsOver(page, 1500);
  await models.getByRole("button", { name: "Blend" }).click();
  const atOnce = eased(await still, inView);
  expect(atOnce.widths[1]).toBeGreaterThan(atOnce.widths[0]);
  expect(atOnce.grew).toBeGreaterThan(5);
  expect(atOnce.between).toBe(0);
  expect(atOnce.moved).toBeLessThanOrEqual(1);
  await graph.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(300);
  const jumping = barsOver(page, 1000);
  await models.getByRole("button", { name: "HARMONIE" }).click();
  const jumped = eased(await jumping, inView);
  expect(jumped.moved).toBeGreaterThan(40);
  expect(jumped.step).toBeGreaterThanOrEqual(jumped.moved - 1);
  await expect(svg.locator("[data-model-dot]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the hour's card breaks the hour down: model by model, the sky, the tide", async ({
  page,
}) => {
  await allSpotRows(page);
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await page
    .locator('[data-graph-tabs="wind"]')
    .getByRole("group", { name: "Model" })
    .getByRole("button", { name: "Blend" })
    .click();
  const graph = page.locator("[data-spot-graph]");
  await graph.scrollIntoViewIfNeeded();
  const box = (await graph.boundingBox())!;
  const x = box.x + box.width * 0.4;
  const band = async (name: string) => {
    const strip = page
      .locator('[data-week-section="wind"] [data-band-name]')
      .filter({ hasText: new RegExp(`^${name}$`) });
    return (await strip.boundingBox())!.y + 6;
  };
  const card = page.locator('[data-card="wind"]');

  // On the wind: a line a model, its gust in a column of its own, then
  // under a rule the blend's own; every line on one line.
  await page.mouse.move(x, await band("Wind"));
  await expect(card).toHaveAttribute("data-card-band", "wind");
  const lines = card.locator("[data-card-model]");
  await expect.poll(() => lines.count()).toBeGreaterThanOrEqual(2);
  await expect(lines.first()).toHaveText(/^[A-Z][\w -]+\d+(g\d+)?$/);
  await expect(card.locator("[data-card-total]")).toHaveText(
    /^Blend\d+(g\d+ )?kn$/,
  );
  const heights = await card
    .locator("[data-card-model], [data-card-total]")
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().height),
    );
  for (const h of heights) expect(h).toBeLessThan(22);
  // The figures in one column down the card, the gusts in another.
  const columns = await card
    .locator("[data-card-model], [data-card-total]")
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector("b")!.getBoundingClientRect().right),
    );
  for (const right of columns) expect(right).toBeCloseTo(columns[0], 0);

  // A long card, every model then the stars, stays inside the graph rather
  // than over the tabs above it.
  await page.mouse.move(x, await band("Stars"));
  await expect(card).toHaveAttribute("data-card-band", "stars");
  const frame = (await graph.locator("..").boundingBox())!;
  const long = (await card.boundingBox())!;
  expect(long.y).toBeGreaterThanOrEqual(frame.y);
  expect(long.y + long.height).toBeLessThanOrEqual(frame.y + frame.height);

  // On the sky: the air, how it feels, the rain and the cloud.
  await page.mouse.move(x, await band("Sky"));
  await expect(card).toHaveAttribute("data-card-band", "sky");
  await expect(card.locator('[data-card-row="air"]')).toHaveText(/^Air-?\d+°$/);
  await expect(card.locator('[data-card-row="cloud"]')).toHaveText(
    /^Cloud\d+%$/,
  );
  await expect(card.locator('[data-card-row="rain"]')).toBeAttached();
  await expect(card.locator("[data-card-model]")).toHaveCount(0);

  // On the tide: the tide, its next turn and the current.
  await page.mouse.move(x, await band("Tide"));
  await expect(card).toHaveAttribute("data-card-band", "tide");
  await expect(card.locator('[data-card-row="tide"]')).toHaveText(
    /^Tide\d\.\d m$/,
  );
  await expect(card.locator('[data-card-row="turn"]')).toHaveText(
    /^Next (high|low)\d{2}:\d{2}$/,
  );
  await expect(card.locator('[data-card-row="current"]')).toContainText(
    /^Current/,
  );
});

test("the table keeps every column, with the model tabs over it", async ({
  page,
}) => {
  await withTides(page);
  await page.goto("/spot/brandon");
  await expect(heading(page)).toBeVisible({ timeout: 30000 });
  await page
    .locator('[data-graph-tabs="wind"] [data-row-switch="rain"]')
    .click();
  await page.getByRole("group", { name: "View" }).getByText("Table").click();
  const table = page.locator("[data-hour-table]");
  await expect(table).toBeVisible();
  // The rows' switches are the graphs': the table still gives the rain.
  await expect(table.locator("th", { hasText: "Rain" })).toHaveCount(1);
  await expect(page.locator("[data-row-switch]")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Model" })).toBeVisible();
});

test.describe("on a phone, the model and the rows", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("are in one sheet, opened from the Wind heading", async ({ page }) => {
    await withTides(page);
    await page.goto("/spot/brandon");
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    // No tab rows over the graphs: one button beside the Graph | Table switch.
    await expect(page.locator("[data-graph-tabs]")).toHaveCount(0);
    const wind = page.locator('[data-week-section="wind"]');
    const button = wind.locator("[data-rows-button]");
    await expect(button).toHaveText("Model & rows");
    await expect(page.locator('[data-band="current"]')).toHaveCount(0);
    await button.click();
    const sheet = page.getByRole("dialog", { name: "Model & rows" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("group", { name: "Model" })).toBeVisible();
    await expect(sheet.getByRole("group", { name: "Wind rows" })).toBeVisible();
    await expect(sheet.getByRole("group", { name: "Wave rows" })).toBeVisible();
    // The sheet stands at the foot of the screen.
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(830);
    await sheet.locator('[data-row-switch="current"]').click();
    await expect(sheet.locator('[data-row-switch="current"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
    await expect(wind.locator("[data-band-name]").last()).toHaveText("Current");
  });

  test("a model chosen in the sheet keeps the playhead on its hour, the hours gliding under it", async ({
    page,
  }) => {
    await withTides(page);
    await withLaterRuns(page);
    await page.goto("/spot/brandon");
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    const graph = page.locator("[data-spot-graph]");
    await graph.scrollIntoViewIfNeeded();
    const playhead = page.locator(
      '[data-cursor-tag="wind"] [data-cursor-hour]',
    );
    await expect(playhead).toHaveText("Now");
    const width = Number(
      await page.locator("[data-graph-svg]").getAttribute("width"),
    );
    await page.locator("[data-rows-button]").click();
    const sheet = page.getByRole("dialog", { name: "Model & rows" });
    // The playhead's line on screen, frame by frame, as the blend comes in.
    const lines = page.evaluate(
      () =>
        new Promise<number[]>((done) => {
          const seen: number[] = [];
          const start = performance.now();
          const frame = () => {
            const line = document.querySelector("[data-playhead-line]");
            if (line) seen.push(line.getBoundingClientRect().left);
            if (performance.now() - start < 2500) requestAnimationFrame(frame);
            else done(seen);
          };
          requestAnimationFrame(frame);
        }),
    );
    await sheet
      .getByRole("group", { name: "Model" })
      .getByRole("button", { name: "Blend" })
      .click();
    await sheet.getByRole("button", { name: "Close" }).click();
    const at = await lines;
    // The blend's hours start earlier: the graph is wider, the playhead on
    // the same hour, and the hours under it came to their place smoothly.
    await expect
      .poll(async () =>
        Number(await page.locator("[data-graph-svg]").getAttribute("width")),
      )
      .toBeGreaterThan(width);
    await expect(playhead).toHaveText("Now");
    const moved = Math.abs(at.at(-1)! - at[0]);
    const step = Math.max(...at.slice(1).map((x, i) => Math.abs(x - at[i])));
    expect(moved).toBeGreaterThan(20);
    expect(step).toBeLessThan(moved / 2);
  });
});

test.describe("on a phone, the week graph", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  const graphState = (page: Page) =>
    page.evaluate(() => ({
      left: document.querySelector("[data-spot-graph]")!.scrollLeft,
      top: Math.round(scrollY),
      hour: document.querySelector(
        '[data-cursor-tag="wind"] [data-cursor-hour]',
      )!.textContent,
    }));
  /** Where the hours and the page come to rest, once a fling has run out. */
  const settled = async (page: Page) => {
    let last = await graphState(page);
    for (;;) {
      await page.waitForTimeout(150);
      const now = await graphState(page);
      if (now.left === last.left && now.top === last.top) return now;
      last = now;
    }
  };

  test("a finger drags the hours along the graph, and scrolls the page up and down it", async ({
    page,
  }) => {
    await allSpotRows(page);
    await withTides(page);
    await page.goto("/spot/brandon");
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    const graph = page.locator("[data-spot-graph]");
    await expect(page.locator("[data-graph-svg]")).toBeVisible();
    // Everything above the graph in, so nothing moves the page but a finger.
    await page.waitForLoadState("networkidle");
    await page.locator('[data-week-section="wind"]').evaluate((el) =>
      // Just under the days pinned at the top.
      scrollTo(
        0,
        scrollY +
          el.getBoundingClientRect().top -
          parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          ),
      ),
    );
    const box = (await graph.boundingBox())!;
    // Across the graph, from its wind row to its current: the hours move
    // under the playhead and its tag follows, and the page stays put.
    for (const down of [60, 180, 300, 400]) {
      const before = await settled(page);
      const y = box.y + down;
      await swipe(page, { x: box.x + 250, y }, { x: box.x + 50, y });
      await expect
        .poll(async () => (await graphState(page)).left, {
          message: `a drag ${down}px down the graph`,
        })
        .toBeGreaterThan(before.left + 100);
      const after = await settled(page);
      expect(after.top).toBe(before.top);
      expect(after.hour).not.toBe(before.hour);
    }
    // Up the graph: the page scrolls, the hours stay where they were.
    const before = await settled(page);
    await swipe(
      page,
      { x: box.x + 150, y: box.y + 400 },
      { x: box.x + 150, y: box.y + 150 },
    );
    await expect
      .poll(async () => (await graphState(page)).top)
      .toBeGreaterThan(before.top + 100);
    expect((await settled(page)).left).toBe(before.left);
  });

  test("the band names fold away as a finger moves the hours on, and come back as it moves them back", async ({
    page,
  }) => {
    await allSpotRows(page);
    await withTides(page);
    await page.goto("/spot/brandon");
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    const graph = page.locator("[data-spot-graph]");
    await expect(page.locator("[data-graph-svg]")).toBeVisible();
    const names = page.locator('[data-week-section="wind"] [data-band-name]');
    await expect(names).toHaveText([
      "Stars",
      "Wind",
      "Direction",
      "Models",
      "Sky",
      "Rain",
      "Tide",
      "Current",
    ]);
    const column = page.locator('[data-week-section="wind"] [data-band-names]');
    const waveColumn = page.locator(
      '[data-week-section="waves"] [data-band-names]',
    );
    // Opened on now, moved there by the page: the names are out, whole, and
    // at the start of the hours the first hour stands clear of them.
    await expect(column).toHaveAttribute("data-band-names", "shown");
    const right = (await column.boundingBox())!;
    for (const box of await names.evaluateAll((spans) =>
      spans.map((span) => {
        const { left, right } = span.getBoundingClientRect();
        return { left, right };
      }),
    )) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(right.x + right.width);
    }
    await page.waitForLoadState("networkidle");
    await page.locator('[data-week-section="wind"]').evaluate((el) =>
      // Just under the days pinned at the top.
      scrollTo(
        0,
        scrollY +
          el.getBoundingClientRect().top -
          parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingTop,
          ),
      ),
    );
    const box = (await graph.boundingBox())!;
    const y = box.y + 80;
    // On: they fold away, in both sections, and the hours have the width.
    await swipe(page, { x: box.x + 300, y }, { x: box.x + 100, y });
    await expect(column).toHaveAttribute("data-band-names", "folded");
    await expect(waveColumn).toHaveAttribute("data-band-names", "folded");
    await expect
      .poll(async () => (await column.boundingBox())!.x + right.width)
      .toBeLessThanOrEqual(right.x + 1);
    // Back: they come back over the hours.
    await swipe(page, { x: box.x + 100, y }, { x: box.x + 200, y });
    await expect(column).toHaveAttribute("data-band-names", "shown");
    await expect(waveColumn).toHaveAttribute("data-band-names", "shown");
    await expect
      .poll(async () => (await column.boundingBox())!.x)
      .toBe(right.x);
  });

  test("a finger reads the hour at the playhead, and a tap asks a row for its label", async ({
    page,
  }) => {
    await withTides(page);
    await page.goto("/spot/brandon");
    await expect(heading(page)).toBeVisible({ timeout: 30000 });
    await expect(page.locator("[data-graph-svg]")).toBeVisible();
    // No bar of readings: the tag is the hour first, then the row's wind.
    await expect(page.locator("[data-readout]")).toHaveCount(0);
    const tag = page.locator('[data-cursor-tag="wind"]');
    await expect(tag).toHaveText(/^Now · (★[0-5] · )?\d+( g\d+)? kn$/);
    await page
      .locator("[data-spot-graph]")
      .evaluate((el) => (el.scrollLeft += 400));
    await expect(tag).toHaveText(
      /^\w{3} \d{2}:\d{2} · (★[0-5] · )?\d+( g\d+)? kn$/,
    );
    // Each hour's stars are five pips up its column, as many lit as it has.
    const pips = await page
      .locator("[data-spot-graph] g[data-stars]")
      .evaluateAll((hours) =>
        hours.map((g) => ({
          stars: Number(g.getAttribute("data-stars")),
          pips: g.querySelectorAll("rect").length,
          lit: g.querySelectorAll("rect:not(.fill-line)").length,
        })),
      );
    expect(pips.length).toBeGreaterThan(0);
    for (const hour of pips) {
      expect(hour.pips).toBe(5);
      expect(hour.lit).toBe(hour.stars);
    }
    // The tide's row brought up the screen, then a tap on it.
    const svg = page.locator("[data-graph-svg]");
    await page.evaluate(
      (to) => scrollBy(0, to),
      (await svg.boundingBox())!.y + 340 - 400,
    );
    const label = page.locator('[data-card="wind"]');
    const x = (await page.locator("[data-spot-graph]").boundingBox())!.x + 120;
    const y = (await svg.boundingBox())!.y + 340;
    await page.touchscreen.tap(x, y);
    await expect(label).toHaveAttribute("data-card-band", "tide");
    await expect(label).toContainText(/\d\.\d m/);
    // A second tap on the row puts the label away.
    await page.touchscreen.tap(x, y);
    await expect(label).toHaveCount(0);
  });
});
