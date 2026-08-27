# BÁO CÁO KIỂM TRA — Điểm Danh HN2 SOC
**Model:** bynara/agnes-2.5-flash  
**Ngày kiểm tra:** 2026-08-27  
**Phương pháp:** Đọc source code toàn bộ + chạy test suite (JS/Python/Chrome) + code review thủ công

---

## 1. KẾT QUẢ TEST

| Suite | Lệnh | Kết quả | Chi tiết |
|-------|------|---------|----------|
| JS (Node) | `npm test` | **368/368 PASS** | 27 file test, duration 7.68s |
| Python | `npm run test:py` | **85/85 PASS** | 5 file test, duration 0.61s |
| Chrome | `npm run test:chrome` | **11/11 PASS** | Headless CDP, 11 check UI end-to-end |

**Tất cả test đều passing — không có regression.**

---

## 2. BUG ĐÃ TÌM THẤY

### BUG-1 [P2] `debugState()` bị leak qua `google.script.run`
**File:** `Code.gs:116-159`  
**Mô tả:** Hàm `debugState()` có gate `isEditor_()` ở đầu hàm, comment đã ghi rõ: *"gate trong doGet chỉ bảo vệ đường ?debug=1"* — tức gate trong `doGet` KHÔNG bao trùm việc gọi qua `google.script.run.debugState()`. Mặc dù hàm hiện có gate nội tại, nhưng việc expose một public function tên `debugState` là nguy hiểm vì bất kỳ ai cũng có thể gọi qua console kiosk.  
**Hậu quả:** Leak `spreadsheetId`, cấu trúc sheet, mẫu log (staffId, taskId).  
**Gợi ý sửa:** Đổi tên thành `_debugState_()` hoặc move vào block editor-only hoàn toàn.

### BUG-2 [P3] Timer `jsonpCall` không được clear khi response đến qua fetch path
**File:** `js.html:47-78`  
**Mô tả:** Khi `sameOrigin && typeof window.fetch === 'function'`, code dùng `fetch()` thay JSONP. `timer` (setTimeout 30s) vẫn được tạo ở dòng 47, và `cleanup()` có gọi `clearTimeout(timer)` — điều này ĐÃ đúng. Tuy nhiên, khi fetch path gọi `onResult(res)` (dòng 72) → gọi `cleanup()` (dòng 60) → clearTimeout timer. Vậy logic hiện tại ĐÚNG. **Kết luận: Đây không phải bug, chỉ là nhầm lẫn khi đọc sơ.**

### BUG-3 [P2] `sanitizeCallback_` regex cho phép `.constructor` qua từng segment riêng
**File:** `JsonpApi.gs:70-78`  
**Mô tả:** Regex `/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/` kiểm tra từng segment, và có check `__proto__`, `constructor`, `prototype` — ĐỦ. **Không có bug ở đây.**

### BUG-4 [P1] `createReconcileTask` không validate `input.date` có định dạng hợp lệ
**File:** `TaskService.gs:28-115`  
**Mô tả:** `input.date` được lấy nguyên vẹn String.trim(), không validate format. Nếu user gửi date sai format (vd "abc"), `filterStaffByGroup` sẽ so sánh `String(s.date).trim() !== "abc"` → luôn false, task tạo ra với 0 NV, trả về lỗi "Thiếu station/slotCode/team" (vì `filterSlots`/`filterTeams` vẫn có giá trị). Thực tế không crash, nhưng ngày sai sẽ silently lọc hết NV.  
**Hậu quả:** Task created with 0 staff → reject "Quá nhiều nhân viên" hoặc "Không có nhân viên".  
**Gợi ý:** Thêm validate date format hoặc ignore invalid date (truyền null → không lọc theo date).

### BUG-5 [P2] `readLogRowsCached_` cache schema rộng hơn cần thiết (F2 comment nói slim nhưng thực tế vẫn truyền 14 field)
**File:** `Database.gs:468-490`  
**Mô tả:** Comment F2 nói "cache SLIM — chỉ giữ field đường quét cần... 66KB→32KB", nhưng code thực tế vẫn map đầy đủ 14 field (`taskId, staffId, staffName, slotCode, station, team, agency, timeRaText, timeRaEpoch, timeScanText, timeScanEpoch, durationMinutes, status, dateText, _rowIndex`). So với logFromRow_ gốc có thêm `timeRefText` → thực tế只差 1 field, không phải giảm 50%.  
**Hậu quả:** Cache vẫn ~66KB/task 200 NV, gần giới hạn 100KB/key.  
**Gợi ý:** Cân nhắc bỏ `dateText` và `agency` khỏi slim cache nếu không dùng trong scan path.

### BUG-6 [P3] `buildScanPopupHtml` — popup không reset `camOpen` khi getUserMedia bị reject lần đầu (iOS)
**File:** `camera-scan.html:472-520`  
**Mô tả:** Khi popup mở, `start(false)` gọi `getUserMedia` → reject (iOS cần user gesture) → `startBtn.style.display = "inline-block"`. Nhưng cờ `camOpen = true` ở parent (iframe) KHÔNG được set lại thành false, khiến parent nghĩ camera đang mở và ngăn không mở popup mới.  
**Thực tế:** Popup có `stop()` khi đóng và `startCamPopupWatch` poll `camPopupRef.closed` để reset. **Bug này đã được fix bởi cơ chế watch.** Không phải bug.

### BUG-7 [P2] `normalizeStaffDate_` xử lý ISO wrongly cho `2026-1-8` (tháng/ngày 1 chữ số)
**File:** `CsvUtil.gs:76-83`  
**Mô tả:** Regex `^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$` bắt được "2026-1-8" → mm=01, dd=08 → output "2026-01-08". Đúng.  
**Regex Dạng 2** `^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$` — "8/1/2026": dd=08, mm=01, yy=2026 → "2026-01-08". Đúng.  
**Không có bug.**

### BUG-8 [P1] `transformLogStatuses_` không invalidate `TASK_COUNTS` cache
**File:** `Database.gs:625-660`  
**Mô tả:** Khi batch update status (markUnscannedAbsent / resetAbsentToPending), code gọi `invalidateTaskDetailCache_` và `invalidateLogRows_` nhưng **KHÔNG gọi `invalidateTaskListCache_`**. Điều này khiến danh sách task (với counters total/scanned/extra) có thể hiển thị số cũ đến 30s (TTL TASK_COUNTS).  
**Hậu quả:** Sau khi "Kết thúc task" hoặc "Mở lại task", thiết bị khác thấy counters sai ~30s.  
**Gợi ý sửa:** Thêm `invalidateTaskListCache_()` vào cuối `transformLogStatuses_` khi có writes.

### BUG-9 [P2] `camFastDecode` — ZXing worker send buffer không handle popup frame format `{imageData}` vs modal `{data}`
**File:** `camera-scan.html:1370-1380` (modal) và popup line ~316  
**Mô tả:** Modal send `{data: ..., w, h}`, popup send `{imageData: ..., w, h}`. Worker nhận `f.data || f.imageData` → đọc `(f.data || f.imageData)`. Test `camera-code128.test.js` đã cover case này. **Không có bug.**

### BUG-10 [P3] `searchStaffApi` — cache SEARCH_LOG 10s ngắn hơn LOG_ROWS 30s, gây inconsistent read khi search nhanh sau scan
**File:** `Code.gs:239-256`  
**Mô tả:** `searchStaffApi` đọc `CACHE_KEYS.SEARCH_LOG` TTL 10s. Sau khi scan StaffData, `invalidateLogRows_` và `invalidateTaskDetailCache_` được gọi, nhưng `SEARCH_LOG` cache KHÔNG bị invalidate. User search ngay sau scan có thể thấy kết quả cũ (NV chưa xuất hiện trong search).  
**Hậu quả:** Tìm kiếm sau khi quét ít giây không thấy NV vừa quét.  
**Gợi ý:** Invalidate `CACHE_KEYS.SEARCH_LOG` trong các write path của `appendLogRow_`, `batchAppendLogRows_`, `updateLogRowScan_`.

### BUG-11 [P3] `computeDetailSig` không include `task.createdBy` — client không phát hiện thay đổi createdBy
**File:** `Code.gs:315-326`  
**Mô tả:** Signature detail gồm `task.status, counters, log[*].staffId/status/epoch`. Không bao gồm `task.createdBy`. Nếu createdBy đổi (hiếm), client không re-render.  
**Hậu quả:** Không ảnh hưởng logic quét, chỉ UI metadata. Severity P3.

### BUG-12 [P2] `pasteMealMoveScan` — lock timeout 10s có thể gây timeout khi nhiều kiosk cùng paste
**File:** `ScanService.gs:224-326`  
**Mô tả:** `lock.waitLock(10000)` — paste meal-move xử lý batch up to 200 codes, đọc full log, phân loại, ghi batch. Thời gian xử lý trong lock có thể dài (log lớn). Nếu 2 kiosk paste cùng lúc, cái thứ 2 chờ 10s rồi fail "Hệ thống đang bận".  
**Gợi ý:** Tăng waitLock lên 15-20s HOẶC tách lock ra thành các giai đoạn nhỏ hơn.

### BUG-13 [P2] `startCameraDecodeLoop` — interval 200ms × full chain mỗi 2 tick = decode mỗi 400ms, nhưng `busy` guard chặn fast path không chặn full chain
**File:** `camera-scan.html:898+`  
**Mô tả:** Khi `busy=true` (fast path đang decode), interval vẫn fire mỗi 200ms nhưng skip do `if (camDecoding || camSnapping || !camStream) return`. Tuy nhiên `runFullChain` gọi `decodeChain` → `LIBS.fast` → `busy=true` → next tick skip. Đúng logic. **Không có bug.**

---

## 3. TỐI ƯU CÓ THỂ

### OPT-1 [P2] Giảm RPC over-head cho `searchStaffApi`
**Hiện tại:** Mỗi tìm kiếm đọc `SEARCH_LOG` cache 10s (4 cột × N dòng). Khi log lớn (10k+ dòng), 2 RPC (`getRange A2:B` + `getRange I2:L`) tốn ~200-500ms.  
**Gợi ý:** Dùng chung cache với `LOG_ROWS` (hoặc tăng TTL SEARCH_LOG lên 30s như LOG_ROWS) để giảm RPC khi search lặp lại.

### OPT-2 [P2] Batch viết number format trong `batchMealMoveLogUpdates_`
**Hiện tại:** `batchSetNumberFormat_` gọi riêng cho TIME_RA và TIME_SCAN → 2 RPC format额外的.  
**Gợi ý:** Gộp 2 lần setNumberFormat thành 1 range contiguous nếu possible (TIME_SCAN cột 9, TIME_RA cột 12 — không liền nhau, cần 2 RPC như hiện tại). **Không tối ưu được.**

### OPT-3 [P3] `warmLogRowsCache_` build object repeat 2 lần (staffList.map + readLogRows_.map)
**File:** `Database.gs:504-577`  
**Mô tả:** `batchInsertLogRows_` viết sheet, sau đó `warmLogRowsCache_` build cache từ cùng `staffList` → logic trùng. Có thể gộp thành 1 lần duyệt.  
**Impact:** Nhỏ, chỉ tiết kiệm ~1ms trên task nhỏ.

### OPT-4 [P2] `readTaskList_` — read CẢ sheet AttendanceTask mỗi 30s (cache TTL) cho poll
**File:** `Database.gs:334-352`  
**Mô tả:** `cachedJsonRev_` với TTL 30s + rev-key. Khi rev bump (scan), rebuild full sheet read. Log 10k dòng → read ~130k cell.  
**Gợi ý:** Áp dụng G1 pattern (đọc cột TASK_ID trước, chỉ đọc dòng khớp) cho task list — tương tự `readTask_`.

### OPT-5 [P3] `SCAN_FILTER` debounce thời gian không đồng nhất
**File:** `js.html:282-298`  
**Mô tả:** scanSearch debounce 150ms, headerSearch 350ms, mealPreview 400ms. Thiếu tài liệu giải thích sự khác biệt.  
**Gợi ý:** Chuẩn hóa về 200-300ms cho consistency.

### OPT-6 [P2] `camZxingDecode` — bậc B2 (full 1280) chạy every tick sau B1 fail, không gate theo findMode
**File:** `camera-scan.html` (chunk decode logic)  
**Mô tả:** Fast path mỗi tick: B1(full 1920) → B2(full 1280) → B3(crop native) → B4(crop 1.4x+TH) → Quagga fallback. B2 chạy MỖI tick bất kể findMode. Với mã nét (99% trường hợp), B1 đã detect → B2 không chạy. Chỉ khi B1 fail → B2 chạy. Logic OK. **Không có bug/tối ưu cần thiết.**

### OPT-7 [P3] CSS — Nhiều keyframes animation trùng lặp (popFlashOk/popFlashExtra có cùng definition)
**File:** `camera-scan.html:167-175`  
**Mô tả:** `popFlashOk` và `popFlashExtra` identical. Có thể gộp thành 1 class `.pop-flash`.  
**Impact:** Giảm ~20 dòng CSS, không ảnh hưởng performance.

### OPT-8 [P2] `TaskSearch.gs` — function `collectTaskIdsByStaffLog_` duplicate logic với `findLogRow` trong ScanLogic
**File:** `TaskSearch.gs` và `ScanLogic.gs:60-67`  
**Mô tả:** Cùng thuật toán tìm staffId trong log. Có thể trích thành shared helper.  
**Impact:** Code duplication, maintainability.

---

## 4. ĐÁNH GIÁ CHUNG

| Hạng mục | Điểm (1-10) | Ghi chú |
|----------|-------------|---------|
| Correctness | 9 | Logic scan/classify chính xác, edge cases được cover bởi 368 tests |
| Security | 8 | Sanitize cell text, XSS escape, JSONP callback whitelist, editor-only gates — còn 1 leak debugState |
| Performance | 8 | Cache layer tốt, batch operations, version-key invalidation — còn 1-2 chỗ có thể giảm RPC |
| Test coverage | 9 | 368 JS + 85 Py + 11 Chrome = 464 tests, bao phủ scan logic, classify, UI mock |
| Code quality | 8 | Comment chi tiết, separation of concerns tốt (Pure logic vs GAS wrapper) |
| Maintainability | 7 | 3370 dòng js.html + 2419 camera-scan.html — large files, nên tách module |

**Tổng quan:** Hệ thống ổn định, test pass đầy đủ, kiến trúc cache/invalidate được thiết kế tốt. Cần chú ý BUG-8 (missing invalidateTaskListCache_ trong transformLogStatuses_) và BUG-10 (SEARCH_LOG không invalidate sau write).

---

## 5. CHI TIẾT TEST COMMANDS ĐÃ CHẠY

```bash
# JS tests
npm test
# → 368 tests, pass 368, fail 0, duration 7681ms

# Python tests  
npm run test:py
# → 85 tests, OK, duration 0.606s

# Build local + Chrome test
npm run build:local
npm run test:chrome
# → PASS: 11/11, FAIL: 0
```

---

*Báo cáo được tạo tự động bởi agnes-2.5-flash, không sửa code, chỉ đọc + chạy test + code review.*

---

# BÁO CÁO KIỂM TRA #2 — Điểm Danh HN2 SOC
**Model:** muse-spark-1.2-contributor-free  
**Ngày kiểm tra:** 2026-08-27  
**Phương pháp:** Chạy test độc lập toàn bộ suite (JS/Python/Chrome) + đọc source toàn bộ (10 file .gs + 4 html + 8 py + mock) + code review thủ công — KHÔNG đọc đánh giá #1 trước khi test, KHÔNG sửa code

---

## 1. KẾT QUẢ TEST ĐỘC LẬP

### 1.1 JS unit + integration (`npm test` → `node --test tests/*.test.js`)
- **Kết quả:** **368/368 PASS**, 0 fail, 0 skipped — duration ~7688ms (`default.bash:7688.334247`)
- **27 file test** ghi nhận qua `npm test` liệt kê đủ: `batch-meal-move`, `cache-layer`, `camera-autosnap`, `camera-code128`, `camera-continuous`, `camera-popup`, `cdp-helper`, `code-doget`, `csv-normalize`, `formula-injection`, `gs-syntax`, `header-search`, `inline-html`, `jsonp-api`, `js-scanmode`, `meal-create`, `note-edit`, `ocr-scan`, `scan-cards`, `scan-classify`, `scan-logic`, `scan-poll`, `scan-update-epoch`, `submit-scan-guard`, `task-cards`, `task-menu`, `task-search`
- **Nhận xét:** `package.json:7` đặt `engines.node >=22` nhưng môi trường hiện tại `node v18.19.1` (`default.bash` check) vẫn pass nhờ `scripts/test-local-mock.js:23` shim `globalThis.WebSocket = require('ws')` — không phải do Node 22 native. Test suite không phụ thuộc Node 22.

### 1.2 Python mirror (`npm run test:py` → `python3 -m unittest discover -s api -p 'test_*.py'`)
- **Kết quả:** **85/85 PASS** — `OK` trong 0.183s (5 module: `test_database` 27 test, `test_logic`, `test_main`, `test_services`, `test_sheets`)
- **Lưu ý:** `api/main.py:1` có `SyntaxWarning: invalid escape sequence '\.'` do docstring chứa regex `\.` chưa raw-string — không ảnh hưởng runtime nhưng nên sửa thành `r"..."` hoặc `\\.` để sạch warning.

### 1.3 Build local + Chrome headless (`npm run build:local` + `npm run test:chrome`)
- **Build:** `node scripts/build-local.js` → `index.local.html built (templates resolved)` — exit 0
- **Chrome:** `node scripts/test-local-mock.js` → **11/11 PASS** (Chrome 152.0.7977.64 headless, CDP port 9222, file:// index.local.html + mock-google.js). Chi tiết 11 check:
  1. App load + mock nạp (`google.script.run`) — PASS
  2. Meta `LOCAL MOCK` — PASS
  3. DOM `viewList`+`scanTable`+`taskListTable` — PASS
  4. Task list render 30 rows (table mode) — PASS
  5. openScan → viewScan hiển thị (R20260802-0900) — PASS
  6. scanTable 6 rows — PASS
  7. Counter S:3 A:3 E:1 — PASS (mock 6 dòng)
  8. Quét Ops229444 → S+1 A-1 — PASS
  9. Trùng Ops237511 → S không tăng — PASS
  10. NV lạ Ops777777 → E+1 — PASS
  11. backToList → về danh sách — PASS
- **Khắc phục đã làm để test chrome chạy:** Không sửa code, chỉ verify `google-chrome` tồn tại (`/usr/bin/google-chrome`), dùng `ws` polyfill cho Node 18, `setTimeout 2800ms LOAD_WAIT_MS` đủ cho mock load. Không cần sửa thêm.

**Kết luận test:** Cả 3 suite đều PASS, không regression. Đủ điều kiện đánh giá tiếp.

---

## 2. BUG / VẤN ĐỀ TÌM THẤY (đánh giá độc lập, có dẫn chứng file:line)

### Nhóm CRITICAL (Data loss / crash / bảo mật)

**BUG-C1 [CRITICAL] Hardcode `DEFAULT_SPREADSHEET_ID` public trong repo**  
`Config.gs:19` và `api/config.py:16` cùng hardcode `'1kL4Jr3E70NzU3l7wAr3oLve5rBAZ9AqdbvcvmABuVi0'` — ID này là public trong Git. Ai có ID + deployment URL `DOMAIN` access có thể brute-force JSONP `?action=...` nếu deployment để `Anyone` (hiện `DOMAIN` nên an toàn, nhưng nếu admin đổi sang Anyone theo comment `Code.gs` thì lộ toàn bộ DB).  
**Gợi ý:** Move ID vào `PropertiesService` / env `RC_SPREADSHEET_ID` (đã có fallback `api/sheets.py:69`), để Config rỗng là fallback an toàn. Không commit ID thật.

**BUG-C2 [CRITICAL] `debugState()` expose toàn bộ sheet qua `google.script.run` — gate chỉ đủ, nhưng tên hàm dễ bị dò**  
`Code.gs:116-159` hàm `debugState()` là global public (GAS mọi `function` đều callable qua `google.script.run`). Dù có `isEditor_()` ở `Code.gs:120-122` (fail-closed, đúng), nhưng việc giữ hàm public + trả `spreadsheetId` + 4 dòng sample mỗi sheet (kể cả `StaffData` chứa email) là attack surface không cần thiết sau deploy.  
**Gợi ý:** Đổi thành `function _debugState_()` không nằm whitelist `JsonpApi.gs:23` và chỉ gọi từ Editor → giảm dò qua `google.script.run[fn]` loop.

### Nhóm IMPORTANT (Tính năng hỏng / logic sai / edge case lớn)

**BUG-I1 [IMPORTANT] `appsscript.json:9` đang `access: DOMAIN` → JSONP standalone `Anyone` bị chặn, `DOMAIN` thì third-party cookie Safari/Chrome chặn tiếp**  
`appsscript.json:9` `access: DOMAIN` (đã ghi trong `AGENTS.md §20`: org Shopee Mobile khóa `Anyone`). Hậu quả kép: (1) Preview ngoài domain cần login Google; (2) Safari/Chrome chặn third-party cookie → kể cả login vẫn không gọi GAS từ host khác qua JSONP fetch. Đã ghi trong AGENTS nhưng chưa fix. Backend Python `api/` là đường cứu — nhưng deployment hiện tại vẫn phụ thuộc GAS.  
**Gợi ý:** Document rõ tradeoff, khuyến nghị deploy Python backend làm primary cho production, GAS chỉ fallback.

**BUG-I2 [IMPORTANT] `transformLogStatuses_` (kết thúc/mở lại) không invalidate `SEARCH_LOG` + `TASK_COUNTS` cache đầy đủ trong mọi nhánh**  
`Database.gs:625-660` hàm `transformLogStatuses_` khi có writes chỉ gọi `batchSetOneCol_` + `invalidateTaskDetailCache_` + `invalidateLogRows_`. Đã được `markUnscannedAbsent_` `Database.gs:658` comment gọi `invalidateTaskListCache_` trong `resetAbsentToPending_`, nhưng `markUnscannedAbsent_` KHÔNG gọi `invalidateTaskListCache_` trực tiếp — nó dựa vào `completeTaskCore_ TaskService.gs:154` gọi `updateTaskStatus_` → `invalidateTaskListCache_`. Nếu ai gọi `markUnscannedAbsent_` trực tiếp, list counters sẽ stale 30s (`TASK_COUNTS` TTL). Đồng thời `SEARCH_LOG` (10s) không bị invalidate ở bất kỳ write path nào (`appendLogRow_`, `batchAppendLogRows_`, `transformLogStatuses_`).  
**Gợi ý:** Thêm `invalidateTaskListCache_()` + `cache_().remove(CACHE_KEYS.SEARCH_LOG)` vào cuối `transformLogStatuses_` khi `done>0`.

**BUG-I3 [IMPORTANT] `searchStaffApi` cache `SEARCH_LOG` 10s không invalidate sau write → search ngay sau scan có thể miss NV vừa quét**  
`Code.gs:239-256` `searchStaffApi` dùng `cachedJson_(SEARCH_LOG, 10s)`. Các write path `Database.gs:792` `appendLogRow_` chỉ invalidate `TASK_DETAIL` + `TASK_LIST` + `LOG_ROWS`, không đụng `SEARCH_LOG`. User quét xong search ngay (<10s) → log cũ. Python `api/services.py:685` tương tự.  
**Gợi ý:** Invalidate `SEARCH_LOG` trong `appendLogRow_`, `batchAppendLogRows_`, `updateLogRowScan_`, `updateLogRowRa_`.

**BUG-I4 [IMPORTANT] `normalizeStaffDate_` (CsvUtil.gs:66-101) fallback `new Date(s)` có thể parse sai timezone**  
`CsvUtil.gs:94-99` nhánh cuối `new Date(s)` với string `"Mon Aug 03 2026 00:00:00 GMT+0700"` → `getFullYear()/getMonth()/getDate()` lấy local TZ của GAS runtime (Asia/Ho_Chi_Minh) → đúng. Nhưng nếu chạy Node test với TZ khác, kết quả lệch 1 ngày. Đã có comment `KHÔNG dùng Utilities.formatDate` để chạy Node, nên lệch này là intentional. Python `api/cache.py` dùng `zoneinfo Asia/Ho_Chi_Minh` nên khớp GAS — divergency chỉ khi test Node không set TZ.  
**Gợi ý:** Trong Node test, set `TZ=Asia/Ho_Chi_Minh` (đã có `process.env.TZ` trong vài test).

**BUG-I5 [IMPORTANT] `pasteMealMoveScan` giới hạn 200 mã nhưng `createMealMoveTask` cho 1000 mã → inconsistency**  
`ScanService.gs:227` `if (list.length > 200)` cho paste, nhưng `TaskService.gs:279` `if (raw.length > 1000)` cho create. User paste 500 mã vào task meal-move sẽ bị từ chối, nhưng tạo task mới với 500 mã lại OK. Không phải bug logic nhưng UX confusing.  
**Gợi ý:** Document rõ hoặc đồng nhất limit (paste nên cho 1000 như create, vì đã batch write).

**BUG-I6 [IMPORTANT] `SCAN_QUEUE_MAX=50` (js.html:2228) nhưng không báo cho user số còn lại trong queue khi reject**  
`js.html:2937-2941` khi queue đầy, toast `"Hàng đợi đang đầy — chờ giây lát"` nhưng không cho biết cần chờ bao lâu (2.5s/item × 50 = 125s worst-case). Kiosk quét liên tục có thể bị stuck.  
**Gợi ý:** Toast thêm `queue.length` hoặc disable input sớm hơn (đã có `updateQueueFullState` disable input khi full — tốt).

**BUG-I7 [IMPORTANT] `resolveMealMoveMode_` GAS (ScanService.gs:208-214) và Python (services.py:385-399) diverge về trust model**  
GAS `resolveMealMoveMode_` fail-closed: chỉ `createdBy` mới được `ra`, còn lại ép `vao` (dựa `Session.getEffectiveUser`). Python `services.py:385` comment ghi rõ `standalone anonymous → trust client's mode` — ai cũng được `ra`. Đây là divergence đã document, nhưng nếu deploy Python làm primary thì quyền "chỉ creator được Ra" bị bypass hoàn toàn.  
**Gợi ý:** Nếu cần giữ quyền, thêm token/session cho Python hoặc document là intentional trade-off.

**BUG-I8 [IMPORTANT] `computeDetailSig` / `computeTaskListSig` không include `note` trong Python cũ? — Đã khớp, nhưng thiếu `completedAtText`**  
Kiểm tra `Code.gs:308-326` vs `api/services.py:324-360`: GAS `computeTaskListSig` join `taskId|status|total|scanned|extra|createdAtText|completedAtText|note` — Python `services.py:327-338` đã khớp. `computeDetailSig` GAS `Code.gs:315-326` gồm `status|cScanned|absent|extra|out + staffId|status|epoch` — Python `services.py:342-360` khớp. Không bug hiện tại, nhưng nếu thêm field mới (vd `agency`) mà quên cập sig → stale poll.

### Nhóm SUGGESTION (Chất lượng code / maintainability / performance nhỏ)

**BUG-S1 [SUGGESTION] `warmLogRowsCache_` (Database.gs:546-577) build cache object lớn có thể vượt 100KB/key**  
`CacheService` giới hạn 100KB/key, 500KB total. Task 750 NV slim ~130B×750=97KB sát giới hạn. Comment đã ghi `warmLogRowsCache_ fail → fallback cold`, nhưng không có metric để biết tần suất fail. Nên log khi fail (đã có `Logger.log` dòng 574) — tốt.

**BUG-S2 [SUGGESTION] `js.html:122-128` mock loader dùng `document.write` khi `readyState === loading` — có thể bị block bởi CSP GAS wrapper**  
Dù đã fix `2026-08-11` chỉ write khi loading, nhưng GAS wrapper `userHtmlFrame` CSP có thể block inline script. Hiện tại dùng `include('js')` scriptlet nên không ảnh hưởng, nhưng mock path `file://` vẫn dùng `document.write` — OK cho preview.

**BUG-S3 [SUGGESTION] `camera-scan.html` worker `CAM_WORKER_SRC` dùng `importScripts` ZXing từ CDN — CSP GAS iframe có thể chặn**  
`camera-scan.html` worker blob `importScripts('https://cdn.jsdelivr.net/.../index.min.js')` — GAS `HtmlService` CSP cho phép `https://cdn.jsdelivr.net` (đã verify), nhưng nếu CDN down → worker fail-open (đã có `popWorkerFailed` guard). Tốt, nhưng nên vendor fallback URL thứ 2.

**BUG-S4 [SUGGESTION] `js.html:440-460` `playBeep` tạo `AudioContext` mới mỗi lần nếu chưa có — nên reuse**  
Đã reuse `_audioCtx` global, chỉ tạo 1 lần — tốt. Tuy nhiên `for (var i=0; i<2; i++)` tạo 2 oscillator+gain mỗi lần beep success → OK, không leak vì `osc.stop`.

**BUG-S5 [SUGGESTION] `Config.gs:120-126` `TASK_LIST` TTL 30s + `TASK_DETAIL` 15s, nhưng `FILTER_OPTIONS` 5m → dropdown sau khi sync CSV có thể stale 5m**  
`invalidateStaffIndex_() Database.gs:149-152` xóa cả `STAFF_INDEX` + `FILTER_OPTIONS`, nên sync xong fresh — OK. Chỉ stale nếu sync bằng tay sửa sheet không qua `syncFromCsv`.

**BUG-S6 [SUGGESTION] `api/main.py:1` docstring regex `\.` gây `SyntaxWarning`**  
Đã nêu ở 1.2 — sửa thành raw string.

**BUG-S7 [SUGGESTION] `js.html:3340-3346` `esc()` chỉ escape `& < > "` nhưng không escape `'` — có `escAttr()` riêng escape thêm `'` → đúng. Nhưng `taskCardHTML` dùng `escAttr` cho `taskId` trong `onclick="openScan('...')"` — đã đủ. Không bug, nhưng nên dùng `textContent` thay `innerHTML` nếu có thể.**

---

## 3. TỐI ƯU ĐỀ XUẤT (không phải bug, nhưng cải thiện)

| # | File:line | Hiện tại | Đề xuất | Impact |
|---|-----------|----------|---------|--------|
| OPT-1 | `Database.gs:244-256` `searchStaffApi` | Đọc 2 range `A2:B` + `I2:L` (2 RPC) | Gộp thành 1 range `A2:L` rồi slice 4 cột cần (1 RPC) nếu log nhỏ; giữ 2 RPC nếu log >10k để giảm cell đọc | Giảm 50% RPC khi log vừa |
| OPT-2 | `js.html:1446-1452` `loadStaffIndex` | Cache localStorage 12h, fallback tải lại | Thêm version key `rc2_staffIndex_v` bump khi `syncFromCsv` để client biết invalidate, không chờ 12h | Fresh hơn sau sync |
| OPT-3 | `camera-scan.html:896-918` `CAM_WORKER_SRC` | Worker decode full frame TRY_HARDER mỗi frame rảnh | Thêm early-exit khi confidence cao ở bậc 1-2 (đã có) — hiện đã tối ưu, không cần thêm | Đã tối ưu tốt |
| OPT-4 | `Database.gs:334-352` `readTaskList_` | Đọc `getDataRange()` CẢ AttendanceTask mỗi rebuild | Áp dụng G1 pattern (đọc cột TASK_ID trước) nếu task >500 — hiện task ít nên chưa cần | Scale tốt khi task tăng |
| OPT-5 | `js.html:282-298` `initScanFilters` | Debounce scanSearch 150ms | Đồng nhất với headerSearch 350ms → 200ms cho consistency | UX nhỏ |
| OPT-6 | `js.html:198-198` `byId` cache | Cache DOM lookup, check `document.contains` | Thêm `WeakMap` cho GC tốt hơn khi DOM thay đổi nhiều | Micro-opt |
| OPT-7 | `api/sheets.py` | Mỗi `get_values` là 1 API call | Batch `batchGet` cho `read_log_rows` + `read_task_list` khi poll đồng thời | Giảm quota |
| OPT-8 | `css.html` | 1115 dòng, nhiều token lặp | Tách thành `css/tokens.css` + `css/components.css` khi build | Maintainability |
| OPT-9 | `js.html` 3370 dòng + `camera-scan.html` 2419 dòng | Single file lớn | Tách `js.html` thành `js/scan.js` + `js/task.js` + `js/camera.js` khi build (vẫn inline qua `include()`) | Maintainability |
| OPT-10 | `mock/mock-google.js:122-145` | `buildLog` hardcode 5 NV + 1 Dư | Thêm param để test các case edge (0 NV, 100 NV) cho Chrome test | Test coverage |

---

## 4. ĐÁNH GIÁ TỔNG QUAN (thang 10)

| Hạng mục | Điểm | Nhận xét |
|----------|------|----------|
| Correctness | 9/10 | Logic scan/classify chuẩn, 368+85 tests cover edge, dual runtime GAS/Python mirror tốt (đã fix diverge `resolveMealMoveMode` doc) |
| Security | 7/10 | Đã sanitize cell text (A1), XSS escape (esc/escAttr), JSONP whitelist, gate `isEditor_()` — còn hardcode spreadsheetId + debugState public |
| Performance | 8/10 | Cache version-key, batch setValues, G1 read 1 cột, 100KB slim cache — còn SEARCH_LOG chưa invalidate, TASK_LIST full read khi scale |
| Test coverage | 9/10 | 368 JS + 85 Py + 11 Chrome = 464 tests, dual runtime mirror, contract mock↔server — thiếu test tải lớn (1000 NV) |
| Code quality | 8/10 | Comment chi tiết, separation Pure vs GAS wrapper, marker blocks testable — file lớn (3370+2419 dòng) |
| Maintainability | 7/10 | AGENTS.md + skills chi tiết, convention rõ — cần tách module khi vượt 4000 dòng/file |

**Tổng:** Hệ thống ổn định, test pass đầy đủ, kiến trúc cache/invalidate thiết kế tốt. 2 bug quan trọng nhất cần lưu ý là **BUG-I2/I3 (SEARCH_LOG stale)** và **BUG-C1 (hardcode ID)** — còn lại là low-risk hoặc đã có guard.

---

## 5. CHI TIẾT LỆNH ĐÃ CHẠY (verify)

```bash
# JS
npm test
# → 368 tests, pass 368, fail 0, duration 7688ms

# Python
python3 -m unittest discover -s api -p 'test_*.py' -v
# → 85 tests, OK, 0.183s

# Build + Chrome (Node 18.19.1 + ws polyfill, Chrome 152)
node scripts/build-local.js
# → index.local.html built

timeout 60 node scripts/test-local-mock.js
# → PASS 11/11, FAIL 0
# INDEX: file:///.../index.local.html
# Boot Chrome headless (CDP 9222) → 30 rows, S:3 A:3 E:1, scan Ops229444 OK, trùng OK, Dư OK, backToList OK
```

---

*Báo cáo #2 được tạo tự động bởi muse-spark-1.2-contributor-free, không sửa code, chỉ đọc + chạy test + code review độc lập. Append nối tiếp báo cáo #1 (agnes-2.5-flash) — không ghi đè dòng cũ.*
