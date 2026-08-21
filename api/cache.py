"""cache — cache in-memory TTL + format Date/time (port từ CacheLayer.gs, 2026-08-12).

GAS dùng CacheService; backend Python (serverless 1 process) dùng dict trong memory
với TTL. Cache KHÔNG là nguồn sự thật — mọi write đều invalidate đúng key.
Timezone: Asia/Ho_Chi_Minh (khớp appsscript.json).
"""

import threading
import time
from datetime import datetime, timedelta, timezone

from api import config

# Asia/Ho_Chi_Minh = UTC+7, KHÔNG có DST — offset cố định (không cần tzdata,
# zoneinfo không có sẵn trong mọi container). Tương đương chính xác ZoneInfo.
_TZ = timezone(timedelta(hours=7))
_UTC = timezone.utc

_store = {}
_lock = threading.Lock()
_MAX_KEYS = 200  # P2 #12 (2026-08-21): trần FIFO — vượt thì xóa key cũ nhất, tránh leak 15MB khi 500 task


def _ttl_of(key):
    """Map key → TTL. Key dạng prefix + id → dùng CACHE_TTL theo prefix."""
    if key == config.CACHE_KEYS["STAFF_INDEX"] or key == config.CACHE_KEYS["FILTER_OPTIONS"]:
        return config.CACHE_TTL["STAFF_INDEX"]
    if key == config.CACHE_KEYS["TASK_LIST"]:
        return config.CACHE_TTL["TASK_LIST"]
    if key == config.CACHE_KEYS["TZ"]:
        return config.CACHE_TTL["TZ"]
    if key.startswith(config.CACHE_KEYS["TASK_DETAIL"]):
        return config.CACHE_TTL["TASK_DETAIL"]
    if key.startswith(config.CACHE_KEYS["TASK"]):
        return config.CACHE_TTL["TASK"]
    if key.startswith(config.CACHE_KEYS["LOG_ROWS"]):
        return config.CACHE_TTL["LOG_ROWS"]
    if key.startswith(config.CACHE_KEYS["TASK_COUNTS"]):
        return config.CACHE_TTL["TASK_COUNTS"]
    return 30


def cache_get(key):
    with _lock:
        hit = _store.get(key)
        if hit is None:
            return None
        if hit[0] < time.time():
            del _store[key]
            return None
        return hit[1]


def cache_put(key, value, ttl_seconds):
    with _lock:
        _store[key] = (time.time() + ttl_seconds, value)
        # FIFO evict khi vượt trần — giữ 200 key mới nhất
        if len(_store) > _MAX_KEYS:
            # xóa key cũ nhất (chèn đầu tiên) — Python 3.7+ dict giữ thứ tự
            try:
                oldest = next(iter(_store))
                del _store[oldest]
            except Exception:
                pass
    return True


def cache_remove(key):
    with _lock:
        _store.pop(key, None)
    return True


def clear_cache():
    """Xoá toàn bộ cache — dùng cho test."""
    with _lock:
        _store.clear()


def cached(key, load, ttl_seconds):
    """Đọc cache; miss → load() → put (fallback an toàn: load lỗi thì rethrow)."""
    val = cache_get(key)
    if val is not None:
        return val
    val = load()
    try:
        cache_put(key, val, ttl_seconds)
    except Exception:
        pass  # cache put fail → lần sau rebuild (không fail-open)
    return val


def cache_get_or_put_rev(key, rev_key, load, ttl_seconds):
    """cached() có version-check (O4 2026-08-20): scan chỉ bump rev thay vì remove —
    poll thiết bị khác vẫn HIT (bỏ rebuild full-sheet mỗi lượt khi ≥3 thiết bị poll 3s).
    Value lưu {v: rev, d: data}; rev lệch/mất → rebuild. Self-heal: chưa có rev → '1'."""
    hit = cache_get(key)
    if hit is not None:
        try:
            if hit.get("v") == cache_get(rev_key):
                return hit["d"]
        except Exception:
            pass
    value = load()
    try:
        rev = cache_get(rev_key)
        if rev is None:
            rev = "1"
            cache_put(rev_key, rev, ttl_seconds)
        cache_put(key, {"v": rev, "d": value}, ttl_seconds)
    except Exception:
        pass  # cache put fail → lần sau rebuild (không fail-open)
    return value


def bump_rev(rev_key):
    """Bump version key — invalidate nhẹ (1 put), KHÔNG remove value (xem cache_get_or_put_rev)."""
    try:
        cur = cache_get(rev_key)
        cache_put(rev_key, str((0 if cur is None else int(cur) or 0) + 1), config.CACHE_TTL["TASK_LIST"])
    except Exception:
        pass


# ===== Format Date/time (port CacheLayer.gs formatTime_/formatDateTime_/formatDateShort_) =====

def format_time(dt):
    """HH:mm:ss theo TZ script — hiển thị cột giờ quét."""
    if dt is None:
        return ""
    return dt.astimezone(_TZ).strftime("%H:%M:%S")


def format_date_time(dt):
    """yyyy-MM-dd HH:mm:ss (đủ năm — tránh nhầm ngày xuyên năm)."""
    if dt is None:
        return ""
    return dt.astimezone(_TZ).strftime("%Y-%m-%d %H:%M:%S")


def format_date_short(dt):
    """Date = ngày vào làm (StaffData) — yyyy-MM-dd ISO (sort string đúng)."""
    if dt is None:
        return ""
    return dt.astimezone(_TZ).strftime("%Y-%m-%d")


def epoch_ms(dt):
    """epoch ms UTC — sort key (khớp GAS Date.getTime())."""
    if dt is None:
        return 0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_TZ)
    return int(dt.astimezone(_UTC).timestamp() * 1000)


def to_datetime(value):
    """Chuẩn hóa giá trị cell → datetime hoặc None.

    Giá trị từ Sheets API (valueRenderOption=UNFORMATTED_VALUE):
      - serial number (date cell) → datetime (TZ spreadsheet = Asia/Ho_Chi_Minh)
      - ISO string "2026-08-03 09:00:00" / "09:02:15" → datetime (thiếu ngày → None-safe)
    """
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value <= 0 or value > 100000:
            return None
        # serial: ngày kể từ 1899-12-30 (Google Sheets epoch, đã tính bug 1900)
        try:
            from datetime import timedelta
            return datetime(1899, 12, 30, tzinfo=_TZ) + timedelta(days=float(value))
        except Exception:
            return None
    if isinstance(value, datetime):
        return value
    s = str(value).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%H:%M:%S"):
        try:
            dt = datetime.strptime(s, fmt)
            if fmt == "%H:%M:%S":
                # legacy string time-only "09:02:15" (FORMATTED_VALUE cũ) → treat as
                # 1899-12-30 + time, consistent with serial time-only 0.xxx
                return datetime(1899, 12, 30, dt.hour, dt.minute, dt.second, tzinfo=_TZ)
            return dt.replace(tzinfo=_TZ)
        except ValueError:
            continue
    return None


def to_iso_cell(dt):
    """datetime → chuỗi ghi vào sheet (USER_ENTERED — Google parse thành date cell)."""
    if dt is None:
        return ""
    return dt.astimezone(_TZ).strftime("%Y-%m-%d %H:%M:%S")


def to_display_date(value):
    """Ngày vào làm (StaffData DATE col) → yyyy-MM-dd. Chấp nhận datetime hoặc string."""
    from api import csvutil
    if value is None or value == "":
        return ""
    if isinstance(value, datetime):
        return value.astimezone(_TZ).strftime("%Y-%m-%d")
    return csvutil.normalize_staff_date(value)
