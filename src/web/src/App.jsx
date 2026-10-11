import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Github,
  Search,
  Share2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import schedule from "../../static/PFF35-Schedule.json";

const DAY_START = 9 * 60;
const DAY_END = 27 * 60;
const MINUTE_WIDTH = 1.1;
const TRACK_WIDTH = (DAY_END - DAY_START) * MINUTE_WIDTH;
const LANE_HEIGHT = 82;
const UNTIMED_WIDTH = 72;

const VENUE_ORDER = [
  "Film Society East A",
  "Film Society East B",
  "Film Society Bourse 1",
  "Film Society Bourse 2",
  "Film Society Bourse 3",
  "Film Society Center",
  "Events",
  "Panels",
];

const THEATERS = [
  { id: "east", label: "East" },
  { id: "bourse", label: "Bourse" },
  { id: "center", label: "Film Center" },
];

const CATEGORY_COLORS = {
  "After Hours": ["#111923", "#ffffff"],
  Centerpieces: ["#e9282c", "#ffffff"],
  "Cinema de France": ["#2c8074", "#ffffff"],
  "Community Screenings": ["#c8a326", "#15191a"],
  Filmadelphia: ["#4b6d36", "#ffffff"],
  "From the Vaults": ["#777e82", "#ffffff"],
  "Made in USA": ["#3da3ba", "#101718"],
  "Masters of Cinema": ["#ed705e", "#151819"],
  "Non/Fiction": ["#70183a", "#ffffff"],
  "Sight & Soundtrack": ["#6558a4", "#ffffff"],
  Spotlights: ["#a06c98", "#ffffff"],
  "State of the Union": ["#a99764", "#111719"],
  "This Animated Life": ["#edd300", "#151819"],
  "World View": ["#cfb6ca", "#17191a"],
  "Shorts Programs": ["#197d83", "#ffffff"],
  Events: ["#edd8b2", "#191919"],
};

const allDates = [...new Set(schedule.map((item) => item.date))].sort();
const scheduleById = new Map(schedule.map((item) => [item.id, item]));

function sharedSelectionFromUrl() {
  const parameter = new URLSearchParams(window.location.search).get("plan");
  if (parameter === null) return null;
  if (!parameter) return new Set();

  const validIds = new Set(schedule.map((item) => item.id));
  return new Set(parameter.split(",").filter((id) => validIds.has(id)));
}

function dateLabel(date, format = { weekday: "long", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...format, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function clockLabel(offset) {
  if (offset == null) return "";
  const minutesIntoDay = offset % 1440;
  const hour = Math.floor(minutesIntoDay / 60);
  const minute = minutesIntoDay % 60;
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${String(minute).padStart(2, "0")}${hour >= 12 ? "p" : "a"}`;
}

function timeRange(item) {
  return `${clockLabel(item.start_offset_minutes)} – ${clockLabel(item.end_offset_minutes)}`;
}

function intervalsOverlap(left, right) {
  return (
    left.date === right.date &&
    left.id !== right.id &&
    left.end_offset_minutes != null &&
    right.end_offset_minutes != null &&
    left.start_offset_minutes < right.end_offset_minutes &&
    right.start_offset_minutes < left.end_offset_minutes
  );
}

function getStatus(scheduleItems, selectedIds) {
  const selected = scheduleItems.filter((item) => selectedIds.has(item.id));
  const blockedBy = new Map();
  for (const item of scheduleItems) {
    if (selectedIds.has(item.id)) continue;
    const conflict = selected.find((choice) => intervalsOverlap(item, choice));
    if (conflict) blockedBy.set(item.id, conflict);
  }
  return { selected, blockedBy };
}

function planPosition(item, minuteWidth = MINUTE_WIDTH) {
  const start = Math.max(DAY_START, item.start_offset_minutes);
  const naturalEnd = item.end_offset_minutes ?? item.start_offset_minutes + UNTIMED_WIDTH;
  const end = Math.min(DAY_END, naturalEnd);
  return {
    left: (start - DAY_START) * minuteWidth,
    width: Math.max(30, (end - start) * minuteWidth - 2),
  };
}

function assignTracks(items) {
  const laneEnds = [];
  const placements = [...items]
    .sort(
      (left, right) =>
        left.start_offset_minutes - right.start_offset_minutes ||
        left.name.localeCompare(right.name),
    )
    .map((item) => {
      const visualEnd = item.end_offset_minutes ?? item.start_offset_minutes + UNTIMED_WIDTH;
      let lane = laneEnds.findIndex((end) => end <= item.start_offset_minutes);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = visualEnd;
      return { item, lane };
    });
  return { placements, laneCount: Math.max(1, laneEnds.length) };
}

function shortVenue(venue) {
  return venue.replace("Film Society ", "");
}

function theaterForVenue(venue) {
  if (venue.startsWith("Film Society East")) return "east";
  if (venue.startsWith("Film Society Bourse")) return "bourse";
  if (venue === "Film Society Center") return "center";
  return null;
}

function filmPreviewPosition(target) {
  const rect = target.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 24);
  const height = Math.min(360, window.innerHeight - 24);
  const gap = 8;
  const belowSpace = window.innerHeight - rect.bottom - gap * 2;
  const aboveSpace = rect.top - gap * 2;
  const minimumUsefulHeight = Math.min(180, height);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));

  if (belowSpace >= minimumUsefulHeight) {
    return { left, top: rect.bottom + gap, maxHeight: belowSpace };
  }
  if (aboveSpace >= minimumUsefulHeight) {
    const maxHeight = Math.min(height, aboveSpace);
    return { left, top: rect.top - maxHeight - gap, maxHeight };
  }

  const rightSpace = window.innerWidth - rect.right - gap * 2;
  const leftSpace = rect.left - gap * 2;
  const sideSpace = Math.max(rightSpace, leftSpace);
  if (sideSpace >= 180) {
    const sideWidth = Math.min(width, sideSpace);
    const top = Math.max(
      12,
      Math.min(rect.top, window.innerHeight - height - 12),
    );
    return {
      left: rightSpace >= leftSpace ? rect.right + gap : rect.left - sideWidth - gap,
      top,
      width: sideWidth,
      maxHeight: height,
    };
  }

  const maxHeight = Math.max(80, Math.min(height, Math.max(belowSpace, aboveSpace)));
  return {
    left,
    top: belowSpace >= aboveSpace ? rect.bottom + gap : rect.top - maxHeight - gap,
    maxHeight,
  };
}

function FilmPreview({
  item,
  position,
  pinned,
  previewHeight,
  selected,
  conflict,
  onConfirm,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) {
  const subtitle = item.location || (item.director ? `Dir: ${item.director}` : null);
  return (
    <aside
      className={`film-preview ${pinned ? "is-mobile-preview" : ""}`}
      role="dialog"
      aria-label={`${item.name} ${item.run_time_minutes == null ? "event" : "film"} details`}
      style={
        pinned
          ? { "--mobile-preview-height": `${previewHeight ?? 45}dvh` }
          : {
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className="film-preview-close"
        aria-label="Close screening details"
        onClick={onClose}
      >
        <X size={18} aria-hidden="true" />
      </button>
      <div className="film-preview-body">
        {item.image_url && (
          <img
            className="film-preview-image"
            src={item.image_url}
            srcSet={item.image_url_2x ? `${item.image_url_2x} 2x` : undefined}
            alt=""
          />
        )}
        <div className="film-preview-content">
          <h2>{item.name}</h2>
          {subtitle && (
            <p className={`film-preview-subtitle ${item.location ? "is-location" : ""}`}>
              {subtitle}
            </p>
          )}
          {pinned && (
            <p className="film-preview-screening-info">
              {dateLabel(item.date, { weekday: "short", month: "short", day: "numeric" })} · {timeRange(item)}
            </p>
          )}
          {item.description && <p className="film-preview-description">{item.description}</p>}
        </div>
      </div>
      <div className="film-preview-actions">
        {item.purchase_links && (
          <a
            className="film-preview-ticket-link"
            href={item.purchase_links}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ticketing Page
          </a>
        )}
        {conflict && <p className="film-preview-conflict">Overlaps {conflict.name} in your schedule.</p>}
        <button
          type="button"
          className="film-preview-confirm"
          disabled={Boolean(conflict)}
          onClick={onConfirm}
        >
          {selected ? "Remove from schedule" : "Add to schedule"}
        </button>
      </div>
    </aside>
  );
}

function ScreeningBlock({
  item,
  lane,
  selected,
  conflict,
  selectedOtherShowing,
  otherShowingsBlocked,
  onSelect,
  onPreviewEnter,
  onPreviewLeave,
  compact,
  minuteWidth,
}) {
  const [background, foreground] = CATEGORY_COLORS[item.category] ?? ["#98a19e", "#111819"];
  const position = planPosition(item, minuteWidth);
  const className = [
    "screening-block",
    selected ? "is-selected" : "",
    conflict ? "is-blocked" : "",
    selectedOtherShowing ? "has-selected-alternate" : "",
    selectedOtherShowing || otherShowingsBlocked ? "has-expanded-showing-badge" : "",
    compact ? "is-compact" : "",
    item.end_offset_minutes == null ? "has-no-end" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = {
    "--block-color": compact && conflict ? "#d7dbd8" : background,
    "--block-ink": compact && conflict ? "#65706a" : foreground,
    "--block-left": `${position.left}px`,
    "--block-width": `${position.width}px`,
    "--block-top": `${6 + lane * LANE_HEIGHT}px`,
    ...(compact && conflict
      ? { filter: "none", opacity: 1, borderColor: "#aab2ac" }
      : {}),
    ...(compact && selected
      ? {
          filter: "none",
          opacity: 1,
          border: "3px solid #e0e64b",
          boxShadow: "0 0 0 2px #18201f",
        }
      : {}),
  };
  const blockedDescription = conflict
    ? `Unavailable: overlaps ${conflict.name} at ${clockLabel(conflict.start_offset_minutes)}`
    : "";
  const subtitle = item.location || (item.director ? `Dir: ${item.director}` : null);
  const title = [
    item.name,
    item.director ? `Director: ${item.director}` : "",
    item.location ? `Location: ${item.location}` : item.venue,
    timeRange(item),
    item.category ?? "Category not listed",
    blockedDescription,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasOtherShowings = item.Total_Screenings > 1;
  const showingDescription = otherShowingsBlocked
    ? "All other screenings conflict with your plan"
    : "Other screenings are available";
  const selectedOtherDescription = selectedOtherShowing
    ? `Another showing is in your plan: ${clockLabel(selectedOtherShowing.start_offset_minutes)} at ${selectedOtherShowing.location || selectedOtherShowing.venue}`
    : "";
  const blockTitle = [title, selectedOtherDescription].filter(Boolean).join(" · ");
  const content = (
    <>
      <span className="screening-time">
        {clockLabel(item.start_offset_minutes)}
        {item.end_offset_minutes != null &&
          item.end_offset_minutes !== "" &&
          `–${clockLabel(item.end_offset_minutes)}`}
      </span>
      <strong className="screening-title">{item.name}</strong>
      {subtitle && (
        <span className="screening-subtitle">{subtitle}</span>
      )}
      {!item.location && (
        <span className={`screening-venue ${compact && (selected || conflict) ? "has-plan-state" : ""}`}>
          {shortVenue(item.venue)}
        </span>
      )}
      {compact && selected && (
        <span className="export-state-mark is-selected" aria-label="Selected" title="Selected">
          <Check size={9} />
        </span>
      )}
      {compact && conflict && (
        <span className="export-state-mark is-conflict" aria-label="Conflicts with your plan" title="Conflict">
          ×
        </span>
      )}
      {item.end_offset_minutes == null && <span className="screening-unknown"></span>}
      {hasOtherShowings && (
        <span
          className={`second-showing ${otherShowingsBlocked ? "is-ruled-out" : ""} ${selectedOtherShowing ? "has-selected-alternate" : ""}`}
          aria-label={`${item.Total_Screenings} screenings total. ${selectedOtherDescription || showingDescription}`}
          title={`${item.Total_Screenings} screenings total. ${selectedOtherDescription || showingDescription}`}
        >
          {item.Total_Screenings}
          {selectedOtherShowing && <Check size={9} aria-hidden="true" />}
          {otherShowingsBlocked && <X size={9} aria-hidden="true" />}
        </span>
      )}
    </>
  );

  if (compact) {
    return (
      <div className={className} style={style} title={blockTitle}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      title={blockTitle}
      aria-pressed={selected}
      aria-disabled={Boolean(conflict)}
      aria-label={`${item.name}${item.director ? `, directed by ${item.director}` : ""}, ${item.location || item.venue}, ${timeRange(item)}${conflict ? `, ${blockedDescription}` : ""}${selectedOtherDescription ? `, ${selectedOtherDescription}` : ""}`}
      onClick={(event) => onSelect(item, event.currentTarget)}
      onMouseEnter={(event) => onPreviewEnter(item, event.currentTarget)}
      onMouseLeave={() => onPreviewLeave("trigger")}
      onFocus={(event) => onPreviewEnter(item, event.currentTarget)}
      onBlur={() => onPreviewLeave("trigger")}
    >
      {content}
    </button>
  );
}

function TimeAxis({ compact, minuteWidth, trackWidth }) {
  const ticks = [];
  for (let minute = DAY_START; minute < DAY_END; minute += 120) {
    ticks.push(
      <span
        className="time-tick"
        key={minute}
        style={{ left: `${(minute - DAY_START) * minuteWidth}px` }}
      >
        {clockLabel(minute)}
      </span>,
    );
  }
  return (
    <div className={`time-axis ${compact ? "is-compact" : ""}`}>
      <span className="axis-venue">VENUE</span>
      <div
        className="axis-track"
        style={{
          width: trackWidth,
          "--tick-width": `${minuteWidth * 120}px`,
        }}
      >
        {ticks}
      </div>
    </div>
  );
}

function ScheduleDay({
  date,
  items,
  status,
  onSelect,
  onPreviewEnter,
  onPreviewLeave,
  compact = false,
  trackWidth = TRACK_WIDTH,
  minuteWidth = MINUTE_WIDTH,
}) {
  const dayItems = items.filter((item) => item.date === date);
  const filtered = compact ? dayItems : items;
  const venues = VENUE_ORDER.filter((venue) => filtered.some((item) => item.venue === venue));
  return (
    <section className={`schedule-day ${compact ? "is-compact export-day" : ""}`}>
      {compact && (
        <header className="export-day-heading">
          <span>{dateLabel(date, { weekday: "short" }).toUpperCase()}</span>
          <h2>{dateLabel(date, { month: "short", day: "numeric" })}</h2>
          <div className="export-status-key">
            <span><i className="is-selected"><Check size={8} /></i> SELECTED</span>
            <span><i className="is-conflict">×</i> CONFLICT</span>
          </div>
          <span className="export-entry-count">{dayItems.length} screenings &amp; events</span>
        </header>
      )}
      <div
        className="schedule-table"
        style={{
          "--track-width": `${trackWidth}px`,
          "--tick-width": `${minuteWidth * 120}px`,
        }}
      >
        <TimeAxis compact={compact} minuteWidth={minuteWidth} trackWidth={trackWidth} />
        {venues.map((venue) => {
          const venueItems = filtered.filter((item) => item.venue === venue);
          const { placements, laneCount } = assignTracks(venueItems);
          return (
            <div className="venue-row" key={`${date}-${venue}`} style={{ "--row-height": `${laneCount * LANE_HEIGHT + 2}px` }}>
              <div className={`venue-name ${venue.startsWith("Film Society") ? "" : "is-single"}`}>
                {venue.startsWith("Film Society") ? (
                  <>
                    <span>FILM SOCIETY</span>
                    <strong>{shortVenue(venue).toUpperCase()}</strong>
                  </>
                ) : (
                  <strong>{venue.toUpperCase()}</strong>
                )}
              </div>
              <div className="venue-track">
                {placements.map(({ item, lane }) => (
                  <ScreeningBlock
                    key={item.id}
                    item={item}
                    lane={lane}
                    selected={status.selectedIds.has(item.id)}
                    conflict={status.blockedBy.get(item.id)}
                    selectedOtherShowing={status.selectedOtherShowings.get(item.id)}
                    otherShowingsBlocked={status.otherShowingsBlockedIds.has(item.id)}
                    onSelect={onSelect}
                    onPreviewEnter={onPreviewEnter}
                    onPreviewLeave={onPreviewLeave}
                    compact={compact}
                    minuteWidth={minuteWidth}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function App() {
  const [activeDate, setActiveDate] = useState(allDates[0]);
  const [query, setQuery] = useState("");
  const [selectedTheaters, setSelectedTheaters] = useState(
    () => new Set(THEATERS.map((theater) => theater.id)),
  );
  const [selectedIds, setSelectedIds] = useState(() => {
    const sharedSelection = sharedSelectionFromUrl();
    if (sharedSelection !== null) return sharedSelection;
    try {
      const stored = JSON.parse(localStorage.getItem("pff35-selected-screenings") ?? "[]");
      const validIds = new Set(schedule.map((item) => item.id));
      return new Set(stored.filter((id) => validIds.has(id)));
    } catch {
      return new Set();
    }
  });
  const [notice, setNotice] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [filmPreview, setFilmPreview] = useState(null);
  const [categoryPreviewCount, setCategoryPreviewCount] = useState(4);
  const [scheduleTrackWidth, setScheduleTrackWidth] = useState(TRACK_WIDTH);
  const exportRef = useRef(null);
  const scheduleScrollRef = useRef(null);
  const mobilePreviewTargetRef = useRef(null);
  const categoryPreviewRef = useRef(null);
  const categoryMeasureRef = useRef(null);
  const categoryOverflowMeasureRef = useRef(null);
  const previewCloseTimer = useRef(null);
  const previewHover = useRef({ trigger: false, preview: false });
  const previewPinned = useRef(false);

  useEffect(
    () => () => window.clearTimeout(previewCloseTimer.current),
    [],
  );

  useEffect(() => {
    function dismissPreview(event) {
      if (event.key === "Escape") {
        window.clearTimeout(previewCloseTimer.current);
        previewHover.current = { trigger: false, preview: false };
        previewPinned.current = false;
        mobilePreviewTargetRef.current = null;
        setFilmPreview(null);
      }
    }
    window.addEventListener("keydown", dismissPreview);
    return () => window.removeEventListener("keydown", dismissPreview);
  }, []);

  useEffect(() => {
    if (!filmPreview) return undefined;
    function dismissPreview() {
      window.clearTimeout(previewCloseTimer.current);
      previewHover.current = { trigger: false, preview: false };
      previewPinned.current = false;
      mobilePreviewTargetRef.current = null;
      setFilmPreview(null);
    }
    function dismissOutside(event) {
      if (
        !filmPreview.pinned ||
        (event.target instanceof Element && event.target.closest(".film-preview"))
      ) {
        return;
      }
      window.clearTimeout(previewCloseTimer.current);
      previewHover.current = { trigger: false, preview: false };
      previewPinned.current = false;
      mobilePreviewTargetRef.current = null;
      setFilmPreview(null);
    }
    window.addEventListener("resize", dismissPreview);
    window.addEventListener("click", dismissOutside, true);
    return () => {
      window.removeEventListener("resize", dismissPreview);
      window.removeEventListener("click", dismissOutside, true);
    };
  }, [filmPreview]);

  useLayoutEffect(() => {
    const target = mobilePreviewTargetRef.current;
    if (!filmPreview?.pinned || !target) return undefined;

    const preview = document.querySelector(".film-preview.is-mobile-preview");
    if (!target.isConnected || !preview) return undefined;

    const gap = 20;
    const targetRect = target.getBoundingClientRect();
    const scrollDelta = targetRect.bottom + gap - preview.getBoundingClientRect().top;
    if (Math.abs(scrollDelta) < 2) return undefined;

    if (scrollDelta < 0 && window.scrollY < -scrollDelta) {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const targetBottomAtPageTop = targetRect.bottom + window.scrollY;
      const targetPreviewTop = targetBottomAtPageTop + gap;
      const currentPreviewTop = preview.getBoundingClientRect().top;
      const expandedHeight = Math.min(
        96,
        Math.max(
          filmPreview.previewHeight ?? 45,
          (filmPreview.previewHeight ?? 45) +
            ((currentPreviewTop - targetPreviewTop) / viewportHeight) * 100,
        ),
      );
      if (expandedHeight > (filmPreview.previewHeight ?? 45) + 0.5) {
        setFilmPreview((current) =>
          current?.pinned
            ? { ...current, previewHeight: expandedHeight }
            : current,
        );
        return undefined;
      }
    }

    window.scrollBy({
      top: scrollDelta,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    return undefined;
  }, [filmPreview]);

  useEffect(() => {
    localStorage.setItem("pff35-selected-screenings", JSON.stringify([...selectedIds]));
  }, [selectedIds]);

  const selected = schedule.filter((item) => selectedIds.has(item.id));
  const selectedOtherShowings = new Map();
  for (const item of schedule) {
    const selectedShowing = item.Other_Screenings
      .map((id) => scheduleById.get(id))
      .find((showing) => showing && selectedIds.has(showing.id));
    if (selectedShowing) selectedOtherShowings.set(item.id, selectedShowing);
  }
  const blockedBy = new Map();
  for (const item of schedule) {
    if (selectedIds.has(item.id)) continue;
    const conflict = selected.find((choice) => intervalsOverlap(item, choice));
    if (conflict) blockedBy.set(item.id, conflict);
  }
  const otherShowingsBlockedIds = new Set();
  for (const item of schedule) {
    if (
      item.Other_Screenings.length > 0 &&
      item.Other_Screenings.every((id) => blockedBy.has(id))
    ) {
      otherShowingsBlockedIds.add(item.id);
    }
  }
  const planStatus = {
    selectedIds,
    selected,
    blockedBy,
    selectedOtherShowings,
    otherShowingsBlockedIds,
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesFilters = (item) => {
    const theater = theaterForVenue(item.venue);
    return (
      (!normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery)) &&
      (theater === null || selectedTheaters.has(theater))
    );
  };
  const matchingDates = new Set(schedule.filter(matchesFilters).map((item) => item.date));
  const visibleItems = schedule.filter(
    (item) => item.date === activeDate && matchesFilters(item),
  );
  const daySelectedCount = selected.filter((item) => item.date === activeDate).length;
  const activeIndex = allDates.indexOf(activeDate);

  function showFilmPreview(item, target) {
    window.clearTimeout(previewCloseTimer.current);
    if (previewPinned.current) return;
    if (!item.description && !item.director && !item.location && !item.image_url) return;
    previewHover.current.trigger = true;
    setFilmPreview({ item, position: filmPreviewPosition(target) });
  }

  function enterFilmPreview() {
    window.clearTimeout(previewCloseTimer.current);
    previewHover.current.preview = true;
  }

  function schedulePreviewClose(area) {
    if (previewPinned.current) return;
    previewHover.current[area] = false;
    window.clearTimeout(previewCloseTimer.current);
    previewCloseTimer.current = window.setTimeout(() => {
      if (!previewHover.current.trigger && !previewHover.current.preview) {
        setFilmPreview(null);
      }
    }, 150);
  }

  function toggleTheater(theaterId) {
    setSelectedTheaters((previous) => {
      const next = new Set(previous);
      if (next.has(theaterId)) next.delete(theaterId);
      else next.add(theaterId);
      return next;
    });
  }

  function toggleSelection(item) {
    if (blockedBy.has(item.id)) {
      setNotice(`${item.name} overlaps a selected screening.`);
      return;
    }
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    setNotice("");
  }

  function handleScreeningClick(item, target) {
    if (window.matchMedia("(max-width: 620px), (pointer: coarse)").matches) {
      window.clearTimeout(previewCloseTimer.current);
      previewHover.current = { trigger: false, preview: false };
      previewPinned.current = true;
      mobilePreviewTargetRef.current = target;
      setFilmPreview({ item, pinned: true, previewHeight: 45 });
      return;
    }
    toggleSelection(item);
  }

  function closeFilmPreview() {
    window.clearTimeout(previewCloseTimer.current);
    previewHover.current = { trigger: false, preview: false };
    previewPinned.current = false;
    mobilePreviewTargetRef.current = null;
    setFilmPreview(null);
  }

  function confirmFilmPreview() {
    if (!filmPreview) return;
    toggleSelection(filmPreview.item);
    closeFilmPreview();
  }

  function clearPlan() {
    setSelectedIds(new Set());
    setNotice("Plan cleared.");
  }

  async function downloadSchedule() {
    if (!exportRef.current || isExporting) return;
    setIsExporting(true);
    setNotice("Preparing the 11-page schedule PDF…");
    try {
      await document.fonts.ready;
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);
      const pages = [...exportRef.current.querySelectorAll(".export-day")];
      if (pages.length !== allDates.length) {
        throw new Error(`Expected ${allDates.length} date pages, found ${pages.length}`);
      }
      let pdf;
      for (const [index, page] of pages.entries()) {
        const image = await toPng(page, {
          backgroundColor: "#f2f4ef",
          cacheBust: true,
          pixelRatio: 1,
        });
        const width = page.scrollWidth * 0.75;
        const height = page.scrollHeight * 0.75;
        const pageSize = [width, height];
        if (index === 0) {
          pdf = new jsPDF({
            orientation: "landscape",
            unit: "pt",
            format: pageSize,
            compress: true,
          });
        } else {
          pdf.addPage(pageSize, "landscape");
        }
        pdf.addImage(image, "PNG", 0, 0, width, height, undefined, "FAST");
      }
      pdf.save("PFF35-personal-schedule.pdf");
      setNotice("11-page schedule PDF downloaded.");
    } catch (error) {
      console.error(error);
      setNotice("PDF export failed. Try again after the schedule finishes loading.");
    } finally {
      setIsExporting(false);
    }
  }

  async function shareSchedule() {
    const url = new URL(window.location.href);
    url.searchParams.set("plan", [...selectedIds].sort().join(","));

    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice("Share link copied to clipboard.");
    } catch (error) {
      console.error(error);
      setNotice("Could not copy the share link. Check clipboard permissions and try again.");
    }
  }

  const categories = [...new Set(schedule.map((item) => item.category).filter(Boolean))].sort();
  const categoryKey = categories.join("|");

  useLayoutEffect(() => {
    const preview = categoryPreviewRef.current;
    const measure = categoryMeasureRef.current;
    const overflowMeasure = categoryOverflowMeasureRef.current;
    if (!preview || !measure || !overflowMeasure) return undefined;

    function updatePreviewCount() {
      const items = [...measure.children];
      const widths = items.map((item) => item.getBoundingClientRect().width);
      const gap = Number.parseFloat(getComputedStyle(preview).columnGap) || 0;
      const availableWidth = preview.clientWidth;
      let visibleCount = 0;

      for (let count = categories.length; count >= 0; count -= 1) {
        const hiddenCount = categories.length - count;
        overflowMeasure.textContent = hiddenCount > 0 ? `+${hiddenCount}` : "";
        const itemsWidth = widths
          .slice(0, count)
          .reduce((total, width) => total + width, 0);
        const gapsWidth = Math.max(0, count - 1) * gap;
        const overflowWidth = hiddenCount > 0
          ? (count > 0 ? gap : 0) + overflowMeasure.getBoundingClientRect().width
          : 0;

        if (itemsWidth + gapsWidth + overflowWidth <= availableWidth) {
          visibleCount = count;
          break;
        }
      }

      setCategoryPreviewCount(visibleCount);
    }

    const observer = new ResizeObserver(updatePreviewCount);
    observer.observe(preview);
    updatePreviewCount();
    return () => observer.disconnect();
  }, [categoryKey]);

  useLayoutEffect(() => {
    const scrollElement = scheduleScrollRef.current;
    if (!scrollElement) return undefined;

    function updateTrackWidth() {
      const venueWidth =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--venue-width"),
        ) || 152;
      setScheduleTrackWidth(
        Math.max(TRACK_WIDTH, scrollElement.clientWidth - venueWidth),
      );
    }

    const observer = new ResizeObserver(updateTrackWidth);
    observer.observe(scrollElement);
    window.addEventListener("resize", updateTrackWidth);
    updateTrackWidth();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTrackWidth);
    };
  }, []);

  return (
    <main
      className={`app-shell ${filmPreview?.pinned ? "has-mobile-preview" : ""}`}
      style={
        filmPreview?.pinned
          ? { "--mobile-preview-height": `${filmPreview.previewHeight ?? 45}dvh` }
          : undefined
      }
    >
      <div className="mobile-sticky-header">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-stamp" aria-label="Philadelphia Film Festival 35">
              <span>PFF</span>
              <strong>35</strong>
            </div>
            <div>
              <p className="eyebrow">Philadelphia Film Festival</p>
              <h1>Build Your Schedule</h1>
            </div>
          </div>
          <div className="top-actions">
            <div className="selection-counter" aria-live="polite">
              <span className="counter-mark"><Check size={14} /></span>
              <strong>{selected.length}</strong>
              <span>selected</span>
            </div>
            <button className="clear-button" type="button" onClick={clearPlan} disabled={!selected.length} title="Clear all selections">
              <X size={16} />
              <span>Clear</span>
            </button>
            <button className="share-button" type="button" onClick={shareSchedule} disabled={!selected.length}>
              <Share2 size={16} />
              <span>Share</span>
            </button>
            <button className="download-button" type="button" onClick={downloadSchedule} disabled={isExporting}>
              <Download size={17} />
              <span>{isExporting ? "Preparing PDF…" : "Download schedule PDF"}</span>
            </button>
          </div>
        </header>

        <section className="date-section" aria-label="Festival dates">
          <div className="date-section-heading">
            <div className="section-kicker"><CalendarDays size={15} /> OCTOBER 15–25, 2026</div>
            <div className="date-arrows">
              <button type="button" aria-label="Previous day" onClick={() => setActiveDate(allDates[Math.max(0, activeIndex - 1)])} disabled={activeIndex === 0}>
                <ChevronLeft size={17} />
              </button>
              <button type="button" aria-label="Next day" onClick={() => setActiveDate(allDates[Math.min(allDates.length - 1, activeIndex + 1)])} disabled={activeIndex === allDates.length - 1}>
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <nav className="date-tabs" aria-label="Select festival date">
            {allDates.map((date) => {
              const isActive = date === activeDate;
              const hasMatches = matchingDates.has(date);
              const count = selected.filter((item) => item.date === date).length;
              return (
                <button
                  className={`date-tab ${isActive ? "is-active" : ""} ${hasMatches ? "" : "has-no-matches"}`}
                  type="button"
                  key={date}
                  aria-current={isActive ? "date" : undefined}
                  aria-label={`${dateLabel(date)}${hasMatches ? "" : ", no search matches"}`}
                  title={hasMatches ? undefined : "No screenings match your search"}
                  onClick={() => setActiveDate(date)}
                >
                  <span>{dateLabel(date, { weekday: "short" }).toUpperCase()}</span>
                  <strong>{date.slice(8)}</strong>
                  <i className={count ? "has-selections" : ""} aria-label={count ? `${count} selected` : undefined} />
                </button>
              );
            })}
          </nav>
        </section>

      <section className="day-toolbar">
        <div className="day-heading">
          <p className="eyebrow">DAY {String(activeIndex + 1).padStart(2, "0")} / 11 · {daySelectedCount} SELECTED TODAY</p>
          <h2>{dateLabel(activeDate)}</h2>
        </div>
        <div className="schedule-filters">
          <label className="search-box">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a film"
              aria-label="Find a film"
            />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}
          </label>
          <details className="theater-filter">
            <summary aria-label={`Filter theaters, ${selectedTheaters.size} of ${THEATERS.length} selected`}>
              <SlidersHorizontal size={15} />
              <span>Theaters</span>
              <strong>{selectedTheaters.size}/{THEATERS.length}</strong>
            </summary>
            <div className="theater-filter-menu" role="group" aria-label="Show screenings at">
              <span className="theater-filter-heading">Show screenings at</span>
              {THEATERS.map((theater) => (
                <label key={theater.id}>
                  <input
                    type="checkbox"
                    checked={selectedTheaters.has(theater.id)}
                    onChange={() => toggleTheater(theater.id)}
                  />
                  <span>{theater.label}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
      </section>
      </div>

      <details className="category-key" aria-label="Film categories">
        <summary className="category-key-toggle">
          <span className="key-heading">CATEGORY KEY</span>
          <span className="category-key-preview" ref={categoryPreviewRef}>
            {categories.slice(0, categoryPreviewCount).map((category) => (
              <span className="category-key-preview-item" key={category} title={category}>
                <i style={{ background: CATEGORY_COLORS[category]?.[0] ?? "#98a19e" }} />
                <span>{category}</span>
              </span>
            ))}
            {categoryPreviewCount < categories.length && (
              <span className="category-key-overflow">
                +{categories.length - categoryPreviewCount}
              </span>
            )}
            <span className="category-key-measure" ref={categoryMeasureRef} aria-hidden="true">
              {categories.map((category) => (
                <span className="category-key-preview-item" key={category}>
                  <i style={{ background: CATEGORY_COLORS[category]?.[0] ?? "#98a19e" }} />
                  <span>{category}</span>
                </span>
              ))}
            </span>
            <span
              className="category-key-overflow category-key-overflow-measure"
              ref={categoryOverflowMeasureRef}
              aria-hidden="true"
            />
          </span>
          <span className="category-key-count">{categories.length} categories</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="category-list">
          {categories.map((category) => (
            <span className="key-item" key={category}>
              <i style={{ background: CATEGORY_COLORS[category]?.[0] ?? "#98a19e" }} />
              {category}
            </span>
          ))}
        </div>
      </details>

      <div className="schedule-frame">
        <div className="scroll-cue">← SCROLL TO VIEW LATE SHOWS →</div>
        <div className="schedule-scroll" ref={scheduleScrollRef}>
          <ScheduleDay
            date={activeDate}
            items={visibleItems}
            status={planStatus}
            onSelect={handleScreeningClick}
            onPreviewEnter={showFilmPreview}
            onPreviewLeave={schedulePreviewClose}
            trackWidth={scheduleTrackWidth}
            minuteWidth={scheduleTrackWidth / (DAY_END - DAY_START)}
          />
          {visibleItems.length === 0 && <p className="empty-state">No screenings match that search.</p>}
        </div>
      </div>

      {filmPreview && (
        createPortal(
          <FilmPreview
            item={filmPreview.item}
            position={filmPreview.position}
            pinned={filmPreview.pinned}
            previewHeight={filmPreview.previewHeight}
            selected={selectedIds.has(filmPreview.item.id)}
            conflict={blockedBy.get(filmPreview.item.id)}
            onConfirm={confirmFilmPreview}
            onClose={closeFilmPreview}
            onMouseEnter={enterFilmPreview}
            onMouseLeave={() => schedulePreviewClose("preview")}
          />,
          document.body,
        )
      )}

      <footer className="app-footer">
        <div className="footer-meta">
          <p>{notice || "Times shown in Eastern Daylight Time (EDT)"}</p>
          <div className="footer-credit">
            <a
              className="github-link"
              href="https://github.com/theinvisiblesherpa/FilmFestScheduler"
              target="_blank"
              rel="noreferrer"
              aria-label="FilmFestScheduler on GitHub"
              title="View this project on GitHub"
            >
              <Github size={15} aria-hidden="true" />
            </a>
            <span>by Jam Heinlein</span>
          </div>
        </div>
        <p className="footer-disclaimer">
          DISCLAIMER: This applicaiton is NOT affiliated with the Philadelphia Film Society and is purely created to assist patrons
        </p>
      </footer>

      <div className="export-stage" aria-hidden="true">
        <div className="export-sheet" ref={exportRef}>
          <header className="export-heading">
            <div className="export-mark">PFF<span>35</span></div>
            <div>
              <p>PHILADELPHIA FILM FESTIVAL</p>
              <h1>Personal screening schedule</h1>
            </div>
            <div className="export-date">OCT 15—25<br />2026</div>
          </header>
          {allDates.map((date) => (
            <ScheduleDay
              key={date}
              date={date}
              items={schedule}
              status={planStatus}
              onSelect={toggleSelection}
              compact
            />
          ))}
          <footer className="export-footer">PFF35 · PERSONAL SCHEDULE · TIMES LOCAL</footer>
        </div>
      </div>
    </main>
  );
}

export default App;