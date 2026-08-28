# Component inventory — SPX Điểm Danh (2026-08-19)

Kiểm kê toàn bộ thành phần UI của app Điểm Danh HN2 SOC (kiosk barcode kho Shopee Express), gom 8 nhóm. Mỗi nhóm có **audit đúng cho nó** — dùng làm checklist khi audit UI/UX (Phase 1 của skill) và khi thêm tính năng mới phải đối chiếu.

Nguồn sự thật: `index.html` (shell + danh sách task + modal scan + 5 modal) · `css.html` (toàn bộ CSS) · `js.html` (client JS, marker blocks) · `camera-scan.html` (decode chain) · `camera-css.html` · `lib-jsqr.html` · `lib-quagga.html` · `mobile.html`.

## Nhóm 1 — Header & Controls

| Thành phần | Vị trí | Chú ý |
|---|---|---|
| Brand / Title | `.brand` (logo Shopee Express + "Điểm Danh HN2 SOC") | 1 hàng mọi viewport; `--header-h: 59px` |
| User email | `#userEmail` `.header-user` | aria-label |
| Trạng thái mạng | `.net-dot` + `#netText` | dot màu offline/online |
| Task nền | `#bgTaskIndicator` (`.bg-spinner` + `.bg-task-count`) | role=status aria-live |
| Nút âm thanh | `#btnSound` (2 SVG on/off) | aria-pressed |
| Nút làm mới | `#btnRefresh` | gọi `loadTaskList` |
| Tìm kiếm header | `#headerSearchInput` | mã Ops → NV + task đã điểm danh |

**Audit đúng**: header 1 hàng; icon đơn sắc (không emoji); focus-visible đủ; net-dot contrast; header search Enter/focus đúng.

## Nhóm 2 — Feedback & States

| Thành phần | Vị trí | Chú ý |
|---|---|---|
| Skeleton shimmer | `.skeleton-wrap/.skeleton-row/.skeleton-cell` | task 10 · scan 11 cells — **cell count = số cột thật** |
| Empty state | `.empty` (+`.empty-arrow`) | task/scan |
| Phân trang | `.pag-wrap` | NGOÀI `.table-wrap`; mobile chỉ « ‹ › » + info |
| Toast | `#toast` | role=alert/status + aria-live |
| Spinner | `.spin-big` + `#spinModal` | guard — không 2 spinner đè (`showModalSpin`) |

**Audit đúng**: skeleton count khớp cột; empty hiện khi 0 rows; pagination không nằm trong scroll; spinner guard; overlay đóng khi dữ liệu nạp xong.

## Nhóm 3 — Shared primitives

| Thành phần | Class | Chú ý |
|---|---|---|
| Nút | `.btn` base, `.btn-ghost`, `.btn-outline`, `.btn-danger`, `.btn-amber`, `.btn-sm`, `.btn-icon`, `.btn-clear-filter` | modal = 44px touch; btn-sm 36px |
| Card | `.card` | `.table-wrap` cuộn nội bộ |
| Heading/meta | `.task-title` (uppercase), `.task-meta`, `.muted` | |
| Chips chọn | `.chips` > `.pick` (+`.on`/`.all`/`.free.on`) | aria-pressed; selected = primary |
| Form | `.flabel`/`.fnote`, `.field-select` | |
| Search | `.list-search` (`#listSearch`, `#scanSearch`; input + btn-icon + btn clear) | Escape clear; input oninput lọc |
| Badge trạng thái | `.badge.pending/present/absent/extra/out/open` | pending xám · present xanh · absent đỏ · extra cam · out xanh dương |
| Bảng | `.table-wrap`, th/td base, `.sortable` + aria-sort, `tr:hover td` row-hover | desktop 13px; hover đồng nhất |

**Audit đúng**: touch 44/36/33px; focus-visible; contrast AA; badge màu theo ngữ nghĩa; hover row đồng nhất 2 bảng; sticky không rò rỉ xuống card mobile.

## Nhóm 4 — Task List View (`#viewTasks` / `#taskListCard`)

| Thành phần | Vị trí | Chú ý |
|---|---|---|
| Toolbar | `.task-list-toolbar` (heading + `.list-search`) | filter Station/Slot/Team/Date/Contract + `#btnNewTask` + `#btnMealMoveTask` |
| Bảng task | `#taskListTable` **10 cột** | STT, Mã task, Loại, Station, Team, Ca, Tổng NV, Đã quét, Dư, Trạng thái, Tạo lúc, Người tạo, Thao tác |
| Empty | `.empty` | task empty có mũi tên ↑ |
| Pagination | `.pag-wrap` + `#taskPagination` | |

**Audit đúng**: filter chip hoạt động; table auto-fit + table-wrap scroll; mobile ≤640px bảng → card 2 cột đồng bộ (`text-align:left`, nhãn `::before attr(data-label)`); badge trạng thái đúng màu.

## Nhóm 5 — Task Scan View (`#scanView`)

| Thành phần | Vị trí | Chú ý |
|---|---|---|
| Topbar | `.scan-topbar` (back, task badge, mode Ra/Vào cho meal-move, `#btnPaste`, `#btnFinish`) | |
| Counters | `.counters` 3× `.counter.scanned/absent/extra` (+ `.out` cho meal-move) | |
| Scan input row | `.scan-row` `#scanInput` + `#btnCamScan` (camera live, mobile) + `#btnCamFile` (upload ảnh) + `#btnScan` | |
| Scan card projector | `#scanCard` `.scan-card` (ok/err/extra) + `#scanLiveMsg` sr-only | KHÔNG dùng `alert()` |
| Scan list | `.scan-col-right` `#scanTable` **11 cột** (STT, Mã NV, Tên, Agency, Station, Team, Slot, Date, Giờ Ref, Giờ quét, Badge), filter/sort, pagination | |

**Audit đúng**: counters cập nhật ngay (queue + optimistic); scan-row capture tức thì; scan card projector + toast; bảng scan sort/filter; mobile card đồng bộ.

## Nhóm 6 — Modals & Dialogs

Chung: overlay `.about-overlay` (đóng click ngoài) + `.about-dialog` (scale-in, 44px touch, Escape đóng).

| Modal | Id | Thành phần riêng |
|---|---|---|
| Tạo task đối chiếu | `#createModal` | `#modeDesc`, `.create-form` (Station/Team/Ca/Date/Contract chips + `#selDate`), `.create-footer` (preview count + submit) |
| Dán mã Ops | `#pasteModal` | `.paste-title/.paste-hint`, `#pasteTextarea`, `#pasteCountHint`, `#pasteProgress`, `#pastePreview`, `.paste-footer` |
| Confirm chung | `#confirmModal` | `.confirm-title/.confirm-msg`, `#confirmOkBtn` btn-danger |
| Spinner | `#spinModal` | `.spin-dialog` + `#spinModalMsg` role=status |
| Quét camera | `#cameraModal` (top-level) / popup GAS | `camera-scan.html` (live scan / photo decode → `submitScan`); nút `#btnCamScan`/`#camFile` |

**Audit đúng**: role=dialog + aria-modal + labelledby đủ; click ngoài đóng + Escape; 44px touch mọi nút trong modal; không 2 overlay đè.

## Nhóm 7 — Camera & Scanner

- `camera-scan.html`: chain decode ZXing (CDN) → Quagga → jsQR + Tesseract OCR + Web Worker; popup GAS top-level hoặc `#cameraModal` (standalone).
- `camera-css.html`: CSS overlay camera, badge trạng thái (`fl-ok`/`fl-extra`/`fl-err`), effect ring + mark.
- `lib-jsqr.html`, `lib-quagga.html`: thư viện vendored (bọc `<script>`).
- Dedup `CAM_CODE_COOLDOWN_MS=1500` khớp `DUPLICATE_WINDOW_MS` server.

**Audit đúng**: camera mở không kẹt; popup/modal tự đóng đúng; kết quả render dưới camera (cuộn container thật); effect + badge trạng thái rõ.

## Nhóm 8 — Design token system

Tất cả màu/spacing/type/radius nằm trong `:root` (css.html).

| Nhóm | Token | Ghi chú |
|---|---|---|
| Màu semantic | `--primary(-dark/-bright/-bg/-soft)` · `--danger(-strong)` · `--warning` · `--success(-dark)` · `--amber(-dark/-solid/-text/-hover/-deep)` · `--card-ok/err/extra-bg` · `--free(-bg/-text)` · `--net-err(-border)` · `--toast-bg` · `--surface(-muted/-soft)` · `--text/--muted/--muted-2` | mọi tông status/badge đều có token |
| Spacing | `--space-1..8` = 4/8/12/16/20/24/28/32px | 4pt grid |
| Type | `--text-3xs..8xl` = 10→72px | px-exact |
| Radius | `--radius-2xs..full` = 4/6/8/12/20/999px | `--card-radius: var(--radius-md)` |
| Layout | `--header-h` 59px · `--bottom-nav-h` 60px · `--card-radius` | 1 nguồn cho sticky |

**Invariant**: KHÔNG hardcode hex/px ngoài `:root` (cả inline style/JS). Ngoại lệ: micro 1-3px · `#fff`/`#000` · fallback `var(--x, #hex)` · px đo runtime.

## Lỗ hổng audit tooling hiện tại

1. `node:test` phủ logic + scriptlet + template parse (`inline-html.test.js`, `code-doget.test.js`, `camera-*.test.js`, `ocr-scan.test.js`, `scan-*.test.js`) — đủ.
2. Chưa có script audit-ui/audit-style tự động (repo này KHÔNG có `audit-ui.js`/`audit-style.js` như bản cũ) → đo CDP thủ công qua `scripts/cdp-helper.js`.
3. `npm run test:css` / `npm run test:gs` KHÔNG tồn tại trong repo này — đừng chạy; dùng `npm test` + `node --check`.
