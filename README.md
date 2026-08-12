# RollCall v2 — Điểm danh kho

> Hệ thống điểm danh nhân viên kho (warehouse) bằng barcode, chạy trên **Google Apps Script WebApp** + **Google Sheets**.
> Repo: `van90bg/rollcall-kiosk-v2` (private) · Spec đầy đủ: [`Spec — RollCall v2.md`](Spec%20—%20RollCall%20v2.md)

## Tính năng

- **Tạo task đối chiếu** — chọn Station / Ca (Slot Code) / Team qua popup modal; 1 task = 1 tổ hợp lọc từ danh sách nhân viên HR
- **Quét barcode đối chiếu** — quét mã NV (`Ops…`, case-insensitive), server phân loại:
  - Khớp NV trong task → **Có mặt**
  - Quét lại → reject **Đã điểm danh**
  - NV ngoài task → **Dư**
  - Task đã kết thúc → reject
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
| Frontend | Vanilla HTML + CSS (không framework, không Bootstrap) |
| Backend | Google Apps Script (V8 runtime) |
| Database | Google Sheets (4 sheets, standalone) |
| Test | Node `node:test` (pure-function unit tests) |
| Deploy | clasp (`@google/clasp`) |

## Cấu trúc dự án

```
RollCall_2/
├── appsscript.json        # manifest — webapp block (executeAs USER_DEPLOYING, access ANYONE_ANONYMOUS)
├── Code.gs                # entry point doGet + gate isEditor_() cho ?debug=*/sync/setup
├── Config.gs              # hằng số: sheet names, cột, cache keys/TTL, STATUS, UI labels
├── CsvUtil.gs             # parse/normalize CSV + isValidBarcodeId() (pure, test được)
├── Database.gs            # đọc StaffData, task CRUD, cache (index 5m / task list 30s / detail 15s)
├── ScanLogic.gs           # phân loại scan: Có mặt / Đã điểm danh / Dư / reject (pure, test được)
├── ScanService.gs         # scanStaff — guard Ops + LockService + update/append log
├── TaskService.gs         # task CRUD + kết thúc task → markUnscannedAbsent_
├── index.html             # UI: CHỈ HTML (task list + scan view) — 437 dòng
├── css.html               # toàn bộ CSS (inline lúc serve — GAS không serve file tĩnh)
├── js.html                # toàn bộ client JS (inline lúc serve)
├── mock/mock-google.js    # mock GAS API cho test local
├── tests/                 # unit tests (130/130 pass)
└── scripts/               # serve.js (preview) · build-static.js (hosting) · inline-html.js (transform chung)
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

## Sheet dữ liệu (Spreadsheet `1NQQn…`)

| Sheet | Vai trò |
| :---- | :------ |
| **Config** | Cấu hình (optional) |
| **StaffData** | Dữ liệu HR (20 cột theo chuẩn Att.csv) — đọc-only, cache 5 phút, HR tự đồng bộ |
| **AttendanceTask** | Task: Task ID, Type, Station, Slot Code, Team, Status, Created At/By, Completed At |
| **AttendanceLog** | Log đối chiếu (10 cột): Task ID, Staff ID/Name, Slot/Team/Station/Workstation, Time Ref, Time Scan, Status |

> **Đã bỏ cardIn/cardOut** (2026-08-03): log không copy 2 cột Clock In/Out từ StaffData nữa — StaffData giữ nguyên, chỉ hiển thị.

## Cách chạy

### Test local

```bash
npm test          # 130/130 — node --test
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

## REST API cho AppSheet (quét camera native)

> **Vì sao:** web app kiosk chạy trong iframe GAS → iOS chặn camera live (`getUserMedia`) →
> không thể quét live auto-detect ngay trong trang GAS. **AppSheet** (app đang dùng của người
> quản lý) có scanner **native**: bấm vào ô quét → camera mở ngay → **tự nhận mã vạch** → điền
> mã → bấm nút → done. AppSheet gọi webhook HTTP tới GAS để chạy **đúng logic hiện có**
> (`scanStaff`, tạo task, list task…) — không viết lại gì, không cấp quyền Sheets cho từng user.
> Code: `Api.gs` (`doPost`) + test `tests/api-rest.test.js`.

### Endpoint

```bash
POST https://script.google.com/macros/s/<SCRIPT_ID>/exec
Content-Type: application/json

{"action":"scanStaffApi","args":["R20260802-0730","OPS229444",""]}
```

→ `{"ok":true,"result":{"ok":true,"message":"…","status":"present",…}}`

```bash
# thử nhanh bằng curl:
curl -s -X POST "https://script.google.com/macros/s/<SCRIPT_ID>/exec" \
  -H "Content-Type: application/json" \
  -d '{"action":"getTaskListApi","args":[]}'
```

### Action được phép (whitelist — `Api.gs`)

`getMeta` · `getFilterOptions` · `previewStaffApi` · `createReconcileTaskApi` ·
`createMealMoveTaskApi` · `pasteMealMoveScanApi` · `getTaskListApi` · `getTaskDetailApi` ·
`scanStaffApi` · `completeTaskApi` · `reopenTaskApi` · `updateTaskNoteApi` · `searchStaffApi` ·
`getStaffIndexApi`

- `args` = mảng tham số **đúng thứ tự** của hàm tương ứng (vd `scanStaffApi(taskId, staffId, mode)`;
  `mode` = `"ra"`/`"vao"` chỉ dùng cho task meal-move, để `""` với task đối chiếu).
- Mọi hàm khác (kể cả `_private`, editor-only như `syncFromCsv`/`setupSheets`/`debugState`) **bị chặn**.
- **KHÔNG hỗ trợ CORS** (GAS không set được `Access-Control-Allow-Origin`) → chỉ dùng cho client
  server-to-server: AppSheet webhook, curl, backend khác. Không fetch từ trình duyệt khác origin.
- Bảo mật ngang với UI kiosk anonymous — không thêm quyền nào, không cần API key.

### Cấu hình AppSheet (1 lần, làm trên AppSheet builder)

1. **Tạo app AppSheet** (hoặc dùng app hiện có) → kết nối **Google Sheets** của RollCall
   (cần ít nhất quyền xem `AttendanceTask` để chọn task; `AttendanceLog` để xem kết quả).
2. **Tạo form “Điểm danh”** với 3 cột:
   - `Task` — dropdown/ref từ `AttendanceTask` (chọn task đang mở)
   - `Mã Ops` — kiểu **Barcode** (scanner native: chạm vào ô → camera mở ngay → tự nhận mã)
   - `Kết quả` — text, chỉ đọc (nơi bot ghi message từ GAS)
3. **Bot (Automation):** trigger khi bấm nút “Điểm danh” (hoặc khi thêm dòng mới) → bước
   **Webhook / HTTP POST**:
   - URL: `https://script.google.com/macros/s/<SCRIPT_ID>/exec`
   - Method: `POST` · Header: `Content-Type: application/json`
   - Body: `{"action":"scanStaffApi","args":["[Task]","[Mã Ops]",""]}`
     (AppSheet thay `[Column]` bằng giá trị dòng hiện tại)
   - Bước tiếp theo: ghi response (message) vào cột `Kết quả`.
4. **Chia sẻ app** (Deploy → Share): gửi link cài đặt cho nhân viên → họ mở link, thêm app vào
   AppSheet của họ (cần tài khoản Google bất kỳ, không cần quyền vào Sheets).

Luồng người dùng: mở app → chọn task → chạm ô Mã Ops → **camera mở ngay, tự nhận mã vạch** →
bấm “Điểm danh” → thấy kết quả. Gói AppSheet miễn phí giới hạn ~10 user (tính cả bạn); nhiều
user hơn → gói trả phí.

## Quy ước

- Cột sheet / file: tiếng Anh · Hiển thị web: tiếng Việt
- Mọi hằng số tập trung tại `Config.gs` — không hardcode rải rác; client mirror `STATUS_C`/`TASK_STATUS_C` trong `js.html` (1 nguồn mỗi phía)
- Cache key có version (`rc2_*_vN`) — bump để invalidate
- `google.script.run` không trả `Date` (trả null) — trả text, check cả `xxx` + `xxxText`
- Client check mã Ops: regex `/^ops/i` chạy trước queue (0ms, không gọi server); server có guard `isValidBarcodeId()` chống bypass
- Modal pattern: `.about-overlay` + dialog; `anyModalOpen()` cho Escape + focus trap
- Mọi ghi log/đổi status phải gọi `invalidateTaskDetailCache_(taskId)` — cache detail 15s

## Git

```bash
git add <files>
git commit -m "type(scope): mô tả"
git push origin main
```

- Không commit: `.clasprc.json`, `codegraph.json`, file tạm verify, secrets
- 1 issue / 1 commit; push giữa các bước
- Branch `main` là nguồn duy nhất (branch `lobe` test đã gộp vào main và xoá — 2026-08-03)

## Trạng thái (2026-08-03)

- ✅ 4 yêu cầu UI: counters 1 hàng · gradient scanLine · Ops prefix · modal tạo task
- ✅ Modal confirm dùng chung thay `confirm()` (finishTask)
- ✅ Scan-topbar card nổi giống v1 (hết "treo lơ lửng")
- ✅ P1+P2+P3: rollback splice đúng row · torn-write chuẩn hóa · gate debug · chặn backToList khi xử lý · counter theo timeScan · hằng số status
- ✅ Cache task detail 15s + invalidate mọi đường ghi · `markUnscannedAbsent_` 1 RPC (hết ~240 RPC khi kết thúc)
- ✅ Simplify pass (4 reviewer): gộp helper trùng (scanBusy/scanCardHTML/statusRank/isEditor_), xoá duplicate counter bump, guard response scan theo task
- ✅ Config trỏ script `1HmmGcLI…` + spreadsheet `1NQQnLn…` (HR tự đồng bộ vào StaffData)
- ✅ Review pass (2026-08-03, reviewer độc lập + verify): P0 `updateTaskStatus_` ghi nhầm cột CREATED_AT → ghi đúng STATUS+COMPLETED_AT · P1 `debugState()` gate editor-only · P1 dedupe staffId trong cùng tổ hợp (Att.csv thật có NV 2 dòng cùng ca) · P2 a11y, format ngày, xóa CSS chết
- ✅ Test: 23/23 pass
- ⏳ P2 phase: QA prod quét NV thật
