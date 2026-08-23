# Điểm Danh HN2 SOC — Điểm danh kho

> Hệ thống điểm danh nhân viên kho (warehouse) bằng barcode, chạy trên **Google Apps Script WebApp** + **Google Sheets**.
> Repo: `Duc-Nguyen-739/spx-diem-danh` · Spec đầy đủ: [`Spec — Điểm Danh HN2 SOC.md`](Spec%20—%20Điểm%20Danh%20HN2%20SOC.md)

## Tính năng

- **Tạo task đối chiếu** — chọn Station / Ca (Slot Code) / Team / Ngày / Loại hợp đồng qua popup modal; 1 task = 1 tổ hợp lọc từ danh sách nhân viên HR
- **Quét barcode đối chiếu** — quét mã NV (`Ops…`, case-insensitive), server phân loại:
  - Khớp NV trong task → **Có mặt**
  - Quét lại → reject **Đã điểm danh**
  - NV ngoài task → **Dư**
  - Task đã kết thúc / không tồn tại → reject
- **Đi ăn + Move (meal-move)** — task 2 mốc Ra (đi ra ngoài) / Vào (quay lại); paste/quét mã Ops, server tự quyết định mode (fail-closed nếu task không có người tạo)
- **Quét camera** — ZXing + Quagga + jsQR (multi-scale/2-bậc) + Tesseract OCR + Web Worker decode; trên GAS iframe mở popup top-level, trên trang top-level quét live trong modal; nhận cả mã ngoài hệ thống (Dư)
- **Kết thúc task** → các dòng chưa quét gán **Vắng** (modal confirm, không dùng `confirm()` trình duyệt)
- **Counters tức thì** — Đã quét / Vắng / Dư cập nhật ngay (queue + optimistic, không chờ server)
- **Scan queue nền** — input được capture/xoá/focus tức thì (1ms), server xử lý ngầm
- **Scan card projector** — phản hồi ok/err/Dư trên card lớn + toast, không dùng `alert()`
- **Bảng danh sách NV** — tìm kiếm, lọc trạng thái, sort theo cột; hiển thị giờ có mặt / giờ quét / trạng thái
- **Âm thanh phản hồi** — beep khi quét thành công, buzz khi lỗi (Web Audio API, toggle 🔊/🔇)
- **A11y** — skip-link, focus trap modal, `prefers-contrast`, badge nền đặc

## Tech Stack

| Thành phần | Công nghệ |
| :--------- | :-------- |
| Frontend | Vanilla HTML + CSS (không framework, không Bootstrap); UI tách `index.html` + `css.html` + `js.html` |
| Backend (GAS) | Google Apps Script (V8 runtime) — `Code.gs` + `.gs` services |
| Backend (Python) | `api/` — FastAPI-style handler, đọc Google Sheets qua `google-api-python-client` (hosting top-level, JSONP/POST) |
| Database | Google Sheets (4 sheets, standalone) |
| Test | Node `node:test` (26 file, ~337 tests) + Python `unittest` (`api/test_*.py`) |
| Deploy | clasp (`@google/clasp`) cho GAS · `node scripts/build-static.js` cho hosting tĩnh |

## Cấu trúc dự án

```
spx-diem-danh/
├── appsscript.json        # manifest — webapp block (executeAs USER_DEPLOYING, access DOMAIN)
├── Code.gs                # entry point doGet + gate isEditor_() cho ?debug=*/sync/setup + JSONP
├── Config.gs              # hằng số: sheet names, cột, cache keys/TTL, STATUS, UI labels
├── CsvUtil.gs             # parse/normalize CSV + isValidBarcodeId() (pure, test được)
├── Database.gs            # đọc StaffData, task CRUD, cache (index 60s / task list 10s / detail 5s / log 10s)
├── ScanLogic.gs           # phân loại scan: Có mặt / Đã điểm danh / Dư / Ra-Vào (pure, Node + Python test)
├── ScanService.gs         # scanStaff / pasteMealMoveScan — guard Ops + LockService + update/append log
├── TaskService.gs         # task CRUD + kết thúc task → markUnscannedAbsent_
├── TaskSearch.gs          # tìm kiếm NV theo mã Ops (header search)
├── JsonpApi.gs            # JSONP API cho trang standalone (whitelist action + cb sanitize)
├── CacheLayer.gs          # helper cache versioned
├── index.html             # UI: CHỈ HTML (task list + scan view) — scriptlet include('css'/'js')
├── css.html               # toàn bộ CSS (inline lúc serve — GAS không serve file tĩnh)
├── js.html                # toàn bộ client JS (marker blocks: TASK-MENU-*, PURE-LOGIC-*, HEADER-SEARCH, MEAL-CREATE, SCAN-LOGIC, OCR-SCAN-*)
├── camera-scan.html       # chain decode: ZXing → Quagga → jsQR + Tesseract OCR + Web Worker
├── camera-css.html        # CSS overlay camera
├── lib-jsqr.html          # thư viện jsQR (vendored, bọc <script>)
├── lib-quagga.html        # thư viện Quagga (vendored, bọc <script>)
├── mobile.html            # variant mobile
├── api/                   # backend Python (port cùng logic GAS) — main.py handler JSONP/POST + scanlogic.py + services.py + database.py + sheets.py
├── mock/mock-google.js    # mock GAS API cho test local + demo mode (?demo=1)
├── tests/                 # unit tests Node (26 file, ~337 tests)
├── api/test_*.py          # unit tests Python (unittest: test_logic/test_database/test_main/test_services)
└── scripts/               # serve.js (?demo=1 preview) · build-static.js (hosting tĩnh) · inline-html.js (transform) · cdp-helper.js (CDP geometry)
```

> **CSS/JS tách file (2026-08-11):** GAS `HtmlService` không serve file tĩnh `.css`/`.js`
> (clasp chỉ push `.gs/.js/.html/.json`) nên CSS/JS được giữ ở file đuôi `.html`
> (`css.html` / `js.html`, bọc sẵn `<style>`/`<script>`) và nhúng qua **scriptlet
> template** `<?!= include('css') ?>` / `<?!= include('js') ?>`:
> `Code.gs doGet` dùng `createTemplateFromFile('index').evaluate()` + hàm `include()`
> (KHÔNG dùng `createHtmlOutput`/`setContent` — GAS sanitize strip `<script>`).
> `scripts/serve.js` (preview) + `scripts/build-static.js` (hosting → dist tự-chứa)
> thay cùng scriptlet bằng nội dung file qua `scripts/inline-html.js`.
> Bản serve ra **byte-identical** với index.html 1-file cũ (verify bằng cách so với
> `git show c5dd5b4:index.html`).

## Sheet dữ liệu (Spreadsheet `1kL4J…`)

| Sheet | Vai trò |
| :---- | :------ |
| **Config** | Cấu hình (optional) |
| **StaffData** | Dữ liệu HR (20 cột theo chuẩn Att.csv) — đọc-only, cache 5 phút, HR tự đồng bộ |
| **AttendanceTask** | Task: Task ID, Type, Station, Slot Code, Team, Status, Created At/By, Completed At |
| **AttendanceLog** | Log đối chiếu (13 cột): Task ID, Staff ID/Name, Slot/Team/Station/Workstation, Time Ref, Time Scan, Status, Date, Time Ra (meal-move), Agency (meal-move) |

> **Đã bỏ cardIn/cardOut** (2026-08-03): log không copy 2 cột Clock In/Out từ StaffData nữa — StaffData giữ nguyên, chỉ hiển thị.

## Cách chạy

### Test local

```bash
npm test          # ~337 tests — node --test (26 file)
npm run test:py   # python unittest api/ (4 file: test_logic/test_database/test_main/test_services)
```

### Mock UI local

```bash
# mở index.html trực tiếp bằng trình duyệt (mock tự nạp khi không có google.script.run)
# có thể dùng CDP verify:
node scripts/cdp-helper.js open "http://localhost:4173/"  # dùng serve.js — file:// không inline được css/js (2026-08-11)
```

### Deploy (clasp)

```bash
clasp login
clasp push -f            # đẩy code (dùng -f khi "Skipping push." do hash trùng)
clasp deploy             # tạo version + deployment webapp MỚI — CÁCH ĐÚNG
```

> **⚠️ Bài học deploy:** `PUT /deployments/{id}` (đổi version) **luôn làm mất `entryPoints`** → URL `/exec` trả 404. API POST cũng không tạo entryPoint. **Chỉ `clasp deploy`** (đọc `webapp` block trong appsscript.json) tạo deployment hoạt động đúng. Sau mọi thao tác deploy: **curl verify** URL `/exec` (chờ HTTP 200 + đủ marker).

## Quy ước

- Cột sheet / file: tiếng Anh · Hiển thị web: tiếng Việt
- Mọi hằng số tập trung tại `Config.gs` — không hardcode rải rác; client mirror `STATUS_C`/`TASK_STATUS_C` trong `js.html` (1 nguồn mỗi phía)
- Cache key có version (`rc2_*_vN`) — bump để invalidate
- `google.script.run` không trả `Date` (trả null) — trả text, check cả `xxx` + `xxxText`
- Client check mã Ops: regex `/^ops/i` chạy trước queue (0ms, không gọi server); server có guard `isValidBarcodeId()` chống bypass
- Modal pattern: `.about-overlay` + dialog; `anyModalOpen()` cho Escape + focus trap
- Mọi ghi log/đổi status phải gọi `invalidateTaskDetailCache_(taskId)` — cache detail 5s (TTL hiển thị realtime thấp để thiết bị khác thấy sửa tay gsheet)

## Git

```bash
git add <files>
git commit -m "type(scope): mô tả"
git push origin main
```

- Không commit: `.clasprc.json`, `codegraph.json`, file tạm verify, secrets
- 1 issue / 1 commit; push giữa các bước
- Branch `main` là nguồn duy nhất (branch `lobe` test đã gộp vào main và xoá — 2026-08-03)

## Trạng thái (2026-08-19)

- ✅ Dual-runtime: GAS Apps Script WebApp + backend Python (`api/`) port cùng logic ScanLogic — dùng hosting top-level khi JSONP GAS bị chặn (org Shopee khóa 'Anyone')
- ✅ Meal-move (Đi ăn + Move): 2 mốc Ra/Vào, server quyết định mode fail-closed
- ✅ Quét camera: ZXing + Quagga + jsQR + Tesseract OCR + Web Worker; popup top-level trên GAS iframe, live modal trên trang top-level
- ✅ Tìm kiếm NV (header search): mã Ops → hồ sơ + task đã điểm danh
- ✅ Poll danh sách task mỗi 3s (không cần F5 thủ công)

- ✅ 4 yêu cầu UI: counters 1 hàng · gradient scanLine · Ops prefix · modal tạo task
- ✅ Modal confirm dùng chung thay `confirm()` (finishTask)
- ✅ Scan-topbar card nổi giống v1 (hết "treo lơ lửng")
- ✅ P1+P2+P3: rollback splice đúng row · torn-write chuẩn hóa · gate debug · chặn backToList khi xử lý · counter theo timeScan · hằng số status
- ✅ Cache task detail 5s + invalidate mọi đường ghi · `markUnscannedAbsent_` 1 RPC (hết ~240 RPC khi kết thúc)
- ✅ Simplify pass (4 reviewer): gộp helper trùng (scanBusy/scanCardHTML/statusRank/isEditor_), xoá duplicate counter bump, guard response scan theo task
- ✅ Config trỏ script `18TTG5d0…` + spreadsheet `1kL4J…` (HR tự đồng bộ vào StaffData)
- ✅ Review pass (2026-08-03, reviewer độc lập + verify): P0 `updateTaskStatus_` ghi nhầm cột CREATED_AT → ghi đúng STATUS+COMPLETED_AT · P1 `debugState()` gate editor-only · P1 dedupe staffId trong cùng tổ hợp (Att.csv thật có NV 2 dòng cùng ca) · P2 a11y, format ngày, xóa CSS chết
- ✅ Test: 337/337 Node + 4 file Python pass
- ⏳ P2 phase: QA prod quét NV thật
