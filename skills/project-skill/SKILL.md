---
name: project-skill
description: SPX Điểm Danh (Điểm Danh HN2 SOC) — project skill. Use for ANY edit in this repo (GAS client/server, Python backend, tests, docs, camera scanning): architecture mental model, dual-runtime sync, gotchas, deterministic editing, perf, pitfalls. Nguồn: skill Hermes `rollcall` + AGENTS.md repo này.
---

# Project Skill — SPX Điểm Danh (Điểm Danh HN2 SOC)

> Bản skill đóng gói cho AI agent làm việc trong repo `spx-diem-danh` (GitHub: `Duc-Nguyen-739/spx-diem-danh`; package `diem-danh-hn2-soc` v0.1.0).
> Dùng khi: bất kỳ edit nào với repo này (UI, GAS server, Python backend, tests, docs, camera).
> **Nguồn quyết định**: file `AGENTS.md` ở gốc repo (quy tắc ngôn ngữ, workflow, GAS/Web guidelines, lịch sử fix camera). Nếu mâu thuẫn, `AGENTS.md` là mới nhất.
> References: xem `references/architecture-gotchas.md` (gotchas sâu) · `references/editing-conventions.md` (line endings / git / secrets / no over-engineering).
>
> ⚠️ **Bản `project-skill` cũ từ `van90bg/diem-danh-hn2-socx` KHÔNG dùng được** — nó mô tả repo KHÁC (`Điểm Danh HN2 SOC_deploy` / `attendance-portal`: portal có sidebar + viewAdmin/reports, 155 tests, 9 module JS, CRLF + .gitattributes). Repo này là kiosk barcode, 3-file UI, **LF**, ~337 tests, **có backend Python song song**. Đừng áp dụng rule của bản cũ (đặc biệt rule CRLF).

## 1. Repo facts

- **GitHub**: `Duc-Nguyen-739/spx-diem-danh` · local example `/home/caigicungdc98/spx-diem-danh`.
- **Dual runtime** (cùng 1 domain logic):
  - **GAS Apps Script** (WebApp kiosk chính): `Code.gs` + `Config.gs` `CsvUtil.gs` `Database.gs` `JsonpApi.gs` `ScanLogic.gs` `ScanService.gs` `TaskSearch.gs` `TaskService.gs` `CacheLayer.gs` + HTML UI. Deploy qua clasp (`scriptId` trong `.clasp.json` — file này bị git ignore).
  - **Python backend** (`api/`): port cùng logic cho hosting top-level (standalone JSONP/POST, đọc Google Sheets qua `google-api-python-client`). `api/main.py` (handler JSONP/POST, whitelist action = `JsonpApi.gs`), `api/scanlogic.py` (port `ScanLogic.gs`), `api/services.py`, `api/database.py`, `api/sheets.py`, `api/cache.py`, `api/config.py`, `api/csvutil.py`.
- **Test**:
  - `npm test` → `node --test` **26 file, ~337 tests** (`tests/*.test.js`). Pure logic: `scan-classify.test.js` (ScanLogic) + `csv-normalize.test.js` + `gs-syntax.test.js` (load mọi .gs) + smoke `code-doget.test.js`/`inline-html.test.js`/`jsonp-api.test.js` + camera `camera-*.test.js`/`ocr-scan.test.js`/`js-scanmode.test.js` + UI `task-*.test.js`/`header-search.test.js`/`meal-create.test.js`/`note-edit.test.js`/`scan-*.test.js`/`submit-scan-guard.test.js`/`batch-meal-move.test.js`/`cache-layer.test.js`/`scan-poll.test.js`/`cdp-helper.test.js`.
  - `npm test:py` → `python3 -m unittest discover -s api -p 'test_*.py'` (4 file: `test_logic.py` `test_database.py` `test_main.py` `test_services.py`).
  - `node --check <file>` cho syntax 1 file GS.
- **Dev / build**: `npm run dev` = `node scripts/serve.js` (preview local, inject `?demo=1` mock + cờ standalone) · `npm run build` = `node scripts/build-static.js` (hosting tĩnh, inject `__RC_STANDALONE__`+`__RC_API_BASE__`) · `node scripts/cdp-helper.js` (geometry CDP) · `node scripts/inline-html.js` (thay scriptlet bằng nội dung file).

## 2. Shell (giao diện)

Kiosk điểm danh kho chuyển phát nhanh Shopee Express bằng barcode. Layout 1 màn hình (không sidebar): header controls (title · 🔊 · ⟳) > thân = danh sách Task (filter Station/Slot/Team/Date/Contract) + modal Task detail (bảng log, counters, nút Quét / Kết thúc / Ghi chú) + modal tạo Task + modal Quét Camera + header search (tìm mã Ops → NV + task đã điểm danh). Không có viewAdmin/viewReports/viewStats như bản project-skill cũ.

## 3. Architecture mental model (đọc TRƯỚC mọi fix)

- **Task 2 loại** (`TASK_TYPE`): `RECONCILE` (đối chiếu từ csv — 1 mốc timeScan) · `MEAL_MOVE` (Đi ăn + Move — 2 mốc Ra/Vào + agency). `TASK_STATUS`: `OPEN` | `DONE` (chỉ 2 trạng thái — KHÔNG có phase `attend` như bản cũ).
- **logRow.status** (`STATUS`): `PENDING('-')` (chưa quét) · `PRESENT('Có mặt')` · `ABSENT('Vắng')` (chỉ gán khi `completeTask`) · `EXTRA('Dư')` · `OUT('Ra ngoài')` (meal-move, đã Ra chưa Vào).
- **Epoch là nguồn sự thật** cho counters/sort: `timeScanEpoch` / `timeRaEpoch` (number). Text `HH:mm:ss` mất ngày xuyên nửa đêm → đếm/counters/sort bằng epoch, KHÔNG bằng Date text. `computeCounters` (ScanLogic.gs:78) đếm: `scanned = timeScanEpoch>0`; `absent = !scanned && status!=EXTRA`; `extra = status==EXTRA`; `out = status==OUT`.
- **classifyScan(cfg, task, logRows, staffId)** (ScanLogic.gs:25, THUẦN, Node-testable):
  - `task` null → `reject 'task-not-found'` (2026-08-19: task mất ≠ đóng) · `task.status !== OPEN` → `reject 'task-closed'`.
  - NV có trong roster + chưa quét (`timeScanEpoch==0`) → `update` → `PRESENT`.
  - NV lạ (không trong roster) → `append` → `EXTRA` (Dư).
  - NV đã quét → `reject 'already-scanned'`.
- **Meal-move**: `classifyMealMoveScan(cfg, task, logRows, staffId, mode, nowMs, staffInfo)` (ScanLogic.gs:163) — 2 mốc Ra(`timeRaEpoch`)/Vào(`timeScanEpoch`) + `DUPLICATE_WINDOW_MS=1500` (chống quét trùng; phải khớp `CAM_CODE_COOLDOWN_MS` client) + `resolveMealMoveMode_` (Code/ScanService: server ép `'vao'` fail-closed nếu task không có `createdBy`).
- **Layers**: `scanStaffApi`(Code) → `scanStaff`(ScanService) → `classifyScan`/`classifyMealMoveScan`(ScanLogic, pure) + `readTaskCached_`/`readLogRowsCached_`/`appendLogRow_`/`updateLogRowScan_`/`updateLogRowRa_`/`batchMealMoveLogUpdates_`/`batchAppendLogRows_`(Database) + `readStaffIndex_`(lazy, chỉ nhánh append NV lạ). `LockService.getScriptLock()` `waitLock(10000)` + `releaseLock()` trong `finally`.
- **Barcode**: chỉ chấp nhận mã bắt đầu `"Ops"` (case-insensitive) — `isValidBarcodeId` (ScanService:21). `normalizeStaffId` uppercase. Đừng bỏ validation format.
- **Caches** (Config.gs `CACHE_TTL`/`CACHE_KEYS`): key versioned `rc2_*_v1/v2` (bump version khi đổi schema log, ví dụ `TASK_DETAIL v2`, `LOG_ROWS v2` thêm `timeRaEpoch`/agency/duration). TTL hiển thị realtime thấp (TASK_DETAIL 5s, LOG_ROWS 10s) để thiết bị khác thấy sửa tay trên gsheet trong ~1 chu kỳ poll.
- **Dual-runtime PORT**: `api/scanlogic.py` là port của `ScanLogic.gs` (cùng `find_log_row`/`classify`/`compute_counters`). Đổi logic quét → sửa CẢ `.gs` VÀ `.py` + tests cả 2.

## 4. Recurring gotchas (đã fix — đừng regress)

Xem chi tiết `references/architecture-gotchas.md`. Tóm tắt cao rủi ro:

1. **doGet dùng `createTemplateFromFile('index').evaluate()` + `include()`** — KHÔNG `createHtmlOutput`/`setContent` (GAS sanitize strip `<script>` → app xoay tròn không load, bug 2026-08-11). `include()` trả nội dung file `.html` (css.html/js.html).
2. **Barcode "Ops" prefix** — `scanStaff` reject non-Ops (`Mã phải bắt đầu bằng "Ops"`). Giữ `isValidBarcodeId`.
3. **`task-not-found` ≠ `task-closed`** (2026-08-19) — message khác nhau (`Task không tồn tại` vs `Task đã kết thúc`).
4. **Epoch source of truth** — counters/sort dùng `timeScanEpoch`/`timeRaEpoch`, không dùng Date text. `buildExtraRow`/`buildMealMoveExtraRow` luôn set epoch.
5. **`DUPLICATE_WINDOW_MS=1500` đồng bộ** với `CAM_CODE_COOLDOWN_MS` (camera client) — đổi 1 chỗ phải đổi cả 2.
6. **Meal-move mode server-side** — `resolveMealMoveMode_` ép `'vao'` fail-closed nếu task rỗng `createdBy`. Client không quyết định quyền.
7. **LockService** — `waitLock(10000)`, scope tối thiểu, `releaseLock()` trong `finally`. Không làm việc nặng trong lock.
8. **Cache versioned keys** — đổi schema log → bump `v1`→`v2` (không invalidate thủ công được với sửa tay gsheet).
9. **Line endings = LF, KHÔNG CRLF** (repo này không có `.gitattributes`, file LF, no-BOM). Bản project-skill cũ bảo CRLF — SAI với repo này. Dùng Edit tool trực tiếp được.
10. **Comments**: English code / Vietnamese UI; KHÔNG ghi date/marker vòng fix (`FIX(2026-08-XX):`, `B3:`, `P1:`). Chỉ comment rationale/gotcha.
11. **Dual-runtime sync** — logic quét đổi → sửa `.gs` + `api/*.py` + tests cả 2.
12. **Secrets**: `.clasp.json`/`.clasprc.json` bị git ignore (`.claspignore`). Không commit, không log `scriptId`/token. `appsscript.json` `access: DOMAIN` → JSONP anonymous bị chặn (xem AGENTS.md §20 demo mode).

## 5. UI / HtmlService conventions

- **3-file split**: `index.html` = HTML thuần (KHÔNG `<!DOCTYPE>/<html>/<head>/<body>/<title>/<meta>`) · `css.html` = toàn bộ CSS (đã bọc `<style>`) · `js.html` = client JS (đã bọc `<script>`). Nhúng qua scriptlet `<?!= include('css') ?>` / `<?!= include('js') ?>` trong `index.html`. `scripts/inline-html.js` thay scriptlet bằng nội dung file cho preview/build.
- **Khối logic đánh dấu marker** trong `js.html` (test client đọc marker): `TASK-MENU-*` · `PURE-LOGIC-*` · `HEADER-SEARCH` · `MEAL-CREATE` · `SCAN-LOGIC` · `OCR-SCAN-*` · `STAFF-CACHE`. Đừng xóa marker khi sửa.
- **Camera**: `camera-scan.html` (chain decode: ZXing CDN → Quagga → jsQR + Tesseract OCR + Web Worker) · `camera-css.html` · `lib-jsqr.html` + `lib-quagga.html` (vendored, bọc `<script>`) · `mobile.html`. Nút `#btnCamScan` chỉ hiện mobile. Trên GAS iframe → mở popup top-level; standalone top-level → live scan trong `#cameraModal`.
- **Standalone JSONP**: `serve.js`/`build-static.js` inject `window.__RC_STANDALONE__=true` + `window.__RC_API_BASE__`; `?demo=1` inject `window.__RC_DEMO__=true` → shim JSONP skip, load `mock/mock-google.js`. Server: `JsonpApi.gs` (`?action&args&cb`, whitelist + cb sanitize `/^[A-Za-z0-9_$.]+$/`) + `api/main.py` (whitelist + cb sanitize mirror).
- **Loading overlay**: mọi `google.script.run` success/failure handler phải `hideLoadingOverlay()` (cả success lẫn failure) — nếu chỉ ẩn failure → spinner không tắt.
- **Limit platform**: iOS Safari KHÔNG hỗ trợ focus control trong iframe GAS → camera live phải trang top-level (popup/standalone), không trong iframe.

## 6. API endpoints (GAS `google.script.run` + JSONP/Python mirror)

`Code.gs`: `getMeta` · `getFilterOptions` · `previewStaffApi` · `createReconcileTaskApi` · `createMealMoveTaskApi` · `pasteMealMoveScanApi` · `getTaskListApi` · `getTaskDetailApi` · `scanStaffApi(taskId, staffId, mode)` · `completeTaskApi` · `reopenTaskApi` · `updateTaskNoteApi` · `searchStaffApi` · `getStaffIndexApi` · `syncFromCsv` (editor-only) · `setupSheets` (editor-only). `JsonpApi.gs`/`api/main.py` expose cùng tên qua `action`. `isEditor_` fail-closed (chặn debug/sync từ webapp anonymous).

## 7. Verify workflow

- Logic changes → `npm test` (337/337) + `npm test:py` (đổi logic Python). UI/camera → chạy test liên quan + `node --check` file GS.
- `node scripts/serve.js` để dev; `?demo=1` test UI/camera với mock (KHÔNG cần GAS).
- CDP: `node scripts/cdp-helper.js open "file://.../dist/index.html?t=N"` — geometry `getBoundingClientRect` là truth.
- Không claim "fixed"/"test pass" khi chưa chạy xong (Constraint #8).

## 8. Security

- `appsscript.json`: `executeAs: USER_DEPLOYING`, `access: DOMAIN`, `timeZone: Asia/Ho_Chi_Minh`, V8. JSONP anonymous bị org Shopee chặn → demo mode / backend Python.
- `isEditor_` fail-closed: chỉ deployer (active==effective) mới debug/sync/setup.
- Meal-move: không tin client mode (server `resolveMealMoveMode_`).
- JSONP: whitelist action + cb sanitize `/^[A-Za-z0-9_$.]+$/` (chống XSS reflection) — cả `JsonpApi.gs` lẫn `api/main.py`.
- Không log/commit secrets (scriptId, token, `.clasprc.json`).

## References (repo)

- `references/architecture-gotchas.md` — gotchas sâu (doGet, epoch, cache version, dual-runtime, lock, barcode).
- `references/editing-conventions.md` — line endings LF/no BOM, Edit tool, git workflow, secrets, không over-engineering.
- `AGENTS.md` (gốc) — quy tắc ngôn ngữ, GAS/Web guidelines, lịch sử fix camera chi tiết.
