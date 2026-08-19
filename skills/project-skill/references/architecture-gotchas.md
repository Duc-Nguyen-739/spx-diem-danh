# Architecture Gotchas — SPX Điểm Danh (RollCall v2)

> Chi tiết từ `ScanLogic.gs` / `ScanService.gs` / `Code.gs` / `Database.gs` / `Config.gs` / `api/*`. Đọc trước mọi fix logic quét / task / cache.

## 1. doGet / HtmlService (P0 — app không load)

- `Code.gs:92` `doGet` DÙNG `HtmlService.createTemplateFromFile('index').evaluate()` + `include()` (scriptlet `<?!= include('css') ?>` / `<?!= include('js') ?>`).
- **KHÔNG** `createHtmlOutput` / `setContent` — GAS sanitize strip `<script>` → app xoay tròn trắng (bug 2026-08-11).
- `index.html` = HTML thuần, KHÔNG `<!DOCTYPE>/<html>/<head>/<body>/<title>/<meta>` (title/meta khai qua `doGet().setTitle()` / `addMetaTag('viewport',...)` — chỉ `viewport` được whitelist, `theme-color`/`color-scheme` bị từ chối).
- `serve.js`/`build-static.js` thay scriptlet bằng nội dung file qua `scripts/inline-html.js` — sửa transform phải sửa đủ 3 nơi + chạy `npm test` (`inline-html.test.js` verify self-contained; `code-doget.test.js` simulate evaluate).

## 2. Epoch là nguồn sự thật (P0 — counters/sort sai)

- `timeScanEpoch` / `timeRaEpoch` (number, ms) quyết định counters + sort. Text `HH:mm:ss` mất ngày xuyên nửa đêm.
- `computeCounters` (ScanLogic.gs:78): `scanned = timeScanEpoch>0`; `absent = !scanned && status!=EXTRA`; `extra = status==EXTRA`; `out = status==OUT` (meal-move Ra chưa Vào → đếm `out`, KHÔNG đếm `absent` — fix 2026-08-11).
- `buildExtraRow` (ScanLogic.gs:107) / `buildMealMoveExtraRow` (ScanLogic.gs:237) LUÔN set epoch — nếu thiếu, counters=0 và sort đẩy NV mới xuống cuối.
- `durationMinutes` = `Math.max(0, round((now - timeRaEpoch)/60000))` (clamp âm do đồng hồ lệch, 2026-08-19).

## 3. Classify — reject reasons (P1 — message sai)

- `task-not-found` (2026-08-19: task bị xóa/không tìm thấy) ≠ `task-closed` (task DONE). Message: `Task không tồn tại` vs `Task đã kết thúc`. Đừng gộp.
- `already-scanned` (NV đã quét) · `duplicate` (meal-move trong `DUPLICATE_WINDOW_MS=1500`) · `empty-staff-id`.
- `classifyScan` trả `append`→`EXTRA` cho NV lạ (KHÔNG phân biệt khác tổ hợp). Dư chỉ khi quét NV không trong roster.

## 4. Meal-move mode (P1 — quyền sai)

- `resolveMealMoveMode_(task, mode)` (ScanService.gs:203): client mode chỉ gợi ý; server ép `'vao'` fail-closed nếu `task.createdBy` rỗng. `mode` không bao giờ quyết định quyền một mình.
- Không tin client: kiosk anonymous, ai quét cũng được `'ra'` (nhưng task phải có `createdBy`).

## 5. Cache versioned keys (P1 — stale data)

- `CACHE_KEYS` versioned `rc2_*_v1/v2`. Đổi schema log (thêm `timeRa`/agency/duration) → bump `TASK_DETAIL v2`, `LOG_ROWS v2`. Không invalidate thủ công được khi sửa tay gsheet → TTL thấp (TASK_DETAIL 5s, LOG_ROWS 10s).
- `readTaskCached_` (scan path) vs `readTask_` (write path complete/reopen/note) — scan không đọc tươi toàn sheet.
- `readStaffIndex_` lazy + cache 5m — chỉ đọc ở nhánh `append` (NV lạ), KHÔNG mỗi scan (F1 optimization).

## 6. LockService (P0 — race / timeout)

- `scanStaff` / `pasteMealMoveScan` bọc `LockService.getScriptLock()` `waitLock(10000)` + `releaseLock()` trong `finally`.
- Scope tối thiểu: đọc cache → classify → write → release. Không làm việc nặng (OCR/decode) trong lock.
- Lock timeout → trả `ok:false, 'Hệ thống đang bận'` (KHÔNG throw client).

## 7. Dual-runtime PORT (P0 — logic lệch 2 backend)

- `api/scanlogic.py` port `ScanLogic.gs` (`find_log_row`/`classify`/`compute_counters`). `api/main.py` port `JsonpApi.gs` + `doGet` JSONP (whitelist action + cb sanitize mirror).
- Đổi logic quét/classify/counters → sửa CẢ `ScanLogic.gs` VÀ `api/scanlogic.py` + tests (`scan-classify.test.js` + `api/test_logic.py`). Đừng chỉ sửa 1 bên.

## 8. Barcode / normalize (P1 — quét sai)

- `isValidBarcodeId` chỉ nhận mã bắt đầu `"Ops"` (case-insensitive) — `scanStaff` reject non-Ops (`Mã phải bắt đầu bằng "Ops"`). Giữ validation.
- `normalizeStaffId` uppercase — staffIndex key uppercase → client `toUpperCase()` khi lookup.

## 9. JSONP / standalone (P1 — XSS / không load)

- `JsonpApi.gs` + `api/main.py`: whitelist action (chỉ hàm `*Api` đã duyệt) + cb sanitize `/^[A-Za-z0-9_$.]+$/` (chống reflection XSS).
- `CAM_CODE_COOLDOWN_MS` (camera client dedup 1.5s) phải khớp `DUPLICATE_WINDOW_MS=1500` server.
- `access: DOMAIN` → JSONP anonymous bị chặn trên org Shopee → demo mode (`?demo=1`) / backend Python thật.
