"""services — nghiệp vụ Điểm Danh HN2 SOC (port từ TaskService.gs + ScanService.gs + Code.gs, 2026-08-12).

Thay LockService bằng threading.Lock module-level (serverless 1 process).
Thay Session.getActiveUser() (không có login trong bản standalone anonymous):
  - get_meta trả currentUser '' (không session)
  - resolve_meal_move_mode: KHÔNG có session → kiosk anonymous trust client's mode
    (khác GAS fail-closed vì GAS luôn có session user — ghi chú divergence).
"""

import datetime
import math
import threading
import time

from api import cache
from api import config
from api import csvutil
from api import database
from api import scanlogic

CFG = {
    "STATUS": config.STATUS,
    "TASK_STATUS": config.TASK_STATUS,
    "DUPLICATE_WINDOW_MS": config.DUPLICATE_WINDOW_MS,
}

_lock = threading.Lock()
_BUSY_MSG = "Hệ thống đang bận — thử lại sau giây lát"


def _now_ms():
    return int(time.time() * 1000)


# ===== Meta =====

def get_meta():
    return {
        "ok": True,
        "appTitle": config.UI_LABELS["APP_TITLE"],
        "currentUser": "",  # standalone anonymous — không session (khác GAS có email)
    }


# ===== Filter options =====

def get_filter_options():
    staff_list = database.read_staff_list()
    contract_types = csvutil.distinct_values(staff_list, "contractType")
    return {
        "ok": True,
        "stations": csvutil.distinct_values(staff_list, "station"),
        "slotCodes": csvutil.distinct_values(staff_list, "slotCode"),
        "teams": csvutil.distinct_values(staff_list, "team"),
        "dates": csvutil.distinct_values(staff_list, "date"),
        "contractTypes": contract_types if contract_types else config.CONTRACT_TYPES,
    }


def preview_staff(input_):
    staff_list = database.read_staff_list()
    filtered = csvutil.filter_staff_by_group(staff_list, {
        "station": (input_ or {}).get("station"),
        "slotCode": (input_ or {}).get("slotCode"),
        "team": (input_ or {}).get("team"),
        "date": (input_ or {}).get("date"),
        "contractType": (input_ or {}).get("contractType"),
    })
    deduped = csvutil.dedupe_staff_by_group(filtered)
    return {"ok": True, "count": len(deduped), "capped": len(deduped) > 1000}


# ===== TaskId =====

def make_task_id(now=None):
    """R20260824-143015482 (giờ tạo TZ Asia/Ho_Chi_Minh + millisecond) — ms giúp 2 kiosk
    tạo CÙNG GIÂY vẫn khác ID, tránh vòng suffix -2/-3 tốn thêm RPC read_task trong lock
    khi cao điểm; while-read_task giữ làm backstop (mirror GAS makeTaskId_)."""
    d = now or datetime.datetime.now(cache._TZ)
    return f"R{d.strftime('%Y%m%d-%H%M%S')}{d.microsecond // 1000:03d}"


# ===== Reconcile task =====

def create_reconcile_task(input_):
    inp = input_ or {}
    station = str(inp.get("station") or "").strip()
    slot_code = ", ".join(str(x) for x in inp["slotCode"]) if isinstance(inp.get("slotCode"), (list, tuple)) else str(inp.get("slotCode") or "").strip()
    team = ", ".join(str(x) for x in inp["team"]) if isinstance(inp.get("team"), (list, tuple)) else str(inp.get("team") or "").strip()
    filter_slots = list(inp.get("slotCode")) if isinstance(inp.get("slotCode"), (list, tuple)) else ([slot_code] if slot_code else [])
    filter_teams = list(inp.get("team")) if isinstance(inp.get("team"), (list, tuple)) else ([team] if team else [])
    date = str(inp.get("date") or "").strip()
    contract_type = ", ".join(str(x) for x in inp["contractType"]) if isinstance(inp.get("contractType"), (list, tuple)) else str(inp.get("contractType") or "").strip()
    filter_contracts = list(inp.get("contractType")) if isinstance(inp.get("contractType"), (list, tuple)) else ([contract_type] if contract_type else [])
    created_by = str(inp.get("createdBy") or "").strip() or "web"
    note = str(inp.get("note") or "").strip()

    if not station or not filter_slots or not filter_teams:
        return {"ok": False, "taskId": None, "count": 0, "message": "Thiếu station/slotCode/team"}

    if not _lock.acquire(timeout=10):
        return {"ok": False, "taskId": None, "count": 0, "message": _BUSY_MSG}
    try:
        staff_list = csvutil.filter_staff_by_group(database.read_staff_list(), {
            "station": station, "slotCode": filter_slots, "team": filter_teams,
            "date": date, "contractType": filter_contracts,
        })
        deduped = csvutil.dedupe_staff_by_group(staff_list)
        database.read_staff_index()  # warm staff index cho scan Dư (khớp GAS)

        if not deduped:
            return {"ok": False, "taskId": None, "count": 0, "message": config.UI_LABELS["CREATE_FAILED_EMPTY"]}
        if len(deduped) > 1000:
            return {"ok": False, "taskId": None, "count": 0, "message": f"Quá nhiều nhân viên ({len(deduped)}), giới hạn 1000"}

        now = datetime.datetime.now(cache._TZ)
        task_id = make_task_id(now)
        suffix = 2
        while database.read_task(task_id):
            task_id = f"{make_task_id(now)}-{suffix}"
            suffix += 1

        task = {
            "taskId": task_id, "taskType": config.TASK_TYPE["RECONCILE"],
            "station": station, "slotCode": slot_code, "team": team,
            "status": config.TASK_STATUS["OPEN"], "createdAt": now,
            "createdBy": created_by, "completedAt": None, "note": note,
        }
        try:
            database.insert_task(task)
            count = database.batch_insert_log_rows(task_id, deduped, now)
            return {"ok": True, "taskId": task_id, "count": count, "message": f"Tạo task thành công: {task_id}"}
        except Exception:
            try:
                database.update_task_status(task_id, config.TASK_STATUS["DONE"], datetime.datetime.now(cache._TZ))
            except Exception:
                pass
            raise
    finally:
        _lock.release()


# ===== Meal-move task =====

def create_meal_move_task(input_):
    if not _lock.acquire(timeout=10):
        return {"ok": False, "taskId": None, "count": 0, "message": _BUSY_MSG}
    try:
        return create_meal_move_task_core(input_)
    finally:
        _lock.release()


def create_meal_move_task_core(input_):
    """Thân create_meal_move_task KHÔNG lock — dùng chung trong lock ngoài
    (transfer_present_list_to_meal_move) — tránh deadlock (threading.Lock không reentrant)."""
    inp = input_ or {}
    station = str(inp.get("station") or "").strip()
    team = ", ".join(str(x) for x in inp["team"]) if isinstance(inp.get("team"), (list, tuple)) else str(inp.get("team") or "").strip()
    if not station or not team:
        return {"ok": False, "taskId": None, "count": 0, "message": "Vui lòng chọn Station và Team để tạo task"}

    raw = list(inp.get("staffIds")) if isinstance(inp.get("staffIds"), (list, tuple)) else []
    if len(raw) > 1000:
        return {"ok": False, "taskId": None, "count": 0, "message": f"Quá nhiều mã ({len(raw)}), giới hạn 1000"}
    seen = set()
    ids = []
    for c in raw:
        id_ = csvutil.normalize_staff_id(c)
        if not id_ or not csvutil.is_valid_barcode_id(id_) or id_ in seen:
            continue
        seen.add(id_)
        ids.append(id_)

    created_by = str(inp.get("createdBy") or "").strip() or "web"
    note = str(inp.get("note") or "").strip()
    # 2026-08-19: map staffId → epoch ms "Giờ điểm danh" của task reconcile — pre-fill
    # "Giờ Ra" (khớp GAS createMealMoveTaskCore_) — NV Có mặt coi như đã Ra, status OUT.
    time_ra_by_staff = inp.get("timeRaByStaff") or {}

    # FIX-20: validate dict + to_epoch_ms an toàn — GAS Number(...)||0 bao dung
    if not isinstance(time_ra_by_staff, dict):
        time_ra_by_staff = {}
    def _to_epoch_ms(v):
        try:
            return int(v or 0) or 0
        except Exception:
            return 0
    index = database.read_staff_index()
    staff_list = []
    for id_ in ids:
        info = index.get(id_) or {}
        ra_epoch = _to_epoch_ms(time_ra_by_staff.get(id_))
        try:
            time_ra = datetime.datetime.fromtimestamp(ra_epoch / 1000, tz=cache._TZ) if ra_epoch > 0 else None
        except Exception:
            time_ra = None
            ra_epoch = 0
        # date luôn "" — staff index SLIM không giữ date (khớp GAS readStaffIndex_:
        # cache <100KB; pre-fill dùng read_staff_list riêng, không qua index)
        staff_list.append({
            "staffId": id_, "staffName": info.get("staffName") or "",
            "slotCode": info.get("slotCode") or "", "station": info.get("station") or "",
            "team": info.get("team") or "", "workstation": info.get("workstation") or "",
            "agency": info.get("agency") or "",
            "timeRa": time_ra, "timeRaEpoch": ra_epoch,
            "status": config.STATUS["OUT"] if time_ra else config.STATUS["PENDING"],
        })

    now = datetime.datetime.now(cache._TZ)
    task_id = "M" + make_task_id(now)
    suffix = 2
    while database.read_task(task_id):
        task_id = f"M{make_task_id(now)}-{suffix}"
        suffix += 1

    task = {
        "taskId": task_id, "taskType": config.TASK_TYPE["MEAL_MOVE"],
        "station": station, "slotCode": "", "team": team,
        "status": config.TASK_STATUS["OPEN"], "createdAt": now,
        "createdBy": created_by, "completedAt": None, "note": note,
    }
    try:
        database.insert_task(task)
        count = database.batch_insert_log_rows(task_id, staff_list, now)
        return {"ok": True, "taskId": task_id, "count": count, "message": f"Tạo task Điểm danh Ra/Vào: {task_id}"}
    except Exception:
        try:
            database.update_task_status(task_id, config.TASK_STATUS["DONE"], datetime.datetime.now(cache._TZ))
        except Exception:
            pass
        raise


# ===== Task lifecycle =====

def complete_task(task_id):
    if not _lock.acquire(timeout=10):
        return {"ok": False, "message": _BUSY_MSG}
    try:
        return complete_task_core(task_id)
    finally:
        _lock.release()


def complete_task_core(task_id):
    """Thân complete_task KHÔNG lock — dùng chung trong lock ngoài
    (transfer_present_list_to_meal_move) — tránh deadlock (threading.Lock không reentrant)."""
    if not task_id:
        return {"ok": False, "message": "Thiếu taskId"}
    task = database.read_task(task_id)
    if not task:
        return {"ok": False, "message": "Không tìm thấy task"}
    if task["status"] != config.TASK_STATUS["OPEN"]:
        return {"ok": False, "message": "Task đã kết thúc"}
    # fail-safe: mark Vắng TRƯỚC, update status SAU (retry được)
    absent_count = database.mark_unscanned_absent(task_id, task["taskType"])
    database.update_task_status(task_id, config.TASK_STATUS["DONE"], datetime.datetime.now(cache._TZ), task.get("_rowIndex"))
    msg = f"Đã kết thúc task {task_id}"
    if absent_count > 0:
        msg += f" — {absent_count} NV chưa quét đánh dấu Vắng"
    return {"ok": True, "message": msg}


def transfer_present_list_to_meal_move(input_, old_task_id):
    """Chuyển danh sách NV Có mặt từ task Điểm Danh Ca → task Ra/Vào mới (A4 2026-08-19).
    1 RPC + 1 lock cho CẢ 2 bước (tạo task mới + đóng task cũ) — trước đây client gọi
    createMealMoveTaskApi → completeTaskApi 2 RPC riêng: cửa sổ giữa 2 RPC fail → task mới
    tồn tại mà task cũ vẫn MỞ → NV trùng ở 2 task. partial=True: task mới ĐÃ tạo nhưng đóng
    task cũ fail (không rollback — không có xoá task) → client vẫn mở task mới, user tự xử lý.
    """
    if not old_task_id:
        return {"ok": False, "taskId": None, "count": 0, "message": "Thiếu taskId task cũ"}
    if not _lock.acquire(timeout=10):
        return {"ok": False, "taskId": None, "count": 0, "message": _BUSY_MSG}
    try:
        old_task = database.read_task(old_task_id)
        if not old_task:
            return {"ok": False, "taskId": None, "count": 0, "message": f"Không tìm thấy task {old_task_id}"}
        if old_task["status"] != config.TASK_STATUS["OPEN"]:
            return {"ok": False, "taskId": None, "count": 0, "message": "Task đã kết thúc — không chuyển được"}
        created = create_meal_move_task_core(input_)
        if not created["ok"]:
            return {"ok": False, "taskId": None, "count": 0, "message": created["message"]}
        fin = complete_task_core(old_task_id)
        if not fin["ok"]:
            return {
                "ok": False, "taskId": created["taskId"], "count": created["count"], "partial": True,
                "message": f"Đã tạo {created['taskId']} nhưng không hoàn thành được {old_task_id}: {fin['message']}",
            }
        return {
            "ok": True, "taskId": created["taskId"], "count": created["count"],
            "message": f"Đã tạo {created['taskId']} và hoàn thành {old_task_id}",
        }
    finally:
        _lock.release()


def reopen_task(task_id):
    if not task_id:
        return {"ok": False, "message": "Thiếu taskId"}
    if not _lock.acquire(timeout=10):
        return {"ok": False, "message": _BUSY_MSG}
    try:
        task = database.read_task(task_id)
        if not task:
            return {"ok": False, "message": "Không tìm thấy task"}
        if task["status"] != config.TASK_STATUS["DONE"]:
            return {"ok": False, "message": "Task đang mở — không cần mở lại"}
        reset_count = database.reset_absent_to_pending(task_id)
        database.update_task_status(task_id, config.TASK_STATUS["OPEN"], None, task.get("_rowIndex"))
        msg = f"Đã mở lại task {task_id}"
        if reset_count > 0:
            msg += f" — {reset_count} NV Vắng được đặt lại Chưa điểm danh"
        return {"ok": True, "message": msg}
    finally:
        _lock.release()


def update_task_note(task_id, note):
    if not task_id:
        return {"ok": False, "message": "Thiếu taskId"}
    clean = str(note or "").strip()
    if not _lock.acquire(timeout=10):
        return {"ok": False, "message": _BUSY_MSG}
    try:
        task = database.read_task(task_id)
        if not task:
            return {"ok": False, "message": "Không tìm thấy task"}
        database.update_task_note(task_id, clean, task.get("_rowIndex"))
        return {"ok": True, "message": "Đã lưu ghi chú" if clean else "Đã xoá ghi chú"}
    finally:
        _lock.release()


def compute_task_list_sig(tasks):
    """O-A (2026-08-20): mirror taskListSignature client (js.html) — field nào đổi mà
    thiếu trong sig → client không nhận ra → stale. Test đảm bảo khớp client."""
    return ";".join(
        "|".join([
            str(t.get("taskId") or ""),
            str(t.get("status") or ""),
            str(t.get("total") or 0),
            str(t.get("scanned") or 0),
            str(t.get("extra") or 0),
            str(t.get("createdAtText") or ""),
            str(t.get("completedAtText") or ""),
            str(t.get("note") or ""),
        ])
        for t in (tasks or [])
    )


def compute_detail_sig(detail):
    """O-A: mirror scanDetailSignature client (js.html)."""
    task = (detail or {}).get("task") or {}
    c = (detail or {}).get("counters") or {}
    parts = [
        str(task.get("status") or ""),
        str(task.get("note") or ""),
        str(c.get("scanned") or 0),
        str(c.get("absent") or 0),
        str(c.get("extra") or 0),
        str(c.get("out") or 0),
    ]
    for r in (detail or {}).get("log") or []:
        parts.append("|".join([
            str(r.get("staffId") or ""),
            str(r.get("status") or ""),
            str(int(r.get("timeScanEpoch") or 0)),
            str(int(r.get("timeRaEpoch") or 0)),
        ]))
    return ";".join(parts)


def list_tasks(client_sig=None):
    """O-A: client_sig khớp → {ok:True, unchanged:True} (~40B) thay vì full list mỗi poll.
    P2-11: luôn trả {ok, tasks} khi có dữ liệu để thống nhất shape với get_task_detail."""
    tasks = database.read_task_list()
    if client_sig and compute_task_list_sig(tasks) == client_sig:
        return {"ok": True, "unchanged": True}
    return {"ok": True, "tasks": tasks}


def get_task_detail(task_id, client_sig=None):
    if not task_id:
        return {"ok": False, "message": "Thiếu taskId", "task": None, "log": []}
    detail = database.read_task_detail_cached(task_id)
    if not detail or not detail.get("task"):
        return {"ok": False, "message": "Không tìm thấy task", "task": None, "log": []}
    if client_sig and compute_detail_sig(detail) == client_sig:
        return {"ok": True, "unchanged": True}
    return {"ok": True, "task": detail["task"], "log": detail["log"], "counters": detail["counters"]}


# ===== Scan =====

def resolve_meal_move_mode(task, mode):
    """mode hiệu lực cho meal-move — mirror resolveMealMoveMode_ (ScanService.gs).

    KHÔNG check session người quét (kiosk anonymous — cả 2 runtime cùng behavior):
    ai quét cũng được 'ra', nhưng vẫn yêu cầu task CÓ createdBy (rỗng → ép 'vao'
    fail-closed). Docstring cũ mô tả GAS check email session — đã stale từ khi
    GAS đổi sang cùng logic fail-closed (ScanService.gs resolveMealMoveMode_)."""
    if mode != "ra":
        return "vao"
    if not task:
        return "vao"
    created_by = str(task.get("createdBy") or "").strip().lower()
    if not created_by:
        return "vao"
    return "ra"


def _stale_row_result(log_rows):
    """FIX-03: dòng đích không còn thuộc task (sheet bị sửa tay trong cửa sổ cache
    30s) → trả lỗi để client rollback, không ghi đè dòng NV khác. Counters trả về
    từ log_rows local (state chưa ghi gì)."""
    return {
        "ok": False,
        "message": config.UI_LABELS["STALE_ROW"],
        "status": None, "scanPhase": None,
        "counters": scanlogic.compute_counters(CFG, log_rows),
    }


def scan_staff(task_id, raw_staff_id, mode=None, now_override=None):
    """now_override: hook test — datetime thay đồng hồ thật (classify + ghi).
    GAS không có param này (dùng Date.now()); thêm để test rule 1.5s không chờ thật.
    """
    staff_id = csvutil.normalize_staff_id(raw_staff_id)
    if not csvutil.is_valid_barcode_id(staff_id):
        return {
            "ok": False, "message": 'Mã phải bắt đầu bằng "Ops"', "status": None,
            "counters": {"scanned": 0, "absent": 0, "extra": 0, "total": 0},
        }

    if not _lock.acquire(timeout=10):
        return {"ok": False, "message": _BUSY_MSG, "status": None, "scanPhase": None, "counters": {"scanned": 0, "absent": 0, "extra": 0, "total": 0}}
    try:
        # D2 fix: tính now SAU khi acquire lock — tránh timestamp cũ khi chờ lock 10s
        now_dt = now_override or datetime.datetime.now(cache._TZ)
        now_ms = cache.epoch_ms(now_dt)
        task = database.read_task_cached(task_id)
        # FIX-1 cache poison: deep copy từng row để không nhiễm cache khi mutate timeRa/timeScan
        log_rows = [dict(r) for r in database.read_log_rows_cached(task_id)]
        is_meal = bool(task and task.get("taskType") == config.TASK_TYPE["MEAL_MOVE"])

        if is_meal:
            result = scanlogic.classify_meal_move_scan(
                CFG, task, log_rows, staff_id,
                resolve_meal_move_mode(task, mode), now_ms, None,
            )
        else:
            result = scanlogic.classify_scan(CFG, task, log_rows, staff_id)

        if result["action"] == "reject":
            reject_msg = {
                "task-not-found": config.UI_LABELS["TASK_NOT_FOUND"],
                "task-closed": config.UI_LABELS["TASK_CLOSED"],
                "already-scanned": config.UI_LABELS["ALREADY_SCANNED"],
                "duplicate": config.UI_LABELS["DUPLICATE_SCAN"],
            }
            return {
                "ok": False,
                "message": reject_msg.get(result["reason"], config.UI_LABELS["STAFF_NOT_FOUND"]),
                "status": None, "scanPhase": None,
                "counters": scanlogic.compute_counters(CFG, log_rows),
            }

        time_scan_text = ""
        time_scan_epoch = 0
        time_ra_text = ""
        time_ra_epoch = 0
        duration_minutes = 0
        scanned_name = None
        scanned_info = {"agency": None, "slotCode": None, "station": None, "team": None, "workstation": None}

        if result["action"] == "update":
            if is_meal and result.get("scanPhase") == "ra":
                written = database.update_log_row_ra(result["row"], now_dt, result["status"])
                if not written:
                    return _stale_row_result(log_rows)
                result["row"]["timeRa"] = now_dt
                result["row"]["timeRaEpoch"] = cache.epoch_ms(now_dt)
                result["row"]["status"] = result["status"]
                time_ra_text = cache.format_time(now_dt)
                time_ra_epoch = cache.epoch_ms(now_dt)
            else:
                written = database.update_log_row_scan(result["row"], now_dt, result["status"])
                if not written:
                    return _stale_row_result(log_rows)
                result["row"]["timeScan"] = now_dt
                result["row"]["timeScanEpoch"] = cache.epoch_ms(now_dt)
                result["row"]["status"] = result["status"]
                time_scan_text = cache.format_time(now_dt)
                time_scan_epoch = cache.epoch_ms(now_dt)
                if (result["row"].get("timeRaEpoch") or 0) > 0:
                    # P2 (2026-08-19): clamp 0 — khớp read path (database.py B1). Đồng hồ
                    # lệch giữa 2 lần quét → response có thể âm trong khi sheet/reload hiện 0.
                    # 2026-08-20 (review #2): round() Python = banker's rounding (round(2.5)=2)
                    # lệch GAS Math.round + read path floor(x+0.5) (half-up: 2.5→3) → response
                    # hiện khác reload. Dùng floor(x+0.5) khớp cả 2.
                    duration_minutes = max(0, math.floor((time_scan_epoch - result["row"]["timeRaEpoch"]) / 60000 + 0.5))
                    result["row"]["durationMinutes"] = duration_minutes
            scanned_name = result["row"].get("staffName") or None
            scanned_info = {
                "agency": result["row"].get("agency") or None,
                "slotCode": result["row"].get("slotCode") or None,
                "station": result["row"].get("station") or None,
                "team": result["row"].get("team") or None,
                "workstation": result["row"].get("workstation") or None,
            }
        elif result["action"] == "append":
            staff_info = database.read_staff_index().get(staff_id)
            if is_meal:
                extra_row = scanlogic.build_meal_move_extra_row(
                    CFG, task_id, staff_id, staff_info, result.get("scanPhase") or "ra", now_dt, result["status"],
                )
            else:
                extra_row = scanlogic.build_extra_row(CFG, task_id, staff_id, staff_info, now_dt)
            database.append_log_row(extra_row)
            # log_rows đã là copy (không phải cached object) → append an toàn
            log_rows.append(extra_row)
            time_scan_text = cache.format_time(extra_row.get("timeScan"))
            time_scan_epoch = extra_row.get("timeScanEpoch") or 0
            time_ra_text = cache.format_time(extra_row.get("timeRa"))
            time_ra_epoch = extra_row.get("timeRaEpoch") or 0
            scanned_name = extra_row.get("staffName") or None
            scanned_info = {
                "agency": extra_row.get("agency") or None,
                "slotCode": extra_row.get("slotCode") or None,
                "station": extra_row.get("station") or None,
                "team": extra_row.get("team") or None,
                "workstation": extra_row.get("workstation") or None,
            }

        counters = scanlogic.compute_counters(CFG, log_rows)
        return {
            "ok": True,
            "message": result["status"],
            "status": result["status"],
            "scanPhase": result.get("scanPhase") or None,
            "timeScanText": time_scan_text,
            "timeScanEpoch": time_scan_epoch,
            "timeRaText": time_ra_text,
            "timeRaEpoch": time_ra_epoch,
            "durationMinutes": duration_minutes,
            "staffName": scanned_name,
            "agency": scanned_info["agency"],
            "slotCode": scanned_info["slotCode"],
            "station": scanned_info["station"],
            "team": scanned_info["team"],
            "workstation": scanned_info["workstation"],
            "counters": counters,
        }
    finally:
        _lock.release()


def paste_meal_move_scan(task_id, codes, mode=None, now_override=None):
    """now_override: hook test (như scan_staff) — không ảnh hưởng production."""
    lst = list(codes) if isinstance(codes, (list, tuple)) else []
    if not task_id:
        return {"ok": False, "message": "Thiếu taskId", "summary": None, "counters": None}
    if len(lst) > 200:
        return {"ok": False, "message": config.UI_LABELS["PASTE_TOO_MANY"], "summary": None, "counters": None}

    seen = set()
    norm_codes = []
    for c in lst:
        id_ = csvutil.normalize_staff_id(c)
        if not id_ or not csvutil.is_valid_barcode_id(id_) or id_ in seen:
            continue
        seen.add(id_)
        norm_codes.append(id_)
    if not norm_codes:
        return {"ok": False, "message": config.UI_LABELS["MEAL_NO_OPS"], "summary": None, "counters": None}

    if not _lock.acquire(timeout=10):
        return {"ok": False, "message": _BUSY_MSG, "summary": None, "counters": None}
    try:
        # D2 fix: tính now SAU khi acquire lock
        now = now_override or datetime.datetime.now(cache._TZ)
        now_ms = cache.epoch_ms(now)
        task = database.read_task_cached(task_id)
        if not task:
            return {"ok": False, "message": "Không tìm thấy task", "summary": None, "counters": None}
        if task.get("taskType") != config.TASK_TYPE["MEAL_MOVE"]:
            return {"ok": False, "message": "Task không phải Đi ăn + Move", "summary": None, "counters": None}
        if task.get("status") != config.TASK_STATUS["OPEN"]:
            return {"ok": False, "message": config.UI_LABELS["TASK_CLOSED"], "summary": None, "counters": None}

        eff_mode = resolve_meal_move_mode(task, mode)
        log_rows = database.read_log_rows(task_id)  # tươi — cần _rowIndex cho batch write
        # FIX-29: guard tổng số dòng log — paste 200 mã vào task gần trống có thể
        # bùng nổ AttendanceLog (mỗi NV lạ = 1 dòng append vĩnh viễn). Chặn sớm.
        if len(log_rows) + len(norm_codes) > config.PASTE_LOG_ROWS_MAX:
            return {"ok": False, "message": config.UI_LABELS["PASTE_LOG_TOO_MANY"], "summary": None, "counters": None}
        updates = []
        new_rows = []
        summary = {"total": len(norm_codes), "ra": 0, "vao": 0, "extra": 0, "duplicate": 0, "already": 0}

        staff_index = database.read_staff_index()
        for id_ in norm_codes:
            staff_info = staff_index.get(id_)
            r = scanlogic.classify_meal_move_scan(CFG, task, log_rows, id_, eff_mode, now_ms, staff_info)
            if r["action"] == "reject":
                if r["reason"] == "duplicate":
                    summary["duplicate"] += 1
                elif r["reason"] == "already-scanned":
                    summary["already"] += 1
                continue
            if r["action"] == "update":
                if r.get("scanPhase") == "ra":
                    r["row"]["timeRaEpoch"] = now_ms
                    r["row"]["status"] = r["status"]
                    updates.append({"_rowIndex": r["row"]["_rowIndex"], "status": r["status"], "timeRa": now})
                    summary["ra"] += 1
                else:
                    r["row"]["timeScanEpoch"] = now_ms
                    r["row"]["status"] = r["status"]
                    updates.append({"_rowIndex": r["row"]["_rowIndex"], "status": r["status"], "timeScan": now})
                    if r["status"] == config.STATUS["EXTRA"]:
                        summary["extra"] += 1
                    else:
                        summary["vao"] += 1
            elif r["action"] == "append":
                si = r.get("staffInfo") or staff_info
                append_status = config.STATUS["OUT"] if (r.get("scanPhase") or eff_mode) == "ra" else config.STATUS["EXTRA"]
                extra_row = scanlogic.build_meal_move_extra_row(CFG, task_id, id_, si, r.get("scanPhase") or eff_mode, now, append_status)
                new_rows.append(extra_row)
                log_rows.append(extra_row)
                if append_status == config.STATUS["OUT"]:
                    summary["ra"] += 1
                else:
                    summary["extra"] += 1

        if updates:
            database.batch_meal_move_log_updates(task_id, updates)
        if new_rows:
            database.batch_append_log_rows(new_rows)

        counters = scanlogic.compute_counters(CFG, log_rows)
        return {
            "ok": True,
            "message": f"Đã ghi {summary['ra']} Ra / {summary['vao']} Vào / {summary['extra']} Thừa"
                       f" — trùng {summary['duplicate']}, đã điểm danh {summary['already']}",
            "summary": summary,
            "counters": counters,
        }
    finally:
        _lock.release()


# ===== Search + staff index =====

def collect_task_ids_by_staff_log(log_values, staff_code, cols):
    """TaskId duy nhất mà mã NV đã điểm danh (timeScan/timeRa có giá trị)."""
    q = str(staff_code or "").strip().upper()
    if not q or not log_values:
        return []
    ids = []
    seen = set()
    for row in log_values:
        task_id = str(row[cols["TASK_ID"]] if len(row) > cols["TASK_ID"] else "").strip()
        if not task_id:
            continue
        if str(row[cols["STAFF_ID"]] if len(row) > cols["STAFF_ID"] else "").strip().upper() != q:
            continue
        if not (row[cols["TIME_SCAN"]] if len(row) > cols["TIME_SCAN"] else "") and \
           not (row[cols["TIME_RA"]] if len(row) > cols["TIME_RA"] else ""):
            continue
        if task_id not in seen:
            seen.add(task_id)
            ids.append(task_id)
    return ids


def search_staff(code):
    q = str(code or "").strip().upper()
    if not q:
        return {"ok": False, "message": "Nhập mã Ops để tìm"}
    staff_list = database.read_staff_list()
    matches = [s for s in staff_list if str(s.get("staffId") or "").upper() == q]
    staff = None
    if matches:
        # P2-9: last-wins — dòng sau thắng (khớp build_staff_index) để hiển thị khớp quét
        s = matches[-1]
        staff = {"staffId": s["staffId"], "staffName": s["staffName"], "slotCode": s["slotCode"],
                 "team": s["team"], "station": s["station"]}
        if s.get("agency"):
            staff["agency"] = s["agency"]
        if s.get("date"):
            staff["date"] = s["date"]
        if s.get("contractType"):
            staff["contractType"] = s["contractType"]

    log_values = sheets_log_values()
    task_ids = collect_task_ids_by_staff_log(log_values, q, config.LOG_COLS)
    tasks = []
    if task_ids:
        all_tasks = database.read_task_list()
        tasks = [t for t in all_tasks if t["taskId"] in task_ids]

    if not staff and not tasks:
        return {"ok": False, "message": "Không tìm thấy mã " + q}
    return {"ok": True, "staff": staff, "tasks": tasks, "taskCount": len(tasks)}


def sheets_log_values():
    """AttendanceLog values đã bỏ header — cho search.
    2026-08-20 (O3): cache 10s (version-key) — trước đọc CẢ sheet mỗi lần tìm
    (log lớn → chậm dần). TTL ngắn đủ tươi cho luồng quét→tìm.
    P2-1 (2026-08-23): G1 — chỉ đọc 4 cột cần (A2:B + I2:I + L2:L) thay full 13 cột
    (đồng bộ Code.gs — Python trước cũng getDataRange full)."""
    from api import sheets
    return cache.cached(
        config.CACHE_KEYS["SEARCH_LOG"],
        lambda: _sheets_log_values_g1(),
        config.CACHE_TTL["SEARCH_LOG"],
    )


def _sheets_log_values_g1():
    """G1 helper — đọc 4 cột cần cho search, build sparse rows cho collectTaskIds."""
    from api import config as cfg
    from api import sheets
    id_staff = sheets.get_values(cfg.SHEETS["ATTENDANCE_LOG"], range_="A2:B", unformatted=True) or []
    time_cols = sheets.get_values(cfg.SHEETS["ATTENDANCE_LOG"], range_="I2:L", unformatted=True) or []
    n = len(id_staff)
    out = []
    for i in range(n):
        row = [""] * cfg.LOG_COL_COUNT
        ab = id_staff[i] if i < len(id_staff) else []
        row[cfg.LOG_COLS["TASK_ID"]] = ab[0] if len(ab) > 0 else ""
        row[cfg.LOG_COLS["STAFF_ID"]] = ab[1] if len(ab) > 1 else ""
        tc = time_cols[i] if i < len(time_cols) else []
        row[cfg.LOG_COLS["TIME_SCAN"]] = tc[0] if len(tc) > 0 else ""
        row[cfg.LOG_COLS["TIME_RA"]] = tc[3] if len(tc) > 3 else ""
        out.append(row)
    return out


def get_staff_index():
    """Staff index COMPACT cho client (scan cache)."""
    index = database.read_staff_index()
    out = {}
    for sid, s in index.items():
        out[sid] = {
            "staffName": s.get("staffName") or "",
            "slotCode": s.get("slotCode") or "",
            "station": s.get("station") or "",
            "team": s.get("team") or "",
            "workstation": s.get("workstation") or "",
            "agency": s.get("agency") or "",
        }
    return {"ok": True, "staff": out, "count": len(out)}
