# Component inventory — SPX Điểm Danh (2026-08-16)

Kiểm kê toàn bộ thành phần UI của app, gom 6 nhóm. Mỗi nhóm có **audit đúng cho nó** — dùng làm checklist khi audit UI/UX (Phase 1 của skill) và khi thêm tính năng mới phải đối chiếu.

Nguồn sự thật: `index.html` (shell + 9 view + 5 modal) · 9 module `app-*.html` · `styles.html` (1478 dòng).

## Nhóm 1 — Shell & điều hướng

| Thành phần | Vị trí | Chú ý |
|---|---|---|
| Loading overlay | `#loadingOverlay` + `.spin-big` | Boot — đóng khi dữ liệu nạp xong |
| Header | `header` → `.brand` (logo+title) + `.header-right` | 1 hàng mọi viewport; `--header-h: 59px` |
| User email | `#userEmail` `.header-user` | aria-label |
| Trạng thái mạng | `.net-dot` + `#netText` | dot màu offline/online |
| Task nền | `#bgTaskIndicator` (`.bg-spinner` + `.bg-task-count`) | role=status aria-live |
| Nút âm thanh | `#btnSound` `.btn-icon-dark` (2 SVG on/off) | aria-pressed |
| Nút làm mới | `#btnRefresh` `.btn-icon-dark` + `.btn-refresh-label` | |
| Sidebar trái | `#sidebar` → `.side-nav` 7× `.side-item` (`.side-ico` + `.side-lbl`) + `.side-foot`/`.side-compact` | ≥701px; thu gọn 240↔48px; icon SVG currentColor |
| Bottom nav | `.bottom-nav` 6× `.nav-item` (config + admin ẩn theo role) | ≤700px; `.nav-item.active` #4d8fe8 (AA) |
| Skip link | `.skip-link` | focus-visible |

**Audit đúng**: sidebar collapse 240↔48 không vỡ; bottom-nav 5 mục vừa 375px; header 1 hàng; icon đơn sắc (không emoji); nav.active contrast ≥4.5; focus-visible đủ.

## Nhóm 2 — Feedback chung (trạng thái tải/trống/lỗi/phân trang)

| Thành phần | Vị trí | Chú ý |
|---|---|---|
| Skeleton shimmer | `.skeleton-wrap/.skeleton-row/.skeleton-cell` | task 13 · scan 11 · staff 20 · reports 10 · config 5 cells — **cell count = số cột thật** |
| Empty state | `.empty` (+`.empty-arrow`) | task/scan/staff/reports/config |
| Phân trang | `.pag-wrap` (task/scan/staff) | NGOÀI `.table-wrap`; mobile ≤640px chỉ « ‹ › » + info |
| Toast | `#toast` | role=alert/status + aria-live set động trong showToast |
| Spinner | `.spin-big` + `#spinModal` | guard — không 2 spinner đè (showModalSpin) |

**Audit đúng**: skeleton count khớp cột; empty hiện khi 0 rows + ẩn khi có data; pagination không nằm trong scroll; toast SR thông báo; spinner guard.

## Nhóm 3 — Shared primitives (dùng xuyên view)

| Thành phần | Class | Chú ý |
|---|---|---|
| Nút | `.btn` base, `.btn-ghost`, `.btn-outline`, `.btn-danger`, `.btn-amber`, `.btn-sm`, `.btn-icon`, `.btn-icon-dark`, `.btn-clear-filter` | modal = 44px touch; btn-sm 36px; icon 36px |
| Card | `.card` | `.table-wrap` cuộn nội bộ; scan card = flex item |
| Heading/meta | `.task-title` (uppercase CSS), `.task-meta`, `.section-heading`, `.task-count-badge`, `.muted` | |
| Chips chọn | `.chips` > `.pick` (+`.on`/`.all`/`.free.on`) | aria-pressed; selected = primary |
| Form | `.flabel`/`.fnote`, `.field-select`, `.cfg-input`, `.cfg-field`, `.cfg-hint` | |
| Search | `.list-search` (input + btn-icon + btn clear) | Escape clear; input oninput lọc |
| Badge trạng thái | `.badge.pending/present/absent/extra/open/attend`, `.reports-off` (đỏ), `.has-pmo` (cam) | pending xám · present/attend xanh · absent đỏ · extra cam · OFF đỏ |
| Bảng | `.table-wrap`, th/td base, `.sortable` + aria-sort, sticky-left (staff 4 cột), `tr:hover td` row-hover, `.reports-num` | desktop 13px; hover đồng nhất |

**Audit đúng**: touch 44/36/33px; focus-visible; contrast AA từng token; badge màu theo ngữ nghĩa; hover row đồng nhất 4 bảng (ngoại lệ: extra-row cam có chủ đích); sticky-left không rò rỉ xuống card mobile.

## Nhóm 4 — 9 view (mỗi view = topbar chung + card + phần riêng)

| View | Thành phần riêng |
|---|---|
| viewHome | `.home-hero` (logo, `.home-title`, `.home-sub`, `#homeClock` role=timer, `#homeDate`), `.home-shortcuts` 3× `.home-shortcut` |
| viewTasks | `.task-list-toolbar` (heading + `.list-search`), `#taskListTable` 13 cột, empty, `#taskPagination` |
| viewScan | `.scan-layout` → `.scan-col-left` (`.counters` 3× `.counter.scanned/absent/extra`, `.scan-row` `#scanInput`+`#btnCamera`(tab scanner ngoài)+`#btnCameraPhoto`(chụp ảnh)+`#btnScan`, `.scan-hint`, `#scanCard` `.scan-card` projector + `.sc-empty`, `#scanLiveMsg` sr-only) + `.scan-col-right` (`#scanListCard`: `.att-toolbar`, search, `#btnScanListToggle` ▼/▲, `#scanStatusFilter` select, `#scanClearFilter`, `#scanTable` 11 cột sortable, empty, `#scanPagination`) |
| viewStats | `.stats-filters` 3× `.stats-filter-row` (flabel + `.chips`), `#statsTableWrap` `.stats-table-wrap` (grid 2 cột), `#statsA11yMsg` sr-only |
| viewStaff | `.att-toolbar` + search, `#staffTable` **20 cột** (thead động từ STAFF_TABLE_HEAD, 4 cột đầu sticky-left), `#staffFilterPanel` funnel (`.staff-filter-panel` role=dialog: `.sfp-head/.sfp-body/.sfp-foot`), `#staffPagination` |
| viewConfig | form `.card.cfg-card`, `#cfgSkeleton`, `.task-list-toolbar` + `#cfgSearch`, `.cfg-list-wrap` → `#cfgList` (`.cfg-item` dòng), `#cfgNoResult`, `#roleWrap`/`#cfgRoleRows` (role editor), topbar `#cfgDiscardBtn`/`#cfgRefreshBtn`/`#cfgSaveBtn` (dirty) |
| viewReports | `#reportsMeta`, `#reportsSkeleton`, `.task-list-toolbar` + `#reportsSearch`, `#reportsTable` **10 cột** (fixed layout, PMO ellipsis desktop / full-width wrap mobile), `.reports-off` pill, `.has-pmo` tint, empty (tách admin ra viewAdmin 2026-08-17) |
| viewAdmin | Quản trị (chỉ admin — nav ẩn theo `canAdmin_`): topbar riêng, `#adminPanel` → `#auditFilters` (lọc ngày) + `#auditTable` (nhật ký hoạt động). Bảng task mọi owner đã bỏ 2026-08-17 — task + Kết thúc/Mở lại đã có ở viewTasks (gate operator). Module `app-admin.html` (tách từ app-reports 2026-08-17). viewStats/viewStaff/viewReports: manager+ (nav ẩn theo `canManager_`) |
| viewAbout | `.about-head`/`.about-title`, `.about-body` (`.about-h3`, `.about-list`, `.about-table`/`.about-thead`/`.about-cell`) |

**Audit đúng**: topbar đồng bộ (`.view-topbar` + title + actions) 7/9 view; desktop 4 bảng: data-table auto-fit + table-wrap scroll, fixed-layout chỉ reports; mobile ≤640px: bảng → **card 2 cột đồng bộ** (grid `minmax(0,1.2fr) minmax(0,1fr)` gap `3px 10px`, td block nowrap+ellipsis 15px, nhãn `::before attr(data-label) ': '` 12px/600/muted, title 16px/700, badge 13px, MỌI cell `text-align:left` — rule desktop `td:nth-child(5-9)` center rò rỉ là gotcha đã đóng); phễu/select/sort hoạt động trên mobile.

## Nhóm 5 — Modals & dialog (4 + 1)

Chung: overlay `.about-overlay` (đóng click ngoài) + `.about-dialog` (scale-in, 44px touch, Escape đóng).

| Modal | Id | Thành phần riêng |
|---|---|---|
| Dán mã | `#pasteModal` | `.paste-title/.paste-hint`, `#pasteTextarea`, `#pasteCountHint`, `#pasteProgress` (`.paste-track/.paste-fill/.paste-progress-text`), `#pastePreview`, `.paste-footer` |
| Tạo task | `#createModal` | `#modeDesc`, `.create-form` 5× `.frow` (Station/Team/Ca/Hình thức/Date chips + `#selDate`), `.create-footer` → `.create-total` + `.create-actions` |
| Confirm chung | `#confirmModal` | `.confirm-title/.confirm-msg`, `#confirmOkBtn` btn-danger |
| Spinner | `#spinModal` | `.spin-dialog` + `#spinModalMsg` role=status |
| Quét ảnh (photo) | `#btnCameraPhoto` → `#photoInput` (input file capture=environment) | Html5Qrcode.scanFile decode → submitScan; nút Camera → tab scanner ngoài `scanner/scanner.html` (postMessage origin-validate) |
| Funnel staff | `#staffFilterPanel` | role=dialog; sfp-head/body/foot |

**Audit đúng**: role=dialog + aria-modal + labelledby đủ; click ngoài đóng + Escape; 44px touch mọi nút trong modal; không 2 overlay đè.

## Nhóm 6 — Trạng thái luồng (patterns xuyên view)

- **Tải**: overlay → skeleton → data; mọi success handler phải hideLoadingOverlay CẢ success lẫn failure (gotcha spinner kẹt)
- **Trống**: `.empty` (có nút hành động nếu cần — task empty có mũi tên ↑)
- **Lỗi**: toast đỏ + giữ state cũ; server offline → net-dot + markServerFail
- **Busy**: nút disabled + tooltip (btnFinish/btnToAttend khi scanBusy)
- **Dirty (config)**: `#cfgSaveBtn` pulse `cfgSavePulse` + `#cfgDiscardBtn` hiện

## Nhóm 7 — Design token system (2026-08-17)

Tất cả màu/spacing/type/radius nằm trong `:root` (styles.html) — **92 token, 0 duplicate**:

| Nhóm | Token | Ghi chú |
|---|---|---|
| Màu semantic (~59) | `--primary(-dark/-bright/-bg/-soft/-active)` · `--danger(-strong)` · `--warning` · `--success(-dark)` · `--amber(-dark/-solid/-text/-hover/-deep)` · `--card-ok/err/extra-bg` · `--free(-bg/-text/-dark-*)` · `--net-err(-border)` · `--reconcile-dark-*` · `--toast-bg` · `--surface(-muted/-soft)` · `--text/--muted/--muted-2` | Mọi tông status/badge đều có token; `--danger-strong` #b3261e ≠ `--danger` #d93025 (AA trên nền err) |
| Spacing (8) | `--space-1..8` = 4/8/12/16/20/24/28/32px | 4pt grid; micro 1-3px trong component được phép raw |
| Type (15) | `--text-3xs..8xl` = 10/11/12/13/14/15/16/18/20/22/28/32/34/44/72px | px-exact (scale rem cũ chết đã thay) |
| Radius (6) | `--radius-2xs..full` = 4/6/8/12/20/999px | 8px = chuẩn chủ đạo; `--card-radius: var(--radius-md)` |
| Layout (3) | `--header-h` 59px · `--bottom-nav-h` 60px · `--card-radius` | 1 nguồn cho sticky/nav |

**Invariant**: KHÔNG hardcode hex/px ngoài :root (cả inline style/JS). Ngoại lệ: micro 1-3px · `#fff`/`#000` · fallback `var(--x, #hex)` · px đo runtime. Audit 2026-08-17: 0 rời rạc còn lại (trước đó: 93 hex + 317 spacing px + 100% font px).

**Tech debt — hàm dài (ghi nhận, KHÔNG refactor)**: server `scanStaff` 7.9k chars · `pasteCodes` 5.4k · `createReconcileTask` 5.7k · `planScanCommits` 5.3k; client `submitScan` 9.2k · `processScanQueue` 6.0k · `renderScanView` 4.2k · `submitPaste` 4.5k · `renderStaffDataTable` 4.5k. Core đã review nhiều vòng (gate/optimistic/race) — rủi ro refactor > lợi ích trên GAS.

## Lỗ hổng audit tooling hiện tại (2026-08-16, đã vá 1-2)

1. ~~**audit-ui.js thiếu viewAbout**~~ — **ĐÃ VÁ** (commit 2026-08-16): thêm `about` vào `pages[]` + `viewAbout`/`viewReports` vào check bảng có dữ liệu → 29/29 PASS.
2. ~~**audit-style.js SHARED_CLASSES thiếu ~15 class**~~ — **ĐÃ VÁ**: thêm 16 class (btn-icon-dark, side-item, nav-item, net-dot, spin-big, skeleton-cell, pag-wrap, att-toolbar, task-list-toolbar, sortable, stats-table, about-dialog, about-overlay, home-shortcut, cfg-item, staff-filter-panel) + ALLOWED_DRIFT +8 (about-dialog, btn-icon-dark, counter, nav-item, side-item, spin-big, task-meta, task-title) → --strict 0 lệch thật. (`.btn` base + `.badge` không thêm — variant màu chồng nhau sẽ tạo drift giả; `.counter` là lệch định sẵn bị sót đã thêm vào ALLOWED.)
3. **Chưa có audit geometry modal** (fit mobile, touch target trong modal, overlay đóng) — test-local-mock chỉ phủ tương tác scan/task, chưa phủ staff/reports/config render + funnel + sort + pagination.
4. **audit-css/audit-gs** — đã đủ (dead class/function + API treo).
