#!/usr/bin/env python3
"""Build the synthetic-glucose lookup table from real ShanghaiT2DM CGM readings.

The table is a subset of the public dataset, not a model of it. Each row is
one numeric CGM value whose workbook timestamp falls in a slot's clock-hour
window. Nothing is interpolated, averaged, or clamped.

Source file (downloaded separately; not committed):

  Zhao, Qinpei; Zhu, Jinhao; Wang, Congrong; Rao, Weixiong (2022).
  diabetes_datasets.zip. figshare. Dataset.
  https://doi.org/10.6084/m9.figshare.21600933.v5
  CC BY 4.0. MD5 4bfb61cfa506b48155fd9e841ee48e21.

Described in Zhao et al., Scientific Data 10, 35 (2023),
https://doi.org/10.1038/s41597-023-01940-7.

Only the Shanghai_T2DM workbooks are read (100 patients, 109 files). The
summary sheet and the Shanghai_T1DM folder are ignored. Column 0 is the
recording time and the CGM column (header starts with "CGM") is mg/dL, already
the unit used by this API. Two workbooks label that column "CGM " without the
unit text; their values sit on the same mg/dL scale and are included.

Slot windows are half-open clock hours on the timestamp stored in the
workbook. That timestamp is the local time of the Shanghai recording. It is
not shifted to UTC or to Africa/Nairobi.

  fasting       05:00 <= t < 06:00
  after_lunch   13:00 <= t < 14:00
  after_dinner  19:00 <= t < 20:00

Why these hours, counted from the same workbooks' "Dietary intake" column
(a log is counted when that cell is non-empty on a CGM row):

  Breakfast logs peak in the 07:00 hour (575) and are already common in the
  06:00 hour (321). The 05:00 hour has 44 logs, 41 of them at 05:45-05:59,
  so it is the last hour that is still mostly before breakfast.
  Lunch logs peak in the 11:00 hour (677). 13:00-14:00 starts two hours later.
  Dinner logs peak in the 17:00 hour (640). 19:00-20:00 starts two hours later.

Blank CGM cells are skipped. That is 13 rows in 2029_0_20210526 (the sensor
was changed; the publisher's note says those values are missing) plus empty
trailing rows in a few xlsx files. No replacement value is written for them.

Output rows are ordered by workbook filename, then timestamp, then source row,
so the same zip always produces the same file. The Go generator indexes that
order; a fixed seed only chooses indexes.

Usage, from the repo root:

  pip install openpyxl 'xlrd==1.2.0'
  python3 scripts/extract_shanghait2dm_slots.py /path/to/diabetes_datasets.zip

xlrd 1.2.0 is required because later xlrd releases do not read .xls.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, time
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import xlrd

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip install openpyxl 'xlrd==1.2.0'")

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "src" / "domains" / "glucose" / "synthetic" / "shanghai_t2dm_slots.csv"

# Half-open local clock windows. Keep in sync with the Go slot clock times
# (the synthetic reading is stored at the midpoint of its window).
SLOTS = (
    ("fasting", time(5, 0), time(6, 0)),
    ("after_lunch", time(13, 0), time(14, 0)),
    ("after_dinner", time(19, 0), time(20, 0)),
)

def slot_of(stamp: datetime) -> str | None:
    clock = stamp.time()
    for name, start, end in SLOTS:
        if start <= clock < end:
            return name
    return None


def as_mg_dl(value) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value:  # NaN
        return None
    return Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def as_datetime(value, datemode: int | None) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 20000:
        converted = xlrd.xldate.xldate_as_datetime(value, 0 if datemode is None else datemode)
        if isinstance(converted, datetime):
            return converted
    return None


def patient_id(filename: str) -> str:
    # 2055_0_20210524.xls and 2055_1_20201207.xls are two periods for patient 2055.
    return filename.split("_", 1)[0]


def iter_workbooks(folder: Path):
    files = sorted(
        path
        for path in folder.iterdir()
        if path.suffix.lower() in {".xls", ".xlsx"} and not path.name.startswith(".") and not path.name.startswith("._")
    )
    if len(files) != 109:
        sys.exit(f"expected 109 Shanghai_T2DM workbooks, found {len(files)} in {folder}")
    for path in files:
        yield path


def iter_rows(path: Path):
    """Yield (row_number, datetime or None, raw CGM cell, raw dietary cell)."""
    if path.suffix.lower() == ".xls":
        book = xlrd.open_workbook(path)
        if book.nsheets != 1:
            sys.exit(f"{path.name} has {book.nsheets} sheets; expected 1")
        sheet = book.sheet_by_index(0)
        header = [sheet.cell_value(0, col) for col in range(sheet.ncols)]
        date_col, cgm_col, diet_col = columns(header, path.name)
        for row in range(1, sheet.nrows):
            diet = sheet.cell_value(row, diet_col) if diet_col < sheet.ncols else ""
            yield (
                row + 1,
                as_datetime(sheet.cell_value(row, date_col), book.datemode),
                sheet.cell_value(row, cgm_col),
                diet,
            )
        return

    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        if len(workbook.worksheets) != 1:
            sys.exit(f"{path.name} has {len(workbook.worksheets)} sheets; expected 1")
        sheet = workbook.worksheets[0]
        rows = sheet.iter_rows(values_only=True)
        header = list(next(rows))
        date_col, cgm_col, diet_col = columns(header, path.name)
        for row_number, row in enumerate(rows, start=2):
            diet = row[diet_col] if diet_col < len(row) else None
            raw_date = row[date_col] if date_col < len(row) else None
            raw_cgm = row[cgm_col] if cgm_col < len(row) else None
            yield row_number, as_datetime(raw_date, None), raw_cgm, diet
    finally:
        workbook.close()


def columns(header, filename: str) -> tuple[int, int, int]:
    def find(prefix: str) -> int | None:
        for index, cell in enumerate(header):
            if str(cell or "").strip().lower().startswith(prefix):
                return index
        return None

    date_col = find("date")
    cgm_col = find("cgm")
    diet_col = find("dietary intake")
    if date_col is None or cgm_col is None or diet_col is None:
        sys.exit(f"{filename} is missing Date, CGM, or Dietary intake: {header!r}")
    return date_col, cgm_col, diet_col


def extract(folder: Path) -> tuple[list[tuple[str, Decimal]], dict]:
    chosen: list[tuple[str, str, datetime, int, Decimal]] = []
    patients = defaultdict(set)
    files = defaultdict(set)
    meals_in_slot = Counter()
    meals_by_hour = Counter()
    fasting_from_0545 = 0
    skipped_blank = 0
    skipped_no_time = 0
    cgm_rows = 0

    for path in iter_workbooks(folder):
        pid = patient_id(path.name)
        for row_number, stamp, raw_cgm, diet in iter_rows(path):
            has_diet = diet not in (None, "")
            if stamp is not None and has_diet:
                meals_by_hour[stamp.hour] += 1
                if time(5, 45) <= stamp.time() < time(6, 0):
                    fasting_from_0545 += 1
            mg_dl = as_mg_dl(raw_cgm)
            if stamp is None:
                if raw_cgm not in (None, "") or has_diet:
                    skipped_no_time += 1
                else:
                    skipped_blank += 1
                continue
            if mg_dl is None:
                skipped_blank += 1
                continue
            cgm_rows += 1
            slot = slot_of(stamp)
            if slot is None:
                continue
            if has_diet:
                meals_in_slot[slot] += 1
            patients[slot].add(pid)
            files[slot].add(path.name)
            chosen.append((slot, path.name, stamp, row_number, mg_dl))

    chosen.sort(key=lambda item: (item[1], item[2], item[3], item[0]))
    rows = [(slot, mg_dl) for slot, _, _, _, mg_dl in chosen]
    summary = {
        "cgm_rows": cgm_rows,
        "skipped_blank": skipped_blank,
        "skipped_no_time": skipped_no_time,
        "patients": {slot: patients[slot] for slot, _, _ in SLOTS},
        "files": {slot: files[slot] for slot, _, _ in SLOTS},
        "meals_in_slot": meals_in_slot,
        "meals_by_hour": meals_by_hour,
        "fasting_from_0545": fasting_from_0545,
        "all_patients": set().union(*patients.values()) if patients else set(),
    }
    return rows, summary


def write_csv(path: Path, rows: list[tuple[str, Decimal]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["slot,mg_dl"]
    lines.extend(f"{slot},{mg_dl}" for slot, mg_dl in rows)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def print_summary(rows: list[tuple[str, Decimal]], summary: dict) -> None:
    print(f"numeric CGM rows read: {summary['cgm_rows']}")
    print(f"skipped blank CGM cells or empty rows: {summary['skipped_blank']}")
    print(f"skipped rows with no timestamp: {summary['skipped_no_time']}")
    print("dietary logs by hour (non-empty Dietary intake):")
    for hour in range(24):
        count = summary["meals_by_hour"][hour]
        if count:
            print(f"  {hour:02d}:00-{hour:02d}:59  {count}")
    print(f"dietary logs at 05:45-05:59: {summary['fasting_from_0545']}")
    print()
    grouped = defaultdict(list)
    for slot, mg_dl in rows:
        grouped[slot].append(mg_dl)
    for slot, _, _ in SLOTS:
        values = grouped[slot]
        total = sum(values, Decimal("0"))
        mean = total / len(values)
        patients = summary["patients"][slot]
        files = summary["files"][slot]
        print(
            f"{slot}: n={len(values)} patients={len(patients)} files={len(files)} "
            f"diet_logs={summary['meals_in_slot'][slot]} "
            f"min={min(values)} mean={mean} max={max(values)} "
            f"sum_tenths={int(total * 10)}"
        )
    print(f"patients appearing in at least one slot: {len(summary['all_patients'])}")
    print(f"rows written: {len(rows)}")


def shanghai_t2dm_dir(source: Path) -> Path | None:
    if source.is_dir():
        direct = source / "Shanghai_T2DM"
        if direct.is_dir():
            return direct
        if source.name == "Shanghai_T2DM":
            return source
        sys.exit(f"{source} is not the zip and does not contain Shanghai_T2DM/")
    if not zipfile.is_zipfile(source):
        sys.exit(f"{source} is not a zip file")
    return None  # caller extracts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="diabetes_datasets.zip or an extracted folder")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    folder = shanghai_t2dm_dir(args.source)
    if folder is None:
        with tempfile.TemporaryDirectory() as tmp:
            with zipfile.ZipFile(args.source) as archive:
                for info in archive.infolist():
                    name = info.filename
                    if name.startswith("Shanghai_T2DM/") and not name.startswith("__MACOSX") and "/._" not in name and not name.endswith("/"):
                        archive.extract(info, tmp)
            folder = Path(tmp) / "Shanghai_T2DM"
            rows, summary = extract(folder)
            write_csv(args.out, rows)
    else:
        rows, summary = extract(folder)
        write_csv(args.out, rows)

    print_summary(rows, summary)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
