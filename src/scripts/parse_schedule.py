"""Extract PFF35 schedule occurrences from the source PDF.

Run with: uv run --no-project --with pymupdf python scripts/parse_schedule.py
"""

from __future__ import annotations

import argparse
import collections
import json
import math
import re
import uuid
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT / "SourceData/PFF35-Schedule-Grid (1) (1).pdf"
DEFAULT_JSON = ROOT / "SourceData/PFF35-Schedule.json"
FILM_METADATA_JSON = ROOT / "SourceData/PFF35-FilmMetadata.json"

CATEGORY_LABELS = {
    "AFTER HOURS": "After Hours",
    "CENTERPIECES": "Centerpieces",
    "CINEMA DE FRANCE": "Cinema de France",
    "COMMUNITY SCREENINGS": "Community Screenings",
    "FILMADELPHIA": "Filmadelphia",
    "FROM THE VAULTS": "From the Vaults",
    "MADE IN USA": "Made in USA",
    "MASTERS OF CINEMA": "Masters of Cinema",
    "NON/FICTION": "Non/Fiction",
    "SIGHT & SOUNDTRACK": "Sight & Soundtrack",
    "SPOTLIGHTS": "Spotlights",
    "STATE OF THE UNION": "State of the Union",
    "THIS ANIMATED LIFE": "This Animated Life",
    "WORLD VIEW": "World View",
}

TIME_PATTERN = re.compile(r"(?<!\d)(\d{1,2}:\d{2})\s*•\s*")
RUNTIME_PATTERN = re.compile(r"\(\s*(\d+)\s*min\b", re.IGNORECASE)
DATE_PATTERN = re.compile(
    r"(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+10\.(\d{2})"
)


def read_category_swatches(page: pymupdf.Page) -> list[tuple[tuple[float, ...], str]]:
    swatches = []
    drawings = page.get_drawings()
    for block in page.get_text("blocks"):
        label = " ".join(block[4].split()).upper()
        if label not in CATEGORY_LABELS:
            continue
        label_y = (block[1] + block[3]) / 2
        candidates = [
            (
                abs((drawing["rect"].y0 + drawing["rect"].y1) / 2 - label_y),
                drawing["fill"],
            )
            for drawing in drawings
            if drawing.get("fill") is not None
            and drawing["rect"].width < 20
            and drawing["rect"].height < 20
            and abs((drawing["rect"].y0 + drawing["rect"].y1) / 2 - label_y) < 2
            and 0 < block[0] - drawing["rect"].x1 < 12
        ]
        if candidates:
            color = min(candidates, key=lambda item: item[0])[1]
            swatches.append((tuple(color), CATEGORY_LABELS[label]))
    if len(swatches) != len(CATEGORY_LABELS):
        raise ValueError(
            f"Expected {len(CATEGORY_LABELS)} category swatches; found {len(swatches)}"
        )
    return swatches


def category_for_color(
    fill: tuple[float, ...] | None,
    swatches: list[tuple[tuple[float, ...], str]],
) -> str | None:
    if fill is None:
        return None
    distance, category = min((math.dist(fill, color), name) for color, name in swatches)
    return category if distance < 0.02 else None


def film_venue(text: str) -> str | None:
    match = re.search(
        r"FILM SOCIETY\s+(EAST A|EAST B|BOURSE 1|BOURSE 2|BOURSE 3|CENTER)\b",
        " ".join(text.upper().split()),
    )
    return "Film Society " + match.group(1).title() if match else None


def category_override(name: str, extracted: str | None) -> str | None:
    upper_name = name.upper()
    if upper_name == "SEIZED":
        return "State of the Union"
    if upper_name == "WRITTEN ON THE WIND":
        return "From the Vaults"
    if "SHORTS PROGRAM" in upper_name:
        return "Shorts Programs"
    return extracted


def extract_entries(pdf_path: Path, swatches: list[tuple[tuple[float, ...], str]]) -> list[dict]:
    document = pymupdf.open(pdf_path)
    entries = []
    sequence = 0

    for page_index in (1, 2, 3):
        page = document[page_index]
        blocks = page.get_text("blocks")
        date_bands = []
        venue_rows = []

        for block in blocks:
            text = " ".join(block[4].split())
            upper_text = text.upper()
            center_y = (block[1] + block[3]) / 2
            date_match = DATE_PATTERN.fullmatch(upper_text)
            if date_match:
                date_bands.append((center_y, f"2026-10-{date_match.group(1)}"))
            elif block[0] <= 130:
                venue = film_venue(text)
                if venue:
                    venue_rows.append((center_y, venue))
                elif re.match(r"^EVENTS\b", upper_text):
                    venue_rows.append((center_y, "Events"))
                elif re.match(r"^PANELS\b", upper_text):
                    venue_rows.append((center_y, "Panels"))

        if not date_bands:
            raise ValueError(f"No left-side date labels found on PDF page {page_index + 1}")

        fills = [
            (drawing["rect"], drawing.get("fill"))
            for drawing in page.get_drawings()
            if drawing.get("fill") is not None
        ]

        for block in blocks:
            text = block[4]
            starts = list(TIME_PATTERN.finditer(text))
            if not starts:
                continue

            center_y = (block[1] + block[3]) / 2
            date = min(date_bands, key=lambda band: abs(band[0] - center_y))[1]
            prefix = " ".join(text[: starts[0].start()].split()).upper()
            if re.match(r"^EVENTS\b", prefix):
                venue = "Events"
            elif re.match(r"^PANELS\b", prefix):
                venue = "Panels"
            elif venue_rows:
                venue = min(venue_rows, key=lambda row: abs(row[0] - center_y))[1]
            else:
                raise ValueError(f"No left-side venue label found on PDF page {page_index + 1}")

            center_x = (block[0] + block[2]) / 2
            matching_fills = []
            for rect, fill in fills:
                if rect.x0 <= center_x <= rect.x1 and rect.y0 <= center_y <= rect.y1:
                    category = category_for_color(fill, swatches)
                    if category:
                        matching_fills.append((rect.width * rect.height, category))
            extracted_category = min(matching_fills, default=(None, None))[1]

            for item_index, match in enumerate(starts):
                stop = starts[item_index + 1].start() if item_index + 1 < len(starts) else len(text)
                segment = text[match.end() : stop]
                runtime_match = RUNTIME_PATTERN.search(segment)
                title = segment[: runtime_match.start()] if runtime_match else segment
                name = " ".join(title.split()).strip(" •\t\r\n")
                if not name:
                    continue
                runtime = int(runtime_match.group(1)) if runtime_match else None
                entries.append(
                    {
                        "name": name,
                        "date": date,
                        "start_time": None,
                        "start_time_as_printed": match.group(1),
                        "end_time": None,
                        "run_time_minutes": runtime,
                        "category": category_override(name, extracted_category),
                        "venue": venue,
                        "_source_x": block[0] + item_index * 0.001,
                        "_sequence": sequence,
                    }
                )
                sequence += 1

    add_fresh_air(entries, sequence)
    infer_times(entries)
    return entries


def add_fresh_air(entries: list[dict], sequence: int) -> None:
    center_screenings = [
        entry
        for entry in entries
        if entry["date"] == "2026-10-25"
        and entry["venue"] == "Film Society Center"
    ]
    earlier = next(
        (entry for entry in center_screenings if entry["start_time_as_printed"] == "2:00"),
        None,
    )
    later = next(
        (entry for entry in center_screenings if entry["start_time_as_printed"] == "7:30"),
        None,
    )
    if earlier is None or later is None or earlier["_source_x"] >= later["_source_x"]:
        raise ValueError("Could not position the added Fresh Air screening in the Sunday Center row")
    entries.append(
        {
            "name": "Fresh Air",
            "date": "2026-10-25",
            "start_time": None,
            "start_time_as_printed": "5:45",
            "end_time": None,
            "run_time_minutes": 60,
            "category": "Events",
            "venue": "Film Society Center",
            "_source_x": (earlier["_source_x"] + later["_source_x"]) / 2,
            "_sequence": sequence,
        }
    )


def infer_times(entries: list[dict]) -> None:
    rows = collections.defaultdict(list)
    for entry in entries:
        rows[(entry["date"], entry["venue"])].append(entry)

    for row in rows.values():
        row.sort(key=lambda entry: (entry["_source_x"], entry["_sequence"]))
        previous_start = None
        for index, entry in enumerate(row):
            hour, minute = map(int, entry["start_time_as_printed"].split(":"))
            name = entry["name"].upper()
            if index == 0:
                if hour == 12:
                    start = 12 * 60 + minute
                elif 9 <= hour <= 11 and not (
                    entry["venue"] == "Events" and "PARTY" in name
                ):
                    start = hour * 60 + minute
                else:
                    start = (hour % 12 + 12) * 60 + minute
            else:
                clock_hours = (0, 12) if hour == 12 else (hour % 12, hour % 12 + 12)
                lower_bound = previous_start + 1
                possibilities = [
                    day * 1440 + clock_hour * 60 + minute
                    for day in range(3)
                    for clock_hour in clock_hours
                    if day * 1440 + clock_hour * 60 + minute >= lower_bound
                ]
                if not possibilities:
                    raise ValueError(f"Could not infer ascending start time for {entry['name']}")
                start = min(possibilities)

            entry["_start_absolute"] = start
            entry["start_offset_minutes"] = start
            entry["start_time"] = f"{(start % 1440) // 60:02d}:{start % 60:02d}"
            runtime = entry["run_time_minutes"]
            if runtime is not None:
                end = start + runtime
                entry["end_offset_minutes"] = end
                entry["end_time"] = f"{(end % 1440) // 60:02d}:{end % 60:02d}"
            else:
                entry["end_offset_minutes"] = None
            previous_start = start


def link_screenings(
    entries: list[dict],
    film_metadata: dict[str, dict[str, str | None]],
) -> None:
    screenings_by_title = collections.defaultdict(list)
    for entry in entries:
        title_key = " ".join(entry["name"].casefold().split())
        canonical_title = film_metadata.get(entry["name"], {}).get(
            "canonical_title", entry["name"]
        )
        group_key = " ".join(canonical_title.casefold().split())
        identity = "|".join(
            (
                "pff35-screening",
                entry["date"],
                entry["venue"],
                entry["start_time"],
                title_key,
            )
        )
        entry["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, identity))
        screenings_by_title[group_key].append(entry["id"])

    identifiers = [entry["id"] for entry in entries]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Screening UUIDs are not unique")

    for entry in entries:
        canonical_title = film_metadata.get(entry["name"], {}).get(
            "canonical_title", entry["name"]
        )
        group_key = " ".join(canonical_title.casefold().split())
        matching_ids = screenings_by_title[group_key]
        entry["Total_Screenings"] = len(matching_ids)
        entry["Other_Screenings"] = [
            identifier for identifier in matching_ids if identifier != entry["id"]
        ]


def load_film_metadata() -> dict[str, dict[str, str | None]]:
    records = json.loads(FILM_METADATA_JSON.read_text(encoding="utf-8"))
    metadata = {}
    for record in records:
        film_metadata = {
            "canonical_title": record.get("canonical_title", record["name"]),
            "description": record["description"],
            "director": record["director"],
            "image_url": record["image_url"],
            "image_url_2x": record["image_url_2x"],
        }
        for name in (record["name"], *record.get("aliases", [])):
            if name in metadata:
                raise ValueError(f"Duplicate film metadata for {name}")
            metadata[name] = film_metadata
    return metadata


def build_schedule(pdf_path: Path) -> list[dict]:
    document = pymupdf.open(pdf_path)
    swatches = read_category_swatches(document[3])
    entries = extract_entries(pdf_path, swatches)
    entries.sort(key=lambda entry: (entry["date"], entry["_start_absolute"], entry["_sequence"]))
    film_metadata = load_film_metadata()
    for entry in entries:
        metadata = film_metadata.get(entry["name"])
        if (
            entry["run_time_minutes"] is not None
            and entry["name"].casefold() != "fresh air"
            and metadata is None
        ):
            raise ValueError(f"Missing film metadata for {entry['name']}")
        entry["description"] = metadata["description"] if metadata else None
        entry["director"] = metadata["director"] if metadata else None
        entry["image_url"] = metadata["image_url"] if metadata else None
        entry["image_url_2x"] = metadata["image_url_2x"] if metadata else None
    link_screenings(entries, film_metadata)

    required_fields = {
        "id",
        "name",
        "date",
        "start_time",
        "start_time_as_printed",
        "start_offset_minutes",
        "end_time",
        "end_offset_minutes",
        "run_time_minutes",
        "category",
        "venue",
        "description",
        "director",
        "image_url",
        "image_url_2x",
        "Total_Screenings",
        "Other_Screenings",
    }
    result = []
    for entry in entries:
        record = {key: value for key, value in entry.items() if not key.startswith("_")}
        if set(record) != required_fields:
            raise ValueError(f"Unexpected fields in record for {record.get('name')}")
        if not record["name"] or not record["date"] or not record["venue"]:
            raise ValueError("A schedule entry is missing its name, date, or venue")
        if record["run_time_minutes"] is not None and record["end_time"] is None:
            raise ValueError(f"A screening is missing its end time: {record['name']}")
        if (
            record["run_time_minutes"] is not None
            and record["category"] is None
            and record["name"].casefold() != "fresh air"
        ):
            raise ValueError(f"A screening is missing its category: {record['name']}")
        result.append(record)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse the PFF35 screening schedule PDF into JSON.")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="Source schedule PDF")
    parser.add_argument("--output", type=Path, default=DEFAULT_JSON, help="Output JSON path")
    args = parser.parse_args()

    schedule = build_schedule(args.pdf)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(schedule, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    film_count = sum(item["run_time_minutes"] is not None for item in schedule)
    event_count = len(schedule) - film_count
    print(f"Wrote {len(schedule)} entries ({film_count} screenings, {event_count} events/panels) to {args.output}")


if __name__ == "__main__":
    main()