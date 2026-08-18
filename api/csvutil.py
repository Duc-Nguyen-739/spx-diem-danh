"""CsvUtil — logic THUẦN parse/chuẩn hóa/lọc StaffData (port từ CsvUtil.gs, 2026-08-12).

KHÔNG gọi Google API — test được trên Python thuần (`python -m unittest`).
"""

from datetime import datetime

# Map header sheet/csv (giữ đúng tên) → field chuẩn
CSV_HEADER_FIELD = {
    "No.": "no",
    "Date": "date",
    "Staff ID": "staffId",
    "Staff Name": "staffName",
    "Staff Email": "staffEmail",
    "Agency": "agency",
    "Contract Type": "contractType",
    "Event ID": "eventId",
    "Matching Type": "matchingType",
    "Gender": "gender",
    "Department": "department",
    "Clock In Time": "cardIn",
    "Clock Out Time": "cardOut",
    "Actual Hours": "actualHours",
    "Clock In Remark": "cardInRemark",
    "Clock Out Remark": "cardOutRemark",
    "Slot Code": "slotCode",
    "Workstation": "workstation",
    "Team": "team",
    "Station": "station",
}


def normalize_staff_name(name):
    """Trim + gộp nhiều khoảng trắng (v1 bug: "Đào  Quang  Hà")."""
    if name is None:
        return ""
    return " ".join(str(name).split()).strip()


def normalize_staff_id(id_):
    """Chuẩn hóa staffId: trim + uppercase (so khớp case-insensitive)."""
    if id_ is None:
        return ""
    return str(id_).strip().upper()


def normalize_staff_date(date):
    """Chuẩn hóa ngày vào làm về yyyy-MM-dd (ISO — sort string đúng thứ tự).

    StaffData có 3 dạng: datetime (cell ngày) / "8/1/2026", "26-07-2026" /
    "2026-01-08" / string kiểu JS Date.
    """
    if date is None:
        return ""
    if isinstance(date, datetime):
        return date.strftime("%Y-%m-%d")
    # Dạng serial number (cell date thật, UNFORMATTED_VALUE): 46239.0 = 2026-08-01
    if isinstance(date, (int, float)) and not isinstance(date, bool):
        try:
            from datetime import timedelta
            return (datetime(1899, 12, 30) + timedelta(days=float(date))).strftime("%Y-%m-%d")
        except Exception:
            return ""
    s = str(date).strip()
    # Dạng 2: "8/1/2026" / "26-07-2026" / "2026-01-08"
    import re
    m = re.match(r"^(\d{1,2})[/\-.]?(\d{1,2})[/\-.]?(\d{2,4})$", s)
    if m:
        dd = m.group(1).zfill(2)
        mm = m.group(2).zfill(2)
        yy = m.group(3) if len(m.group(3)) == 4 else "20" + m.group(3)
        return f"{yy}-{mm}-{dd}"
    # Dạng 3: "Mon Aug 03 2026 00:00:00 GMT+0700 (Indochina Time)"
    try:
        # Bỏ phần timezone name; datetime.fromisoformat/dateutil quá nặng — parse thủ công
        from email.utils import parsedate_to_datetime
        parsed = parsedate_to_datetime(s)
        if parsed:
            return parsed.strftime("%Y-%m-%d")
    except Exception:
        pass
    return s


def is_valid_barcode_id(id_):
    """Chỉ chấp nhận mã barcode NV bắt đầu "Ops" (case-insensitive)."""
    if id_ is None:
        return False
    s = str(id_).strip()
    return s[:3].lower() == "ops"


def split_csv_line(line):
    """Parse 1 dòng csv (split cơ bản, xử lý quoted field tối thiểu)."""
    out = []
    cur = ""
    in_quotes = False
    i = 0
    while i < len(line):
        ch = line[i]
        if in_quotes:
            if ch == '"':
                if i + 1 < len(line) and line[i + 1] == '"':
                    cur += '"'
                    i += 1
                else:
                    in_quotes = False
            else:
                cur += ch
        elif ch == '"':
            in_quotes = True
        elif ch == ",":
            out.append(cur)
            cur = ""
        else:
            cur += ch
        i += 1
    out.append(cur)
    return out


def parse_csv_to_staff(csv_text):
    """Parse raw csv text → [{field: value}...] (bỏ dòng header)."""
    lines = [l for l in str(csv_text or "").splitlines() if l.strip() != ""]
    if len(lines) < 2:
        return []
    header = [h.strip() for h in split_csv_line(lines[0])]
    fields = [CSV_HEADER_FIELD.get(h, h.lower().replace(" ", "")) for h in header]
    rows = []
    for i in range(1, len(lines)):
        cells = split_csv_line(lines[i])
        row = {}
        for c, f in enumerate(fields):
            row[f] = cells[c].strip() if c < len(cells) else ""
        row["staffId"] = normalize_staff_id(row.get("staffId"))
        row["staffName"] = normalize_staff_name(row.get("staffName"))
        if row["staffId"]:
            rows.append(row)
    return rows


def _header_col_map(values):
    """values[0] = header → {field: colIndex}. None nếu thiếu staffId."""
    header = ["" if h is None else str(h).strip() for h in (values[0] if values else [])]
    col = {}
    for c, h in enumerate(header):
        f = CSV_HEADER_FIELD.get(h)
        if f:
            col[f] = c
    return col


def build_staff_index(values):
    """Map { staffId: staff } từ mảng 2D. Duplicate staffId → dòng sau thắng (mới nhất)."""
    index = {}
    if not values or len(values) < 2:
        return index
    col = _header_col_map(values)
    if "staffId" not in col:
        return index
    for v in values[1:]:
        if v is None:
            continue
        staff_id = normalize_staff_id(v[col["staffId"]] if col["staffId"] < len(v) else None)
        if not staff_id:
            continue
        index[staff_id] = {
            "staffId": staff_id,
            "staffName": normalize_staff_name(_cell(v, col, "staffName")),
            "station": str(_cell(v, col, "station") or "").strip(),
            "slotCode": str(_cell(v, col, "slotCode") or "").strip(),
            "team": str(_cell(v, col, "team") or "").strip(),
            "workstation": str(_cell(v, col, "workstation") or "").strip(),
            "cardIn": str(_cell(v, col, "cardIn") or "").strip(),
            "cardOut": str(_cell(v, col, "cardOut") or "").strip(),
            "agency": str(_cell(v, col, "agency") or "").strip(),
            "date": normalize_staff_date(_cell(v, col, "date")),
        }
    return index


def build_staff_list_from_values(values):
    """Mảng 2D (dòng 0 = header) → list đầy đủ field, KHÔNG dedupe theo staffId."""
    out = []
    if not values or len(values) < 2:
        return out
    col = _header_col_map(values)
    if "staffId" not in col:
        return out
    for v in values[1:]:
        if v is None:
            continue
        staff_id = normalize_staff_id(_cell(v, col, "staffId"))
        if not staff_id:
            continue
        out.append({
            "no": str(_cell(v, col, "no") or "").strip(),
            "date": normalize_staff_date(_cell(v, col, "date")),
            "staffId": staff_id,
            "staffName": normalize_staff_name(_cell(v, col, "staffName")),
            "staffEmail": str(_cell(v, col, "staffEmail") or "").strip(),
            "agency": str(_cell(v, col, "agency") or "").strip(),
            "contractType": str(_cell(v, col, "contractType") or "").strip(),
            "eventId": str(_cell(v, col, "eventId") or "").strip(),
            "matchingType": str(_cell(v, col, "matchingType") or "").strip(),
            "gender": str(_cell(v, col, "gender") or "").strip(),
            "department": str(_cell(v, col, "department") or "").strip(),
            "cardIn": str(_cell(v, col, "cardIn") or "").strip(),
            "cardOut": str(_cell(v, col, "cardOut") or "").strip(),
            "actualHours": str(_cell(v, col, "actualHours") or "").strip(),
            "cardInRemark": str(_cell(v, col, "cardInRemark") or "").strip(),
            "cardOutRemark": str(_cell(v, col, "cardOutRemark") or "").strip(),
            "slotCode": str(_cell(v, col, "slotCode") or "").strip(),
            "workstation": str(_cell(v, col, "workstation") or "").strip(),
            "team": str(_cell(v, col, "team") or "").strip(),
            "station": str(_cell(v, col, "station") or "").strip(),
        })
    return out


def _cell(v, col, field):
    idx = col.get(field)
    if idx is None or idx >= len(v):
        return ""
    return v[idx]


def to_filter_array(val):
    """Chuẩn hóa giá trị filter thành list chuỗi (accept string|list|None)."""
    if val is None:
        return []
    if isinstance(val, (list, tuple)):
        return [str(x or "").strip() for x in val if str(x or "").strip()]
    s = str(val).strip()
    return [s] if s else []


def filter_staff_by_group(staff_list, group):
    """Lọc NV theo tổ hợp (station, slotCode, team, date, contractType)."""
    station = str((group or {}).get("station") or "").strip()
    slots = to_filter_array((group or {}).get("slotCode"))
    teams = to_filter_array((group or {}).get("team"))
    date = str((group or {}).get("date") or "").strip()
    contract_types = to_filter_array((group or {}).get("contractType"))
    out = []
    for s in staff_list or []:
        if str((s or {}).get("station") or "").strip() != station:
            continue
        s_slot = str((s or {}).get("slotCode") or "").strip()
        s_team = str((s or {}).get("team") or "").strip()
        s_contract = str((s or {}).get("contractType") or "").strip()
        if slots and s_slot not in slots:
            continue
        if teams and s_team not in teams:
            continue
        if date and str((s or {}).get("date") or "").strip() != date:
            continue
        if contract_types and s_contract not in contract_types:
            continue
        out.append(s)
    return out


def dedupe_staff_by_group(staff_list):
    """P1: dedupe theo staffId trong 1 tổ hợp — giữ dòng ĐẦU TIÊN.

    Att.csv thật có NV 2 dòng trong CÙNG tổ hợp → log 2 dòng cùng staffId → server chỉ
    update dòng đầu, dòng 2 bị đánh 'Vắng' nhầm khi kết thúc (phantom absent).
    KHÁC build_staff_index (dòng sau thắng — staffInfo mới nhất cho NV lạ): cố ý.
    """
    seen = set()
    out = []
    for s in staff_list or []:
        if s.get("staffId") not in seen:
            seen.add(s.get("staffId"))
            out.append(s)
    return out


def distinct_values(staff_list, field, filter_field=None, filter_value=None):
    """Distinct giá trị 1 cột cho dropdown — lọc rỗng + sort A-Z."""
    seen = set()
    out = []
    for s in staff_list or []:
        if filter_field and str((s or {}).get(filter_field) or "").strip() != str(filter_value or "").strip():
            continue
        val = str((s or {}).get(field) or "").strip()
        if val and val not in seen:
            seen.add(val)
            out.append(val)
    return sorted(out)
