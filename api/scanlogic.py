"""ScanLogic — logic THUẦN phân loại quét + đếm counters (port từ ScanLogic.gs, 2026-08-12).

KHÔNG gọi Google API — test được trên Python thuần.
Các hằng số (STATUS/TASK_STATUS/DUPLICATE_WINDOW_MS) truyền qua `cfg` dict.
"""

import time


def find_log_row(log_rows, staff_id):
    """Tìm dòng NV trong log theo staffId (đã normalize trước)."""
    if not log_rows or not staff_id:
        return None
    needle = str(staff_id).strip().upper()
    for row in log_rows:
        if str((row or {}).get("staffId") or "").strip().upper() == needle:
            return row
    return None


def classify_scan(cfg, task, log_rows, staff_id):
    """Phân loại 1 lần quét (reconcile).

    Returns dict(action, status, reason, row):
      update — NV trong log + chưa quét → ghi timeScan, status PRESENT
      append — NV không trong log → thêm dòng mới, status EXTRA
      reject 'task-closed' / 'already-scanned' / 'empty-staff-id'
    """
    if not task or task.get("status") != cfg["TASK_STATUS"]["OPEN"]:
        return {"action": "reject", "status": None, "reason": "task-closed", "row": None}
    if not staff_id:
        return {"action": "reject", "status": None, "reason": "empty-staff-id", "row": None}
    row = find_log_row(log_rows, staff_id)
    if row:
        # epoch là nguồn sự thật duy nhất (text mất ngày xuyên nửa đêm)
        if _epoch(row.get("timeScanEpoch")) > 0:
            return {"action": "reject", "status": None, "reason": "already-scanned", "row": row}
        return {"action": "update", "status": cfg["STATUS"]["PRESENT"], "reason": None, "row": row}
    # Không có trong danh sách chốt → Dư (danh sách chốt là tham chiếu cố định)
    return {"action": "append", "status": cfg["STATUS"]["EXTRA"], "reason": None, "row": None}


def compute_counters(cfg, log_rows):
    """Counters: scanned/absent/extra/out/total.

    Đã quét = timeScanEpoch > 0 (PRESENT + EXTRA); Vắng = pre-fill chưa quét;
    Dư = status EXTRA; meal-move OUT (đã Ra chưa Vào) → counter riêng, KHÔNG absent.
    """
    scanned = 0
    absent = 0
    extra = 0
    out = 0
    total = len(log_rows) if log_rows else 0
    for row in log_rows or []:
        if cfg.get("STATUS", {}).get("OUT") and row.get("status") == cfg["STATUS"].get("OUT"):
            out += 1
            continue
        has_scan = _epoch(row.get("timeScanEpoch")) > 0
        if has_scan:
            scanned += 1
        if row.get("status") == cfg["STATUS"].get("EXTRA"):
            extra += 1
        elif not has_scan:
            absent += 1
    return {"scanned": scanned, "absent": absent, "extra": extra, "out": out, "total": total}


def build_extra_row(cfg, task_id, staff_id, staff_info, now):
    """Dòng mới cho NV quét lạ (append reconcile) — dùng staffInfo nếu có."""
    return {
        "taskId": task_id,
        "staffId": staff_id,
        "staffName": (staff_info or {}).get("staffName") or "",
        "slotCode": (staff_info or {}).get("slotCode") or "",
        "station": (staff_info or {}).get("station") or "",
        "team": (staff_info or {}).get("team") or "",
        "workstation": (staff_info or {}).get("workstation") or "",
        "agency": (staff_info or {}).get("agency") or "",
        "timeRef": None,
        "timeScan": now,
        "timeScanEpoch": _now_ms(now),
        "date": "",
        "status": cfg["STATUS"]["EXTRA"],
    }


def classify_meal_move_scan(cfg, task, log_rows, staff_id, mode, now_ms=None, staff_info=None):
    """Phân loại 1 lần quét meal-move (Ra/Vào).

    - Lần 1 (chưa có Ra) mode ra → ghi Ra, status OUT
    - Có Ra, chưa Vào mode vao → ghi Vào, status PRESENT (+ durationMinutes)
    - Trùng trong DUPLICATE_WINDOW_MS → reject 'duplicate'
    - Đã đủ Ra+Vào → reject 'already-scanned'
    - Task đóng → reject 'task-closed'
    - NV lạ: mode ra → append OUT; mode vao (chưa có Ra) → append EXTRA
    - mode vao + có trong roster + chưa Ra → EXTRA (Vào không khớp = Thừa)
    """
    if not task or task.get("status") != cfg["TASK_STATUS"]["OPEN"]:
        return {"action": "reject", "status": None, "reason": "task-closed", "row": None, "scanPhase": None}
    if not staff_id:
        return {"action": "reject", "status": None, "reason": "empty-staff-id", "row": None, "scanPhase": None}

    row = find_log_row(log_rows, staff_id)
    now = now_ms or int(time.time() * 1000)

    if row:
        has_ra = _epoch(row.get("timeRaEpoch")) > 0
        has_vao = _epoch(row.get("timeScanEpoch")) > 0

        # Rule chống quét trùng (DUPLICATE_WINDOW_MS — 1.5s): so với mốc cuối cùng (Ra hoặc Vào)
        last_epoch = max(_epoch(row.get("timeRaEpoch")), _epoch(row.get("timeScanEpoch")))
        if last_epoch > 0 and (now - last_epoch) < (cfg.get("DUPLICATE_WINDOW_MS") or 1500):
            return {"action": "reject", "status": None, "reason": "duplicate", "row": row, "scanPhase": None}

        if has_ra and has_vao:
            return {"action": "reject", "status": None, "reason": "already-scanned", "row": row, "scanPhase": None}

        if mode == "ra":
            if not has_ra:
                # Quét Ra mà đã có Vào (quên quét Ra lúc đi, giờ quét bù) → chu kỳ
                # Ra+Vào đủ → Có mặt, không phải Ra ngoài (tránh counters lệch list/detail).
                if has_vao:
                    return {"action": "update", "status": cfg["STATUS"]["PRESENT"], "reason": None,
                            "row": row, "scanPhase": "ra"}
                return {"action": "update", "status": cfg["STATUS"]["OUT"], "reason": None, "row": row, "scanPhase": "ra"}
            return {"action": "reject", "status": None, "reason": "already-scanned", "row": row, "scanPhase": None}

        # mode === 'vao'
        if not has_ra:
            # Quên quét Ra → đánh Thừa (Vào không khớp = Thừa)
            return {"action": "update", "status": cfg["STATUS"]["EXTRA"], "reason": None, "row": row, "scanPhase": "vao"}
        return {"action": "update", "status": cfg["STATUS"]["PRESENT"], "reason": None, "row": row, "scanPhase": "vao"}

    # NV không trong log
    if mode == "ra":
        # Paste/quét Ra → luôn ghi Ra (OUT), không bao giờ Dư
        return {"action": "append", "status": cfg["STATUS"]["OUT"], "reason": None, "row": None,
                "scanPhase": "ra", "staffInfo": staff_info or None}
    # mode Vào, chưa có Ra → Dư
    return {"action": "append", "status": cfg["STATUS"]["EXTRA"], "reason": None, "row": None,
            "scanPhase": "vao", "staffInfo": staff_info or None}


def build_meal_move_extra_row(cfg, task_id, staff_id, staff_info, mode, now, status=None):
    """Dòng mới cho NV quét lạ meal-move — ghi giờ theo mode (Ra hoặc Vào)."""
    now_ms = _now_ms(now)
    row_status = status or cfg["STATUS"]["EXTRA"]
    is_ra = mode == "ra"
    return {
        "taskId": task_id,
        "staffId": staff_id,
        "staffName": (staff_info or {}).get("staffName") or "",
        "slotCode": (staff_info or {}).get("slotCode") or "",
        "station": (staff_info or {}).get("station") or "",
        "team": (staff_info or {}).get("team") or "",
        "workstation": (staff_info or {}).get("workstation") or "",
        "agency": (staff_info or {}).get("agency") or "",
        "timeRef": None,
        "timeRa": now if is_ra else None,
        "timeRaEpoch": now_ms if is_ra else 0,
        "timeScan": now if not is_ra else None,
        "timeScanEpoch": now_ms if not is_ra else 0,
        "status": row_status,
        "durationMinutes": 0,
    }


def _epoch(val):
    try:
        return int(val or 0)
    except (TypeError, ValueError):
        return 0


def _now_ms(now):
    if now is None:
        return int(time.time() * 1000)
    if isinstance(now, (int, float)):
        return int(now)
    # datetime → epoch ms (assume UTC-aware hoặc local; khớp GAS getTime() = UTC ms)
    import datetime as _dt
    if now.tzinfo is None:
        now = now.replace(tzinfo=_dt.timezone.utc)
    return int(now.timestamp() * 1000)
