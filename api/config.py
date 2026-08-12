"""Config — hằng số toàn cục RollCall v2 (port từ Config.gs, 2026-08-12).

Cột sheet/file: tiếng Anh · Hiển thị web: tiếng Việt (UI_LABELS).
KHÔNG hardcode string rải rác — mọi hằng số tập trung tại đây.
"""

# ===== Sheet names =====
SHEETS = {
    "CONFIG": "Config",
    "STAFF_DATA": "StaffData",
    "ATTENDANCE_TASK": "AttendanceTask",
    "ATTENDANCE_LOG": "AttendanceLog",
}

# Spreadsheet chứa dữ liệu (user cung cấp 2026-08-04) — phải share cho service account.
DEFAULT_SPREADSHEET_ID = "1kL4Jr3E70NzU3l7wAr3oLve5rBAZ9AqdbvcvmABuVi0"

# ===== Header StaffData (giữ đúng header Att.csv — index theo thứ tự cột) =====
STAFF_DATA_COLS = {
    "NO": 0,
    "DATE": 1,
    "STAFF_ID": 2,
    "STAFF_NAME": 3,
    "STAFF_EMAIL": 4,
    "AGENCY": 5,
    "CONTRACT_TYPE": 6,
    "EVENT_ID": 7,
    "MATCHING_TYPE": 8,
    "GENDER": 9,
    "DEPARTMENT": 10,
    "CARD_IN": 11,        # Clock In Time (csv) — chỉ hiển thị, không sửa
    "CARD_OUT": 12,       # Clock Out Time (csv) — chỉ hiển thị, không sửa
    "ACTUAL_HOURS": 13,
    "CARD_IN_REMARK": 14,
    "CARD_OUT_REMARK": 15,
    "SLOT_CODE": 16,      # text "08:00-17:00"
    "WORKSTATION": 17,
    "TEAM": 18,
    "STATION": 19,
}
STAFF_DATA_COL_COUNT = 20

# ===== Cột AttendanceTask =====
TASK_COLS = {
    "TASK_ID": 0,
    "TASK_TYPE": 1,
    "STATION": 2,
    "SLOT_CODE": 3,
    "TEAM": 4,
    "STATUS": 5,
    "CREATED_AT": 6,
    "CREATED_BY": 7,
    "COMPLETED_AT": 8,
    "NOTE": 9,    # Ghi chú của task — 2026-08-08
}
TASK_COL_COUNT = 10

# ===== Cột AttendanceLog (1 dòng / NV) =====
LOG_COLS = {
    "TASK_ID": 0,
    "STAFF_ID": 1,
    "STAFF_NAME": 2,
    "SLOT_CODE": 3,
    "STATION": 4,
    "TEAM": 5,
    "WORKSTATION": 6,
    "TIME_REF": 7,    # luồng 2 = taskCreated (pre-fill batch lúc tạo task)
    "TIME_SCAN": 8,   # giờ quét đối chiếu
    "STATUS": 9,
    "DATE": 10,       # ngày vào làm (copy từ StaffData) — hiển thị cột Date
    "TIME_RA": 11,    # giờ quét Ra (đi ra ngoài) — chỉ meal-move
    "AGENCY": 12,     # Nhà Thầu (copy từ StaffData cột Agency) — chỉ meal-move
}
LOG_COL_COUNT = 13

# ===== Trạng thái đối chiếu (badge — tiếng Việt) =====
STATUS = {
    "PENDING": "-",      # pre-fill khi tạo task — chưa xác định
    "PRESENT": "Có mặt",
    "ABSENT": "Vắng",    # chỉ gán khi kết thúc task (dòng chưa quét)
    "EXTRA": "Dư",
    "OUT": "Ra ngoài",   # meal-move: đã quét Ra, chưa Vào (badge cam)
}

# ===== Trạng thái task =====
TASK_STATUS = {
    "OPEN": "open",
    "DONE": "done",
}

# ===== Loại task =====
TASK_TYPE = {
    "RECONCILE": "reconcile",
    "MEAL_MOVE": "meal-move",
}

# ===== Loại hợp đồng (fallback khi StaffData trống) =====
# getFilterOptions đọc THẬT từ cột G (Contract Type) qua distinctValues (2026-08-12).
CONTRACT_TYPES = ["FTE", "BPO", "OS"]

# Meal-move: khoảng thời gian chống quét trùng (ms)
DUPLICATE_WINDOW_MS = 10000

# ===== Cache TTL (giây) — backend Python dùng cache in-memory đơn giản =====
CACHE_TTL = {
    "STAFF_INDEX": 5 * 60,
    "FILTER_OPTIONS": 5 * 60,
    "TASK_LIST": 30,
    "TASK_DETAIL": 15,
    "TASK": 15,
    "LOG_ROWS": 30,
    "TASK_COUNTS": 30,
    "TZ": 24 * 60 * 60,
}

# ===== Label UI (tiếng Việt) — CHỈ các message server trả về =====
UI_LABELS = {
    "APP_TITLE": "Điểm danh kho",
    "ALREADY_SCANNED": "Đã điểm danh",
    "TASK_CLOSED": "Task đã kết thúc",
    "STAFF_NOT_FOUND": "Không tìm thấy nhân viên",
    "CREATE_FAILED_EMPTY": "Không có nhân viên nào trong tổ hợp đã chọn",
    "DUPLICATE_SCAN": "Trùng mã — chờ 10 giây",
    "MEAL_NO_OPS": "Không có mã Ops nào trong danh sách",
    "PASTE_TOO_MANY": "Danh sách quá dài — tối đa 200 mã/lần",
}
