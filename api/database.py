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

_write_lock = threading.Lock()


def get_write_lock():
    return _write_lock


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
    """Đọc 1 task theo taskId (scan cột taskId). Trả task kèm _rowIndex 1-based."""
    values = sheets.get_values(config.SHEETS["ATTENDANCE_TASK"], unformatted=True)
    for i in range(1, len(values)):
        row = values[i]
        if str(row[config.TASK_COLS["TASK_ID"]] if len(row) > config.TASK_COLS["TASK_ID"] else "").strip() == task_id:
            task = task_from_row(row)
            task["_rowIndex"] = i + 1
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
    row[c["STATION"]] = task.get("station", "")
    row[c["SLOT_CODE"]] = task.get("slotCode", "")
    row[c["TEAM"]] = task.get("team", "")
    row[c["STATUS"]] = task.get("status", "")
    row[c["CREATED_AT"]] = cache.to_iso_cell(task.get("createdAt"))
    row[c["CREATED_BY"]] = task.get("createdBy", "")
    row[c["COMPLETED_AT"]] = cache.to_iso_cell(task.get("completedAt"))
    row[c["NOTE"]] = task.get("note", "")
    sheets.append_values(config.SHEETS["ATTENDANCE_TASK"], [row])
    invalidate_task_list_cache()
    invalidate_task_cache(task.get("taskId", ""))
    invalidate_task_detail_cache(task.get("taskId", ""))


def update_task_note(task_id, note, row_index=None):
    c = config.TASK_COLS
    r = row_index or _find_task_row(task_id)
    if not r:
        return False
    sheets.update_values(config.SHEETS["ATTENDANCE_TASK"], r, c["NOTE"] + 1, [[note or ""]])
    invalidate_task_list_cache()
    invalidate_task_cache(task_id)
    invalidate_task_detail_cache(task_id)
    return True


def update_task_status(task_id, status, completed_at, row_index=None):
    """Ghi 2 cột rời nhau (STATUS, COMPLETED_AT) — P0 fix: không ghi đè CREATED_AT."""
    c = config.TASK_COLS
    r = row_index or _find_task_row(task_id)
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
    values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], unformatted=True)
    lc = config.LOG_COLS
    out = {}
    for i in range(1, len(values)):
        row = values[i]
        task_id = str(row[lc["TASK_ID"]] if len(row) > lc["TASK_ID"] else "").strip()
        if not task_id:
            continue
        st = str(row[lc["STATUS"]] if len(row) > lc["STATUS"] else "")
        has_scan = bool(row[lc["TIME_SCAN"]] if len(row) > lc["TIME_SCAN"] else "")
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
    """Đọc toàn bộ dòng log của task (tươi từ sheet, kèm _rowIndex 1-based)."""
    values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], unformatted=True)
    out = []
    lc = config.LOG_COLS
    for i in range(1, len(values)):
        row = values[i]
        if str(row[lc["TASK_ID"]] if len(row) > lc["TASK_ID"] else "").strip() == task_id:
            r = log_from_row(task_id, row)
            r["_rowIndex"] = i + 1
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
        row[lc["STAFF_NAME"]] = s.get("staffName", "")
        row[lc["SLOT_CODE"]] = s.get("slotCode", "")
        row[lc["STATION"]] = s.get("station", "")
        row[lc["TEAM"]] = s.get("team", "")
        row[lc["WORKSTATION"]] = s.get("workstation", "")
        row[lc["TIME_REF"]] = cache.to_iso_cell(created_at)
        row[lc["TIME_SCAN"]] = ""
        # 2026-08-19: meal-move pre-fill timeRa ("Giờ Ra" = "Giờ điểm danh") + status OUT
        # (đã Ra) — khớp GAS batchInsertLogRows_ (trước Python luôn PENDING + giờ Ra trống).
        row[lc["STATUS"]] = s.get("status") or config.STATUS["PENDING"]
        row[lc["DATE"]] = s.get("date", "")
        row[lc["TIME_RA"]] = cache.to_iso_cell(s.get("timeRa")) if s.get("timeRa") else ""
        row[lc["AGENCY"]] = s.get("agency", "")
        rows.append(row)
    start = sheets.append_values(config.SHEETS["ATTENDANCE_LOG"], rows)
    invalidate_log_rows(task_id)  # scan đầu sẽ đọc tươi (cold 1 lần, an toàn)
    _format_time_columns(start, len(rows))
    return len(rows)


def transform_log_statuses(task_id, mutate):
    """Chuyển status hàng loạt — batch đọc cả sheet, sửa memory, ghi 1 cột (P1)."""
    values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], unformatted=True)
    lc = config.LOG_COLS
    done = 0
    any_changed = False
    for i in range(1, len(values)):
        row = values[i]
        if str(row[lc["TASK_ID"]] if len(row) > lc["TASK_ID"] else "").strip() != task_id:
            continue
        time_scan = row[lc["TIME_SCAN"]] if len(row) > lc["TIME_SCAN"] else None
        status = str(row[lc["STATUS"]] if len(row) > lc["STATUS"] else "")
        next_status = mutate(status, time_scan)
        if next_status is not None and next_status != status:
            row[lc["STATUS"]] = next_status
            done += 1
            any_changed = True
    if any_changed:
        col = []
        for r in range(1, len(values)):
            col.append([values[r][lc["STATUS"]] if len(values[r]) > lc["STATUS"] else ""])
        sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], 2, lc["STATUS"] + 1, col)
        invalidate_task_detail_cache(task_id)
        invalidate_log_rows(task_id)
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
        rows = cache.cache_get(key)
        if rows is None:
            return
        for r in rows:
            if r.get("_rowIndex") == row_index:
                mutate(r)
                break
        cache.cache_put(key, rows, config.CACHE_TTL["LOG_ROWS"])
    except Exception:
        pass


def append_log_row(row):
    """Append dòng mới (quét lạ → Dư)."""
    lc = config.LOG_COLS
    out = [""] * config.LOG_COL_COUNT
    out[lc["TASK_ID"]] = row.get("taskId", "")
    out[lc["STAFF_ID"]] = row.get("staffId", "")
    out[lc["STAFF_NAME"]] = row.get("staffName", "")
    out[lc["SLOT_CODE"]] = row.get("slotCode", "")
    out[lc["STATION"]] = row.get("station", "")
    out[lc["TEAM"]] = row.get("team", "")
    out[lc["WORKSTATION"]] = row.get("workstation", "")
    out[lc["TIME_REF"]] = cache.to_iso_cell(row.get("timeRef"))
    out[lc["TIME_SCAN"]] = cache.to_iso_cell(row.get("timeScan"))
    out[lc["STATUS"]] = row.get("status", "")
    out[lc["DATE"]] = row.get("date", "")
    out[lc["TIME_RA"]] = cache.to_iso_cell(row.get("timeRa"))
    out[lc["AGENCY"]] = row.get("agency", "")
    start = sheets.append_values(config.SHEETS["ATTENDANCE_LOG"], [out])
    _format_time_columns(start, 1)
    invalidate_task_list_cache()
    invalidate_task_detail_cache(row.get("taskId", ""))
    invalidate_log_rows(row.get("taskId", ""))


def update_log_row_ra(row, time_ra, status):
    """Ghi timeRa + status (2 cột rời nhau — tần suất thấp)."""
    lc = config.LOG_COLS
    sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], row["_rowIndex"], lc["TIME_RA"] + 1, [[cache.to_iso_cell(time_ra)]])
    sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], row["_rowIndex"], lc["STATUS"] + 1, [[status]])
    sheets.set_number_format(config.SHEETS["ATTENDANCE_LOG"], row["_rowIndex"], lc["TIME_RA"] + 1, 1, 1, _TIME_FMT)
    invalidate_task_list_cache()
    invalidate_task_detail_cache(row["taskId"])
    update_log_row_cache(row["taskId"], row["_rowIndex"], lambda r: _mutate_ra_cache(r, time_ra, status))
    return True


def _mutate_ra_cache(r, time_ra, status):
    r["status"] = status
    r["timeRaText"] = cache.format_time(time_ra)
    r["timeRaEpoch"] = cache.epoch_ms(time_ra)


def batch_meal_move_log_updates(task_id, updates):
    """Ghi hàng loạt (paste meal-move) — batch 3 cột STATUS/TIME_RA/TIME_SCAN."""
    if not updates:
        return 0
    values = sheets.get_values(config.SHEETS["ATTENDANCE_LOG"], unformatted=True)
    lc = config.LOG_COLS
    # Sheets API xén cell rỗng cuối mỗi dòng → row có thể NGẮN hơn LOG_COL_COUNT
    # (vd dòng NV lạ chỉ tới STATUS index 9). Pad để mutate TIME_RA/TIME_SCAN/STATUS
    # không văng IndexError (write path bên dưới đã guard len — mutate phải tương đồng).
    for i in range(1, len(values)):
        if len(values[i]) < config.LOG_COL_COUNT:
            values[i] = values[i] + [""] * (config.LOG_COL_COUNT - len(values[i]))
    by_row = {u["_rowIndex"]: u for u in updates}
    any_changed = False
    for i in range(1, len(values)):
        u = by_row.get(i + 1)  # _rowIndex 1-based, i 0-based → i+1
        if not u:
            continue
        if u.get("timeRa"):
            values[i][lc["TIME_RA"]] = cache.to_iso_cell(u["timeRa"])
            any_changed = True
        if u.get("timeScan"):
            values[i][lc["TIME_SCAN"]] = cache.to_iso_cell(u["timeScan"])
            any_changed = True
        if u.get("status") and values[i][lc["STATUS"]] != u["status"]:
            values[i][lc["STATUS"]] = u["status"]
            any_changed = True
    if any_changed:
        for col_idx in (lc["STATUS"], lc["TIME_RA"], lc["TIME_SCAN"]):
            col = []
            for r in range(1, len(values)):
                col.append([values[r][col_idx] if len(values[r]) > col_idx else ""])
            sheets.update_values(config.SHEETS["ATTENDANCE_LOG"], 2, col_idx + 1, col)
        invalidate_task_list_cache()
        invalidate_task_detail_cache(task_id)
        invalidate_log_rows(task_id)
        rows_idx = sorted(u["_rowIndex"] for u in updates if u.get("timeRa") or u.get("timeScan"))
        if rows_idx:
            _format_time_columns(rows_idx[0], rows_idx[-1] - rows_idx[0] + 1)
    return len(updates) if any_changed else 0


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
        out[lc["STAFF_NAME"]] = row.get("staffName", "")
        out[lc["SLOT_CODE"]] = row.get("slotCode", "")
        out[lc["STATION"]] = row.get("station", "")
        out[lc["TEAM"]] = row.get("team", "")
        out[lc["WORKSTATION"]] = row.get("workstation", "")
        out[lc["TIME_REF"]] = cache.to_iso_cell(row.get("timeRef"))
        out[lc["TIME_SCAN"]] = cache.to_iso_cell(row.get("timeScan"))
        out[lc["STATUS"]] = row.get("status", "")
        out[lc["DATE"]] = row.get("date", "")
        out[lc["TIME_RA"]] = cache.to_iso_cell(row.get("timeRa"))
        out[lc["AGENCY"]] = row.get("agency", "")
        payload.append(out)
    start = sheets.append_values(config.SHEETS["ATTENDANCE_LOG"], payload)
    _format_time_columns(start, len(payload))
    invalidate_task_list_cache()
    seen = set()
    for r in rows:
        if r.get("taskId") not in seen:
            seen.add(r.get("taskId"))
            invalidate_task_detail_cache(r.get("taskId", ""))
            invalidate_log_rows(r.get("taskId", ""))
    return len(payload)
