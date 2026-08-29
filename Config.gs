/**
 * Config.gs — Hằng số toàn cục Điểm Danh HN2 SOC
 * Cột sheet/file: tiếng Anh · Hiển thị web: tiếng Việt (UI_LABELS)
 * KHÔNG hardcode string rải rác — mọi hằng số tập trung tại đây.
 * test workflows 2026-08-28 — trigger CI
 */

// ===== Sheet names =====
const SHEETS = {
  CONFIG: 'Config',
  STAFF_DATA: 'StaffData',
  ATTENDANCE_TASK: 'AttendanceTask',
  ATTENDANCE_LOG: 'AttendanceLog',
};

/**
 * Spreadsheet chứa dữ liệu.
 * FIX-25: KHÔNG commit ID thật vào repo (public) — để rỗng, set ID thật vào
 * Script Properties `SPREADSHEET_ID` (GAS: Project Settings → Properties) hoặc
 * `DEFAULT_SPREADSHEET_ID` chỉ dùng fallback local/test.
 * getSpreadsheet_() ưu tiên: DEFAULT → Properties → active → throw (không tự tạo DB rỗng ở webapp).
 * Nếu deployment là `Anyone` thì ID + RC_API_TOKEN bake trong HTML sẽ public hoàn toàn
 * (trade-off đã ghi AGENTS.md §20: token là public config cho JSONP anonymous).
 */
const DEFAULT_SPREADSHEET_ID = '';

// ===== Header StaffData (giữ đúng header Att.csv — index theo thứ tự cột) =====
// Sheet StaffData lưu nguyên cấu trúc csv hệ thống (1 dòng = 1 NV–1 ca–1 station).
const STAFF_DATA_COLS = {
  NO: 0,
  DATE: 1,
  STAFF_ID: 2,
  STAFF_NAME: 3,
  STAFF_EMAIL: 4,
  AGENCY: 5,
  CONTRACT_TYPE: 6,
  EVENT_ID: 7,
  MATCHING_TYPE: 8,
  GENDER: 9,
  DEPARTMENT: 10,
  CARD_IN: 11,        // Clock In Time (csv) — chỉ hiển thị, không sửa
  CARD_OUT: 12,       // Clock Out Time (csv) — chỉ hiển thị, không sửa
  ACTUAL_HOURS: 13,
  CARD_IN_REMARK: 14,
  CARD_OUT_REMARK: 15,
  SLOT_CODE: 16,      // text "08:00-17:00"
  WORKSTATION: 17,
  TEAM: 18,
  STATION: 19,
};
const STAFF_DATA_COL_COUNT = 20;

// ===== Cột AttendanceTask =====
const TASK_COLS = {
  TASK_ID: 0,
  TASK_TYPE: 1,
  STATION: 2,
  SLOT_CODE: 3,
  TEAM: 4,
  STATUS: 5,
  CREATED_AT: 6,
  CREATED_BY: 7,
  COMPLETED_AT: 8,
  NOTE: 9,    // Ghi chú của task (người tạo thêm; sửa được trong task) — 2026-08-08
};
const TASK_COL_COUNT = 10;

// ===== Cột AttendanceLog (1 dòng / NV) =====
// Lưu ý: bỏ cardIn/cardOut (2026-08-03) — StaffData GIỮ NGUYÊN; log không copy 2 cột này nữa.
const LOG_COLS = {
  TASK_ID: 0,
  STAFF_ID: 1,
  STAFF_NAME: 2,
  SLOT_CODE: 3,
  STATION: 4,
  TEAM: 5,
  WORKSTATION: 6,
  TIME_REF: 7,    // luồng 2 = taskCreated (pre-fill batch lúc tạo task)
  TIME_SCAN: 8,   // giờ quét đối chiếu
  STATUS: 9,
  DATE: 10,       // ngày vào làm (copy từ StaffData) — hiển thị cột Date, khác TIME_REF (ngày task)
  // Meal-move (2026-08-04): 2 mốc Ra/Vào + agency (Vender)
  TIME_RA: 11,    // giờ quét Ra (đi ra ngoài) — chỉ meal-move
  AGENCY: 12,     // Vender (copy từ StaffData cột Agency) — chỉ meal-move
};
const LOG_COL_COUNT = 13;

// ===== Trạng thái đối chiếu (badge — tiếng Việt) =====
const STATUS = {
  PENDING: '-',      // pre-fill khi tạo task — chưa xác định (chưa quét, task đang mở)
  PRESENT: 'Có mặt',
  ABSENT: 'Vắng',    // chỉ gán khi kết thúc task (dòng chưa quét)
  EXTRA: 'Dư',
  OUT: 'Ra ngoài',  // meal-move: đã quét Ra, chưa Vào (badge cam)
};

// ===== Trạng thái task =====
const TASK_STATUS = {
  OPEN: 'open',
  DONE: 'done',
};

// ===== Loại task =====
const TASK_TYPE = {
  RECONCILE: 'reconcile', // Phase 0: đối chiếu từ csv
  MEAL_MOVE: 'meal-move', // 2026-08-04: Đi ăn + Move — paste/quét mã Ops, 2 mốc Ra/Vào
};

// ===== Loại hợp đồng (filter khi tạo task) =====
// Fallback "Loại hợp đồng" khi StaffData trống — getFilterOptions đọc THẬT từ cột G
// (Contract Type) qua distinctValues(staffList, 'contractType') (yêu cầu 2026-08-12).
const CONTRACT_TYPES = ['FTE', 'BPO', 'OS'];

// Meal-move: khoảng thời gian chống quét trùng (ms) — 2 lần quét cùng mã trong cửa này = 'Trùng mã'
const DUPLICATE_WINDOW_MS = 1500;  // 2026-08-17: giảm 10s → 1.5s để khớp cooldown quét camera client

// FIX-29: trần tổng dòng log của 1 task khi paste (log_rows + mã paste) — chặn
// bùng nổ AttendanceLog khi paste danh sách lớn vào task lạ (mirror api/config.py).
const PASTE_LOG_ROWS_MAX = 1000;

// ===== Cache TTL (giây) =====
// 2026-08-20: tăng lại TTL (2026-08-18 từng giảm sát chu kỳ poll 3-5s cho "sửa tay trên
// gsheet phải thấy nhanh") — app là NGƯỜI GHI DUY NHẤT (chủ sheet tự sửa tay, không cần
// realtime): mọi write path invalidate/incremental ĐÚNG key (scan → bump rev + incremental
// LOG_ROWS; ghi task → invalidate) → TTL dài chỉ giảm read RÁC lúc idle (không ai thao
// tác), KHÔNG làm chậm sync đa thiết bị.
const CACHE_TTL = {
  STAFF_INDEX: 300,          // 5m — index StaffData (đường quét NV lạ + load app); syncFromCsv invalidate
  FILTER_OPTIONS: 5 * 60,    // 5m — distinct station/slotCode/team
  TASK_LIST: 30,             // 30s — danh sách task (version-gated — rebuild chỉ khi thật đổi)
  TASK_DETAIL: 15,           // 15s — chi tiết task + log (rebuild từ cache — không chạm sheet)
  TASK: 15,                  // 15s — task read (đường quét scanStaff) — invalidate khi ghi task
  LOG_ROWS: 30,              // 30s — log rows theo taskId (incremental mỗi scan — không invalidate)
  TASK_COUNTS: 30,           // 30s — counters list (version-gated — rebuild chỉ khi thật đổi)
  SEARCH_LOG: 10,            // 10s — AttendanceLog full cho searchStaffApi (khớp Python O3)
  TZ: 24 * 60 * 60,          // 24h — timezone (cache 1 lần, KHÔNG gọi trong loop)
};

// ===== Cache keys (version-key để invalidate dễ — v1 lesson) =====
const CACHE_KEYS = {
  STAFF_INDEX: 'rc2_staffIndex_v1',
  FILTER_OPTIONS: 'rc2_filterOptions_v1',
  TASK_LIST: 'rc2_taskList_v1',
  TASK_LIST_REV: 'rc2_taskListRev_v1',   // O4: version counter — scan bump rev thay vì remove() (poll thiết bị khác vẫn hit cache)
  TASK_DETAIL: 'rc2_taskDetail_v2_',  // v2: meal-move thêm timeRa/agency/duration (schema log đổi)
  TASK: 'rc2_task_v1_',          // v1 — task theo taskId (đường quét scanStaff)
  LOG_ROWS: 'rc2_logRows_v2_',          // v2: schema slim thêm timeRaEpoch (meal-move)
  TASK_COUNTS: 'rc2_taskCounts_v1_',      // prefix — counters theo taskId cho list (đếm 1 lần + cache 30s)
  SEARCH_LOG: 'rc2_searchLog_v1',   // searchStaffApi — AttendanceLog full (khớp Python O3)
  TZ: 'rc2_tz_v2',  // v2: bump sau khi sửa manifest timeZone NY→Asia/Ho_Chi_Minh (invalidate cache 24h)
};

// ===== Label UI (tiếng Việt) — CHỈ các message server trả về =====
// Text giao diện khác đã hardcode trong index.html (client tự quản lý).
const UI_LABELS = {
  APP_TITLE: 'Điểm Danh HN2 SOC',
  ALREADY_SCANNED: 'Đã điểm danh',
  TASK_NOT_FOUND: 'Task không tồn tại',  // 2026-08-19: task mất ≠ đóng
  TASK_CLOSED: 'Task đã kết thúc',
  STAFF_NOT_FOUND: 'Không tìm thấy nhân viên',
  CREATE_FAILED_EMPTY: 'Không có nhân viên nào trong tổ hợp đã chọn',
  // Meal-move (2026-08-04)
  DUPLICATE_SCAN: 'Trùng mã — chờ 1.5 giây',
  MEAL_NO_OPS: 'Không có mã Ops nào trong danh sách',
  PASTE_TOO_MANY: 'Danh sách quá dài — tối đa 200 mã/lần',
  PASTE_LOG_TOO_MANY: 'Quá nhiều dòng log — chia nhỏ danh sách paste',
  // FIX-03: dòng đích không còn thuộc task (sheet bị sửa tay trong cửa sổ cache)
  STALE_ROW: 'Dữ liệu đã thay đổi — quét lại',
};

// ===== Cấu hình WebApp =====
const WEB_APP = {
  PAGE_TITLE: 'Điểm Danh HN2 SOC',
};
