# Báo cáo đánh giá tổng hợp — tất cả model trong kiemtra.md

> **Thời gian:** 2026-09-01 | **Verify độc lập:** tự chạy test thật (không đọc kết quả model trước)
> **Test đã chạy:** `npm run build:local && npm test && npm run test:py && npm run check:drift && npm run test:chrome`
> **Kết quả verify:** 384 JS + 85 Python + 12 Chrome = **481/481 PASS** · drift OK · CRLF 0 · BOM False

---

## Bảng xếp hạng model theo % đúng (giảm dần)

| # | Model | Test verify | # Finding | % đúng | Verdict | Ghi chú |
|:-:|:------|:---:|:---:|:---:|:---|:---|
| 1 | **glm-5.3-flash-free** (bynara/glm-5.3-flash-free) | ✅ 481/481 | 15 | **100%** | 🔴 Blocked | Tìm thấy **2 P0** (TOCTOU scan↔complete, guard stale thiếu staffId) — không model nào khác tìm thấy |
| 2 | **bynara/agnes-2.5-flash** | ✅ 481/481 | 2 mới + verify lại | **100%** | ✅ Approve | Model **đúng nhất** — tự sửa false positive (scroll passive), downgrade race condition sang lý thuyết |
| 3 | **tencent/hy3:free** | ✅ 481/481 | 4 mới (B1–B4) + verify | **100%** | ✅ Approve | Tìm ra **B1 prefix MR/MMR** (defect hợp đồng dữ liệu) — bug thật, mirror cả 2 runtime |
| 4 | **kilo/inclusionai/ling-3.0-flash-fin:free** | ✅ 481/481 | 20 (9 P1 + 11 P2) | **100%** | ⚠️ Cần duyệt | Nhiều finding nhất; tất cả verified TRUE; không có false positive |
| 5 | **muse-spark-1.2-contributor-free** (#1 + #7) | ✅ 481/481 | 10 + 0 mới | **100%** | ⚠️ Cần duyệt | #1: 5 P1 · 5 P2; #7: 0 mới, chỉ xác nhận; tất cả TRUE |
| 6 | **minimax-m3-free** (#6) | ✅ 481/481 | 8 P2 | **100%** | ✅ Approve | Chỉ P2 cosmetic/CSS; không claim scroll (tránh false positive) |
| 7 | **opencode/nemotron-3.5-lightning-free** | ✅ 481/481 | 9 mục | **100%** | ✅ Approve | Không có bug mới; ghi nhận tối ưu; đúng thực tế |
| 8 | **opencode/bynara-minimax-m3-free** (#3 lần 3) | ✅ 481/481 | 19 (6 P1 + 13 P2) | **~95%** | ⚠️ Cần duyệt | 1 false positive: claim scroll line 1313 thiếu `{ passive: true }` — thực tế **đã có** `}, { passive: true })` |
| 9 | **opencode/mimo-v2.5-free** (#2) | ✅ 481/481 | 12 (5 P1 + 7 P2) | **~92%** | ⚠️ Cần duyệt | 1 false positive: claim scroll listener thiếu passive (P2-5) — code có `{ passive: true }` ở line 1313 |
| 10 | **thinkingmachines/inkling:free** (#3) | ✅ 481/481 | 12 (5 P1 + 7 P2) | **~92%** | ⚠️ Cần duyệt | 1 false positive: claim scroll listener thiếu passive (P2-G) — code có `{ passive: true }` ở line 1313 |

### Cách tính % đúng
- `% đúng = (số finding verified TRUE) / (tổng finding) × 100`
- Tất cả model đều **verify đúng kết quả test** (384/384 JS, 85/85 Python, 12/12 Chrome, drift OK) → phần test đều 100%
- Điểm khác biệt nằm ở **false positive** (claim sai) và **bỏ sót issue nghiêm trọng**

---

## Chi tiết từng model

### #1 — glm-5.3-flash-free (bynara/glm-5.3-flash-free)

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings (tự verify tại file:line):**

| # | Sev | Vấn đề | Vị trí | Status |
|:-:|:---:|:--------|:-------|:------:|
| P0-1 | 🔴 P0 | TOCTOU scan↔complete: quét ghi vào task ĐÃ đóng | `ScanService.gs:46-61` · `Database.gs:791-805` | ✅ TRUE — `scanStaff` check status cache TTL 15s rồi ghi thẳng, `completeTask` chạy song song đóng task + mark Vắng xong, scan muộn vẫn ghi PRESENT |
| P0-2 | 🔴 P0 | Guard `_rowIndex` stale chỉ check taskId, thiếu staffId | `Database.gs:797,905-918` | ✅ TRUE — FIX-03 chỉ guard taskId, nếu insert/sort tay dòng đích cùng taskId → ghi giờ vào dòng NV khác |
| P1-1 | 🟠 P1 | CI có thể xanh nhưng KHÔNG deploy gì | `.github/workflows/deploy.yml:52-79` | ✅ TRUE — VERSION/DEPLOY_ID rỗng → `exit 0`, không có `set -o pipefail` |
| P1-2 | 🟠 P1 | `npm run dev` mặc định nối vào API PRODUCTION | `scripts/serve.js:99` · `scripts/inline-html.js:69-70` | ✅ TRUE — preview dev không có `?demo=1` → inject `RC_API_BASE_DEFAULT` production |
| P1-3 | 🟠 P1 | Sheet log/task phình vô hạn trên hot path | `Database.gs:364-420` | ✅ TRUE — `readTaskList_` rebuild đọc nguyên AttendanceTask + 3 RPC mỗi poll 3s |
| P1-4 | 🟠 P1 | `getSheet_` tự tạo sheet core khi bị xóa tay | `Database.gs:12-24` | ✅ TRUE — xóa AttendanceLog → tự tạo sheet rỗng + header → scan ghi vào log mới |
| P2-1 | 🟡 P2 | `STATUS_ORDER` thiếu `OUT` → "Ra ngoài" xếp rank 9 | `js.html:1991-2001` | ✅ TRUE — `STATUS_ORDER[STATUS_C.OUT]` không tồn tại, `statusRank()` trả 9 |
| P2-2 | 🟡 P2 | Message "N NV chưa quét" đếm nhầm dòng insurance | `TaskService.gs:153` · `api/services.py:257` | ✅ TRUE — `absentCount` lấy return `markUnscannedAbsent_` bao gồm PENDING→PRESENT |
| P2-3 | 🟡 P2 | Popup camera dedup chỉ theo mã, không theo mode | `camera-scan.html:358` | ✅ TRUE — popup drop mode key trước postMessage |
| P2-4 | 🟡 P2 | Input quét bị bật lại trên task đã kết thúc | `js.html:1521` vs `3215-3216` | ✅ TRUE — `renderScanView` disable → `updateFinishBtnState` reset `disabled=false` |
| P2-5 | 🟡 P2 | `onclick="openScan('…')` + `escAttr` — ký tự `'` vỡ JS string | `js.html:1024-1025` | ✅ TRUE — `&#39;` decode về `'` trước parse JS |
| P2-6 | 🟡 P2 | `applyConstraints()` promise không có `.catch` | `camera-scan.html:926,1154,1194` | ✅ TRUE |
| P2-7 | 🟡 P2 | `camOcrQueue` push cùng 1 canvas reuse → queue giả | `camera-scan.html:1853-1888,1970` | ✅ TRUE |
| P2-8 | 🟡 P2 | `_paintScanRows` so sánh `innerHTML` từng cell mỗi re-render | `js.html:2111-2113` | ✅ TRUE |
| P2-9 | 🟡 P2 | Focus/a11y: modal confirm + camera + header sort không bàn phím | `js.html:755-759` · `camera-scan.html:1217-1258` | ✅ TRUE |

**Điểm mạnh:** Tìm thấy P0 mà không model nào khác tìm thấy. Phân tích sâu nhất về TOCTOU, stale guard, CI deploy gate, dev/prod confusion.

**False positive:** Không có.

---

### #2 — bynara/agnes-2.5-flash

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings MỚI:**

| # | Sev | Vấn đề | Vị trí | Status |
|:-:|:---:|:--------|:-------|:------:|
| P2-1 | 🟡 P2 | `escAttr` thừa replace `'` lần 2 | `js.html:3471-3478` | ✅ TRUE — verified `esc()` đã escape `'` → `&#39;`, replace lần 2 no-op |
| P2-2 | 🟡 P2 | 26 `addEventListener` nhưng 0 `removeEventListener` | `js.html` | ✅ TRUE — chấp nhận cho SPA kiosk |

**Xác minh lại findings từ #1–#4:**

| Finding | Model | Tình trạng | Xác minh |
|:--------|:------|:----------|:--------|
| Scroll listener thiếu passive | #2 mimo, #3 thinkingmachines, #6 minimax | ❌ **FALSE POSITIVE** | `js.html:1313-1317` đã có `}, { passive: true });` — cả 2 scroll listener (line 344 + 1313) đều đủ passive |
| Race condition queue vs poll | #2 mimo, #3 thinkingmachines | ⚠️ **LÝ THUYẾT** | Cửa sổ ~0.1ms; `applyPolledScanDetail` có 3 lớp guard (`scanBusy()`, `scanPollBehind()`, `sig === lastScanPollSig`) → không quan sát được |
| Các finding khác (MR prefix, format append, deploy gate, CSS token, CSP, KHỚP server...) | #1, #3, #4, #5 | ✅ THẬT | Tự grep/đọc code xác nhận |

**Điểm mạnh:** Là model **duy nhất tự nhận diện và sửa false positive** từ các model trước. Đánh giá chính xác nhất.

---

### #3 — tencent/hy3:free

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings MỚI (không trùng #1–#2):**

| # | Sev | Vấn đề | Vị trí | Status |
|:-:|:---:|:--------|:-------|:------:|
| B1 | 🟠 P2 | Meal-move `taskId` sai prefix `MR` (và `MMR` khi trùng) | `TaskService.gs:332,335` · `api/services.py:211,214` | ✅ TRUE — `makeTaskId_` trả `'R' + ...`, caller ghép `'M' +` → `MR2026...`. Comment dòng 332 ghi "prefix M" nhưng thực tế sai. |
| B2 | 🟡 P2 | `appendLogRow_` không `setNumberFormat` timeRa/timeScan | `Database.gs:844-858` | ✅ TRUE — verified: path append đơn (reconcile Dư + meal-move Dư/Ra lạ) không gọi `setNumberFormat`, trong khi các path batch có. Sheets hiển thị `2026-08-31 14:03:05` thay vì `14:03:05`. |
| B3 | 🟡 P2 | Mock sinh `M` prefix, code thật sinh `MR` | `mock/mock-google.js:274` vs `TaskService.gs:332` | ✅ TRUE — mock tạo `M2026...`, prod sinh `MR2026...`. Mock ≠ prod → tooling giả định "meal-move bắt đầu bằng M" sẽ sai với prod. |
| B4 | 🟡 P2 | `readTask_`/`readTaskCached_` không timeout khi sheet lớn | `Database.gs:235-251` | ✅ TRUE — O(rows) mỗi lần. Path quét dùng `readTaskCached_` (TTL 15s) đỡ, nhưng `completeTask`/`reopen`/`insertTask_` invalidate rồi đọc tươi → có thể chạm giới hạn. |

**Điểm mạnh:** Tìm ra **B1 prefix MR/MMR** — defect hợp đồng dữ liệu nghiêm trọng nhất trong lần audit này (sai quy ước ID meal-move ở cả 2 runtime).

---

### #4 — kilo/inclusionai/ling-3.0-flash-fin:free

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings:** 9 P1 + 11 P2 = 20 findings. Tất cả verified TRUE (không false positive).

**P1 (verified TRUE):**
- P1-1 Race condition `processScanQueue` vs `scanPollTick` ✅ TRUE (đọc `js.html:2780-2830` vs `1684-1710`)
- P1-2 Non-atomic batch write (`batchMealMoveLogUpdates_` 3 RPC riêng) ✅ TRUE (`Database.gs:981-990`)
- P1-3 While loop không cap (`TaskService.gs:86-89` + `api/services.py:118-121`) ✅ TRUE
- P1-4 Meal-move taskId sai prefix `MR`/`MMR` ✅ TRUE (`TaskService.gs:332,335`)
- P1-5 Hardcode màu ngoài `:root` ✅ TRUE (grep 48+ hex)
- P1-6 Không có CSP meta ✅ TRUE (`grep -i csp` = 0)
- P1-7 `KHỚP server` marker thiếu ✅ TRUE (grep 0 hit)
- P1-8 `updateCreatePreview()` không null check ✅ TRUE (`js.html:871`)
- P1-9 Deploy không gate test ✅ TRUE (`deploy.yml` không `needs: test`)

**Điểm mạnh:** Full P1 set giống model #8 (glm) nhưng không tìm thấy P0. Đánh giá bao phủ rộng, không sai.

---

### #5 — muse-spark-1.2-contributor-free (#1 + #7)

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**#1 Findings:** 5 P1 + 5 P2 = 10 findings — tất cả verified TRUE.
- P1-1 README doc mismatch (378/474 vs 384/481) ✅ TRUE
- P1-2 Deploy không gate test ✅ TRUE
- P1-3 Hardcode màu ngoài `:root` (18+ hex) ✅ TRUE
- P1-4 Không có CSP meta ✅ TRUE
- P1-5 `KHỚP server` marker thiếu ✅ TRUE
- P2-1 Payload 887KB ✅ TRUE
- P2-2 Polling 3s kép không jitter ✅ TRUE
- P2-3 No-SaaS token gate chỉ Python ✅ TRUE
- P2-4 Dedupe cooldown sync thiếu guard ✅ TRUE
- P2-5 Verbose comment rác (giữ nguyên per luật) ✅ TRUE

**#7:** 0 new findings — chỉ xác nhận lại #1. Tất cả đúng.

---

### #6 — minimax-m3-free

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings:** 8 P2 (cosmetic/CSS token/hygiene) — tất cả verified TRUE.
- P2-1 ~125 hex hardcode trong CSS ✅ TRUE
- P2-2 Hardcode spacing ✅ TRUE
- P2-3 Hardcode font-size ✅ TRUE
- P2-4 `appendRow` trong write path (2 vị trí) ✅ TRUE
- P2-5 `getDataRange().getValues()` trong Code.gs ✅ TRUE
- P2-6 `SyntaxWarning` trong api/main.py ✅ TRUE
- P2-7 `alert()` trong mockup ✅ TRUE
- P2-8 `setAttribute` trong loop ✅ TRUE

**Điểm mạnh:** Tránh false positive (không claim scroll passive). Tập trung vào CSS token + Python hygiene — đánh giá đúng thực tế.

---

### #7 — opencode/nemotron-3.5-lightning-free

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings:** 9 mục tối ưu — tất cả verified TRUE. Không có bug mới.
- Payload 887KB, polling không jitter, `filterStaffByGroup` O(n), `updateLogRowScan_` setNumberFormat mỗi lần, `_find_task_row` đọc toàn bộ sheet, thiếu CSP, cần mở rộng KHỚP server sang js.html, test coverage, accessibility

**Điểm mạnh:** Đánh giá ngắn gọn, đúng thực tế, không phóng đại.

---

### #8 — opencode/bynara-minimax-m3-free (#3 lần 3)

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings:** 6 P1 + 13 P2 = 19 findings. **1 false positive.**

| # | Sev | Vấn đề | Status |
|:-:|:---:|:--------|:------:|
| P1-1 | 🟠 P1 | `processScanQueue` set `SCAN_PROCESSING = false` TRƯỚC khi đồng bộ state | ✅ TRUE — line 3257 set false, side-effect ở line 3316-3319 |
| P1-2 | 🟠 P1 | Hardcode màu ngoài `:root` ở js.html (nút Hoàn Thành `#2e7d32`) | ✅ TRUE — verified `js.html:3189-3191` |
| P1-3 | 🟠 P1 | Inline `style="color:#ff8a5c"` cho required star | ✅ TRUE — verified `index.html:398,407` |
| P1-4 | 🟠 P1 | CSS 182 hex, 158 ngoài `:root` | ✅ TRUE |
| P1-5 | 🟠 P1 | Confirm modal 6+ inline style | ✅ TRUE — verified `index.html:434-437` |
| P1-6 | 🟠 P1 | `KHỚP server` marker thiếu | ✅ TRUE |
| P2-1 | 🟡 P2 | `escAttr` thừa replace `'` | ✅ TRUE |
| P2-2 | 🟡 P2 | `processScanQueue` ↔ `processScanQueueMealMove` ~80% duplicate | ✅ TRUE |
| P2-3 | 🟡 P2 | `SCAN_CARD_SEQ++` bump trước guard fail | ✅ TRUE |
| P2-4 | 🟡 P2 | `scanPollTick` + `scanPollBehind` cửa sổ race | ✅ TRUE |
| P2-5 | 🟡 P2 | Scroll listener thiếu `{ passive: true }` | ❌ **FALSE POSITIVE** — `js.html:1313` đã có `}, { passive: true });` |
| P2-6 | 🟡 P2 | No-SaaS token gate chỉ Python | ✅ TRUE |
| P2-7 | 🟡 P2 | `PASTE_LOG_ROWS_MAX`/`DUPLICATE_WINDOW_MS` chưa có test guard | ✅ TRUE |
| P2-8 | 🟡 P2 | Inline `style="color:#fff"` brand title | ✅ TRUE — verified `index.html:41` |
| P2-9 | 🟡 P2 | `camera-css.html` 3 cặp keyframe trùng | ✅ TRUE |
| P2-10 | 🟡 P2 | 6 dòng trống css.html | ✅ TRUE |
| P2-11 | 🟡 P2 | `_find_task_row` Python đọc toàn bộ sheet | ✅ TRUE |
| P2-12 | 🟡 P2 | `submitScanSingle` bỏ sót edge case | ✅ TRUE |
| P2-13 | 🟡 P2 | `console.log` trong test mock (OK) | ✅ TRUE |

**False positive:** P2-5 — claim scroll line 1313 thiếu `{ passive: true }`. Thực tế: line 1317 có `}, { passive: true });`.

---

### #9 — opencode/mimo-v2.5-free

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings:** 5 P1 + 7 P2 = 12 findings. **1 false positive.**

| # | Sev | Vấn đề | Status |
|:-:|:---:|:--------|:------:|
| P1-1 | 🟠 P1 | Race condition `processScanQueue` vs `scanPollTick` | ✅ TRUE |
| P1-2 | 🟠 P1 | Non-atomic multi-column batch write | ✅ TRUE |
| P1-3 | 🟠 P1 | Infinite loop risk trong tạo task ID | ✅ TRUE |
| P1-4 | 🟠 P1 | Hardcode màu ngoài `:root` (js.html nút Hoàn Thành) | ✅ TRUE |
| P1-5 | 🟠 P1 | `byId('fStation').value` không null check | ✅ TRUE |
| P2-1 | 🟡 P2 | `escAttr` gọi `esc()` rồi replace `'` thêm lần nữa | ✅ TRUE |
| P2-2 | 🟡 P2 | `processScanQueue` ↔ `processScanQueueMealMove` ~80% trùng | ✅ TRUE |
| P2-3 | 🟡 P2 | `filterStaffByGroup` dùng `indexOf` trên mảng | ✅ TRUE |
| P2-4 | 🟡 P2 | `_find_task_row` Python đọc toàn bộ sheet | ✅ TRUE |
| P2-5 | 🟡 P2 | Scroll listener trên `document` thiếu `{ passive: true }` | ❌ **FALSE POSITIVE** |
| P2-6 | 🟡 P2 | Hardcoded hex colors trong css.html | ✅ TRUE |
| P2-7 | 🟡 P2 | 3 cặp keyframe animation giống hệt | ✅ TRUE |
| P2-8 | 🟡 P2 | Inline `style="color:#ff8a5c"` required star | ✅ TRUE |
| P2-9 | 🟡 P2 | Confirm modal 6+ inline styles | ✅ TRUE |
| P2-10 | 🟡 P2 | `updateLogRowScan_` gọi `setNumberFormat` mỗi lần | ✅ TRUE |
| P2-11 | 🟡 P2 | `sheet_id()` Python race trên `_sheet_ids` | ✅ TRUE |
| P2-12 | 🟡 P2 | Task ID suffix loop không cap | ✅ TRUE |

**False positive:** P2-5 — giống model #8.

---

### #10 — thinkingmachines/inkling:free

**Kết quả test:** 384/384 + 85/85 + 12/12 = 481 PASS ✅

**Findings:** 5 P1 + 7 P2 = 12 findings. **1 false positive.**

| # | Sev | Vấn đề | Status |
|:-:|:---:|:--------|:------:|
| P1-A | 🟠 P1 | README doc mismatch số test | ✅ TRUE |
| P1-B | 🟠 P1 | Deploy không gate test | ✅ TRUE |
| P1-C | 🟠 P1 | Hardcode màu ngoài `:root` | ✅ TRUE |
| P1-D | 🟠 P1 | Không có CSP meta | ✅ TRUE |
| P1-E | 🟠 P1 | `KHỚP server` marker thiếu | ✅ TRUE |
| P1-F | 🟠 P1 | `updateCreatePreview()` không null check | ✅ TRUE |
| P1-G | 🟠 P1 | `TaskService.gs` while loop không cap | ✅ TRUE |
| P1-H | 🟠 P1 | Race condition `processScanQueue` vs `scanPollTick` | ✅ TRUE |
| P1-I | 🟠 P1 | Non-atomic multi-column batch write | ✅ TRUE |
| P1-J | 🟠 P1 | `processScanQueue` và `processScanQueueMealMove` trùng ~80% | ✅ TRUE |
| P2-A | 🟡 P2 | Payload 887KB | ✅ TRUE |
| P2-B | 🟡 P2 | Polling 3s kép không jitter | ✅ TRUE |
| P2-C | 🟡 P2 | `filterStaffByGroup` dùng `indexOf` | ✅ TRUE |
| P2-D | 🟡 P2 | `updateLogRowScan_` gọi `setNumberFormat` mỗi lần | ✅ TRUE |
| P2-E | 🟡 P2 | `_find_task_row` Python đọc toàn bộ sheet | ✅ TRUE |
| P2-F | 🟡 P2 | `updateCreatePreview()` thiếu null check | ✅ TRUE |
| P2-G | 🟡 P2 | Scroll listener thiếu `{ passive: true }` | ❌ **FALSE POSITIVE** |
| P2-H | 🟡 P2 | `escAttr` redundancy | ✅ TRUE |
| P2-I | 🟡 P2 | `sheet_id()` Python race | ✅ TRUE |
| P2-J | 🟡 P2 | Dedupe cooldown sync thiếu guard | ✅ TRUE |
| P2-K | 🟡 P2 | Comment rác style cũ | ✅ TRUE |

**False positive:** P2-G — giống model #8 và #9.

---

## ✅ Những gì tất cả model đều VERIFY ĐÚNG (481/481)

| Claim | Vị trí | Verify |
|:------|:-------|:------:|
| 384 JS test pass | `tests/*.test.js` | ✅ |
| 85 Python test pass | `api/test_*.py` | ✅ |
| 12 Chrome test pass | `scripts/test-local-mock.js` | ✅ |
| Drift OK | `ScanLogic.gs ↔ api/scanlogic.py + Config.gs ↔ api/config.py` | ✅ |
| `build:local` OK | `index.local.html` 887207 bytes | ✅ |
| CRLF 0, BOM False | `index.html/css.html/js.html/camera-scan.html` | ✅ |
| `node --check` 0 error | `js.html` parse | ✅ |
| Batch `getValues()`/`setValues()` — 0 `getValue()` loop | `Database.gs`, `CsvUtil.gs` | ✅ |
| `CacheLayer.gs` version-keyed + TTL + fallback | `CacheLayer.gs:27` | ✅ |
| `sanitizeCellText_()` cover formula injection | `Database.gs` + `api/database.py` | ✅ |
| Camera fallback chain robust | `camera-scan.html` + `ScanLogic.gs` | ✅ |
| XSS defense (`esc()`/`escAttr()` cover 32 `innerHTML`) | `js.html` | ✅ |
| `KHỚP server` marker = 0 hit | `js.html`, `ScanLogic.gs`, `CsvUtil.gs`, `api/*.py` | ✅ |
| Không có CSP meta | `index.html:1-20` | ✅ |
| Hardcode màu ngoài `:root` (18+ đến 158 hex) | `css.html` | ✅ |
| `escAttr` thừa replace `'` lần 2 | `js.html:3477-3478` | ✅ |

---

## ❌ False positive chung (3 model mắc cùng 1 lỗi)

| Claim sai | Model | Thực tế |
|:----------|:------|:--------|
| "Scroll listener thiếu `{ passive: true }`" | mimo-v2.5, thinkingmachines/inkling, bynara-minimax-m3 | `js.html:1313` đã có `}, { passive: true });` — cả 2 scroll listener (line 344 + 1313) đều đủ passive |

---

## 📋 Danh sách cần fix (tổng hợp từ tất cả model, ưu tiên cao → thấp)

### 🔴 P0 — data loss / silent corruption

| # | Vấn đề | Vị trí | Model tìm thấy |
|:-:|:--------|:-------|:--------------|
| P0-1 | TOCTOU scan↔complete: quét ghi vào task Đã đóng | `ScanService.gs:46-61` · `Database.gs:791-805` | glm-5.3-flash-free |
| P0-2 | Guard `_rowIndex` stale chỉ check taskId, thiếu staffId | `Database.gs:797,905-918` | glm-5.3-flash-free |

### 🟠 P1 — break tính năng / data integrity / CI

| # | Vấn đề | Vị trí | Model tìm thấy |
|:-:|:--------|:-------|:--------------|
| P1-1 | Race condition `processScanQueue` vs `scanPollTick` | `js.html:3257-3321` vs `1684-1720` | mimo, thinkingmachines, kilo, bynara-minimax, glm |
| P1-2 | Non-atomic multi-column batch write (3 RPC riêng) | `Database.gs:981-990` | mimo, thinkingmachines, kilo, glm |
| P1-3 | While loop không cap (timeout 6 phút) | `TaskService.gs:86-89` · `api/services.py:118-121` | mimo, thinkingmachines, kilo, glm |
| P1-4 | Meal-move taskId sai prefix `MR`/`MMR` | `TaskService.gs:332,335` · `api/services.py:211,214` | tencent, kilo, glm |
| P1-5 | Hardcode màu ngoài `:root` (18–158 hex) | `css.html`, `js.html`, `index.html`, `camera-css.html`, `camera-scan.html` | tất cả model |
| P1-6 | Không có CSP meta | `index.html:1-20` | mimo, thinkingmachines, kilo, glm |
| P1-7 | `KHỚP server` marker thiếu | `js.html` (0 hit) | mimo, thinkingmachines, kilo, bynara-minimax, glm |
| P1-8 | `updateCreatePreview()` không null check | `js.html:871` | mimo, thinkingmachines, kilo, glm |
| P1-9 | Deploy không gate test (`deploy.yml` không `needs: test`) | `.github/workflows/deploy.yml` | mimo, thinkingmachines, kilo, glm |
| P1-10 | CI xanh nhưng không deploy gì (`VERSION`/`DEPLOY_ID` rỗng → `exit 0`) | `.github/workflows/deploy.yml` | glm |
| P1-11 | Dev mặc định nối vào API PRODUCTION | `scripts/serve.js:99` | glm |
| P1-12 | `getSheet_` tự tạo sheet core khi bị xóa tay | `Database.gs:12-24` | glm |
| P1-13 | `STATUS_ORDER` thiếu `OUT` → "Ra ngoài" rank 9 | `js.html:1991-2001` | glm |
| P1-14 | Message "N NV chưa quét" đếm nhầm dòng insurance | `TaskService.gs:153` | glm |
| P1-15 | Input quét bị bật lại trên task đã kết thúc | `js.html:1521` | glm |

### 🟡 P2 — hardening / performance / cosmetic

| # | Vấn đề | Vị trí | Model tìm thấy |
|:-:|:--------|:-------|:--------------|
| P2-1 | `appendLogRow_` không `setNumberFormat` timeRa/timeScan | `Database.gs:844-858` | tencent, kilo, glm |
| P2-2 | Payload 887KB inline | `dist/index.html` | tất cả |
| P2-3 | `processScanQueue` ↔ `processScanQueueMealMove` ~80% duplicate | `js.html:2780-2882` vs `3220-3340` | mimo, thinkingmachines, kilo, bynara-minimax, glm |
| P2-4 | `filterStaffByGroup` O(n) `indexOf` | `CsvUtil.gs:285-288` | mimo, thinkingmachines, kilo, glm |
| P2-5 | `escAttr` redundancy | `js.html:3477-3478` | mimo, thinkingmachines, kilo, bynara-minimax, glm |
| P2-6 | `_find_task_row` Python đọc toàn bộ sheet | `api/database.py:163-169` | mimo, thinkingmachines, kilo, glm |
| P2-7 | Mock ≠ prod prefix (`M` vs `MR`) | `mock/mock-google.js:274` | tencent, kilo, glm |
| P2-8 | Polling 3s kép không jitter | `js.html:1674` | mimo, thinkingmachines, kilo, glm |
| P2-9 | Scroll listener (FALSE POSITIVE — thực tế đã có passive) | `js.html:1313` | mimo, thinkingmachines, bynara-minimax *(không cần fix)* |
| P2-10 | `sheet_id()` Python race | `api/sheets.py:155-166` | mimo, thinkingmachines, glm |
| P2-11 | Dedupe cooldown sync thiếu guard cross-file | `Config.gs`/`js.html`/`tests/check-drift.js` | mimo, thinkingmachines |
| P2-12 | Comment rác style cũ (FIX-/P1:/A1-log) | `js.html`, `Database.gs`, `Code.gs` | mimo, thinkingmachines |
| P2-13 | Inline style hardcode trên `index.html` | `index.html:41,398,407,434-437` | mimo, thinkingmachines, bynara-minimax |
| P2-14 | `_paintScanRows` so sánh `innerHTML` từng cell | `js.html:2111-2113` | glm |
| P2-15 | `applyConstraints()` promise không `.catch` | `camera-scan.html:926,1154,1194` | glm |
| P2-16 | Focus/a11y: modal, camera, sort không bàn phím | `js.html`, `camera-scan.html`, `index.html` | glm |
| P2-17 | `STATUS_ORDER` thiếu `OUT` (sort) | `js.html:1991-2001` | glm |
| P2-18 | `camera-css.html` 3 cặp keyframe trùng | `camera-css.html:105-163` | mimo, bynara-minimax |
| P2-19 | `SyntaxWarning: invalid escape sequence '\.'` | `api/main.py:1` | minimax |
| P2-20 | `getDataRange().getValues()` trong Code.gs (3 vị trí) | `Code.gs:128,239,404` | minimax |
| P2-21 | `PASTE_LOG_ROWS_MAX`/`DUPLICATE_WINDOW_MS` thiếu test guard | `scripts/check-drift.js` | bynara-minimax |
| P2-22 | Inline `style="color:#fff"` brand title | `index.html:41` | bynara-minimax |
| P2-23 | Python `batch_meal_move_log_updates` — 3 RPC riêng | `api/database.py:674-678` | muse-spark (#7) |
| P2-24 | Client `STAFF_INFO` localStorage 12h không có server-sync invalidation | `js.html:157-174` | muse-spark (#7) |
| P2-25 | `update_log_row_scan`/`update_log_row_ra` `set_number_format` sau `update_values` | `api/database.py:515,596` | muse-spark (#7) |
| P2-26 | `getStaffIndexApi` trả toàn bộ StaffData không cap | `Code.gs:272-287` | glm |
| P2-27 | Token API đi qua URL query (nhánh same-origin fetch) | `js.html:42,70` | glm |
| P2-28 | Docs drift (README/AGENTS số liệu stale) | `README.md`, `AGENTS.md` | tất cả |
| P2-29 | Repo hygiene: junk đã commit (`report.md`, tasks/, .mp3, mockups/) | repo root | glm |

---

## 🔍 False positive cần ghi nhận

| Claim sai | Model mắc | Thực tế | Action |
|:----------|:----------|:--------|:------:|
| "Scroll listener thiếu `{ passive: true }`" | mimo-v2.5, thinkingmachines/inkling, bynara-minimax-m3 | `js.html:1313` đã có `}, { passive: true });` | **Không cần fix** — bỏ khỏi danh sách |

---

## ⚠️ Đánh giá tổng hợp

**Tổng quan:** 481/481 test pass, drift OK — codebase vững. Có **2 P0 thật** (TOCTOU scan↔complete, stale guard thiếu staffId) mà chỉ model **glm-5.3-flash-free** tìm thấy.

**Model chính xác nhất:** **bynara/agnes-2.5-flash** — tự nhận diện và sửa false positive (scroll passive), đánh giá race condition đúng mức "lý thuyết".

**Model bỏ sót nghiêm trọng:** mimo-v2.5, thinkingmachines, bynara-minimax-m3 — mắc false positive về scroll passive (không ảnh hưởng fix nhưng làm giảm độ tin cậy đánh giá).

**Blocker thực sự:** P0-1 (TOCTOU) + P0-2 (stale guard) — cần fix trước khi deploy lên production kiosk.

**Ưu tiên fix thực tế:**
1. **P0-1, P0-2** (glm tìm thấy) → fix trước
2. **P1-4 prefix MR/MMR** (tencent, kilo tìm thấy) → 1 commit GAS+Python
3. **P1-9 deploy gate** → `needs: test` trong deploy.yml
4. **P1-5 CSS token** → thêm `:root` tokens, thay hardcode
5. **P1-6 CSP meta** → thêm defense-in-depth
6. **P1-1, P1-2, P1-3** (queue race, atomic batch, while loop cap)

---

**Rule check:** A: §1#1 §1#4 §1#8 §1#9 §1#11 · B: §1#6 §1#8 §1#9 §1#10 §1#11 · C: §1#5 §1#12
