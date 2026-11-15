/**
 * The spot report's time slider, pinned at the top of the page under the day
 * cards: a ruler of the week's hours, a tick an hour, each with a small bar
 * for its wind, in the stars' pink where the hour has stars, and the nights
 * shaded. A needle stands still in the middle with the hour on a tag over it;
 * the hours move under it.
 *
 * It drives the page's chosen hour and follows it: dragging, swiping or
 * wheeling it, a tap on an hour, or its keys pick the hour under the needle
 * (`onPick`), and an hour chosen anywhere else (the graphs, a day card) moves
 * the ruler to it. While the rider is moving it, the page's hour does not
 * pull it back; once they stop it settles on the hour the page chose.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NO_RING, tv } from "../../../ui/tv";
import { HOUR } from "../spot";
import {
  sliderAt,
  sliderIndex,
  sliderLeft,
  sliderOffsets,
  type SliderHour,
} from "./slider";

/** An hour's width along the ruler, in pixels. */
export const TICK = 14;
/** The tallest wind bar, in pixels, and the wind that fills it, in knots. */
const BAR = 24;
const BAR_KN = 30;
/** How long after the rider's last move the ruler settles on the page's hour. */
const SETTLE_MS = 250;
/** A press that moves less than this is a tap on an hour, not a drag. */
const DRAG_PX = 4;
/** Further than this many hours, a move the page makes glides there. */
const GLIDE_HOURS = 6;

const styles = tv({
  slots: {
    frame: [
      "relative overflow-hidden rounded-surface bg-sunken on-card select-none",
      // The ruler takes the focus; the ring stands round the whole frame.
      "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
    ],
    // The hour under the needle, as the graphs' cursor says it.
    tag: [
      "pointer-events-none absolute top-1.5 left-1/2 z-2 -translate-x-1/2 rounded-full bg-inverse px-2 py-0.5",
      "font-body text-label font-semibold whitespace-nowrap text-ink-inverse tabular-nums",
    ],
    needle:
      "pointer-events-none absolute top-7 bottom-1.5 left-1/2 z-1 w-0.5 -translate-x-1/2 rounded-full bg-ink",
    track: [
      "cursor-grab overflow-x-auto overscroll-x-contain scrollbar-none",
      NO_RING,
    ],
    ticks: "flex h-14 items-end pb-1.5",
    hour: "relative h-12 shrink-0 snap-center",
    night: "bg-night",
    // An hour's mark along the foot, taller where a day starts.
    mark: "absolute bottom-0 h-1.5 w-px -translate-x-1/2 bg-line-strong",
    markDay: "h-3.5 bg-ink-muted",
    bar: "absolute inset-x-0.5 bottom-2.5 bg-line-strong",
    barStars: "bg-stars-4",
    barNight: "opacity-40",
  },
  variants: {
    // A mouse dragging the ruler: no snapping under it until it lets go.
    dragging: {
      true: { track: "cursor-grabbing snap-none" },
      false: { track: "snap-x snap-mandatory" },
    },
  },
});

const reducedMotion = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TimeSlider({
  hours,
  time,
  words,
  onPick,
  onNow,
}: {
  hours: readonly SliderHour[];
  /** The page's chosen hour (now's, with none chosen). */
  time: number;
  /** That hour as the page says it: "Now", or "Mon 13:00". */
  words: string;
  /** An hour put under the needle here. */
  onPick: (time: number) => void;
  /** Home: back to now. */
  onNow: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const s = styles({ dragging });
  const track = useRef<HTMLDivElement>(null);
  const offsets = useMemo(() => sliderOffsets(hours, TICK), [hours]);
  const at = sliderIndex(hours, time);
  // The latest of what the handlers read after the render that made them.
  const latest = useRef({ at, hours, offsets });
  latest.current = { at, hours, offsets };
  // A move the page made: the scroll it causes is not the rider's.
  const going = useRef<{ left: number; until: number } | null>(null);
  // When the rider last moved the ruler, and the hour they put under it.
  const moved = useRef(-Infinity);
  const picked = useRef<number | null>(null);
  const settle = useRef(0);

  /** Puts hour `i` under the needle, gliding there if it is far. */
  const goTo = (i: number, glide: boolean) => {
    const el = track.current;
    const { hours, offsets } = latest.current;
    if (!el || i < 0 || i >= hours.length) return;
    const left = sliderLeft(offsets, hours, i, TICK);
    if (Math.abs(el.scrollLeft - left) < 1) {
      going.current = null;
      return;
    }
    const smooth = glide && !reducedMotion();
    going.current = { left, until: performance.now() + (smooth ? 1200 : 150) };
    el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  };
  /** The hour under the needle now. */
  const under = () => {
    const el = track.current;
    const { hours, offsets } = latest.current;
    return el ? sliderAt(offsets, hours, el.scrollLeft, TICK) : -1;
  };

  // The page's hour, chosen anywhere: the ruler goes to it, unless the rider
  // is moving it (then it settles there once they stop).
  useLayoutEffect(() => {
    if (dragging || performance.now() - moved.current < SETTLE_MS) return;
    const was = under();
    if (was === at) return;
    goTo(at, was >= 0 && Math.abs(at - was) > GLIDE_HOURS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, offsets, dragging]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  /** The rider moved the ruler: the hour under the needle is picked. */
  const ridden = () => {
    moved.current = performance.now();
    const { hours } = latest.current;
    const hour = hours[under()];
    if (hour && hour.time !== picked.current) {
      picked.current = hour.time;
      onPick(hour.time);
    }
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      moved.current = -Infinity;
      picked.current = null;
      if (under() !== latest.current.at) goTo(latest.current.at, false);
    }, SETTLE_MS);
  };
  const onScroll = () => {
    const el = track.current;
    const move = going.current;
    if (el && move) {
      if (
        Math.abs(el.scrollLeft - move.left) < 1 ||
        performance.now() > move.until
      )
        going.current = null;
      return;
    }
    ridden();
  };
  // The rider's hand on the ruler takes over from a move the page started.
  const takeOver = () => {
    going.current = null;
  };

  // A wheel turned over the ruler moves it an hour a notch's worth at a time;
  // sideways, a trackpad scrolls it as it would anything.
  const wheelLeft = useRef(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) {
        takeOver();
        return;
      }
      e.preventDefault();
      takeOver();
      wheelLeft.current += e.deltaY;
      const by = Math.trunc(wheelLeft.current / TICK);
      if (!by) return;
      wheelLeft.current -= by * TICK;
      const { hours, offsets } = latest.current;
      const i = Math.max(0, Math.min(hours.length - 1, under() + by));
      el.scrollLeft = sliderLeft(offsets, hours, i, TICK);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A mouse pressed and pulled drags the ruler; a press that stays put (a
  // mouse's or a finger's) is a tap, and picks the hour under it.
  const press = (e: React.PointerEvent<HTMLDivElement>) => {
    takeOver();
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const startX = e.clientX;
    const startLeft = el.scrollLeft;
    const mouse = e.pointerType === "mouse";
    let dragged = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!dragged && Math.abs(dx) < DRAG_PX) return;
      if (!mouse) return;
      if (!dragged) setDragging(true);
      dragged = true;
      el.scrollLeft = startLeft - dx;
    };
    const done = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", cancel);
      if (dragged) {
        setDragging(false);
        return;
      }
      if (Math.abs(ev.clientX - startX) >= DRAG_PX) return;
      // A tap: the hour under it.
      const { hours, offsets } = latest.current;
      const box = el.getBoundingClientRect();
      const x =
        ev.clientX - box.left + el.scrollLeft - (el.clientWidth - TICK) / 2;
      let i = -1;
      offsets.forEach((o, k) => {
        if (o <= x) i = k;
      });
      if (i < 0 || x >= offsets[i] + hours[i].step * TICK) return;
      if (i === under()) return;
      picked.current = hours[i].time;
      onPick(hours[i].time);
      goTo(i, true);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", cancel);
      if (dragged) setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", cancel);
  };

  /**
   * The arrow keys step an hour, a day with Shift; Page Up and Down a day;
   * Home goes back to now and End to the last hour.
   */
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const { hours } = latest.current;
    const from = Math.max(0, under());
    const day = (by: 1 | -1) =>
      sliderIndex(hours, hours[from].time + by * 24 * HOUR);
    let i: number | null = null;
    if (e.key === "ArrowRight") i = e.shiftKey ? day(1) : from + 1;
    else if (e.key === "ArrowLeft") i = e.shiftKey ? day(-1) : from - 1;
    else if (e.key === "PageDown") i = day(1);
    else if (e.key === "PageUp") i = day(-1);
    else if (e.key === "End") i = hours.length - 1;
    else if (e.key === "Home") {
      e.preventDefault();
      takeOver();
      onNow();
      return;
    }
    if (i === null) return;
    e.preventDefault();
    takeOver();
    i = Math.max(0, Math.min(hours.length - 1, i));
    if (i === from || !hours[i]) return;
    picked.current = hours[i].time;
    onPick(hours[i].time);
    goTo(i, false);
  };

  return (
    <div className={s.frame()} data-time-slider>
      <span className={s.tag()} data-slider-tag>
        {words}
      </span>
      <span className={s.needle()} aria-hidden="true" />
      <div
        ref={track}
        className={s.track()}
        role="slider"
        tabIndex={0}
        aria-label="Hour: the arrow keys move it, Shift a day, Home back to now"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, hours.length - 1)}
        aria-valuenow={Math.max(0, at)}
        aria-valuetext={words}
        onScroll={onScroll}
        onPointerDown={press}
        onTouchStart={takeOver}
        onKeyDown={onKey}
        data-slider-track
      >
        <div className={s.ticks()}>
          <div
            className="shrink-0"
            style={{ width: `calc(50% - ${TICK / 2}px)` }}
          />
          {hours.map((h) => (
            <div
              key={h.time}
              className={s.hour({ className: h.night ? s.night() : undefined })}
              style={{ width: h.step * TICK }}
              data-slider-hour={h.time}
              data-stars={h.stars || undefined}
              data-night={h.night || undefined}
            >
              {h.kn !== null && (
                <span
                  className={s.bar({
                    className: [
                      h.stars > 0 && s.barStars(),
                      h.night && s.barNight(),
                    ],
                  })}
                  style={{
                    height: Math.max(
                      1,
                      (Math.min(h.kn, BAR_KN) / BAR_KN) * BAR,
                    ),
                  }}
                />
              )}
              {Array.from({ length: h.step }, (_, k) => (
                <span
                  key={k}
                  className={s.mark({
                    className: h.dayStart && k === 0 ? s.markDay() : undefined,
                  })}
                  style={{ left: (k + 0.5) * TICK }}
                />
              ))}
            </div>
          ))}
          <div
            className="shrink-0"
            style={{ width: `calc(50% - ${TICK / 2}px)` }}
          />
        </div>
      </div>
    </div>
  );
}
