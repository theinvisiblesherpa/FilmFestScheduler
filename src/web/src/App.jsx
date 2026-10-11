import React, { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Github,
  Search,
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

function dateLabel(date, format = { weekday: "long", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { ...format, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function clockLabel(offset) {
  if (offset == null) return "End not listed";
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

function planPosition(item) {
  const start = Math.max(DAY_START, item.start_offset_minutes);
  const naturalEnd = item.end_offset_minutes ?? item.start_offset_minutes + UNTIMED_WIDTH;
  const end = Math.min(DAY_END, naturalEnd);
  return {
    left: (start - DAY_START) * MINUTE_WIDTH,
    width: Math.max(30, (end - start) * MINUTE_WIDTH - 2),
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

function FilmPreview({ item, position, onMouseEnter, onMouseLeave }) {
  return (
    <aside
      className="film-preview"
      role="dialog"
      aria-label={`${item.name} film details`}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        maxHeight: position.maxHeight,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
        {item.director && <p className="film-preview-director">Dir: {item.director}</p>}
        {item.description && <p className="film-preview-description">{item.description}</p>}
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
}) {
  const [background, foreground] = CATEGORY_COLORS[item.category] ?? ["#98a19e", "#111819"];
  const position = planPosition(item);
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
  const title = [
    item.name,
    item.director ? `Director: ${item.director}` : "",
    item.venue,
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
    ? `Another showing is in your plan: ${clockLabel(selectedOtherShowing.start_offset_minutes)} at ${selectedOtherShowing.venue}`
    : "";
  const blockTitle = [title, selectedOtherDescription].filter(Boolean).join(" · ");
  const content = (
    <>
      <span className="screening-time">
        {clockLabel(item.start_offset_minutes)}–{clockLabel(item.end_offset_minutes)}
      </span>
      <strong className="screening-title">{item.name}</strong>
      {item.director && (
        <span className="screening-director">Dir: {item.director}</span>
      )}
      <span className={`screening-venue ${compact && (selected || conflict) ? "has-plan-state" : ""}`}>
        {shortVenue(item.venue)}
      </span>
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
      {item.end_offset_minutes == null && <span className="screening-unknown">END NOT LISTED</span>}
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
      aria-label={`${item.name}${item.director ? `, directed by ${item.director}` : ""}, ${item.venue}, ${timeRange(item)}${conflict ? `, ${blockedDescription}` : ""}${selectedOtherDescription ? `, ${selectedOtherDescription}` : ""}`}
      onClick={() => onSelect(item)}
      onMouseEnter={(event) => onPreviewEnter(item, event.currentTarget)}
      onMouseLeave={() => onPreviewLeave("trigger")}
      onFocus={(event) => onPreviewEnter(item, event.currentTarget)}
      onBlur={() => onPreviewLeave("trigger")}
    >
      {content}
    </button>
  );
}

function TimeAxis({ compact }) {
  const ticks = [];
  for (let minute = DAY_START; minute <= DAY_END; minute += 120) {
    ticks.push(
      <span
        className="time-tick"
        key={minute}
        style={{ left: `${(minute - DAY_START) * MINUTE_WIDTH}px` }}
      >
        {clockLabel(minute)}
      </span>,
    );
  }
  return (
    <div className={`time-axis ${compact ? "is-compact" : ""}`}>
      <span className="axis-venue">VENUE</span>
      <div className="axis-track" style={{ width: TRACK_WIDTH }}>
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
      <div className="schedule-table" style={{ "--track-width": `${TRACK_WIDTH}px` }}>
        <TimeAxis compact={compact} />
        {venues.map((venue) => {
          const venueItems = filtered.filter((item) => item.venue === venue);
          const { placements, laneCount } = assignTracks(venueItems);
          return (
            <div className="venue-row" key={`${date}-${venue}`} style={{ "--row-height": `${laneCount * LANE_HEIGHT + 2}px` }}>
              <div className="venue-name">
                <span>{venue.startsWith("Film Society") ? "FILM SOCIETY" : venue.toUpperCase()}</span>
                {venue.startsWith("Film Society") && <strong>{shortVenue(venue).toUpperCase()}</strong>}
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
  const exportRef = useRef(null);
  const previewCloseTimer = useRef(null);
  const previewHover = useRef({ trigger: false, preview: false });

  useEffect(
    () => () => window.clearTimeout(previewCloseTimer.current),
    [],
  );

  useEffect(() => {
    function dismissPreview(event) {
      if (event.key === "Escape") {
        window.clearTimeout(previewCloseTimer.current);
        previewHover.current = { trigger: false, preview: false };
        setFilmPreview(null);
      }
    }
    window.addEventListener("keydown", dismissPreview);
    return () => window.removeEventListener("keydown", dismissPreview);
  }, []);

  useEffect(() => {
    if (!filmPreview) return undefined;
    function dismissPreview(event) {
      if (event.target instanceof Element && event.target.closest(".film-preview")) {
        return;
      }
      window.clearTimeout(previewCloseTimer.current);
      previewHover.current = { trigger: false, preview: false };
      setFilmPreview(null);
    }
    window.addEventListener("scroll", dismissPreview, true);
    window.addEventListener("resize", dismissPreview);
    return () => {
      window.removeEventListener("scroll", dismissPreview, true);
      window.removeEventListener("resize", dismissPreview);
    };
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
    if (!item.description && !item.director && !item.image_url) return;
    previewHover.current.trigger = true;
    setFilmPreview({ item, position: filmPreviewPosition(target) });
  }

  function enterFilmPreview() {
    window.clearTimeout(previewCloseTimer.current);
    previewHover.current.preview = true;
  }

  function schedulePreviewClose(area) {
    previewHover.current[area] = false;
    window.clearTimeout(previewCloseTimer.current);
    previewCloseTimer.current = window.setTimeout(() => {
      if (!previewHover.current.trigger && !previewHover.current.preview) {
        setFilmPreview(null);
      }
    }, 400);
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

  const categories = [...new Set(schedule.map((item) => item.category).filter(Boolean))].sort();

  return (
    <main className="app-shell">
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
            <fieldset className="theater-filter-menu">
              <legend>Show screenings at</legend>
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
            </fieldset>
          </details>
        </div>
      </section>

      <section className="category-key" aria-label="Film categories">
        <span className="key-heading">CATEGORY KEY</span>
        <div className="category-list">
          {categories.map((category) => (
            <span className="key-item" key={category}>
              <i style={{ background: CATEGORY_COLORS[category]?.[0] ?? "#98a19e" }} />
              {category}
            </span>
          ))}
        </div>
      </section>

      <div className="schedule-frame">
        <div className="scroll-cue">← SCROLL TO VIEW LATE SHOWS →</div>
        <div className="schedule-scroll">
          <ScheduleDay
            date={activeDate}
            items={visibleItems}
            status={planStatus}
            onSelect={toggleSelection}
            onPreviewEnter={showFilmPreview}
            onPreviewLeave={schedulePreviewClose}
          />
          {visibleItems.length === 0 && <p className="empty-state">No screenings match that search.</p>}
        </div>
      </div>

      {filmPreview && (
        <FilmPreview
          item={filmPreview.item}
          position={filmPreview.position}
          onMouseEnter={enterFilmPreview}
          onMouseLeave={() => schedulePreviewClose("preview")}
        />
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
            <span>{schedule.length} scheduled entries</span>
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