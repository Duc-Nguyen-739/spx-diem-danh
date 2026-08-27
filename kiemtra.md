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
