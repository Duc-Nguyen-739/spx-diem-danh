"""database — lớp truy cập Google Sheets (port từ Database.gs, 2026-08-12).

Thay SpreadsheetApp bằng Google Sheets API (api/sheets.py — batch read/write,
KHÔNG loop từng ô). Cache in-memory (api/cache.py). Lock module-level cho write
(thay LockService — serverless 1 process; risk ghi chéo khi scale nhiều instance,
chấp nhận ở quy mô kho hiện tại — ghi chú ở services.py).
"""

import math
import threading

from api import cache
from api import config
from api import csvutil
from api import scanlogic
from api import sheets


def sanitize_cell_text(value):
    """Chống formula injection (A1 2026-08-23, mirror GAS sanitizeCellText_): chuỗi text
    từ client (note/station/team/createdBy) bắt đầu bằng ký tự công thức (`= + - @ \\t \\r`)
    sẽ bị Sheets parse thành công thức khi ghi USER_ENTERED. Prefix `'` → text thuần."""
    s = "" if value is None else str(value)
    if s.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + s
    return s


# ===== StaffData =====

def read_staff_index():
    """{ staffId: staff } cache 5m — buildStaffIndex (dòng sau thắng — mới nhất)."""
    return cache.cached(config.CACHE_KEYS["STAFF_INDEX"], lambda: _read_staff_index_uncached(), config.CACHE_TTL["STAFF_INDEX"])


def _read_staff_index_uncached():
    values = sheets.get_values(config.SHEETS["STAFF_DATA"], unformatted=True)
    return csvutil.build_staff_index(values)


def invalidate_staff_index():
    cache.cache_remove(config.CACHE_KEYS["STAFF_INDEX"])
    cache.cache_remove(config.CACHE_KEYS["FILTER_OPTIONS"])


def read_staff_list():
    """List staff đầy đủ field, cache 5m (key FILTER_OPTIONS như GAS)."""
    return cache.cached(config.CACHE_KEYS["FILTER_OPTIONS"], lambda: read_staff_list_uncached(), config.CACHE_TTL["FILTER_OPTIONS"])


def read_staff_list_uncached():
    values = sheets.get_values(config.SHEETS["STAFF_DATA"], unformatted=True)
    return csvutil.build_staff_list_from_values(values)


# ===== AttendanceTask =====

def task_from_row(row):
    c = config.TASK_COLS
    return {
        "taskId": str(row[c["TASK_ID"]] if len(row) > c["TASK_ID"] else ""),
        "taskType": str(row[c["TASK_TYPE"]] if len(row) > c["TASK_TYPE"] else ""),
        "station": str(row[c["STATION"]] if len(row) > c["STATION"] else ""),
        "slotCode": str(row[c["SLOT_CODE"]] if len(row) > c["SLOT_CODE"] else ""),
        "team": str(row[c["TEAM"]] if len(row) > c["TEAM"] else ""),
        "status": str(row[c["STATUS"]] if len(row) > c["STATUS"] else ""),
        "createdBy": str(row[c["CREATED_BY"]] if len(row) > c["CREATED_BY"] else ""),
        "createdAtText": cache.format_date_time(cache.to_datetime(row[c["CREATED_AT"]] if len(row) > c["CREATED_AT"] else None)),
        "completedAtText": cache.format_date_time(cache.to_datetime(row[c["COMPLETED_AT"]] if len(row) > c["COMPLETED_AT"] else None)),
        "note": str(row[c["NOTE"]] if len(row) > c["NOTE"] else ""),
    }


def read_task(task_id):
    """Đọc 1 task theo taskId — đọc cột TASK_ID (cột A) trước, rồi đọc đúng 1 dòng
    khớp (G1 2026-08-21: trước đọc cả sheet task mỗi lần — nhỏ nhưng đồng bộ GAS).
    Trả task kèm _rowIndex 1-based."""
    values = sheets.get_values(config.SHEETS["ATTENDANCE_TASK"], range_="A2:A", unformatted=True)
    for i in range(len(values)):
        row = values[i]
        if str(row[config.TASK_COLS["TASK_ID"]] if len(row) > config.TASK_COLS["TASK_ID"] else "").strip() == task_id:
            row_index = i + 2
            # TASK_COL_COUNT=10 → J, hardcode để FakeSheets test không cần _col_letter
            full = sheets.get_values(config.SHEETS["ATTENDANCE_TASK"], range_=f"A{row_index}:J{row_index}", unformatted=True)
            if not full:
                return None
            task = task_from_row(full[0])
            task["_rowIndex"] = row_index
            return task
    return None


def read_task_cached(task_id):
    task = cache.cached(config.CACHE_KEYS["TASK"] + task_id, lambda: _read_task_slim(task_id), config.CACHE_TTL["TASK"])
    return task


def _read_task_slim(task_id):
    task = read_task(task_id)
    if task:
        task.pop("_rowIndex", None)
    return task


def invalidate_task_cache(task_id):
    cache.cache_remove(config.CACHE_KEYS["TASK"] + task_id)


def insert_task(task):
    """Append task mới + invalidate cache (F5/F8: phá negative-cache)."""
    c = config.TASK_COLS
    row = [""] * config.TASK_COL_COUNT
    row[c["TASK_ID"]] = task.get("taskId", "")
    row[c["TASK_TYPE"]] = task.get("taskType", "")
    row[c["STATION"]] = sanitize_cell_text(task.get("station", ""))
    row[c["SLOT_CODE"]] = sanitize_cell_text(task.get("slotCode", ""))
    row[c["TEAM"]] = sanitize_cell_text(task.get("team", ""))
    row[c["STATUS"]] = task.get("status", "")
    row[c["CREATED_AT"]] = cache.to_iso_cell(task.get("createdAt"))
    row[c["CREATED_BY"]] = sanitize_cell_text(task.get("createdBy", ""))
    row[c["COMPLETED_AT"]] = cache.to_iso_cell(task.get("completedAt"))
    row[c["NOTE"]] = sanitize_cell_text(task.get("note", ""))
    sheets.append_values(config.SHEETS["ATTENDANCE_TASK"], [row])
    invalidate_task_list_cache()
    invalidate_task_cache(task.get("taskId", ""))
    invalidate_task_detail_cache(task.get("taskId", ""))


def update_task_note(task_id, note, row_index=None):
    c = config.TASK_COLS
    r = row_index if row_index is not None else _find_task_row(task_id)
    if not r:
        return False
    sheets.update_values(config.SHEETS["ATTENDANCE_TASK"], r, c["NOTE"] + 1, [[sanitize_cell_text(note or "")]])
    invalidate_task_list_cache()
    invalidate_task_cache(task_id)
    invalidate_task_detail_cache(task_id)
    return True


def update_task_status(task_id, status, completed_at, row_index=None):
    """Ghi 2 cột rời nhau (STATUS, COMPLETED_AT) — P0 fix: không ghi đè CREATED_AT."""
    c = config.TASK_COLS
    r = row_index if row_index is not None else _find_task_row(task_id)
    if not r:
        return False
    sheets.update_values(config.SHEETS["ATTENDANCE_TASK"], r, c["STATUS"] + 1, [[status]])
    sheets.update_values(config.SHEETS["ATTENDANCE_TASK"], r, c["COMPLETED_AT"] + 1, [[cache.to_iso_cell(completed_at)]])
    invalidate_task_list_cache()
    invalidate_task_cache(task_id)
    invalidate_task_detail_cache(task_id)
    return True


def _find_task_row(task_id):
    values = sheets.get_values(config.SHEETS["ATTENDANCE_TASK"], unformatted=True)
    for i in range(1, len(values)):
        row = values[i]
        if str(row[config.TASK_COLS["TASK_ID"]] if len(row) > config.TASK_COLS["TASK_ID"] else "").strip() == task_id:
            return i + 1
    return None


def read_task_list():
    """Danh sách task (cache — O4: version-check) — mới nhất lên đầu, kèm counters."""
    return cache.cache_get_or_put_rev(
        config.CACHE_KEYS["TASK_LIST"], config.CACHE_KEYS["TASK_LIST_REV"],
        _read_task_list_uncached, config.CACHE_TTL["TASK_LIST"])


def _read_task_list_uncached():
    values = sheets.get_values(config.SHEETS["ATTENDANCE_TASK"], unformatted=True)
    out = []
    for i in range(1, len(values)):
        task = task_from_row(values[i])
        if task["taskId"]:
            out.append(task)
    counters = task_counters_for_list()
    for t in out:
        cc = counters.get(t["taskId"], {"total": 0, "scanned": 0, "extra": 0})
        t["total"] = cc["total"]
        t["scanned"] = cc["scanned"]
        t["extra"] = cc["extra"]
    out.reverse()  # dòng mới nhất thường ở cuối → đưa lên đầu
    return out


def task_counters_for_list():
    """Đếm total/scanned/extra theo taskId — đọc AttendanceLog 1 lần + group (không N+1)."""
    return cache.cache_get_or_put_rev(
        config.CACHE_KEYS["TASK_COUNTS"] + "all", config.CACHE_KEYS["TASK_LIST_REV"],
        _task_counters_uncached, config.CACHE_TTL["TASK_COUNTS"])


def _task_counters_uncached():
    # G1 (2026-08-21): chỉ đọc cột cần cho counter thay vì cả sheet 13 cột.
    # TASK_ID (cột A) + TIME_SCAN (cột I) + STATUS (cột J) — I/J liền nhau → 2 range.
    lc = config.LOG_COLS
    out = {}
    id_values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_="A2:A", unformatted=True)
    if not id_values:
        return {}
    st_values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_="I2:J", unformatted=True)
    n = len(id_values)
    for i in range(n):
        id_row = id_values[i]
        task_id = str(id_row[0] if id_row else "").strip()
        if not task_id:
            continue
        st_row = st_values[i] if i < len(st_values) else []
        st = str(st_row[1] if len(st_row) > 1 else "")
        has_scan = bool(st_row[0] if st_row else "")
        entry = out.setdefault(task_id, {"total": 0, "scanned": 0, "extra": 0})
        entry["total"] += 1
        if has_scan:
            entry["scanned"] += 1
        if st == config.STATUS["EXTRA"]:
            entry["extra"] += 1
    return out


def invalidate_task_list_cache():
    # O4 (2026-08-20): bump version thay vì remove — cache value sống tiếp, poll thiết
    # bị khác vẫn HIT; trước đây mỗi scan remove → mọi poll (3s × N thiết bị) miss →
    # rebuild full-sheet (AttendanceTask + AttendanceLog) liên tục.
    # TASK_COUNTS 'all' dùng CHUNG rev (luôn invalidate cùng nhau) → counters đúng.
    cache.bump_rev(config.CACHE_KEYS["TASK_LIST_REV"])


# ===== AttendanceLog =====

def log_from_row(task_id, row):
    lc = config.LOG_COLS
    time_ref = cache.to_datetime(row[lc["TIME_REF"]] if len(row) > lc["TIME_REF"] else None)
    time_scan = cache.to_datetime(row[lc["TIME_SCAN"]] if len(row) > lc["TIME_SCAN"] else None)
    time_ra = cache.to_datetime(row[lc["TIME_RA"]] if len(row) > lc["TIME_RA"] else None)
    scan_epoch = cache.epoch_ms(time_scan)
    ra_epoch = cache.epoch_ms(time_ra)
    return {
        "taskId": task_id,
        "staffId": str(row[lc["STAFF_ID"]] if len(row) > lc["STAFF_ID"] else "").strip(),
        "staffName": str(row[lc["STAFF_NAME"]] if len(row) > lc["STAFF_NAME"] else ""),
        "slotCode": str(row[lc["SLOT_CODE"]] if len(row) > lc["SLOT_CODE"] else ""),
        "station": str(row[lc["STATION"]] if len(row) > lc["STATION"] else ""),
        "team": str(row[lc["TEAM"]] if len(row) > lc["TEAM"] else ""),
        "workstation": str(row[lc["WORKSTATION"]] if len(row) > lc["WORKSTATION"] else ""),
        "agency": str(row[lc["AGENCY"]] if len(row) > lc["AGENCY"] else ""),
        "timeRefText": cache.format_time(time_ref),
        "timeScanText": cache.format_time(time_scan),
        "timeScanEpoch": scan_epoch,
        "timeRaText": cache.format_time(time_ra),
        "timeRaEpoch": ra_epoch,
        # 2026-08-20 (review): round() Python = banker's rounding (round(0.5)=0) —
        # lệch GAS Math.round() (half-up: 0.5→1). floor(x+0.5) khớp GAS.
        "durationMinutes": max(0, math.floor((scan_epoch - ra_epoch) / 60000 + 0.5)) if (time_ra and time_scan) else 0,
        "status": str(row[lc["STATUS"]] if len(row) > lc["STATUS"] else ""),
        "dateText": cache.to_display_date(row[lc["DATE"]] if len(row) > lc["DATE"] else None),
    }


def read_log_rows(task_id):
    """Đọc toàn bộ dòng log của task (tươi từ sheet, kèm _rowIndex 1-based).
    G1 (2026-08-21): đọc cột TASK_ID (cột A) trước để lấy row index khớp, rồi đọc
    các dòng khớp theo range — trước đây đọc cả sheet 13 cột mỗi lần miss cache."""
    lc = config.LOG_COLS
    id_values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_="A2:A", unformatted=True)
    matches = []
    for i in range(len(id_values)):
        row = id_values[i]
        if str(row[lc["TASK_ID"]] if len(row) > lc["TASK_ID"] else "").strip() == task_id:
            matches.append(i + 2)  # 1-based: offset 2 (bỏ header)
    out = []
    # Gộp dòng liền nhau thành 1 range — ít RPC hơn đọc từng dòng.
    for start_idx in range(len(matches)):
        if start_idx > 0 and matches[start_idx] == matches[start_idx - 1] + 1:
            continue
        j = start_idx
        while j + 1 < len(matches) and matches[j + 1] == matches[j] + 1:
            j += 1
        first = matches[start_idx]
        last = matches[j]
        range_ = f"A{first}:M{last}"
        values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_=range_, unformatted=True)
        for k in range(first, last + 1):
            idx = k - first
            if idx >= len(values):
                continue
            r = log_from_row(task_id, values[idx])
            r["_rowIndex"] = k
            out.append(r)
    return out


def read_log_rows_cached(task_id):
    """Cache 30s slim schema — đường quét không chạm sheet log mỗi lần (U2)."""
    return cache.cached(config.CACHE_KEYS["LOG_ROWS"] + task_id, lambda: _slim(read_log_rows(task_id)), config.CACHE_TTL["LOG_ROWS"])


def _slim(rows):
    out = []
    for r in rows:
        out.append({
            "taskId": r.get("taskId"),
            "staffId": r.get("staffId"),
            "staffName": r.get("staffName"),
            "slotCode": r.get("slotCode"),
            "station": r.get("station"),
            "team": r.get("team"),
            "agency": r.get("agency"),
            "timeRaText": r.get("timeRaText"),
            "timeRaEpoch": r.get("timeRaEpoch"),
            "timeScanText": r.get("timeScanText"),
            "timeScanEpoch": r.get("timeScanEpoch"),
            "durationMinutes": r.get("durationMinutes"),
            "status": r.get("status"),
            "dateText": r.get("dateText"),
            "_rowIndex": r.get("_rowIndex"),
        })
    return out


def invalidate_log_rows(task_id):
    cache.cache_remove(config.CACHE_KEYS["LOG_ROWS"] + task_id)


def read_task_detail_cached(task_id):
    """Task + log + counters (cache 15s) — strip _rowIndex khi cache."""
    return cache.cached(config.CACHE_KEYS["TASK_DETAIL"] + task_id, lambda: _read_task_detail(task_id), config.CACHE_TTL["TASK_DETAIL"])


def _read_task_detail(task_id):
    # 2026-08-20 (review): build từ CACHE (read_task_cached + read_log_rows_cached)
    # thay vì đọc fresh full sheet — màn quét poll 3s + TTL detail 5s + invalidate
    # sau mỗi scan → miss liên tục → trước đây mỗi miss đọc lại CẢ AttendanceLog +
    # AttendanceTask (log phình → càng chậm). 2 cache này được mọi write path giữ
    # đúng (scan → incremental update_log_row_cache; append/batch/transform →
    # invalidate_log_rows) nên data tươi như sheet; UI scan chỉ cần field slim.
    # Trade-off: sửa tay trên gsheet → detail cũ tối đa LOG_ROWS TTL (~10s).
    task = read_task_cached(task_id)
    if not task:
        return None
    log = read_log_rows_cached(task_id)
    counters = scanlogic.compute_counters({"STATUS": config.STATUS}, log)
    # COPY trước khi strip _rowIndex — cache Python trả OBJECT SỐNG (cache_get =
    # tham chiếu trong store); pop trên đó làm hỏng LOG_ROWS cache → scan kế mất
    # _rowIndex → update_log_row_scan văng KeyError.
    log = [dict(r) for r in log]
    for r in log:
        r.pop("_rowIndex", None)
    return {"task": task, "log": log, "counters": counters}


def invalidate_task_detail_cache(task_id):
    cache.cache_remove(config.CACHE_KEYS["TASK_DETAIL"] + task_id)


_TIME_FMT = "HH:mm:ss"


def _format_time_columns(start_row, num_rows):
    """Set number format HH:mm:ss cho cột TIME_RA + TIME_SCAN (hiển thị sheet như GAS
    setNumberFormat — nếu không, cell datetime hiện dạng đầy đủ '19/8/2026 09:02:15').
    2026-08-20 (O2): format CHỈ vùng vừa ghi (start_row, num_rows) — trước format CẢ
    cột + đọc lại cả sheet đếm dòng mỗi lần append (log lớn → chậm dần)."""
    if num_rows <= 0 or start_row <= 0:
        return
    lc = config.LOG_COLS
    sheets.set_number_format(config.SHEETS["ATTENDANCE_LOG"], start_row, lc["TIME_RA"] + 1, num_rows, 1, _TIME_FMT)
    sheets.set_number_format(config.SHEETS["ATTENDANCE_LOG"], start_row, lc["TIME_SCAN"] + 1, num_rows, 1, _TIME_FMT)


def batch_insert_log_rows(task_id, staff_list, created_at):
    """Pre-fill log batch 1 lần (createReconcileTask) — KHÔNG append loop."""
    if not staff_list:
        return 0
    lc = config.LOG_COLS
    rows = []
    for s in staff_list:
        row = [""] * config.LOG_COL_COUNT
        row[lc["TASK_ID"]] = task_id
        row[lc["STAFF_ID"]] = s.get("staffId", "")
        # A1-log (2026-08-24): sanitize field text copy từ CSV — chống formula injection
        # (mirror GAS appendLogRow_/batchInsertLogRows_).
        row[lc["STAFF_NAME"]] = sanitize_cell_text(s.get("staffName", ""))
        row[lc["SLOT_CODE"]] = sanitize_cell_text(s.get("slotCode", ""))
        row[lc["STATION"]] = sanitize_cell_text(s.get("station", ""))
        row[lc["TEAM"]] = sanitize_cell_text(s.get("team", ""))
        row[lc["WORKSTATION"]] = sanitize_cell_text(s.get("workstation", ""))
        row[lc["TIME_REF"]] = cache.to_iso_cell(created_at)
        row[lc["TIME_SCAN"]] = ""
        # 2026-08-19: meal-move pre-fill timeRa ("Giờ Ra" = "Giờ điểm danh") + status OUT
        # (đã Ra) — khớp GAS batchInsertLogRows_ (trước Python luôn PENDING + giờ Ra trống).
        row[lc["STATUS"]] = s.get("status") or config.STATUS["PENDING"]
        row[lc["DATE"]] = sanitize_cell_text(s.get("date", ""))
        row[lc["TIME_RA"]] = cache.to_iso_cell(s.get("timeRa")) if s.get("timeRa") else ""
        row[lc["AGENCY"]] = sanitize_cell_text(s.get("agency", ""))
        rows.append(row)
    start = sheets.append_values(config.SHEETS["ATTENDANCE_LOG"], rows)
    invalidate_log_rows(task_id)  # scan đầu sẽ đọc tươi (cold 1 lần, an toàn)
    cache.cache_remove(config.CACHE_KEYS["SEARCH_LOG"])  # FIX-7: pre-fill cũng tạo log mới
    _format_time_columns(start, len(rows))
    return len(rows)


def transform_log_statuses(task_id, mutate):
    """Chuyển status hàng loạt — G1 (2026-08-21): chỉ đọc/ghi dòng khớp task (đã port từ GAS).

    GAS Database.gs:576 đọc cột TASK_ID (A2:A) trước rồi batchReadRows/batchSetOneCol
    — tránh đọc cả sheet 13 cột × 5000 dòng mỗi lần complete/reopen. Python trước đây
    đọc/ghi cả cột STATUS 2..lastRow. Port logic G1 để đồng nhất.
    """
    lc = config.LOG_COLS
    # 1) Dò cột TASK_ID (A2:A) — 1 cột thay vì toàn bộ sheet
    id_values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_="A2:A", unformatted=True)
    matches = []
    for i, row in enumerate(id_values):
        cell = str(row[0] if row and len(row) > lc["TASK_ID"] else "").strip() if row else ""
        # id_values từ A2:A nên row[0] chính là TASK_ID; fallback LOG_COLS[0]=0
        if cell == task_id:
            matches.append(i + 2)  # 1-based sheet row
    if not matches:
        return 0
    # 2) Đọc chỉ dòng khớp — gộp dòng liền nhau thành 1 range (ít RPC)
    writes = []  # [(rowIndex, next_status)]
    idx = 0
    while idx < len(matches):
        j = idx
        while j + 1 < len(matches) and matches[j + 1] == matches[j] + 1:
            j += 1
        first = matches[idx]
        last = matches[j]
        rng = f"A{first}:M{last}"
        chunk = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_=rng, unformatted=True)
        for k, row_idx in enumerate(range(first, last + 1)):
            row = chunk[k] if k < len(chunk) else []
            if len(row) < config.LOG_COL_COUNT:
                row = row + [""] * (config.LOG_COL_COUNT - len(row))
            time_scan = row[lc["TIME_SCAN"]] if len(row) > lc["TIME_SCAN"] else None
            status = str(row[lc["STATUS"]] if len(row) > lc["STATUS"] else "")
            next_status = mutate(status, time_scan)
            if next_status is not None and next_status != status:
                writes.append((row_idx, next_status))
        idx = j + 1
    if not writes:
        return 0
    # 3) Ghi chỉ dòng đổi — gộp dòng liền nhau thành 1 update (batchSetOneCol)
    writes.sort(key=lambda x: x[0])
    i = 0
    done = len(writes)
    while i < len(writes):
        j = i
        while j + 1 < len(writes) and writes[j + 1][0] == writes[j][0] + 1:
            j += 1
        start_row = writes[i][0]
        col = [[w[1]] for w in writes[i:j + 1]]
        sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], start_row, lc["STATUS"] + 1, col)
        i = j + 1
    invalidate_task_detail_cache(task_id)
    invalidate_log_rows(task_id)
    invalidate_task_list_cache()  # FIX-6
    cache.cache_remove(config.CACHE_KEYS["SEARCH_LOG"])  # FIX-7
    return done


def mark_unscanned_absent(task_id, task_type):
    """Kết thúc: dòng chưa Vào (timeScan rỗng) → Vắng; meal-move OUT chưa Vào cũng Vắng."""
    is_meal = task_type == config.TASK_TYPE["MEAL_MOVE"]

    def _mutate(status, time_scan):
        if time_scan and status == config.STATUS["PENDING"]:
            return config.STATUS["PRESENT"]  # insurance: có giờ nhưng status '-' → chuẩn hóa Có mặt
        if not time_scan:
            if status == config.STATUS["PENDING"] or (is_meal and status == config.STATUS["OUT"]):
                return config.STATUS["ABSENT"]
        return None

    return transform_log_statuses(task_id, _mutate)


def reset_absent_to_pending(task_id):
    """Mở lại task: Vắng → Chưa điểm danh. Có mặt giữ nguyên."""
    n = transform_log_statuses(task_id, lambda status, time_scan: config.STATUS["PENDING"] if status == config.STATUS["ABSENT"] else None)
    if n > 0:
        invalidate_task_list_cache()
    return n


def update_log_row_scan(row, time_scan, status):
    """Ghi timeScan + status cho 1 dòng (theo _rowIndex) — 1 batch."""
    lc = config.LOG_COLS
    sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], row["_rowIndex"], lc["TIME_SCAN"] + 1, [[cache.to_iso_cell(time_scan), status]])
    sheets.set_number_format(config.SHEETS["ATTENDANCE_LOG"], row["_rowIndex"], lc["TIME_SCAN"] + 1, 1, 1, _TIME_FMT)
    invalidate_task_list_cache()
    invalidate_task_detail_cache(row["taskId"])
    cache.cache_remove(config.CACHE_KEYS["SEARCH_LOG"])  # FIX-7
    update_log_row_cache(row["taskId"], row["_rowIndex"], lambda r: _mutate_scan_cache(r, time_scan, status))
    return True


def _mutate_scan_cache(r, time_scan, status):
    r["status"] = status
    r["timeScanText"] = cache.format_time(time_scan)
    r["timeScanEpoch"] = cache.epoch_ms(time_scan)
    if r.get("timeRaEpoch", 0) > 0 and r.get("timeScanEpoch", 0) > 0:
        # B1 (2026-08-19): Vào trước Ra (quét bù) → clamp 0, không số âm
        # 2026-08-20 (review #2): round() banker's (2.5→2) lệch read path
        # log_from_row floor(x+0.5) (2.5→3) → reload hiện khác response.
        r["durationMinutes"] = max(0, math.floor((r["timeScanEpoch"] - r["timeRaEpoch"]) / 60000 + 0.5))


def update_log_row_cache(task_id, row_index, mutate):
    try:
        key = config.CACHE_KEYS["LOG_ROWS"] + task_id
        hit = cache.cache_get(key)
        if hit is None:
            return
        # C5 (2026-08-23): cached() lưu {"v": rows} — đọc trực tiếp phải unwrap
        # trước khi mutate và put lại CÙNG format (raw entry cũ vẫn hỗ trợ).
        wrapped = isinstance(hit, dict) and "v" in hit and isinstance(hit["v"], list)
        rows = hit["v"] if wrapped else hit
        for r in rows:
            if r.get("_rowIndex") == row_index:
                mutate(r)
                break
        cache.cache_put(key, {"v": rows} if wrapped else rows, config.CACHE_TTL["LOG_ROWS"])
    except Exception:
        import traceback
        traceback.print_exc()


def append_log_row(row):
    """Append dòng mới (quét lạ → Dư)."""
    lc = config.LOG_COLS
    out = [""] * config.LOG_COL_COUNT
    out[lc["TASK_ID"]] = row.get("taskId", "")
    out[lc["STAFF_ID"]] = row.get("staffId", "")
    # A1-log (2026-08-24): sanitize field text copy từ CSV — chống formula injection.
    out[lc["STAFF_NAME"]] = sanitize_cell_text(row.get("staffName", ""))
    out[lc["SLOT_CODE"]] = sanitize_cell_text(row.get("slotCode", ""))
    out[lc["STATION"]] = sanitize_cell_text(row.get("station", ""))
    out[lc["TEAM"]] = sanitize_cell_text(row.get("team", ""))
    out[lc["WORKSTATION"]] = sanitize_cell_text(row.get("workstation", ""))
    out[lc["TIME_REF"]] = cache.to_iso_cell(row.get("timeRef"))
    out[lc["TIME_SCAN"]] = cache.to_iso_cell(row.get("timeScan"))
    out[lc["STATUS"]] = row.get("status", "")
    out[lc["DATE"]] = sanitize_cell_text(row.get("date", ""))
    out[lc["TIME_RA"]] = cache.to_iso_cell(row.get("timeRa"))
    out[lc["AGENCY"]] = sanitize_cell_text(row.get("agency", ""))
    start = sheets.append_values(config.SHEETS["ATTENDANCE_LOG"], [out])
    _format_time_columns(start, 1)
    invalidate_task_list_cache()
    invalidate_task_detail_cache(row.get("taskId", ""))
    invalidate_log_rows(row.get("taskId", ""))
    cache.cache_remove(config.CACHE_KEYS["SEARCH_LOG"])  # FIX-7


def update_log_row_ra(row, time_ra, status):
    """Ghi timeRa + status — atomic 1 RPC (STATUS→TIME_RA 3 cột liền nhau, giữ DATE)."""
    lc = config.LOG_COLS
    # Atomic: STATUS (col 10) và TIME_RA (col 12) cách nhau DATE (col 11) → đọc DATE
    # để không ghi đè, rồi ghi 3 cột STATUS→TIME_RA trong 1 update_values (thay 2 RPC rời).
    date_vals = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_=f"K{row['_rowIndex']}:K{row['_rowIndex']}", unformatted=True)
    date_val = date_vals[0][0] if date_vals and date_vals[0] else ""
    # DATE val có thể là serial number (unformatted) — giữ nguyên, update ghi USER_ENTERED sẽ hiển thị đúng
    sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], row["_rowIndex"], lc["STATUS"] + 1, [[status, date_val, cache.to_iso_cell(time_ra)]])
    sheets.set_number_format(config.SHEETS["ATTENDANCE_LOG"], row["_rowIndex"], lc["TIME_RA"] + 1, 1, 1, _TIME_FMT)
    invalidate_task_list_cache()
    invalidate_task_detail_cache(row["taskId"])
    cache.cache_remove(config.CACHE_KEYS["SEARCH_LOG"])  # FIX-7
    update_log_row_cache(row["taskId"], row["_rowIndex"], lambda r: _mutate_ra_cache(r, time_ra, status))
    return True


def _mutate_ra_cache(r, time_ra, status):
    r["status"] = status
    r["timeRaText"] = cache.format_time(time_ra)
    r["timeRaEpoch"] = cache.epoch_ms(time_ra)


def batch_meal_move_log_updates(task_id, updates):
    """Ghi hàng loạt (paste meal-move) — G1 (2026-08-21): chỉ đọc/ghi dòng khớp.

    Trước đọc cả sheet 13 cột × 5000 dòng và ghi cả 3 cột 2..lastRow (15000 ô)
    dù chỉ đổi 5-20 dòng → quota + timeout. Port GAS batchSetOneCol: chỉ
    đọc A2:A tìm matches, gộp range đọc, chỉ ghi writes đã đổi.
    """
    if not updates:
        return 0
    lc = config.LOG_COLS
    by_row = {u["_rowIndex"]: u for u in updates}
    # 1) Tìm matches thuộc task_id và có trong updates
    id_values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_="A2:A", unformatted=True)
    matches = []
    for i, row in enumerate(id_values):
        ridx = i + 2
        if ridx in by_row and str(row[0] if row and len(row) > 0 else "").strip() == task_id:
            matches.append(ridx)
    if not matches:
        return 0
    matches.sort()
    # 2) Đọc chỉ dòng khớp — gộp liền nhau
    # Map rowIndex → row data
    row_map = {}
    idx = 0
    while idx < len(matches):
        j = idx
        while j + 1 < len(matches) and matches[j + 1] == matches[j] + 1:
            j += 1
        first = matches[idx]
        last = matches[j]
        rng = f"A{first}:M{last}"
        chunk = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], range_=rng, unformatted=True)
        for k, ridx in enumerate(range(first, last + 1)):
            row = chunk[k] if k < len(chunk) else []
            if len(row) < config.LOG_COL_COUNT:
                row = row + [""] * (config.LOG_COL_COUNT - len(row))
            row_map[ridx] = row
        idx = j + 1
    # 3) Thu thập writes đã đổi
    writes_status = []
    writes_ra = []
    writes_scan = []
    for ridx in matches:
        row = row_map.get(ridx, [])
        u = by_row[ridx]
        if u.get("timeRa"):
            writes_ra.append((ridx, cache.to_iso_cell(u["timeRa"])))
        if u.get("timeScan"):
            writes_scan.append((ridx, cache.to_iso_cell(u["timeScan"])))
        if u.get("status") and str(row[lc["STATUS"]] if len(row) > lc["STATUS"] else "") != u["status"]:
            writes_status.append((ridx, u["status"]))
    any_changed = bool(writes_status or writes_ra or writes_scan)
    if not any_changed:
        return 0
    # 4) Ghi chỉ dòng đổi — gộp liền nhau (batchSetOneCol)
    def _batch_writes(col_idx, writes):
        if not writes:
            return
        writes = sorted(writes, key=lambda x: x[0])
        i = 0
        while i < len(writes):
            j = i
            while j + 1 < len(writes) and writes[j + 1][0] == writes[j][0] + 1:
                j += 1
            start_row = writes[i][0]
            col = [[w[1]] for w in writes[i:j + 1]]
            sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], start_row, col_idx + 1, col)
            i = j + 1
    _batch_writes(lc["STATUS"], writes_status)
    _batch_writes(lc["TIME_RA"], writes_ra)
    _batch_writes(lc["TIME_SCAN"], writes_scan)
    # Format chỉ vùng vừa ghi time
    for writes, col in [(writes_ra, lc["TIME_RA"] + 1), (writes_scan, lc["TIME_SCAN"] + 1)]:
        if not writes:
            continue
        ws = sorted(writes, key=lambda x: x[0])
        i = 0
        while i < len(ws):
            j = i
            while j + 1 < len(ws) and ws[j + 1][0] == ws[j][0] + 1:
                j += 1
            sheets.set_number_format(config.SHEETS["ATTENDANCE_LOG"], ws[i][0], col, j - i + 1, 1, _TIME_FMT)
            i = j + 1
    invalidate_task_list_cache()
    invalidate_task_detail_cache(task_id)
    invalidate_log_rows(task_id)
    cache.cache_remove(config.CACHE_KEYS["SEARCH_LOG"])  # FIX-7
    return len(updates)


def batch_append_log_rows(rows):
    """Append nhiều dòng log trong 1 batch (paste meal-move NV lạ)."""
    if not rows:
        return 0
    lc = config.LOG_COLS
    payload = []
    for row in rows:
        out = [""] * config.LOG_COL_COUNT
        out[lc["TASK_ID"]] = row.get("taskId", "")
        out[lc["STAFF_ID"]] = row.get("staffId", "")
        # A1-log (2026-08-24): sanitize field text copy từ CSV — chống formula injection.
        out[lc["STAFF_NAME"]] = sanitize_cell_text(row.get("staffName", ""))
        out[lc["SLOT_CODE"]] = sanitize_cell_text(row.get("slotCode", ""))
        out[lc["STATION"]] = sanitize_cell_text(row.get("station", ""))
        out[lc["TEAM"]] = sanitize_cell_text(row.get("team", ""))
        out[lc["WORKSTATION"]] = sanitize_cell_text(row.get("workstation", ""))
        out[lc["TIME_REF"]] = cache.to_iso_cell(row.get("timeRef"))
        out[lc["TIME_SCAN"]] = cache.to_iso_cell(row.get("timeScan"))
        out[lc["STATUS"]] = row.get("status", "")
        out[lc["DATE"]] = sanitize_cell_text(row.get("date", ""))
        out[lc["TIME_RA"]] = cache.to_iso_cell(row.get("timeRa"))
        out[lc["AGENCY"]] = sanitize_cell_text(row.get("agency", ""))
        payload.append(out)
    start = sheets.append_values(config.SHEETS["ATTENDANCE_LOG"], payload)
    _format_time_columns(start, len(payload))
    invalidate_task_list_cache()
    cache.cache_remove(config.CACHE_KEYS["SEARCH_LOG"])  # FIX-7
    seen = set()
    for r in rows:
        if r.get("taskId") not in seen:
            seen.add(r.get("taskId"))
            invalidate_task_detail_cache(r.get("taskId", ""))
            invalidate_log_rows(r.get("taskId", ""))
    return len(payload)
