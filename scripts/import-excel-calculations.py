#!/usr/bin/env python3
"""
Import plan/fact Excel calculations into the API.

Usage:
  python3 scripts/import-excel-calculations.py
  python3 scripts/import-excel-calculations.py --dry-run
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Need openpyxl: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
FOR_TESTING = ROOT / "for-testing"
TEST1 = FOR_TESTING / "test1"
API_BASE = "http://localhost:8000/api"
JWT_SECRET = b"jwt_secret_key_report_docs"
USER_ID = 1
# Already imported reference pairs — skip in --all mode
SKIP_NAMES = {
    "План_2025_04_04 Рем крыши ц2.xlsx",
    "Факт_2025_04 Рем крыши ц2.xlsx",
    "План_2025_05_08 Перила Дорога Изюм.xlsx",
    "Факт_2025_08 Перила Дорога Изюм.xlsx",
}

NAME_MAP = {
    "антон": "Червань Антон",
    "артём": "Червань Артём",
    "артем": "Червань Артём",
    "атаман": "Атаманенко",
    "ол": "Бух",
    "мастер": "Нач Ц",
    "нач ц": "Нач Ц",
    "шуленко": "Шул",
    "шул": "Шул",
}

DEFAULT_TAX = [
    {
        "name": "т",
        "coefficient": 0.0,
        "coefficientA": None,
        "coefficientB": None,
        "orderId": 1,
        "key": "T",
        "subtotal": None,
        "total": None,
    },
    {
        "name": "т н",
        "coefficient": None,
        "coefficientA": 93,
        "coefficientB": 7,
        "orderId": 2,
        "key": "TN",
        "subtotal": None,
        "total": None,
    },
    {
        "name": "к",
        "coefficient": 0.2,
        "coefficientA": None,
        "coefficientB": None,
        "orderId": 3,
        "key": "K",
        "subtotal": None,
        "total": None,
    },
    {
        "name": "к налог подаходн+военн",
        "coefficient": 0.242236,
        "coefficientA": None,
        "coefficientB": None,
        "orderId": 4,
        "key": "KMIL",
        "subtotal": None,
        "total": None,
    },
    {
        "name": "к налог есв",
        "coefficient": 0.22,
        "coefficientA": None,
        "coefficientB": None,
        "orderId": 5,
        "key": "KESV",
        "subtotal": None,
        "total": None,
    },
]

REFERENCE_PAIRS = [
    {
        "plan": TEST1 / "План_2025_04_04 Рем крыши ц2.xlsx",
        "facts": [TEST1 / "Факт_2025_04 Рем крыши ц2.xlsx"],
        "plan_date": "2025-04-04T12:00:00.000Z",
        "fact_dates": ["2025-04-01T12:00:00.000Z"],
    },
    {
        "plan": TEST1 / "План_2025_05_08 Перила Дорога Изюм.xlsx",
        "facts": [TEST1 / "Факт_2025_08 Перила Дорога Изюм.xlsx"],
        "plan_date": "2025-05-08T12:00:00.000Z",
        "fact_dates": ["2025-08-01T12:00:00.000Z"],
        "fact_itr_days_override": 25,
    },
]


def subject_key(path: Path) -> str:
    name = path.stem
    name = re.sub(r"^(План|Факт)_?", "", name, flags=re.IGNORECASE)
    name = re.sub(r"^20\d{2}([_/.\-]\d{1,2}){1,2}_?", "", name)
    name = name.replace("ё", "е").replace("Ё", "Е").lower()
    name = re.sub(r"\s*\(\d+\)\s*", " ", name)
    name = re.sub(r"[_\s]+", " ", name)
    name = re.sub(r"[^a-zа-я0-9 .,+xх]+", "", name)
    return re.sub(r"\s+", " ", name).strip(" .")


def extract_date_iso(path: Path, fallback_month_day=(1, 1)) -> str:
    m = re.search(r"20(\d{2})[_\-]?(\d{2})(?:[_\-](\d{2}))?", path.name)
    if not m:
        return f"2025-{fallback_month_day[0]:02d}-{fallback_month_day[1]:02d}T12:00:00.000Z"
    year = 2000 + int(m.group(1))
    month = int(m.group(2))
    day = int(m.group(3)) if m.group(3) else 1
    day = min(max(day, 1), 28)
    return f"{year}-{month:02d}-{day:02d}T12:00:00.000Z"


def tokens(s: str) -> set:
    return {t for t in s.split() if len(t) > 1}


def number_tokens(s: str) -> set:
    return set(re.findall(r"\d+[а-яa-z]?", s))


def match_score(plan_key: str, fact_key: str) -> float:
    if not plan_key or not fact_key:
        return 0.0
    if plan_key == fact_key:
        return 100.0
    pn, fn = number_tokens(plan_key), number_tokens(fact_key)
    # Distinct numeric markers (6н vs 18/3н) must not be cross-matched
    if pn and fn and not (pn & fn) and (pn - fn) and (fn - pn):
        # allow if one side has no exclusive markers meaningfully shared otherwise
        if len(pn - fn) >= 1 and len(fn - pn) >= 1:
            return 0.0
    if plan_key in fact_key or fact_key in plan_key:
        return 80.0 + min(len(plan_key), len(fact_key)) / 10.0
    pt, ft = tokens(plan_key), tokens(fact_key)
    if not pt or not ft:
        return 0.0
    inter = pt & ft
    if not inter:
        return 0.0
    ratio = len(inter) / max(len(pt), len(ft))
    if ratio < 0.6:
        return 0.0
    return 50.0 + ratio * 40.0


def discover_jobs(include_skipped: bool = False, max_size_mb: float = 2.0):
    """Build import jobs from for-testing Excel files."""
    files = []
    skipped_large = []
    for p in sorted(FOR_TESTING.rglob("*.xlsx")):
        if p.name.startswith("."):
            continue
        if not (p.name.startswith("План") or p.name.startswith("Факт")):
            continue
        if not include_skipped and p.name in SKIP_NAMES:
            continue
        size_mb = p.stat().st_size / (1024 * 1024)
        if max_size_mb and size_mb > max_size_mb:
            skipped_large.append((p.name, round(size_mb, 1)))
            continue
        files.append(p)
    if skipped_large:
        print(f"Skipping {len(skipped_large)} large files (>{max_size_mb}MB):")
        for name, sz in skipped_large:
            print(f"  - {name} ({sz}MB)")

    plans = [p for p in files if p.name.startswith("План")]
    facts = [p for p in files if p.name.startswith("Факт")]

    used_facts = set()
    jobs = []

    for plan in plans:
        pk = subject_key(plan)
        scored = []
        for fact in facts:
            sc = match_score(pk, subject_key(fact))
            if sc >= 50:
                scored.append((sc, fact))
        scored.sort(key=lambda x: (-x[0], x[1].name))
        matched = [f for sc, f in scored if sc >= 70]
        # keep top closely related facts (same subject family)
        if matched:
            best = scored[0][0]
            matched = [f for sc, f in scored if sc >= max(70, best - 15)]
        for f in matched:
            used_facts.add(f)
        jobs.append(
            {
                "kind": "plan_with_facts",
                "plan": plan,
                "facts": matched,
                "plan_date": extract_date_iso(plan),
                "fact_dates": [extract_date_iso(f) for f in matched],
                "label": plan.name,
            }
        )

    # Remaining facts: self-contained (plan+fact blocks) or fact-only
    for fact in facts:
        if fact in used_facts:
            continue
        jobs.append(
            {
                "kind": "fact_file",
                "plan": None,
                "facts": [fact],
                "plan_date": extract_date_iso(fact),
                "fact_dates": [extract_date_iso(fact)],
                "label": fact.name,
            }
        )

    return jobs


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_token(user_id: int = USER_ID) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    now = int(time.time())
    payload = b64url(
        json.dumps(
            {"userId": user_id, "role": "admin", "iat": now, "exp": now + 86400},
            separators=(",", ":"),
        ).encode()
    )
    signing = f"{header}.{payload}".encode()
    sig = b64url(hmac.new(JWT_SECRET, signing, hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def api_request(method: str, path: str, token: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        raise RuntimeError(f"{method} {path} -> {e.code}: {parsed}") from e


def num(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, datetime):
        return None
    s = str(value).replace("\xa0", "").replace(" ", "").replace(",", ".")
    s = re.sub(r"[^0-9.\-]", "", s)
    if s in ("", "-", ".", "-."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fmt_price(value) -> str:
    v = num(value) or 0.0
    formatted = f"{v:,.2f}".replace(",", " ").replace(".", ",")
    return formatted


def map_name(name: str) -> str:
    if not name:
        return name
    stripped = name.strip()
    key = stripped.lower().replace("ё", "е")
    mapped = NAME_MAP.get(stripped.lower()) or NAME_MAP.get(key)
    if mapped:
        return mapped
    return name  # preserve trailing spaces (e.g. 'Бригада ')


def pad_row(vals, width=20):
    vals = list(vals or [])
    if len(vals) < width:
        vals.extend([None] * (width - len(vals)))
    return vals


def load_sheet_rows(path: Path):
    wb = openpyxl.load_workbook(path, data_only=True)
    if "Лист1" in wb.sheetnames:
        ws = wb["Лист1"]
    else:
        # fallback: first non-empty sheet
        ws = wb[wb.sheetnames[0]]
    rows = {}
    max_col = max(min(ws.max_column or 20, 20), 12)
    for r in range(1, (ws.max_row or 0) + 1):
        vals = pad_row([ws.cell(r, c).value for c in range(1, max_col + 1)], 20)
        if any(v is not None and str(v).strip() != "" for v in vals):
            rows[r] = vals
    return rows


def detect_layout(rows: dict) -> str:
    """A = canonical (Спецификация + order/name columns), B = compact ETAILON-like."""
    for vals in rows.values():
        if vals[1] == "Спецификация":
            return "A"
    for vals in rows.values():
        if vals[7] == "ед изм" or vals[8] in ("факт", "кол-во", "цена"):
            return "B"
        if vals[6] == "Расходники" and vals[7] == "ед изм":
            return "B"
    return "A"


def marker_kind(cell) -> str | None:
    """Recognize ПЛАН/ФАКТ even with suffixes like 'ПЛАН 120 шт'."""
    if cell is None:
        return None
    s = str(cell).strip().upper().replace("Ё", "Е")
    if s.startswith("ФАКТ"):
        return "ФАКТ"
    if s.startswith("ПЛАН"):
        return "ПЛАН"
    return None


def block_ranges(rows: dict):
    markers = []
    for r in sorted(rows):
        kind = marker_kind(rows[r][0])
        if kind:
            markers.append((r, kind))
    ranges = []
    for i, (start, kind) in enumerate(markers):
        end = markers[i + 1][0] - 1 if i + 1 < len(markers) else max(rows)
        ranges.append((kind, start, end))
    return ranges


def clone_as_plan(fact_payload: dict) -> dict:
    """When file has no separate plan — plan mirrors fact."""
    import copy

    plan = copy.deepcopy(fact_payload)
    plan["calculationType"] = "plan"
    title = plan.get("title") or "Калькуляция"
    plan["title"] = re.sub(r"\s*-\s*факт\s*$", "", title, flags=re.IGNORECASE).strip() or title
    return plan


def iter_block(rows, start, end):
    for r in range(start, end + 1):
        if r in rows:
            yield r, rows[r]


def find_row(rows, start, end, pred):
    for r, vals in iter_block(rows, start, end):
        if pred(vals):
            return r, vals
    return None, None


def parse_cost_items(rows, start, end, section_title: str):
    r0, _ = find_row(rows, start, end, lambda v: len(v) > 6 and v[6] == section_title)
    if r0 is None:
        return []
    items = []
    for r, vals in iter_block(rows, r0 + 1, end):
        label = vals[6]
        if label in ("Метизы", "Металл", "Расходники", "ЦЕХ"):
            break
        if isinstance(label, str) and label.strip().endswith(".") and len(label.strip()) <= 4:
            # numbered empty placeholders under Метизы/Металл
            name = vals[7]
            qty = num(vals[9])
            price = num(vals[11])
            if not name or (qty is None and not price):
                continue
        name = vals[7]
        if not name or not str(name).strip():
            continue
        name_s = str(name).strip()
        if name_s in ("Метизы", "Металл"):
            break
        qty = num(vals[9])
        tax = num(vals[10])
        price = num(vals[11])
        if qty is None and not price:
            continue
        if price is None and tax is not None and qty is not None:
            price = qty * tax
        if not price:
            continue
        items.append(
            {
                "order": str(int(label)) if isinstance(label, (int, float)) else str(label or ""),
                "name": name_s,
                "unitOfMeasurement": (str(vals[8]).strip() if vals[8] not in (None, "") else ""),
                "quantity": str(vals[9]).replace(".", ",") if vals[9] is not None else "",
                "taxPrice": fmt_price(tax) if tax is not None else "",
                "price": fmt_price(price) if price is not None else "0,00",
            }
        )
    return items


def parse_workers(rows, start, end):
    # Prefer the first ЦЕХ summary block (brigade), not a later detailed dump.
    r0, _ = find_row(rows, start, end, lambda v: len(v) > 7 and v[6] == "ЦЕХ" and v[7] == "час")
    if r0 is None:
        return [], 8
    hours_per_shift = 8
    for r, vals in iter_block(rows, max(start, r0 - 5), r0):
        if num(vals[9]) == 8:
            hours_per_shift = 8
    workers = []
    empty_streak = 0
    for r, vals in iter_block(rows, r0 + 1, end):
        name = vals[6]
        if name == "ЦЕХ":
            break
        if name in (None, ""):
            empty_streak += 1
            if workers and empty_streak >= 3:
                break
            continue
        empty_streak = 0
        hours = num(vals[7])
        day = num(vals[8])
        if hours is None or day is None:
            continue
        if hours == 0 and (num(vals[10]) in (None, 0)):
            continue
        hour_rate = num(vals[9])
        workers.append(
            {
                "name": map_name(str(name)),
                # DB column is INTEGER
                "numberOfHoursWorked": int(round(hours)),
                "salaryPerDay": int(round(day)),
                "salaryPerHour": int(round(hour_rate)) if hour_rate is not None else None,
                "total": int(round(num(vals[10]))) if num(vals[10]) is not None else None,
            }
        )
    return workers, hours_per_shift


def parse_itr(rows, start, end):
    r_it, vals_it = find_row(rows, start, end, lambda v: v[1] == "ИТ")
    itr_days = num(vals_it[3]) if vals_it else 1
    items = []
    if r_it is None:
        return items, itr_days or 1
    for r, vals in iter_block(rows, r_it + 1, end):
        name = vals[1]
        thousands = num(vals[2])
        if name in (None, ""):
            if thousands is not None and vals[3] is not None:
                # totals row (e.g. 59 / 22.48 under ИТ)
                break
            continue
        if name in ("Коммерческое Пасс Ко", "Коммерческое ТимМеталл"):
            break
        # Empty salary cells (Бух / Нач Ц with blank) must be skipped, not stop the list
        if thousands is None or thousands == 0:
            continue
        salary = thousands * 1000
        items.append({"name": map_name(str(name)), "salaryPerMonth": int(round(salary))})
    return items, itr_days or 1


def parse_spec(rows, start, end):
    r_h, vals_h = find_row(rows, start, end, lambda v: v[1] == "Спецификация")
    if r_h is None:
        return {"notes": "", "table": []}
    header_qty = str(vals_h[2] or "")
    header_weight = str(vals_h[3] or "")
    r_item = r_h + 1
    vals = rows.get(r_item)
    if not vals or not vals[1]:
        return {"notes": "", "table": []}
    name = str(vals[1]).strip()
    qty = num(vals[2]) or 0
    weight = num(vals[3])
    notes = ""
    for r, v in iter_block(rows, r_item, min(r_item + 20, end)):
        b = v[1]
        if isinstance(b, str) and b and b not in ("услуга", "тн", "Металл", "Метизы", "Расходники", "Цех", "Ит"):
            if any(x in b.lower() for x in ("отв", "вес считал", "вес считала")):
                notes = b
                break
    if weight is None or weight == 0:
        unit = "шт"
        value_per_unit = 1
    else:
        value_per_unit = weight
        if "м.п" in header_qty or "м.п" in header_qty.lower() or "мп" in header_qty.replace(".", ""):
            unit = "м"
        elif "тн" in header_weight or "тн" in header_qty:
            unit = "тн"
        else:
            unit = "тн" if weight < 10 else "шт"
    return {
        "notes": notes,
        "table": [
            {
                "name": name,
                "quantity": qty,
                "valuePerUnit": value_per_unit,
                "unitOfMeasurement": unit,
                "totalWeight": None,
            }
        ],
    }


def parse_variables(rows, start, end, itr_days: float):
    def left(label):
        _, vals = find_row(rows, start, end, lambda v: v[1] == label)
        return vals

    oz = left("Оцинковка")
    tr = left("Транспорт оцинк")
    ar = left("Аренда")
    el = left("Эл эн")
    rent = left("Рентабельность")

    galvanized = num(oz[2]) if oz else 0
    transport = num(tr[2]) if tr else 0
    rental_per_day = num(ar[3]) if ar else 0
    if rental_per_day is None and ar and itr_days:
        total_ar = num(ar[2]) or 0
        rental_per_day = total_ar / itr_days if itr_days else 0
    elec_per_day = num(el[3]) if el else 0
    if elec_per_day is None and el and itr_days:
        total_el = num(el[2]) or 0
        elec_per_day = total_el / itr_days if itr_days else 0
    profit = num(rent[3]) if rent else 0

    return {
        # DB columns for these scalars are INTEGER
        "galvanizedValue": int(round(galvanized or 0)),
        "transportValue": int(round(transport or 0)),
        "rentalCostPerDay": int(round(rental_per_day or 0)),
        "costOfElectricityPerDay": int(round(elec_per_day or 0)),
        "profitabilityCoeficient": profit or 0,
        "coeficientOfNds": 1.2,
        "numberOfDaysPerShift": 21,
    }


def parse_title(rows, start, kind: str):
    vals = pad_row(rows.get(start, []))
    parts = []
    for v in vals[1:4]:
        if v in (None, ""):
            continue
        if isinstance(v, datetime):
            continue
        parts.append(str(v).strip())
    title = " ".join(parts) if parts else f"Калькуляция {start}"
    title = re.sub(r"\s+", " ", title).strip()
    if kind == "ФАКТ" and not title.lower().endswith("факт"):
        title = f"{title} - факт"
    return title


def make_cost_item(order, name, unit, qty, tax, price):
    qty_n = num(qty)
    tax_n = num(tax)
    price_n = num(price)
    if price_n is None and tax_n is not None and qty_n is not None:
        price_n = qty_n * tax_n
    if not price_n:
        return None
    return {
        "order": str(order),
        "name": str(name).strip(),
        "unitOfMeasurement": (str(unit).strip() if unit not in (None, "") else ""),
        "quantity": str(qty).replace(".", ",") if qty is not None else "",
        "taxPrice": fmt_price(tax_n) if tax_n is not None else "",
        "price": fmt_price(price_n),
    }


def parse_cost_items_b(rows, start, end, section_title: str):
    """Compact layout: name=G, unit=H, qty=I, price=J, sum=K."""
    r0, _ = find_row(
        rows,
        start,
        end,
        lambda v: v[6] == section_title or (section_title == "Расходники" and v[7] == "ед изм"),
    )
    if r0 is None and section_title == "Металл":
        r0, _ = find_row(rows, start, end, lambda v: v[6] == "Металл")
    if r0 is None:
        return []
    items = []
    order = 1
    empty_streak = 0
    for r, vals in iter_block(rows, r0 + 1, end):
        vals = pad_row(vals)
        name = vals[6]
        # stop at other sections / workers table
        if isinstance(name, str) and (
            name in ("Метизы", "Металл", "Расходники", "ЦЕХ")
            or "Фамилия" in name
            or name == section_title
        ):
            if name in ("Метизы", "Металл", "Расходники") and name != section_title:
                break
            if "Фамилия" in name or name == "ЦЕХ":
                break
            if vals[7] == "ед изм":
                continue
        if vals[0] == "ИТ" or vals[1] == "ИТ":
            break
        # worker-like rows: name | hours(number) | day_rate(number)
        if isinstance(vals[7], (int, float)) and isinstance(vals[8], (int, float)) and vals[7] > 20:
            break
        if name in (None, ""):
            empty_streak += 1
            if items and empty_streak >= 3:
                break
            continue
        empty_streak = 0
        if vals[7] == "ед изм":
            continue
        if isinstance(name, (int, float)):
            # numbered worker rows
            break
        item = make_cost_item(order, name, vals[7], vals[8], vals[9], vals[10])
        if item:
            items.append(item)
            order += 1
    return items


def parse_itr_b(rows, start, end):
    r_it, vals_it = find_row(rows, start, end, lambda v: v[0] == "ИТ" or v[1] == "ИТ")
    if r_it is None:
        return [], 1
    vals_it = pad_row(vals_it)
    itr_days = num(vals_it[2]) if vals_it[0] == "ИТ" else num(vals_it[3])
    items = []
    for r, vals in iter_block(rows, r_it + 1, end):
        vals = pad_row(vals)
        name = vals[0] if vals[0] not in (None, "") else vals[1]
        thousands = num(vals[1]) if vals[0] not in (None, "") else num(vals[2])
        if name in (None, ""):
            break
        if isinstance(name, (int, float)):
            break
        name_s = str(name).strip()
        if name_s.lower() in ("ит", "цех"):
            break
        if thousands is None or thousands == 0:
            continue
        items.append({"name": map_name(name_s), "salaryPerMonth": int(round(thousands * 1000))})
    return items, itr_days or 1


def parse_workers_b(rows, start, end):
    r0, _ = find_row(
        rows,
        start,
        end,
        lambda v: isinstance(v[6], str) and ("Фамилия" in v[6] or v[6] == "ЦЕХ"),
    )
    workers = []
    hours_per_shift = 8
    if r0 is None:
        return workers, hours_per_shift
    for r, vals in iter_block(rows, r0 + 1, end):
        vals = pad_row(vals)
        name = vals[6]
        if name in (None, "", "ЦЕХ"):
            if workers:
                break
            continue
        hours = num(vals[7])
        day = num(vals[8])
        total = num(vals[9])
        if hours is None or day is None:
            continue
        if hours == 0:
            continue
        # numbered anonymous rows -> Worker N
        if isinstance(name, (int, float)):
            name = f"Рабочий {int(name)}"
        workers.append(
            {
                "name": map_name(str(name)),
                "numberOfHoursWorked": int(round(hours)),
                "salaryPerDay": int(round(day)),
                "salaryPerHour": int(round(day / hours_per_shift)),
                "total": int(round(total)) if total is not None else None,
            }
        )
    return workers, hours_per_shift


def parse_variables_b(rows, start, end, itr_days: float):
    def find_label(label):
        for r, vals in iter_block(rows, start, end):
            vals = pad_row(vals)
            if vals[1] == label or vals[0] == label:
                return vals
        return None

    ar = find_label("Аренда")
    el = find_label("Эл эн")
    rent = find_label("Рентабельность")
    oz = find_label("Оцинковка")
    tr = find_label("Транспорт оцинк")

    rental_per_day = num(ar[3]) if ar else 0
    if (rental_per_day is None or rental_per_day == 0) and ar and itr_days:
        rental_per_day = (num(ar[2]) or 0) / itr_days if itr_days else 0
    elec_per_day = num(el[3]) if el else 0
    if (elec_per_day is None or elec_per_day == 0) and el and itr_days:
        elec_per_day = (num(el[2]) or 0) / itr_days if itr_days else 0
    # profitability coef often in column A for layout B
    profit = 0
    if rent:
        profit = num(rent[0]) if num(rent[0]) not in (None, 0) and num(rent[0]) < 2 else num(rent[3])
        if profit is None:
            profit = 0

    return {
        "galvanizedValue": int(round(num(oz[2]) or 0)) if oz else 0,
        "transportValue": int(round(num(tr[2]) or 0)) if tr else 0,
        "rentalCostPerDay": int(round(rental_per_day or 0)),
        "costOfElectricityPerDay": int(round(elec_per_day or 0)),
        "profitabilityCoeficient": profit or 0,
        "coeficientOfNds": 1.2,
        "numberOfDaysPerShift": 21,
    }


def parse_spec_b(rows, start, end):
    # B4 often unit (шт/услуга), B5 quantity
    unit = "шт"
    qty = 1
    name = parse_title(rows, start, "ПЛАН").replace(" - факт", "")
    for r, vals in iter_block(rows, start, min(start + 10, end)):
        vals = pad_row(vals)
        if vals[1] in ("шт", "услуга", "тн", "м"):
            if isinstance(vals[1], str) and vals[1] in ("шт", "тн", "м"):
                unit = vals[1]
            if num(vals[1]) is not None and not isinstance(vals[1], str):
                qty = num(vals[1])
        if num(vals[1]) == 1 and vals[2] in ("план", "факт", None):
            qty = 1
            unit = "шт"
    return {
        "notes": "",
        "table": [
            {
                "name": name or "позиция",
                "quantity": qty or 1,
                "valuePerUnit": 1,
                "unitOfMeasurement": unit if unit in ("шт", "тн", "м") else "шт",
                "totalWeight": None,
            }
        ],
    }


def parse_block_b(rows, kind, start, end, date_iso: str, itr_days_override=None):
    title = parse_title(rows, start, kind)
    spec = parse_spec_b(rows, start, end)
    consumables = parse_cost_items_b(rows, start, end, "Расходники")
    hardware = parse_cost_items_b(rows, start, end, "Метизы")
    metal = parse_cost_items_b(rows, start, end, "Металл")
    workers, hours = parse_workers_b(rows, start, end)
    itr, itr_days = parse_itr_b(rows, start, end)
    if itr_days_override is not None:
        itr_days = itr_days_override
    variables = parse_variables_b(rows, start, end, itr_days)
    payload = {
        "title": title,
        "calculationType": "plan" if kind == "ПЛАН" else "fact",
        "dateOfCreation": date_iso,
        "lastEditDate": datetime.utcnow().isoformat() + "Z",
        "itrWorkedDays": float(itr_days) if itr_days is not None else 1,
        "numberOfHoursPerShift": int(hours),
        "specificationData": spec,
        "workersData": {"notes": "", "table": workers},
        "itrData": {"notes": "", "table": itr},
        "consumablesData": consumables,
        "hardwareData": hardware,
        "metalData": metal,
        "workersTaxData": [dict(x) for x in DEFAULT_TAX],
        "itrTaxData": [dict(x) for x in DEFAULT_TAX],
        "isMetalEnabled": False,
        "isHardwareEnabled": False,
        **variables,
    }
    totals = compute_totals(payload)
    payload.update(totals)
    return payload


def parse_block_a(rows, kind, start, end, date_iso: str, itr_days_override=None):
    title = parse_title(rows, start, kind)
    spec = parse_spec(rows, start, end)
    consumables = parse_cost_items(rows, start, end, "Расходники")
    hardware = parse_cost_items(rows, start, end, "Метизы")
    metal = parse_cost_items(rows, start, end, "Металл")
    workers, hours = parse_workers(rows, start, end)
    itr, itr_days = parse_itr(rows, start, end)
    if itr_days_override is not None:
        itr_days = itr_days_override
    variables = parse_variables(rows, start, end, itr_days)

    payload = {
        "title": title,
        "calculationType": "plan" if kind == "ПЛАН" else "fact",
        "dateOfCreation": date_iso,
        "lastEditDate": datetime.utcnow().isoformat() + "Z",
        "itrWorkedDays": float(itr_days) if itr_days is not None else 1,
        "numberOfHoursPerShift": int(hours),
        "specificationData": spec,
        "workersData": {"notes": "", "table": workers},
        "itrData": {"notes": "", "table": itr},
        "consumablesData": consumables,
        "hardwareData": hardware,
        "metalData": metal,
        "workersTaxData": [dict(x) for x in DEFAULT_TAX],
        "itrTaxData": [dict(x) for x in DEFAULT_TAX],
        "isMetalEnabled": False,
        "isHardwareEnabled": False,
        **variables,
    }
    totals = compute_totals(payload)
    payload.update(totals)
    return payload


def parse_block(rows, kind, start, end, date_iso: str, itr_days_override=None):
    layout = detect_layout({r: rows[r] for r in rows if start <= r <= end})
    if layout == "B":
        return parse_block_b(rows, kind, start, end, date_iso, itr_days_override)
    return parse_block_a(rows, kind, start, end, date_iso, itr_days_override)


def parse_price(value) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def sum_prices(items):
    return sum(parse_price(i.get("price")) for i in items)


def tax_total(salary_base: float, tax_rows: list, nds: float) -> float:
    acc = {"T": 0.0, "TN": 0.0, "K": 0.0, "KMIL": 0.0, "KESV": 0.0}
    for item in tax_rows:
        key = item["key"]
        if key == "T":
            acc["T"] = round(float(item["coefficient"] or 0) * salary_base, 2)
        elif key == "TN":
            acc["TN"] = round((acc["T"] / item["coefficientA"]) * item["coefficientB"], 2) if item.get("coefficientA") else 0.0
        elif key == "K":
            acc["K"] = round(salary_base - acc["T"], 2)
        elif key == "KMIL":
            acc["KMIL"] = round(acc["K"] * float(item["coefficient"]), 2)
        elif key == "KESV":
            acc["KESV"] = round((acc["K"] + acc["KMIL"]) * float(item["coefficient"]), 2)
    return round((acc["T"] + acc["TN"] + acc["K"] + acc["KMIL"] + acc["KESV"]) * nds, 2)


def compute_totals(payload: dict) -> dict:
    hours = payload["numberOfHoursPerShift"] or 8
    days = payload["numberOfDaysPerShift"] or 21
    itr_days = payload["itrWorkedDays"] or 0

    workers_salary = 0.0
    for w in payload["workersData"]["table"]:
        workers_salary += float(
            round((w["salaryPerDay"] / hours) * w["numberOfHoursWorked"])
        )

    itr_salary = 0.0
    for i in payload["itrData"]["table"]:
        itr_salary += float(
            round((i["salaryPerMonth"] / days) * itr_days)
        )

    metal = sum_prices(payload["metalData"])
    hardware = sum_prices(payload["hardwareData"])
    consumables = sum_prices(payload["consumablesData"])
    w_tax = tax_total(workers_salary, payload["workersTaxData"], payload["coeficientOfNds"])
    i_tax = tax_total(itr_salary, payload["itrTaxData"], payload["coeficientOfNds"])

    if payload.get("isMetalEnabled") is True:
        metal = 0.0
    if payload.get("isHardwareEnabled") is True:
        hardware = 0.0

    base = (
        metal
        + hardware
        + consumables
        + w_tax
        + i_tax
        + payload["galvanizedValue"]
        + payload["transportValue"]
        + payload["rentalCostPerDay"] * itr_days
        + payload["costOfElectricityPerDay"] * itr_days
    )
    profit = base * payload["profitabilityCoeficient"]
    total = base + profit

    spec_items = payload["specificationData"]["table"]
    has_pieces = any(i.get("unitOfMeasurement") == "шт" for i in spec_items)
    if has_pieces:
        divisor = sum(float(i.get("quantity") or 0) for i in spec_items if i.get("unitOfMeasurement") == "шт")
    else:
        divisor = sum(float(i.get("quantity") or 0) * float(i.get("valuePerUnit") or 0) for i in spec_items)

    processing = (
        consumables
        + w_tax
        + i_tax
        + payload["galvanizedValue"]
        + payload["transportValue"]
        + payload["rentalCostPerDay"] * itr_days
        + payload["costOfElectricityPerDay"] * itr_days
    )
    metal_total = metal + hardware

    return {
        "total": total,
        "totalMetalPerItem": (metal_total / divisor) if divisor else None,
        "totalProcessingPerItem": (processing / divisor) if divisor else None,
        "totalProfitabilityPerItem": (profit / divisor) if divisor else 0,
        "_debug": {
            "workers_salary": workers_salary,
            "itr_salary": itr_salary,
            "w_tax": w_tax,
            "i_tax": i_tax,
            "metal": metal,
            "hardware": hardware,
            "consumables": consumables,
            "base": base,
            "profit": profit,
            "divisor": divisor,
        },
    }


def to_api_body(payload: dict, parent_id=None) -> dict:
    body = {
        **payload,
        "parentCalculationId": parent_id,
        "consumablesData": json.dumps(payload["consumablesData"], ensure_ascii=False),
        "hardwareData": json.dumps(payload["hardwareData"], ensure_ascii=False),
        "metalData": json.dumps(payload["metalData"], ensure_ascii=False),
    }
    body.pop("_debug", None)
    return body


def refine_title(payload: dict, path: Path, prefer_kind: str):
    title = payload.get("title") or ""
    bad = (
        not title
        or title.startswith("Калькуляция ")
        or re.match(r"^\d{4}-\d{2}-\d{2}", title)
        or title.replace(" - факт", "").strip() in ("", "Цех")
    )
    if bad:
        title = subject_key(path) or path.stem
        title = title[:1].upper() + title[1:] if title else path.stem
    if prefer_kind == "ФАКТ" and not title.lower().endswith("факт"):
        title = f"{title} - факт"
    payload["title"] = title
    return payload


def choose_block(ranges, prefer_kind: str, rows: dict):
    """Pick ПЛАН/ФАКТ block. Prefer a titled section over anonymous 'ПЛАН 120 шт'."""
    matching = [(k, s, e) for k, s, e in ranges if k == prefer_kind]
    if not matching:
        if prefer_kind == "ФАКТ" and any(k == "ПЛАН" for k, _, _ in ranges):
            return ranges[-1]
        return ranges[0]
    if len(matching) == 1:
        return matching[0]

    def title_quality(start: int) -> tuple:
        t = parse_title(rows, start, prefer_kind).replace(" - факт", "").strip()
        bad = (not t) or t.startswith("Калькуляция ") or re.match(r"^\d{4}-\d{2}-\d{2}", t)
        # good titles win; among equals prefer later blocks (often the named variant, e.g. МД-4)
        return (0 if bad else 1, start)

    matching.sort(key=lambda x: title_quality(x[1]))
    return matching[-1]


def parse_excel_file(path: Path, prefer_kind: str, date_iso: str, itr_days_override=None):
    rows = load_sheet_rows(path)
    ranges = block_ranges(rows)
    if not ranges:
        raise ValueError(f"No ПЛАН/ФАКТ markers in {path.name}")
    chosen = choose_block(ranges, prefer_kind, rows)
    kind, start, end = chosen
    payload = parse_block(rows, kind if kind in ("ПЛАН", "ФАКТ") else prefer_kind, start, end, date_iso, itr_days_override=itr_days_override)
    # force requested type when falling back
    if prefer_kind == "ФАКТ":
        payload["calculationType"] = "fact"
    elif prefer_kind == "ПЛАН":
        payload["calculationType"] = "plan"
    refine_title(payload, path, prefer_kind)
    return payload, ranges


def summarize_payload(prefix: str, payload: dict):
    print(
        f"  {prefix} title={payload['title']!r} total={payload['total']:.2f} "
        f"workers={len(payload['workersData']['table'])} itr={len(payload['itrData']['table'])} "
        f"cons={len(payload['consumablesData'])} metal={len(payload['metalData'])} "
        f"hw={len(payload['hardwareData'])} days={payload['itrWorkedDays']}"
    )


def import_job(token: str, job: dict, dry_run: bool = False):
    print("\n" + "=" * 72)
    print(f"JOB [{job['kind']}]: {job['label']}")
    if job.get("plan"):
        print(f"  plan file: {job['plan'].name}")
    for f in job.get("facts") or []:
        print(f"  fact file: {f.name}")

    plan_payload = None
    fact_payloads = []

    if job["kind"] == "plan_with_facts":
        plan_payload, _ = parse_excel_file(job["plan"], "ПЛАН", job["plan_date"])
        summarize_payload("plan", plan_payload)
        for i, fact_path in enumerate(job["facts"]):
            fact_date = job["fact_dates"][i] if i < len(job["fact_dates"]) else extract_date_iso(fact_path)
            try:
                fact_payload, ranges = parse_excel_file(
                    fact_path,
                    "ФАКТ",
                    fact_date,
                    itr_days_override=job.get("fact_itr_days_override"),
                )
            except Exception:
                # fact file may only contain plan-looking data; try any block as fact
                fact_payload, ranges = parse_excel_file(fact_path, "ПЛАН", fact_date)
                fact_payload["calculationType"] = "fact"
                if not str(fact_payload["title"]).lower().endswith("факт"):
                    fact_payload["title"] = f"{fact_payload['title']} - факт"
            summarize_payload(f"fact{i+1}", fact_payload)
            fact_payloads.append(fact_payload)
    else:
        # fact_file: prefer plan block + fact block from same workbook.
        # If there is no separate plan — plan = copy of fact (same numbers).
        fact_path = job["facts"][0]
        rows = load_sheet_rows(fact_path)
        ranges = block_ranges(rows)
        # No markers at all: treat whole sheet as one fact block
        if not ranges and rows:
            ranges = [("ФАКТ", min(rows), max(rows))]
        kinds = {k for k, _, _ in ranges}

        if "ФАКТ" in kinds:
            fact_payload, _ = parse_excel_file(fact_path, "ФАКТ", job["fact_dates"][0])
            summarize_payload("fact", fact_payload)
            fact_payloads.append(fact_payload)
            if "ПЛАН" in kinds:
                plan_payload, _ = parse_excel_file(fact_path, "ПЛАН", job["plan_date"])
                summarize_payload("plan(from fact file)", plan_payload)
            else:
                plan_payload = clone_as_plan(fact_payload)
                summarize_payload("plan(=fact)", plan_payload)
        elif "ПЛАН" in kinds:
            # Only plan-like markers (e.g. 'ПЛАН 120 шт') in a Fact_ file:
            # use that block as fact, plan mirrors it.
            fact_payload, _ = parse_excel_file(fact_path, "ПЛАН", job["fact_dates"][0])
            fact_payload["calculationType"] = "fact"
            refine_title(fact_payload, fact_path, "ФАКТ")
            summarize_payload("fact(from plan-like block)", fact_payload)
            fact_payloads.append(fact_payload)
            plan_payload = clone_as_plan(fact_payload)
            summarize_payload("plan(=fact)", plan_payload)
        else:
            raise ValueError(f"No usable blocks in {fact_path.name}")

    if dry_run:
        return {"dry_run": True, "facts": len(fact_payloads), "has_plan": plan_payload is not None}

    parent_id = None
    plan_res = None
    fact_results = []

    if plan_payload is not None:
        _, plan_res = api_request("POST", "/calculation", token, to_api_body(plan_payload))
        parent_id = plan_res["parent_calculation_id"]
        print(f"  created plan id={plan_res['id']} parent={parent_id}")
    else:
        title = fact_payloads[0]["title"].replace(" - факт", "") if fact_payloads else job["label"]
        _, parent_res = api_request("POST", "/parent-calculation", token, {"title": title})
        parent_id = parent_res["id"]
        print(f"  created parent only id={parent_id}")

    for fact_payload in fact_payloads:
        _, fact_res = api_request("POST", "/calculation", token, to_api_body(fact_payload, parent_id=parent_id))
        print(f"  created fact id={fact_res['id']} total={fact_res.get('total')}")
        fact_results.append(fact_res)

    return {"parentId": parent_id, "plan": plan_res, "facts": fact_results}


def main():
    global API_BASE
    parser = argparse.ArgumentParser(description="Import Excel calculations into API")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api", default=API_BASE)
    parser.add_argument("--reference-only", action="store_true", help="Only the 2 test1 pairs")
    parser.add_argument("--include-skipped", action="store_true", help="Also re-import test1 pairs")
    parser.add_argument("--limit", type=int, default=0, help="Max jobs to process")
    parser.add_argument("--max-size-mb", type=float, default=2.0, help="Skip xlsx larger than this (0=no limit)")
    args = parser.parse_args()
    API_BASE = args.api.rstrip("/")

    if args.reference_only:
        jobs = []
        for pair in REFERENCE_PAIRS:
            jobs.append(
                {
                    "kind": "plan_with_facts",
                    "plan": pair["plan"],
                    "facts": pair["facts"],
                    "plan_date": pair["plan_date"],
                    "fact_dates": pair["fact_dates"],
                    "fact_itr_days_override": pair.get("fact_itr_days_override"),
                    "label": pair["plan"].name,
                }
            )
    else:
        jobs = discover_jobs(include_skipped=args.include_skipped, max_size_mb=args.max_size_mb)

    if args.limit:
        jobs = jobs[: args.limit]

    print(f"Jobs to process: {len(jobs)}", flush=True)
    for j in jobs:
        facts = ", ".join(f.name for f in j.get("facts") or []) or "-"
        plan = j["plan"].name if j.get("plan") else "-"
        print(f"  - {j['kind']}: plan={plan} | facts={facts}", flush=True)

    token = make_token()
    if not args.dry_run:
        api_request("GET", "/parent-calculations", token)

    ok, failed = [], []
    for idx, job in enumerate(jobs, 1):
        print(f"\n[{idx}/{len(jobs)}] starting...", flush=True)
        try:
            result = import_job(token, job, dry_run=args.dry_run)
            ok.append((job["label"], result))
        except Exception as e:
            print(f"  !! FAILED: {e}", flush=True)
            failed.append((job["label"], str(e)))

    print("\n" + "=" * 72)
    print(f"DONE: ok={len(ok)} failed={len(failed)}")
    if failed:
        print("Failures:")
        for label, err in failed:
            print(f"  - {label}: {err}")
    if not args.dry_run:
        print("Created:")
        for label, r in ok:
            if not r or r.get("dry_run"):
                continue
            facts = ",".join(str(f["id"]) for f in r.get("facts") or [])
            print(f"  {label} -> parent={r.get('parentId')} facts=[{facts}]")


if __name__ == "__main__":
    main()
