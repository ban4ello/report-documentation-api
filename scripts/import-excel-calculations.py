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
# Source Excels live in calculations-src (legacy name: for-testing).
FOR_TESTING = ROOT / "calculations-src"
if not FOR_TESTING.exists() and (ROOT / "for-testing").exists():
    FOR_TESTING = ROOT / "for-testing"
TEST1 = FOR_TESTING / "test1"
# Skip quarantine folders when discovering jobs
SKIP_DIRS = {"_not-imported", "test1"}
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

# Canonical display names for people / roles / ITR found in Excel exports.
# Keys must be lowercased with ё→е; lookup uses the same normalization.
NAME_MAP = {
    # --- people (short / alternate spellings) ---
    "антон": "Червань Антон",
    "артём": "Червань Артём",
    "артем": "Червань Артём",
    "червань артем": "Червань Артём",
    "червань артём": "Червань Артём",
    "червань антон": "Червань Антон",
    "атаман": "Атаманенко",
    "атаманенко": "Атаманенко",
    "атаманенко покр": "Атаманенко",
    "бабенко": "Бабенко",
    "васильев": "Васильев",
    "гаврилейч": "Гаврилейченко",
    "гаврилейченко": "Гаврилейченко",
    "грид": "Гридин",
    "гридин": "Гридин",
    "гридин песочка": "Гридин",
    "гридин покраска": "Гридин",
    "гридин строп": "Гридин",
    "овч": "Овчаренко",
    "овчар": "Овчаренко",
    "овчаренко": "Овчаренко",
    "овчаренко покр": "Овчаренко",
    "педорич": "Педорич",
    "рогожин": "Рогожин",
    "стан": "Станишевский",
    "станиш": "Станишевский",
    "станишевск": "Станишевский",
    "станишевский": "Станишевский",
    # --- brigades / roles / operations ---
    "брагада": "Бригада",
    "бригада": "Бригада",
    "бриг 3 чел": "Бригада 3 чел",
    "бригада 4 чел": "Бригада 4 чел",
    "бригада дерево": "Бригада дерево",
    "бригада мк": "Бригада мк",
    "доп бригада": "Доп бригада",
    "доп зачистк": "Доп зачистка",
    "плазма": "Плазма",
    "покраска": "Покраска",
    "песочка": "Песочка",
    "сборка": "Сборка",
    "сварка": "Сварка",
    "слесарка": "Слесарка",
    "слесарн": "Слесарка",
    "слес+сварк": "Слесарка",
    "строп": "Строп",
    "строп мк": "Строп",
    "рабочий 1": "Рабочий 1",
    "рабочий 2": "Рабочий 2",
    "по-1": "ПО-1",
    "по-2": "ПО-2",
    "по-3": "ПО-3",
    "по-4": "ПО-4",
    "8чел 5дн": "8чел 5дн",
    "прем": "Премия",
    "премия": "Премия",
    # --- ITR ---
    "ол": "Бух",
    "мастер": "Нач Ц",
    "нач ц": "Нач Ц",
    "нач цеха": "Нач Ц",
    "шуленко": "Шул",
    "шул": "Шул",
    "ш+кр": "Кр+Ш",
    "кр+ш": "Кр+Ш",
}

# Longest-first prefixes for "Surname + task suffix" (e.g. "Гридин покраска").
NAME_PREFIXES = [
    ("атаманенко", "Атаманенко"),
    ("гаврилейченко", "Гаврилейченко"),
    ("гаврилейч", "Гаврилейченко"),
    ("гридин", "Гридин"),
    ("овчаренко", "Овчаренко"),
    ("станишевск", "Станишевский"),
    ("червань артем", "Червань Артём"),
    ("червань артём", "Червань Артём"),
]

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
    """Build import jobs from calculations-src Excel files."""
    files = []
    skipped_large = []
    for p in sorted(FOR_TESTING.rglob("*.xlsx")):
        if p.name.startswith("."):
            continue
        # Quarantine / helper folders (e.g. _not-imported)
        if any(part in SKIP_DIRS for part in p.parts):
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


def _name_key(name: str) -> str:
    import unicodedata

    s = unicodedata.normalize("NFC", str(name or ""))
    s = s.strip().lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s)
    return s


def map_name(name: str) -> str:
    """Normalize worker/ITR/role labels so analysis groups variants together."""
    if not name:
        return name
    stripped = str(name).strip()
    if not stripped:
        return stripped
    key = _name_key(stripped)
    mapped = NAME_MAP.get(key)
    if mapped:
        return mapped
    for prefix, canonical in NAME_PREFIXES:
        if key == prefix or key.startswith(prefix + " "):
            return canonical
    # Title-case known all-lowercase role leftovers; otherwise keep trimmed original
    return stripped


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


_COST_STOP_LABELS = {
    "метизы",
    "металл",
    "расходники",
    "цех",
    "ит",
    "факт",
    "план",
    "фамилия",
}


def _norm_section_label(label) -> str:
    """Normalize Excel section headers: 'Металл:' / 'ЦЕХ' / 'Расходники' → lowercase key."""
    if not isinstance(label, str):
        return ""
    return label.strip().lower().replace("ё", "е").rstrip(":").strip()


def _is_cost_stop_label(label) -> bool:
    if label in (None, ""):
        return False
    if not isinstance(label, str):
        return False
    low = _norm_section_label(label)
    if low in _COST_STOP_LABELS:
        return True
    if "фамилия" in low:
        return True
    return False


def _is_cost_section_header(vals, section_title: str) -> bool:
    vals = pad_row(vals)
    if len(vals) <= 6:
        return False
    return _norm_section_label(vals[6]) == _norm_section_label(section_title)


def _is_cex_header_row(vals) -> bool:
    """ЦЕХ brigade header: G='ЦЕХ'+час, or H='ЦЕХ'+чел/смен (цех днепр layout)."""
    vals = pad_row(vals)
    if len(vals) <= 7:
        return False
    g, h = vals[6], vals[7]
    g_n = _norm_section_label(g) if isinstance(g, str) else ""
    h_s = str(h).strip().lower() if isinstance(h, str) else ""
    if g_n == "цех" and any(k in h_s for k in ("час", "чел", "смен")):
        return True
    if isinstance(h, str) and _norm_section_label(h) == "цех":
        return True
    return False


def parse_cost_items(rows, start, end, section_title: str):
    r0, _ = find_row(rows, start, end, lambda v: _is_cost_section_header(v, section_title))
    if r0 is None:
        return []
    items = []
    for r, vals in iter_block(rows, r0 + 1, end):
        vals = pad_row(vals)
        label = vals[6]
        if _is_cost_stop_label(label) and _norm_section_label(label) != _norm_section_label(section_title):
            break
        # ЦЕХ wage table starts (header in G or H) — never absorb into Расходники/Металл
        if _is_cex_header_row(vals):
            break
        # Shifted wage rows: empty G, name in H, hours+day rate in I/J (цех днепр)
        if (
            label in (None, "")
            and isinstance(vals[7], str)
            and str(vals[7]).strip()
            and num(vals[8]) is not None
            and num(vals[9]) is not None
            and num(vals[8]) <= 24 * 30
            and num(vals[9]) >= 100
        ):
            break
        # Worker table leaked into cost block: name | hours | day_rate
        if (
            isinstance(label, str)
            and num(vals[7]) is not None
            and num(vals[8]) is not None
            and num(vals[7]) <= 24 * 14
            and num(vals[8]) >= 100
        ):
            break

        # Compact layout (no order col): G=name, H=unit, I=qty, J=tax, K=price
        compact = (
            isinstance(label, str)
            and num(label) is None
            and not (label.strip().endswith(".") and len(label.strip()) <= 4)
            and isinstance(vals[7], str)
            and num(vals[8]) is not None
        )
        if compact:
            name_s = label.strip()
            unit = vals[7]
            qty = num(vals[8])
            tax = num(vals[9])
            price = num(vals[10])
            order = str(len(items) + 1)
            qty_cell = vals[8]
        else:
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
            if _norm_section_label(name_s) in ("метизы", "металл", "расходники", "цех"):
                break
            unit = vals[8]
            qty = num(vals[9])
            tax = num(vals[10])
            price = num(vals[11])
            order = str(int(label)) if isinstance(label, (int, float)) else str(label or "")
            qty_cell = vals[9]

        if qty is None and not price:
            continue
        if price is None and tax is not None and qty is not None:
            price = qty * tax
        if not price:
            continue
        items.append(
            {
                "order": order,
                "name": name_s,
                "unitOfMeasurement": (str(unit).strip() if unit not in (None, "") else ""),
                "quantity": str(qty_cell).replace(".", ",") if qty_cell is not None else "",
                "taxPrice": fmt_price(tax) if tax is not None else "",
                "price": fmt_price(price) if price is not None else "0,00",
            }
        )
    return items


def parse_workers(rows, start, end):
    """Parse ЗП ЦЕХ.

    Layout A (common): G='ЦЕХ', H='час', rows name@G hours@H day@I total@K
    Layout днепр:     H='ЦЕХ', I='чел/смен', rows name@H hours@I day@J total@L(K)
    """
    r0, header = find_row(rows, start, end, _is_cex_header_row)
    if r0 is None:
        return [], 8
    header = pad_row(header)
    # name in G when header ЦЕХ is in G; name in H when header ЦЕХ is in H
    shifted = isinstance(header[7], str) and _norm_section_label(header[7]) == "цех"
    hours_per_shift = 8
    for r, vals in iter_block(rows, max(start, r0 - 5), r0):
        if num(vals[9]) == 8:
            hours_per_shift = 8
    workers = []
    empty_streak = 0
    for r, vals in iter_block(rows, r0 + 1, end):
        vals = pad_row(vals)
        if shifted:
            name = vals[7]
            hours = num(vals[8])
            day = num(vals[9])
            total = num(vals[11])
            hour_rate = None
        else:
            name = vals[6]
            hours = num(vals[7])
            day = num(vals[8])
            total = num(vals[10])
            hour_rate = num(vals[9])
        if isinstance(name, str) and _norm_section_label(name) == "цех":
            break
        # contractor / other tables after workers
        if isinstance(name, str) and (
            "підряд" in name.lower() or "подряд" in name.lower() or "роботи" in name.lower()
        ):
            break
        if name in (None, ""):
            empty_streak += 1
            if workers and empty_streak >= 3:
                break
            continue
        empty_streak = 0
        # Premium / lump-sum rows: name + итого only (e.g. "прем", "Покраска")
        if (hours is None or day is None) and total not in (None, 0):
            workers.append(
                {
                    "name": map_name(str(name)),
                    "numberOfHoursWorked": 0,
                    "salaryPerDay": 0,
                    "salaryPerHour": 0,
                    "total": int(round(total)),
                }
            )
            continue
        if hours is None or day is None:
            continue
        if hours == 0 and total in (None, 0):
            continue
        workers.append(
            {
                "name": map_name(str(name)),
                # DB column is INTEGER — for чел/смен this is shift-count, not clock hours
                "numberOfHoursWorked": int(round(hours)),
                "salaryPerDay": int(round(day)),
                "salaryPerHour": int(round(hour_rate)) if hour_rate is not None else None,
                "total": int(round(total)) if total is not None else None,
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


# Left-column cost labels → galvanizedValue / transportValue.
# Keys: lowercased, ё→е, stripped; trailing ":" ignored at match time.
# Excel often uses short / alternate spellings instead of «Оцинковка» / «Транспорт».
GALVANIZED_LABEL_ALIASES = frozenset(
    {
        "оцинковка",
        "подрядные цинк",
        "цинкование",
        "цинк",
        "цинк факт",
    }
)
TRANSPORT_LABEL_ALIASES = frozenset(
    {
        "транспорт",
        "транспорт оцинк",
        "трансп",
        "трансп подряд",
        "транспортні послуги",
        "транспорт факт",
    }
)


def _norm_cost_label(label: str) -> str:
    s = str(label or "").strip().lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s)
    return s.rstrip(":").strip()


def is_galvanized_label(label: str) -> bool:
    low = _norm_cost_label(label)
    return low in GALVANIZED_LABEL_ALIASES


def is_transport_label(label: str) -> bool:
    low = _norm_cost_label(label)
    if low in TRANSPORT_LABEL_ALIASES:
        return True
    # Compound rows: «Транспорт оцинк+доставка», «Транспорт оцинк+в из»
    return low.startswith("транспорт оцинк")


SPEC_STOP_NAMES = {
    "Металл",
    "Метизы",
    "Расходники",
    "Цех",
    "Ит",
    "ИТ",
    "Оцинковка",
    "Транспорт оцинк",
    "Транспорт",
    "Трансп",
    "Подрядные цинк",
    "Цинкование",
    "Цинк",
    "Аренда",
    "Эл эн",
    "Рентабельность",
    "Покраска + песок",
    "Доставка Залесье",
    "материал",
    "переработка",
    "рент",
    "Итого",
    "Кр+Ш",
    "Бух",
    "Нач Ц",
    "м.п",
    "мп",
    "услуга",
    "тн",
    "шт",
    "штуки",
    "штука",
    "компл",
    "комплект",
    "комплекты",
}

# Units that behave like pieces for per-item divisor (quantity, not qty×weight).
PIECE_UNIT_ALIASES = frozenset(
    {
        "шт",
        "штуки",
        "штука",
        "компл",
        "комплект",
        "комплекты",
    }
)

_PER_UNIT_HEADER_RE = re.compile(r"^на\s*1\s*(.+)$", re.IGNORECASE)


def _normalize_unit_key(unit: str) -> str:
    return str(unit or "").strip().lower().replace(" ", "").replace("ё", "е")


def is_piece_unit(unit: str) -> bool:
    return _normalize_unit_key(unit) in PIECE_UNIT_ALIASES


def _canonical_summary_unit(raw: str) -> str:
    """Normalize unit taken from 'на 1XXX' cost-summary header."""
    key = _normalize_unit_key(raw)
    if not key:
        return "шт"
    if key in ("м.п", "мп", "м.п.", "м"):
        return "м"
    if key in ("тн", "т", "тонна", "тонны"):
        return "тн"
    if key in PIECE_UNIT_ALIASES:
        # Keep компл* as "компл" for display; piece aliases → "шт"
        if key.startswith("компл"):
            return "компл"
        return "шт"
    return str(raw).strip()


def _extract_unit_from_per_unit_label(label) -> str | None:
    if not isinstance(label, str):
        return None
    text = label.strip()
    if not text:
        return None
    m = _PER_UNIT_HEADER_RE.match(text)
    if not m:
        return None
    return _canonical_summary_unit(m.group(1))


def _find_cost_summary_unit(rows, start, end) -> str | None:
    """
    Unit for «На 1 единицу» comes from the header above Металл/Метизы/Расходники/Цех
    (e.g. 'на 1компл', 'на 1шт', 'на 1тн', 'на 1м.п') — not from spec weight headers like 'вес 1шт, тн'.
    """
    r_metal, _ = find_row(rows, start, end, lambda v: len(v) > 1 and v[1] == "Металл")
    if r_metal is None:
        return None
    for r in range(r_metal - 1, max(start, r_metal - 6) - 1, -1):
        vals = pad_row(rows.get(r, []))
        for col in (4, 3, 5, 2):  # E, D, F, C
            unit = _extract_unit_from_per_unit_label(vals[col] if col < len(vals) else None)
            if unit:
                return unit
    return None


def _read_qty_block_above_metal(rows, start, end) -> tuple[str | None, float | None]:
    """Read unit + value from the compact qty block above Металл (e.g. B='тн', B=0.297, E='на 1тн')."""
    r_metal, _ = find_row(rows, start, end, lambda v: len(v) > 1 and v[1] == "Металл")
    if r_metal is None:
        return None, None

    unit_from_b = None
    unit_from_per = None
    value = None
    for r in range(r_metal - 1, max(start, r_metal - 6) - 1, -1):
        vals = pad_row(rows.get(r, []))
        b = vals[1]
        if value is None and not isinstance(b, str):
            n = num(b)
            if n is not None and n != 0:
                value = n
        if isinstance(b, str) and b.strip():
            key = _normalize_unit_key(b)
            if unit_from_b is None and (
                key in ("тн", "т", "м.п", "мп", "м")
                or is_piece_unit(key)
                or key.startswith("компл")
            ):
                unit_from_b = _canonical_summary_unit(b)
        if unit_from_per is None:
            for col in (4, 3, 5, 2):
                unit_from_per = _extract_unit_from_per_unit_label(vals[col] if col < len(vals) else None)
                if unit_from_per:
                    break
    # Prefer explicit B label (тн / компл / шт) over «на 1…» when both exist.
    unit = unit_from_b or unit_from_per or _find_cost_summary_unit(rows, start, end)
    return unit, value


def _fallback_spec_from_qty_block(rows, start, end, notes: str = "") -> dict | None:
    """When Спецификация has no named rows but Excel has qty/weight above Металл.

    Creates: name=«Без названия», quantity=1, unit + valuePerUnit from that block
    (e.g. тн / 0.297 for Площадка НП Изюм).
    """
    unit, value = _read_qty_block_above_metal(rows, start, end)
    if value is None:
        return None
    if unit is None:
        unit = "тн" if abs(value) < 10 else "шт"
    return {
        "notes": notes or "",
        "table": [
            {
                "name": "Без названия",
                "quantity": 1,
                "valuePerUnit": value,
                "unitOfMeasurement": unit,
                "totalWeight": None,
            }
        ],
    }


def _spec_unit_and_value(header_qty: str, header_weight: str, weight):
    if weight is None or weight == 0:
        return "шт", 1
    header_qty_l = header_qty.lower()
    if "м.п" in header_qty_l or "мп" in header_qty.replace(".", "").lower():
        unit = "м"
    elif "тн" in header_weight.lower() or "тн" in header_qty_l:
        unit = "тн"
    else:
        unit = "тн" if weight < 10 else "шт"
    return unit, weight


def _is_spec_notes_label(name: str) -> bool:
    low = str(name or "").strip().lower().replace("ё", "е").rstrip(":")
    return low in ("заметки", "заметка", "примечание", "примечания", "комментарий")


_SPEC_NOTE_NOISE = frozenset(
    {
        "итого",
        "всего",
        "сумма",
        "на 1шт",
        "на 1тн",
        "на 1м",
        "на 1м.п",
        "кв.м",
        "квм",
        "м2",
        "м²",
    }
)


def _is_spec_note_candidate(name: str) -> bool:
    """True if free-text under Спецификация looks like a real note, not a unit/footer."""
    s = str(name or "").strip()
    if not s:
        return False
    low = s.lower().replace("ё", "е")
    if low in _SPEC_NOTE_NOISE or low in SPEC_STOP_NAMES:
        return False
    if _is_spec_notes_label(s):
        return False
    key = _normalize_unit_key(s)
    if key in PIECE_UNIT_ALIASES or key in ("м.п", "мп", "м", "тн", "т", "кв.м", "квм"):
        return False
    # Too short / looks like a code-only footer without letters
    if len(s) < 4:
        return False
    return True


def _collect_spec_note_text(vals) -> str | None:
    """Text for notes from a 'Заметки:' row (label in A/B, body in next cells)."""
    vals = pad_row(vals)
    parts = []
    for col in range(0, 6):
        v = vals[col] if col < len(vals) else None
        if v in (None, "") or isinstance(v, (int, float)):
            continue
        s = str(v).strip()
        if not s or _is_spec_notes_label(s):
            continue
        if s in SPEC_STOP_NAMES or not _is_spec_note_candidate(s):
            continue
        parts.append(s)
    return " ".join(parts) if parts else None


def parse_spec(rows, start, end):
    r_h, vals_h = find_row(rows, start, end, lambda v: v[1] == "Спецификация")
    if r_h is None:
        fallback = _fallback_spec_from_qty_block(rows, start, end)
        return fallback or {"notes": "", "table": []}
    header_qty = str(vals_h[2] or "")
    header_weight = str(vals_h[3] or "")
    summary_unit = _find_cost_summary_unit(rows, start, end)
    table = []
    note_parts: list[str] = []
    for r, vals in iter_block(rows, r_h + 1, end):
        vals = pad_row(vals)
        a = vals[0]
        b = vals[1]
        # Explicit «Заметки:» label in A or B (Excel often puts body in the next cell).
        if (isinstance(a, str) and _is_spec_notes_label(a)) or (isinstance(b, str) and _is_spec_notes_label(b)):
            text = _collect_spec_note_text(vals)
            if text:
                note_parts.append(text)
            continue
        if b is None or (isinstance(b, str) and not str(b).strip()):
            continue
        if not isinstance(b, str):
            # numeric summary under м.п / totals — end of spec block
            break
        name = str(b).strip()
        if name in SPEC_STOP_NAMES:
            break
        # Bare unit labels (компл / м.п) above the cost summary — not spec rows
        if _normalize_unit_key(name) in PIECE_UNIT_ALIASES or _normalize_unit_key(name) in ("м.п", "мп", "м"):
            continue
        qty = num(vals[2])
        weight = num(vals[3])
        if qty is None and weight is None:
            # Free-text under Спецификация → Заметки (before Подытог in UI)
            if _is_spec_note_candidate(name):
                note_parts.append(name)
            continue
        # Zeroed «Прочее (…)» lines are comments, not billable spec rows
        if (qty == 0 or qty is None) and (weight == 0 or weight is None) and name.lower().startswith("прочее"):
            if _is_spec_note_candidate(name):
                note_parts.append(name)
            continue
        unit, value_per_unit = _spec_unit_and_value(header_qty, header_weight, weight)
        if summary_unit:
            unit = summary_unit
        table.append(
            {
                "name": name,
                "quantity": qty or 0,
                "valuePerUnit": value_per_unit,
                "unitOfMeasurement": unit,
                "totalWeight": None,
            }
        )
    notes = "\n".join(dict.fromkeys(note_parts))  # preserve order, drop exact dupes
    if not table:
        fallback = _fallback_spec_from_qty_block(rows, start, end, notes=notes)
        if fallback:
            return fallback
    return {"notes": notes, "table": table}


def parse_variables(rows, start, end, itr_days: float):
    def left(label):
        _, vals = find_row(rows, start, end, lambda v: v[1] == label)
        return vals

    ar = left("Аренда")
    el = left("Эл эн")
    rent = left("Рентабельность")

    # Scan cost-summary left column once: aliases for Оцинковка / Транспорт,
    # plus paint → galvanized and delivery → transport extras.
    # Stop at материал/Итого so detail rows (e.g. «покраска работа 2слоя») are skipped.
    galvanized = 0.0
    transport = 0.0
    paint = 0.0
    delivery = 0.0
    for r, vals in iter_block(rows, start, end):
        vals = pad_row(vals)
        lab = vals[1]
        if not isinstance(lab, str):
            continue
        low = _norm_cost_label(lab)
        if low in ("материал", "переработка", "рент", "итого"):
            break
        v = num(vals[2])
        if not v:
            continue
        if is_galvanized_label(low):
            galvanized += v
        elif is_transport_label(low):
            transport += v
        elif low == "покраска + песок" or low.startswith("покраска +") or low.startswith("покраска+"):
            paint += v
        elif low.startswith("доставка"):
            delivery += v

    galvanized = (galvanized or 0) + paint
    transport = (transport or 0) + delivery

    def rate_per_day(row_vals, itr_days_val: float):
        """Prefer Excel column C (total) when it disagrees with D * days.

        Some sheets put a non-rate value in D (e.g. Аренда C=4080, D=136, days=1);
        the Итого formula always uses C.
        """
        if not row_vals:
            return 0
        total = num(row_vals[2])
        rate = num(row_vals[3])
        days = float(itr_days_val or 0)
        if days and total is not None and total != 0:
            if rate is None or abs(total - rate * days) > max(1.0, abs(total) * 0.02):
                return total / days
        if rate is not None:
            return rate
        if days and total is not None:
            return total / days
        return 0

    rental_per_day = rate_per_day(ar, itr_days)
    elec_per_day = rate_per_day(el, itr_days)
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
        lambda v: _is_cost_section_header(v, section_title)
        or (section_title == "Расходники" and len(v) > 7 and v[7] == "ед изм"),
    )
    if r0 is None and section_title == "Металл":
        r0, _ = find_row(rows, start, end, lambda v: _is_cost_section_header(v, "Металл"))
    if r0 is None:
        return []
    items = []
    order = 1
    empty_streak = 0
    for r, vals in iter_block(rows, r0 + 1, end):
        vals = pad_row(vals)
        name = vals[6]
        if _is_cex_header_row(vals):
            break
        # stop at other sections / workers table
        if isinstance(name, str):
            nrm = _norm_section_label(name)
            if nrm in ("метизы", "металл", "расходники", "цех") or "фамилия" in nrm:
                if nrm in ("метизы", "металл", "расходники") and nrm != _norm_section_label(section_title):
                    break
                if "фамилия" in nrm or nrm == "цех":
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

    galvanized = 0.0
    transport = 0.0
    paint = 0.0
    delivery = 0.0
    for r, vals in iter_block(rows, start, end):
        vals = pad_row(vals)
        # Layout B may put the label in col A or B
        lab = vals[1] if isinstance(vals[1], str) and str(vals[1]).strip() else vals[0]
        if not isinstance(lab, str):
            continue
        low = _norm_cost_label(lab)
        if low in ("материал", "переработка", "рент", "итого"):
            break
        v = num(vals[2])
        if not v:
            continue
        if is_galvanized_label(low):
            galvanized += v
        elif is_transport_label(low):
            transport += v
        elif low == "покраска + песок" or low.startswith("покраска +") or low.startswith("покраска+"):
            paint += v
        elif low.startswith("доставка"):
            delivery += v

    galvanized = (galvanized or 0) + paint
    transport = (transport or 0) + delivery

    def rate_per_day(row_vals, itr_days_val: float):
        if not row_vals:
            return 0
        total = num(row_vals[2])
        rate = num(row_vals[3])
        days = float(itr_days_val or 0)
        if days and total is not None and total != 0:
            if rate is None or abs(total - rate * days) > max(1.0, abs(total) * 0.02):
                return total / days
        if rate is not None and rate != 0:
            return rate
        if days and total is not None:
            return total / days
        return 0

    rental_per_day = rate_per_day(ar, itr_days)
    elec_per_day = rate_per_day(el, itr_days)
    # profitability coef often in column A for layout B
    profit = 0
    if rent:
        profit = num(rent[0]) if num(rent[0]) not in (None, 0) and num(rent[0]) < 2 else num(rent[3])
        if profit is None:
            profit = 0

    return {
        "galvanizedValue": int(round(galvanized or 0)),
        "transportValue": int(round(transport or 0)),
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
    allowed_units = {"шт", "тн", "м", "компл", "услуга"}
    for r, vals in iter_block(rows, start, min(start + 10, end)):
        vals = pad_row(vals)
        raw = vals[1]
        if isinstance(raw, str):
            key = _normalize_unit_key(raw)
            if key in allowed_units or is_piece_unit(key):
                unit = _canonical_summary_unit(raw) if key != "услуга" else "шт"
            if key == "услуга":
                unit = "шт"
        if num(vals[1]) is not None and not isinstance(vals[1], str):
            qty = num(vals[1])
        if num(vals[1]) == 1 and vals[2] in ("план", "факт", None):
            qty = 1
            unit = "шт"
    if unit not in allowed_units and not is_piece_unit(unit):
        unit = "шт"
    return {
        "notes": "",
        "table": [
            {
                "name": name or "позиция",
                "quantity": qty or 1,
                "valuePerUnit": 1,
                "unitOfMeasurement": unit,
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


_FASTENER_NAME_RE = re.compile(r"болт|гайк|шайб|гровер|шпильк", re.IGNORECASE)


def _is_fastener_item(item: dict) -> bool:
    name = str(item.get("name") or "")
    unit = _normalize_unit_key(item.get("unitOfMeasurement"))
    return (is_piece_unit(unit) or unit == "пар") and bool(_FASTENER_NAME_RE.search(name))


def _cost_item_amount(item: dict) -> float:
    raw = item.get("price")
    if isinstance(raw, (int, float)):
        return float(raw)
    if raw in (None, ""):
        return 0.0
    text = str(raw).replace("\xa0", " ").replace(" ", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def _metiz_section_customer_paid(rows, start, end) -> bool:
    """True when Метизы are marked as bought by customer (e.g. 'купил НАН')."""
    r0, vals = find_row(rows, start, end, lambda v: len(v) > 6 and v[6] == "Метизы")
    if r0 is None:
        return False
    vals = pad_row(vals)
    note = " ".join(str(vals[i]) for i in range(7, 12) if vals[i] not in (None, ""))
    return any(k in note.lower() for k in ("купил", "куплено", "давальч"))


def _left_summary_total(rows, start, end, label: str):
    _, vals = find_row(rows, start, end, lambda v, lab=label: len(v) > 1 and v[1] == lab)
    return num(vals[2]) if vals else None


def extract_block_itogo(rows, start, end) -> float | None:
    """Primary cost-summary «Итого» for a ПЛАН/ФАКТ block.

    Takes the *first* Итого that follows the материал/переработка/рент
    (or Рентабельность) trio — that is the calc total. Later «Итого» rows are
    often payment rollups / multi-item footers (e.g. деф швы ДШ4 fact: 286k then
    483k) and must not override the primary figure.
    """
    seen_cost_summary = False
    for _r, vals in iter_block(rows, start, end):
        vals = pad_row(vals)
        lab = vals[1] if len(vals) > 1 else None
        if not isinstance(lab, str):
            continue
        low = lab.strip().lower().replace("ё", "е")
        if low in ("материал", "переработка", "рент", "рентабельность"):
            seen_cost_summary = True
            continue
        if low != "итого" or not seen_cost_summary:
            continue
        v = num(vals[2])
        if v is None:
            v = num(vals[3])
        if v is not None and abs(v) >= 100:
            return float(v)
        # Tiny/garbage «Итого» right after summary — ignore, keep looking only
        # if another summary chain appears (reset).
        seen_cost_summary = False
    return None


def excel_itogo_for_file(path: Path, prefer_kind: str, date_iso: str | None = None) -> float | None:
    """Excel «Итого» for the block chosen the same way as parse_excel_file."""
    rows = load_sheet_rows(path)
    ranges = block_ranges(rows)
    if not ranges:
        return None
    requested = prefer_kind
    if requested == "ПЛАН" and any(k == "ПЛАН" for k, _, _ in ranges):
        prefer_kind = "ПЛАН"
    kind, start, end = choose_block(ranges, prefer_kind, rows, date_iso=date_iso)
    if requested == "ПЛАН" and kind != "ПЛАН":
        plan_blocks = [(k, s, e) for k, s, e in ranges if k == "ПЛАН"]
        if plan_blocks:
            kind, start, end = plan_blocks[0]
    return extract_block_itogo(rows, start, end)


def _filter_metal_alternatives(metal: list, left_metal) -> list:
    """When Металл lists mutually exclusive options (Дорогой вар / Аналоги), keep
    the row(s) that match the left-column «Металл» summary.
    """
    if not metal or left_metal is None:
        return list(metal)
    full_sum = sum(_cost_item_amount(i) for i in metal)
    tol = max(2.0, abs(left_metal) * 0.01)
    if abs(full_sum - left_metal) <= tol:
        return list(metal)
    exact = [i for i in metal if abs(_cost_item_amount(i) - left_metal) <= tol]
    if exact:
        return exact
    return list(metal)


def _split_metal_excluded_hardware(metal: list, left_metal) -> tuple[list, list]:
    """Keep Металл rows in metal unless Excel's «Металл» total excludes them.

    Old rule moved every шт-row (e.g. «доставка пиломатериалов») into Метизы and
    often flipped «Исключить из подсчета» — breaking Итого when Excel already
    includes that row in Металл.

    Strategy: if the full metal sum already matches Excel's left «Металл» — keep
    all rows there. Otherwise move the candidate set (prefer fasteners, else all
    piece/пар rows) that most improves the match to that summary.
    """
    if not metal:
        return [], []

    full_sum = sum(_cost_item_amount(i) for i in metal)
    if left_metal is None:
        # No summary to compare — keep everything under Металл.
        return list(metal), []

    gap_full = abs(full_sum - left_metal)
    tol = max(2.0, abs(left_metal) * 0.01)
    if gap_full <= tol:
        return list(metal), []

    fasteners = [i for i in metal if _is_fastener_item(i)]
    piece_or_pair = [
        i
        for i in metal
        if is_piece_unit(i.get("unitOfMeasurement"))
        or _normalize_unit_key(i.get("unitOfMeasurement")) == "пар"
    ]

    best_move: list = []
    best_gap = gap_full
    for candidates in (fasteners, piece_or_pair):
        if not candidates:
            continue
        without = full_sum - sum(_cost_item_amount(i) for i in candidates)
        gap = abs(without - left_metal)
        # Require a clear improvement (close most of the gap to Excel Металл).
        if gap + 1e-6 < best_gap and gap < gap_full * 0.5:
            best_gap = gap
            best_move = candidates

    if not best_move:
        return list(metal), []

    move_ids = {id(i) for i in best_move}
    keep = [i for i in metal if id(i) not in move_ids]
    return keep, list(best_move)


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

    left_metal = _left_summary_total(rows, start, end, "Металл")
    metal = _filter_metal_alternatives(metal, left_metal)
    metal, metal_to_hw = _split_metal_excluded_hardware(metal, left_metal)
    if metal_to_hw:
        for idx, item in enumerate(metal_to_hw, 1):
            item["order"] = str(len(hardware) + idx)
        hardware = hardware + metal_to_hw

    left_metiz = _left_summary_total(rows, start, end, "Метизы")
    # Exclude hardware from Итого only when Excel marks it as customer-supplied
    # ("купил НАН") or we moved rows that Excel's Металл total already omits while
    # left Метизы is empty (typical for МК platform / plates).
    customer_paid_hw = _metiz_section_customer_paid(rows, start, end)
    if not customer_paid_hw and metal_to_hw and left_metiz in (None, 0):
        customer_paid_hw = True

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
        # isHardwareEnabled=True means "exclude hardware from Итого" in the UI
        "isHardwareEnabled": bool(customer_paid_hw),
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
        # Prefer Excel "итого" when present — (day_rate/shift)*hours often diverges
        # due to rounding (e.g. 1969 vs 1875).
        stored_total = w.get("total")
        if stored_total is not None and stored_total != "":
            workers_salary += float(stored_total)
        else:
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
    piece_items = [i for i in spec_items if is_piece_unit(i.get("unitOfMeasurement"))]
    if piece_items:
        divisor = sum(float(i.get("quantity") or 0) for i in piece_items)
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


def _block_date_key(rows: dict, start: int) -> str | None:
    """YYYY-MM from block title/marker if present (e.g. 'ФАКТ … 2025-03-01')."""
    vals = pad_row(rows.get(start, []))
    blob = " ".join(str(v) for v in vals[:6] if v not in (None, ""))
    m = re.search(r"(20\d{2})[_./\-](\d{2})(?:[_./\-](\d{2}))?", blob)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    for v in vals[:6]:
        if isinstance(v, datetime):
            return f"{v.year:04d}-{v.month:02d}"
    return None


def choose_block(ranges, prefer_kind: str, rows: dict, date_iso: str | None = None):
    """Pick ПЛАН/ФАКТ block.

    - For ПЛАН: never fall back to a ФАКТ block when a ПЛАН exists (plan data must
      not be taken from the last monthly fact in the same workbook).
    - For multiple ФАКТ: prefer block whose title/date matches date_iso (YYYY-MM),
      then titled sections over anonymous ones; last resort = latest block.
    """
    matching = [(k, s, e) for k, s, e in ranges if k == prefer_kind]
    if not matching:
        # Plan requested but only fact markers → caller may clone; use first range.
        # Fact requested but only plan → last range (legacy single-block files).
        if prefer_kind == "ПЛАН":
            planish = [(k, s, e) for k, s, e in ranges if k == "ПЛАН"]
            return planish[0] if planish else ranges[0]
        if prefer_kind == "ФАКТ" and any(k == "ПЛАН" for k, _, _ in ranges):
            return ranges[-1]
        return ranges[0]
    if len(matching) == 1:
        return matching[0]

    want_ym = None
    if date_iso:
        m = re.match(r"(20\d{2})-(\d{2})", str(date_iso))
        if m:
            want_ym = f"{m.group(1)}-{m.group(2)}"

    def title_quality(start: int) -> tuple:
        t = parse_title(rows, start, prefer_kind).replace(" - факт", "").strip()
        bad = (not t) or t.startswith("Калькуляция ") or re.match(r"^\d{4}-\d{2}-\d{2}", t)
        block_ym = _block_date_key(rows, start)
        date_score = 2 if (want_ym and block_ym == want_ym) else (1 if not want_ym else 0)
        # higher is better: date match > good title > later start
        return (date_score, 0 if bad else 1, start)

    matching.sort(key=lambda x: title_quality(x[1]))
    return matching[-1]


def parse_excel_file(path: Path, prefer_kind: str, date_iso: str, itr_days_override=None):
    rows = load_sheet_rows(path)
    ranges = block_ranges(rows)
    if not ranges:
        raise ValueError(f"No ПЛАН/ФАКТ markers in {path.name}")
    # If a Fact_ workbook still contains a ПЛАН section, plan calcs must use it —
    # never the last monthly ФАКТ (that bug filled plan #280 metal from Mar fact).
    requested = prefer_kind
    if requested == "ПЛАН" and any(k == "ПЛАН" for k, _, _ in ranges):
        prefer_kind = "ПЛАН"
    chosen = choose_block(ranges, prefer_kind, rows, date_iso=date_iso)
    kind, start, end = chosen
    # Safety: never parse a ФАКТ range into a plan payload when ПЛАН exists.
    if requested == "ПЛАН" and kind != "ПЛАН":
        plan_blocks = [(k, s, e) for k, s, e in ranges if k == "ПЛАН"]
        if plan_blocks:
            kind, start, end = plan_blocks[0]
    payload = parse_block(
        rows,
        kind if kind in ("ПЛАН", "ФАКТ") else prefer_kind,
        start,
        end,
        date_iso,
        itr_days_override=itr_days_override,
    )
    # force requested type when falling back
    if requested == "ФАКТ":
        payload["calculationType"] = "fact"
    elif requested == "ПЛАН":
        payload["calculationType"] = "plan"
    refine_title(payload, path, requested)
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


def _snake_to_camel_key(key: str) -> str:
    parts = key.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def calculation_to_put_body(calc: dict, payload: dict) -> dict:
    """Build PUT /calculation/:id body from GET response + repaired parse payload.

    Used by --repair-specs: refreshes specification (+ per-item totals) only;
    keeps existing metal/hardware/consumables/workers/total from DB.
    """
    body = {}
    for k, v in calc.items():
        if k in ("id", "parent_calculation_id", "calculation_type"):
            continue
        body[_snake_to_camel_key(k)] = v

    # nested tables from GET use snake; API expects camel for nested updates
    spec = calc.get("specification_data") or {}
    body["specificationData"] = {
        "notes": payload["specificationData"].get("notes") or spec.get("notes") or "",
        "table": [
            {
                "name": item["name"],
                "quantity": item["quantity"],
                "valuePerUnit": item["valuePerUnit"],
                "unitOfMeasurement": item["unitOfMeasurement"],
                "totalWeight": item.get("totalWeight"),
            }
            for item in payload["specificationData"]["table"]
        ],
    }
    body["workersData"] = {
        "notes": (calc.get("workers_data") or {}).get("notes") or "",
        "table": (calc.get("workers_data") or {}).get("table") or [],
    }
    body["itrData"] = {
        "notes": (calc.get("itr_data") or {}).get("notes") or "",
        "table": (calc.get("itr_data") or {}).get("table") or [],
    }
    body["workersTaxData"] = calc.get("workers_tax_data") or payload.get("workersTaxData")
    body["itrTaxData"] = calc.get("itr_tax_data") or payload.get("itrTaxData")
    body["consumablesData"] = json.dumps(calc.get("consumables_data") or [], ensure_ascii=False)
    body["hardwareData"] = json.dumps(calc.get("hardware_data") or [], ensure_ascii=False)
    body["metalData"] = json.dumps(calc.get("metal_data") or [], ensure_ascii=False)
    body["isMetalEnabled"] = calc.get("is_metal_enabled") or False
    body["isHardwareEnabled"] = calc.get("is_hardware_enabled") or False

    # per-item totals depend on full specification; recompute from payload
    body["totalMetalPerItem"] = payload.get("totalMetalPerItem")
    body["totalProcessingPerItem"] = payload.get("totalProcessingPerItem")
    body["totalProfitabilityPerItem"] = payload.get("totalProfitabilityPerItem")
    body["total"] = calc.get("total")  # grand total does not depend on spec rows
    body["lastEditDate"] = datetime.utcnow().isoformat() + "Z"
    return body


def calculation_to_full_put_body(calc: dict, payload: dict) -> dict:
    """Full reparse PUT: replace cost tables, workers, ITR, variables and total from payload.

    Reuses existing row ids where possible so UPDATE paths work; caller must DELETE
    leftover rows when the new table is shorter.
    """
    body = to_api_body(payload, parent_id=calc.get("parent_calculation_id"))
    body.pop("parentCalculationId", None)
    body.pop("calculationType", None)

    def merge_table(existing: list, new_rows: list) -> list:
        out = []
        for i, row in enumerate(new_rows):
            item = dict(row)
            if i < len(existing) and existing[i].get("id") is not None:
                item["id"] = existing[i]["id"]
            out.append(item)
        return out

    old_spec = (calc.get("specification_data") or {}).get("table") or []
    new_spec = payload.get("specificationData", {}).get("table") or []
    body["specificationData"] = {
        "notes": payload.get("specificationData", {}).get("notes")
        or (calc.get("specification_data") or {}).get("notes")
        or "",
        "table": merge_table(old_spec, new_spec),
    }

    old_workers = (calc.get("workers_data") or {}).get("table") or []
    new_workers = payload.get("workersData", {}).get("table") or []
    body["workersData"] = {
        "notes": (calc.get("workers_data") or {}).get("notes") or "",
        "table": merge_table(old_workers, new_workers),
    }

    old_itr = (calc.get("itr_data") or {}).get("table") or []
    new_itr = payload.get("itrData", {}).get("table") or []
    body["itrData"] = {
        "notes": (calc.get("itr_data") or {}).get("notes") or "",
        "table": merge_table(old_itr, new_itr),
    }

    # Keep tax row ids from DB when present
    for tax_key_snake, tax_key_camel in (
        ("workers_tax_data", "workersTaxData"),
        ("itr_tax_data", "itrTaxData"),
    ):
        old_tax = calc.get(tax_key_snake) or []
        new_tax = payload.get(tax_key_camel) or old_tax
        merged = []
        for i, row in enumerate(new_tax):
            item = dict(row)
            if i < len(old_tax) and old_tax[i].get("id") is not None:
                item["id"] = old_tax[i]["id"]
            merged.append(item)
        body[tax_key_camel] = merged

    body["lastEditDate"] = datetime.utcnow().isoformat() + "Z"
    return body


def _trim_nested_tables(token: str, calc: dict, payload: dict):
    """Delete extra specification/workers/ITR rows left after a shorter reparse."""
    old_spec = (calc.get("specification_data") or {}).get("table") or []
    new_n = len(payload.get("specificationData", {}).get("table") or [])
    for item in old_spec[new_n:]:
        if item.get("id") is not None:
            api_request("DELETE", f"/specification-data-table/{item['id']}", token)

    old_workers = (calc.get("workers_data") or {}).get("table") or []
    new_n = len(payload.get("workersData", {}).get("table") or [])
    for item in old_workers[new_n:]:
        if item.get("id") is not None:
            api_request("DELETE", f"/workers-data-table/{item['id']}", token)

    old_itr = (calc.get("itr_data") or {}).get("table") or []
    new_n = len(payload.get("itrData", {}).get("table") or [])
    for item in old_itr[new_n:]:
        if item.get("id") is not None:
            api_request("DELETE", f"/itr-data-table/{item['id']}", token)


def collect_job_payloads_with_sources(job: dict) -> list[tuple[dict, Path]]:
    """Parse job like import_job; return [(payload, source_xlsx_path), ...]."""
    items = []
    if job["kind"] == "plan_with_facts":
        plan_payload, _ = parse_excel_file(job["plan"], "ПЛАН", job["plan_date"])
        items.append((plan_payload, job["plan"]))
        for i, fact_path in enumerate(job["facts"]):
            fact_date = job["fact_dates"][i] if i < len(job["fact_dates"]) else extract_date_iso(fact_path)
            try:
                fact_payload, _ = parse_excel_file(
                    fact_path,
                    "ФАКТ",
                    fact_date,
                    itr_days_override=job.get("fact_itr_days_override"),
                )
            except Exception:
                fact_payload, _ = parse_excel_file(fact_path, "ПЛАН", fact_date)
                fact_payload["calculationType"] = "fact"
                if not str(fact_payload["title"]).lower().endswith("факт"):
                    fact_payload["title"] = f"{fact_payload['title']} - факт"
            items.append((fact_payload, fact_path))
        return items

    fact_path = job["facts"][0]
    rows = load_sheet_rows(fact_path)
    ranges = block_ranges(rows)
    if not ranges and rows:
        ranges = [("ФАКТ", min(rows), max(rows))]
    kinds = {k for k, _, _ in ranges}

    if "ФАКТ" in kinds:
        fact_payload, _ = parse_excel_file(fact_path, "ФАКТ", job["fact_dates"][0])
        items.append((fact_payload, fact_path))
        if "ПЛАН" in kinds:
            items.append((parse_excel_file(fact_path, "ПЛАН", job["plan_date"])[0], fact_path))
        else:
            items.append((clone_as_plan(fact_payload), fact_path))
    elif "ПЛАН" in kinds:
        fact_payload, _ = parse_excel_file(fact_path, "ПЛАН", job["fact_dates"][0])
        fact_payload["calculationType"] = "fact"
        refine_title(fact_payload, fact_path, "ФАКТ")
        items.append((fact_payload, fact_path))
        items.append((clone_as_plan(fact_payload), fact_path))
    else:
        raise ValueError(f"No usable blocks in {fact_path.name}")
    return items


def collect_job_payloads(job: dict) -> list[dict]:
    """Parse job the same way as import_job, return list of payloads (plan + facts)."""
    return [payload for payload, _source in collect_job_payloads_with_sources(job)]


def _norm_text(value: str) -> str:
    import unicodedata

    s = unicodedata.normalize("NFC", str(value or ""))
    s = s.lower().replace("ё", "е")
    s = re.sub(r"\s*-\s*факт\s*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"[+\-_/.,:;()]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def title_tokens(value: str) -> set[str]:
    stop = {"факт", "план", "и", "на", "для", "с", "из"}
    return {t for t in _norm_text(value).split() if t and t not in stop}


def titles_compatible(a: str, b: str) -> bool:
    ta, tb = title_tokens(a), title_tokens(b)
    if not ta or not tb:
        return False
    if ta == tb or ta <= tb or tb <= ta:
        return True
    overlap = len(ta & tb)
    return overlap >= 2 and overlap >= min(len(ta), len(tb)) * 0.5


def same_calendar_day(a, b) -> bool:
    """Compare ISO / DB timestamps by YYYY-MM-DD."""
    if not a or not b:
        return False
    sa, sb = str(a), str(b)
    return sa[:10] == sb[:10]


def repair_specs(token: str, jobs: list, dry_run: bool = False):
    """Re-parse specs and update existing calculations that lost multi-row specifications."""
    repaired, skipped, failed = [], [], []
    seen_calc_ids = set()

    status, parents = api_request("GET", "/parent-calculations", token)
    if status >= 400:
        raise RuntimeError(f"Cannot list parents: {parents}")
    all_briefs = []
    for parent in parents or []:
        all_briefs.extend(parent.get("calculations") or [])

    for idx, job in enumerate(jobs, 1):
        print(f"\n[{idx}/{len(jobs)}] repair scan: {job['label']}", flush=True)
        try:
            payloads = collect_job_payloads(job)
        except Exception as e:
            print(f"  !! parse failed: {e}", flush=True)
            failed.append((job["label"], str(e)))
            continue

        file_hint = subject_key(job.get("plan") or (job.get("facts") or [None])[0] or Path(job["label"]))

        for payload in payloads:
            table = payload.get("specificationData", {}).get("table") or []
            if len(table) <= 1:
                continue
            title = payload["title"]
            calc_type = payload["calculationType"]
            first_name = table[0]["name"]
            print(f"  multi-spec ({len(table)}): {title!r} [{calc_type}] first={first_name!r}", flush=True)

            candidates = [
                c
                for c in all_briefs
                if c.get("calculation_type") == calc_type
                and (
                    titles_compatible(c.get("title") or "", title)
                    or titles_compatible(c.get("title") or "", file_hint)
                )
            ]
            if not candidates:
                print(
                    f"  !! no title-compatible DB candidates for {title!r} / hint={file_hint!r}",
                    flush=True,
                )
                skipped.append((title, calc_type, "no match"))
                continue

            # Resolve candidates: same first-spec name, prefer same calendar day
            resolved = []
            for brief in candidates:
                cid = brief["id"]
                if cid in seen_calc_ids:
                    continue
                st, calc = api_request("GET", f"/calculation/{cid}", token)
                if st >= 400 or not calc:
                    failed.append((title, f"GET {cid} -> {st}"))
                    continue
                existing = (calc.get("specification_data") or {}).get("table") or []
                existing_names = [i.get("name") for i in existing]
                if existing and existing_names[0] != first_name:
                    continue
                if not existing and first_name:
                    # empty spec — allow only with strong title+date match
                    if not same_calendar_day(calc.get("date_of_creation"), payload.get("dateOfCreation")):
                        continue
                resolved.append((calc, existing, existing_names))

            same_day = [
                x
                for x in resolved
                if same_calendar_day(x[0].get("date_of_creation"), payload.get("dateOfCreation"))
            ]
            picked = same_day if same_day else resolved

            if not picked:
                print(f"  !! no DB match by first-spec={first_name!r} title={title!r}", flush=True)
                skipped.append((title, calc_type, "no match"))
                continue

            for calc, existing, existing_names in picked:
                cid = calc["id"]
                expected_names = [i["name"] for i in table]
                if existing_names == expected_names:
                    print(f"  skip id={cid} ({calc.get('title')!r}): already complete", flush=True)
                    skipped.append((cid, title, "already ok"))
                    seen_calc_ids.add(cid)
                    continue
                if existing and len(existing) >= len(table) and existing_names != expected_names:
                    print(
                        f"  skip id={cid} ({calc.get('title')!r}): not truncated "
                        f"{existing_names} vs {expected_names}",
                        flush=True,
                    )
                    skipped.append((cid, title, "not truncated"))
                    continue

                print(
                    f"  repair id={cid} ({calc.get('title')!r}): {len(existing)} -> {len(table)} rows "
                    f"{existing_names} => {expected_names}",
                    flush=True,
                )
                if dry_run:
                    repaired.append((cid, calc.get("title") or title, len(existing), len(table)))
                    seen_calc_ids.add(cid)
                    continue

                for item in existing:
                    if item.get("id") is not None:
                        api_request("DELETE", f"/specification-data-table/{item['id']}", token)

                body = calculation_to_put_body(calc, payload)
                st2, updated = api_request("PUT", f"/calculation/{cid}", token, body)
                if st2 >= 400:
                    print(f"  !! PUT failed id={cid}: {updated}", flush=True)
                    failed.append((cid, str(updated)))
                    continue
                st3, check = api_request("GET", f"/calculation/{cid}", token)
                new_n = len(((check or {}).get("specification_data") or {}).get("table") or [])
                print(f"  OK id={cid}: now {new_n} rows", flush=True)
                repaired.append((cid, calc.get("title") or title, len(existing), new_n))
                seen_calc_ids.add(cid)

    print("\n" + "=" * 72)
    print(f"REPAIR DONE: repaired={len(repaired)} skipped={len(skipped)} failed={len(failed)}")
    for cid, title, old_n, new_n in repaired:
        print(f"  {cid}: {title} ({old_n}->{new_n})")
    if failed:
        print("Failures:")
        for a, b in failed:
            print(f"  - {a}: {b}")
    return repaired, skipped, failed


def _src_file_index() -> dict:
    import unicodedata

    index = {}
    if not FOR_TESTING.exists():
        return index
    for p in FOR_TESTING.rglob("*.xlsx"):
        if p.name.startswith("~$") or any(part in SKIP_DIRS for part in p.parts):
            continue
        n = unicodedata.normalize("NFC", p.name)
        index[n] = p
        index[n.lower()] = p
    return index


def _metal_fingerprint(items) -> tuple:
    rows = []
    for it in items or []:
        if isinstance(it, dict):
            rows.append(
                (
                    str(it.get("name") or "").strip().lower(),
                    str(it.get("quantity") or "").strip(),
                    str(it.get("price") or it.get("total") or "").strip(),
                )
            )
    return tuple(rows)


def repair_plans_taken_from_fact(token: str, dry_run: bool = False, schema: str = "user_1"):
    """Re-parse plan calcs whose Fact_ workbook still has a ПЛАН block.

    Previous repair helpers sometimes re-imported plan rows with prefer=ФАКТ
    (last monthly fact). This restores metal/workers/total from the ПЛАН section.
    """
    import unicodedata

    env = _load_db_env()
    # Media lives in user schema; DB_NAME in .env may be 'postgres' (multi-schema) or 'calculations'
    file_index = _src_file_index()
    sep = "\x1f"
    raw = _psql(
        f"""
        SELECT c.id::text||'{sep}'||coalesce(c.title,'')||'{sep}'||
               coalesce(c.total::text,'')||'{sep}'||coalesce(c.date_of_creation::text,'')||'{sep}'||
               m.file_name
        FROM {schema}.calculation c
        JOIN {schema}.calculation_media_files m ON m.calculation_id = c.id
        WHERE c.calculation_type = 'plan'
          AND c.id >= 138
          AND m.file_name ILIKE '%.xlsx'
        ORDER BY c.id, m.id
        """,
        env,
    )
    by_id = {}
    for ln in raw.splitlines():
        if not ln.strip():
            continue
        cid_s, title, total_s, date_s, fname = ln.split(sep)
        cid = int(cid_s)
        nf = unicodedata.normalize("NFC", fname)
        # Prefer a Fact_ media that actually contains ПЛАН; keep best title overlap.
        score = 2 if nf.startswith("Факт") or nf.lower().startswith("факт") else 1
        if nf.startswith("План") or nf.lower().startswith("план"):
            score = 3  # dedicated plan file wins
        cur = by_id.get(cid)
        cand = {
            "title": title,
            "total": float(total_s) if total_s else None,
            "date": (date_s or "")[:10] or None,
            "fname": fname,
            "score": score,
        }
        if cur is None or score > cur["score"]:
            by_id[cid] = cand

    repaired, skipped, failed = [], [], []
    print(f"Plan calcs with media to scan: {len(by_id)}", flush=True)

    for cid, info in sorted(by_id.items()):
        nf = unicodedata.normalize("NFC", info["fname"])
        path = file_index.get(nf) or file_index.get(nf.lower())
        if not path:
            skipped.append((cid, f"missing file {info['fname']}"))
            continue
        try:
            rows = load_sheet_rows(path)
            ranges = block_ranges(rows)
        except Exception as e:
            failed.append((cid, f"read {path.name}: {e}"))
            continue

        has_plan = any(k == "ПЛАН" for k, _, _ in ranges)
        has_fact = any(k == "ФАКТ" for k, _, _ in ranges)
        # Only relevant when workbook mixes ПЛАН + ФАКТ (typical Fact_ cumulative files)
        # OR plan was attached only to Fact_ media.
        is_fact_media = nf.startswith("Факт") or nf.lower().startswith("факт")
        if not (has_plan and (has_fact or is_fact_media)):
            skipped.append((cid, "no ПЛАН+ФАКТ mix"))
            continue

        date_iso = info["date"] or extract_date_iso(path) or "2025-01-01"
        try:
            payload, _ = parse_excel_file(path, "ПЛАН", date_iso)
        except Exception as e:
            failed.append((cid, f"parse: {e}"))
            continue

        st, calc = api_request("GET", f"/calculation/{cid}", token)
        if st != 200 or not calc:
            failed.append((cid, f"GET {st}"))
            continue

        old_fp = _metal_fingerprint(calc.get("metal_data"))
        new_fp = _metal_fingerprint(payload.get("metalData"))
        old_total = float(calc.get("total") or 0)
        new_total = float(payload.get("total") or 0)
        # Also catch wrong total with coincidentally empty metal
        needs = old_fp != new_fp or abs(old_total - new_total) > 2.0
        if not needs:
            skipped.append((cid, "already matches ПЛАН"))
            continue

        print(
            f"  repair plan #{cid} {info['title']!r}: "
            f"total {old_total:.2f}->{new_total:.2f} "
            f"metal {list(old_fp)[:2]} -> {list(new_fp)[:2]} "
            f"<- {path.name}",
            flush=True,
        )
        if dry_run:
            repaired.append((cid, info["title"], old_total, new_total))
            continue

        try:
            body = calculation_to_full_put_body(calc, payload)
            _trim_nested_tables(token, calc, payload)
            api_request("PUT", f"/calculation/{cid}", token, body)
            st2, check = api_request("GET", f"/calculation/{cid}", token)
            check_fp = _metal_fingerprint(check.get("metal_data"))
            check_total = float(check.get("total") or 0)
            if check_fp != new_fp and abs(check_total - new_total) > 2:
                failed.append((cid, f"after PUT metal/total still wrong ({check_total})"))
            else:
                repaired.append((cid, info["title"], old_total, check_total))
        except Exception as e:
            failed.append((cid, str(e)))

    print(
        f"REPAIR PLAN-FROM-FACT DONE: repaired={len(repaired)} "
        f"skipped={len(skipped)} failed={len(failed)}"
    )
    for cid, title, old_t, new_t in repaired:
        print(f"  #{cid}: {title} total {old_t:.2f}->{new_t:.2f}")
    if failed:
        print("Failures:")
        for a, b in failed:
            print(f"  - {a}: {b}")
    return repaired, skipped, failed


def _load_db_env() -> dict:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    env = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def _psql(sql: str, env: dict) -> str:
    import os
    import subprocess

    cmd = [
        "psql",
        "-h",
        env.get("DB_HOST", "localhost"),
        "-p",
        str(env.get("DB_PORT", "5432")),
        "-U",
        env.get("DB_USER", "postgres"),
        "-d",
        env.get("DB_NAME", "postgres"),
        "-v",
        "ON_ERROR_STOP=1",
        "-tAc",
        sql,
    ]
    proc_env = {**os.environ, "PGPASSWORD": env.get("DB_PASSWORD", "")}
    result = subprocess.run(cmd, capture_output=True, text=True, env=proc_env)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "psql failed")
    return result.stdout


def normalize_names_in_db(schema: str = "user_1", dry_run: bool = False):
    """Rewrite worker/ITR names in DB to canonical forms used by map_name()."""
    env = _load_db_env()
    tables = [
        f"{schema}.workers_data_table",
        f"{schema}.itr_data_table",
        f"{schema}.workers",
        f"{schema}.template_workers_data_table",
        f"{schema}.template_itr_data_table",
    ]

    changes = []  # (table, old, new, count)
    for table in tables:
        try:
            out = _psql(f'SELECT name, count(*) FROM {table} GROUP BY name ORDER BY name;', env)
        except RuntimeError as e:
            print(f"  skip {table}: {e}", flush=True)
            continue
        for line in out.splitlines():
            if not line.strip() or "|" not in line:
                continue
            old_name, count_s = line.split("|", 1)
            count = int(count_s)
            new_name = map_name(old_name)
            if new_name != old_name:
                changes.append((table, old_name, new_name, count))

    if not changes:
        print("No name variants to normalize.", flush=True)
        return []

    print(f"Name remaps ({len(changes)} groups):", flush=True)
    for table, old, new, count in changes:
        print(f"  {table}: {old!r} -> {new!r} ({count})", flush=True)

    if dry_run:
        print("Dry-run only — DB not updated.", flush=True)
        return changes

    # Apply updates; quote literals safely for SQL
    def q(s: str) -> str:
        return "'" + s.replace("'", "''") + "'"

    for table, old, new, _count in changes:
        sql = f"UPDATE {table} SET name = {q(new)} WHERE name = {q(old)};"
        _psql(sql, env)
        print(f"  updated {table}: {old!r} -> {new!r}", flush=True)

    # Deduplicate workers directory after merges (keep lowest id)
    dedupe_sql = f"""
    DELETE FROM {schema}.workers a
    USING {schema}.workers b
    WHERE a.name = b.name AND a.id > b.id;
    """
    try:
        _psql(dedupe_sql, env)
        print("Deduped workers directory by name.", flush=True)
    except RuntimeError as e:
        print(f"  workers dedupe skipped: {e}", flush=True)

    print("Name normalization complete.", flush=True)
    # show resulting unique worker names
    out = _psql(
        f"SELECT name, count(*) FROM {schema}.workers_data_table GROUP BY name ORDER BY name;",
        env,
    )
    print("\nworkers_data_table unique names after:", flush=True)
    for line in out.splitlines():
        if line.strip():
            print(f"  {line.replace('|', ' × ')}", flush=True)
    return changes


def excel_mime(path: Path) -> str:
    name = path.name.lower()
    if name.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if name.endswith(".xls"):
        return "application/vnd.ms-excel"
    return "application/octet-stream"


def upload_media_file(token: str, calc_id: int, path: Path):
    """POST multipart file to /calculation/:id/media-files."""
    boundary = f"----CursorFormBoundary{int(time.time() * 1000)}"
    filename = path.name
    content = path.read_bytes()
    mime = excel_mime(path)
    # RFC 7578: filename is UTF-8
    header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n"
        f"\r\n"
    ).encode("utf-8")
    footer = f"\r\n--{boundary}--\r\n".encode("utf-8")
    body = header + content + footer
    req = urllib.request.Request(
        f"{API_BASE}/calculation/{calc_id}/media-files",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            data = json.loads(raw) if raw else {"message": raw}
        except json.JSONDecodeError:
            data = {"message": raw}
        return e.code, data


def attach_source_files(token: str, jobs: list, dry_run: bool = False):
    """Attach source Excel files to matching imported calculations."""
    attached, skipped, failed = [], [], []
    seen = set()  # (calc_id, filename)

    status, parents = api_request("GET", "/parent-calculations", token)
    if status >= 400:
        raise RuntimeError(f"Cannot list parents: {parents}")
    all_briefs = []
    for parent in parents or []:
        all_briefs.extend(parent.get("calculations") or [])

    for idx, job in enumerate(jobs, 1):
        print(f"\n[{idx}/{len(jobs)}] attach scan: {job['label']}", flush=True)
        try:
            pairs = collect_job_payloads_with_sources(job)
        except Exception as e:
            print(f"  !! parse failed: {e}", flush=True)
            failed.append((job["label"], str(e)))
            continue

        file_hint = subject_key(job.get("plan") or (job.get("facts") or [None])[0] or Path(job["label"]))

        for payload, source_path in pairs:
            if not source_path or not Path(source_path).exists():
                skipped.append((payload.get("title"), "missing file"))
                continue
            title = payload["title"]
            calc_type = payload["calculationType"]
            candidates = [
                c
                for c in all_briefs
                if c.get("calculation_type") == calc_type
                and (
                    titles_compatible(c.get("title") or "", title)
                    or titles_compatible(c.get("title") or "", file_hint)
                )
            ]
            same_day = [
                c
                for c in candidates
                if same_calendar_day(c.get("date_of_creation"), payload.get("dateOfCreation"))
            ]
            picked = same_day if same_day else candidates
            if not picked:
                print(f"  !! no match for {title!r} [{calc_type}] <- {source_path.name}", flush=True)
                skipped.append((title, "no match"))
                continue

            for brief in picked:
                cid = brief["id"]
                key = (cid, source_path.name)
                if key in seen:
                    continue

                st, existing = api_request("GET", f"/calculation/{cid}/media-files", token)
                existing_names = {f.get("fileName") or f.get("file_name") for f in (existing or [])}
                if source_path.name in existing_names:
                    print(f"  skip id={cid}: already has {source_path.name}", flush=True)
                    skipped.append((cid, "already attached"))
                    seen.add(key)
                    continue

                print(
                    f"  attach id={cid} ({brief.get('title')!r}) <- {source_path.name}",
                    flush=True,
                )
                if dry_run:
                    attached.append((cid, brief.get("title"), source_path.name))
                    seen.add(key)
                    continue

                st2, result = upload_media_file(token, cid, Path(source_path))
                if st2 >= 400:
                    print(f"  !! upload failed id={cid}: {result}", flush=True)
                    failed.append((cid, str(result)))
                    continue
                print(f"  OK id={cid}", flush=True)
                attached.append((cid, brief.get("title"), source_path.name))
                seen.add(key)

    print("\n" + "=" * 72)
    print(f"ATTACH DONE: attached={len(attached)} skipped={len(skipped)} failed={len(failed)}")
    for cid, title, name in attached:
        print(f"  {cid}: {title} <- {name}")
    if failed:
        print("Failures:")
        for a, b in failed:
            print(f"  - {a}: {b}")
    return attached, skipped, failed


def audit_itogo_vs_db(schema: str = "user_1", min_id: int = 138):
    """Compare Excel primary «Итого» vs DB total for calcs with xlsx media."""
    import unicodedata

    env = _load_db_env()
    file_index = _src_file_index()
    sep = "\x1f"
    raw = _psql(
        f"""
        SELECT c.id::text||'{sep}'||c.calculation_type||'{sep}'||coalesce(c.title,'')||'{sep}'||
               coalesce(c.total::text,'')||'{sep}'||m.file_name||'{sep}'||
               coalesce(c.parent_calculation_id::text,'')||'{sep}'||
               coalesce(c.date_of_creation::text,'')
        FROM {schema}.calculation c
        JOIN {schema}.calculation_media_files m ON m.calculation_id = c.id
        WHERE c.id >= {int(min_id)} AND m.file_name ILIKE '%.xlsx'
        ORDER BY c.id, m.id
        """,
        env,
    )
    by = {}
    for ln in raw.splitlines():
        if not ln.strip():
            continue
        cid_s, ctype, title, total_s, fname, parent, date_s = ln.split(sep)
        cid = int(cid_s)
        prefer = "ПЛАН" if ctype == "plan" else "ФАКТ"
        nf = unicodedata.normalize("NFC", fname)
        score = (
            2
            if (
                (prefer == "ПЛАН" and nf.startswith("План"))
                or (prefer == "ФАКТ" and nf.startswith("Факт"))
            )
            else (0 if (prefer == "ПЛАН" and nf.startswith("Факт")) else 1)
        )
        overlap = len(title_tokens(title) & title_tokens(subject_key(Path(nf))))
        cur = by.get(cid)
        cand = {
            "ctype": ctype,
            "title": title,
            "total": float(total_s) if total_s else None,
            "fname": fname,
            "score": score,
            "prefer": prefer,
            "parent": parent,
            "overlap": overlap,
            "date": (date_s or "")[:10] or None,
        }
        if cur is None or (overlap, score) > (cur["overlap"], cur["score"]):
            by[cid] = cand

    ok = near = fail = skip = 0
    fails, nears = [], []
    for cid, info in sorted(by.items()):
        nf = unicodedata.normalize("NFC", info["fname"])
        path = file_index.get(nf) or file_index.get(nf.lower())
        if not path:
            skip += 1
            continue
        try:
            ex = excel_itogo_for_file(path, info["prefer"], date_iso=info["date"])
            if ex is None or info["total"] is None:
                skip += 1
                continue
            db = info["total"]
            d = abs(ex - db)
            pct = d / max(abs(ex), abs(db), 1) * 100
            if d <= 2 or pct <= 1:
                ok += 1
            elif pct <= 3:
                near += 1
                nears.append((pct, d, cid, info["title"], ex, db, info["parent"]))
            else:
                fail += 1
                fails.append((pct, d, cid, info["title"], ex, db, info["ctype"], info["parent"]))
        except Exception:
            fail += 1
            fails.append((0, 0, cid, info["title"], None, None, info["ctype"], info["parent"]))

    checked = ok + near + fail
    print(f"Checked={checked}  OK(≤1%)={ok}  near(1–3%)={near}  FAIL(>3%)={fail}  skip={skip}")
    if checked:
        print(f"OK+near: {(ok + near) / checked * 100:.1f}%   FAIL share: {fail / checked * 100:.1f}%")
    print("\nFAIL (>3%):")
    for pct, d, cid, title, ex, db, ctype, parent in sorted(fails, key=lambda x: -x[0]):
        if ex is None:
            print(f"  #{cid} {title}")
        else:
            print(
                f"  #{cid} {title}: Excel={ex:,.2f} DB={db:,.2f} Δ={d:,.2f} ({pct:.1f}%) "
                f"http://localhost:5174/calculations/{cid}?type={ctype}&parentId={parent}"
            )
    if nears:
        print("\nNEAR:")
        for pct, d, cid, title, ex, db, parent in sorted(nears, key=lambda x: -x[0]):
            print(f"  #{cid} {title}: Excel={ex:,.2f} DB={db:,.2f} Δ={d:,.2f} ({pct:.1f}%)")
    return fails, nears, ok, skip


def main():
    global API_BASE
    parser = argparse.ArgumentParser(description="Import Excel calculations into API")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api", default=API_BASE)
    parser.add_argument("--reference-only", action="store_true", help="Only the 2 test1 pairs")
    parser.add_argument("--include-skipped", action="store_true", help="Also re-import test1 pairs")
    parser.add_argument("--limit", type=int, default=0, help="Max jobs to process")
    parser.add_argument("--max-size-mb", type=float, default=2.0, help="Skip xlsx larger than this (0=no limit)")
    parser.add_argument(
        "--repair-specs",
        action="store_true",
        help="Update already-imported calculations whose multi-row specs were truncated",
    )
    parser.add_argument(
        "--normalize-names",
        action="store_true",
        help="Normalize worker/ITR/role name variants already stored in the DB",
    )
    parser.add_argument(
        "--attach-sources",
        action="store_true",
        help="Attach source Excel files to matching imported calculations",
    )
    parser.add_argument(
        "--repair-plan-from-fact",
        action="store_true",
        help="Rebuild plan calcs from the ПЛАН block when Fact_ workbook also has ФАКТ sections",
    )
    parser.add_argument(
        "--audit-itogo",
        action="store_true",
        help="Compare Excel primary Итого vs DB total (uses first cost-summary Итого, not payment footers)",
    )
    args = parser.parse_args()
    API_BASE = args.api.rstrip("/")

    if args.normalize_names:
        normalize_names_in_db(dry_run=args.dry_run)
        return

    if args.repair_plan_from_fact:
        token = make_token()
        api_request("GET", "/parent-calculations", token)
        repair_plans_taken_from_fact(token, dry_run=args.dry_run)
        return

    if args.audit_itogo:
        audit_itogo_vs_db()
        return

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
    if not args.dry_run or args.repair_specs or args.attach_sources:
        api_request("GET", "/parent-calculations", token)

    if args.repair_specs:
        repair_specs(token, jobs, dry_run=args.dry_run)
        return

    if args.attach_sources:
        attach_source_files(token, jobs, dry_run=args.dry_run)
        return

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
