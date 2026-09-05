# Báo cáo tổng hợp — Kiểm chứng 17 đánh giá trong kiemtra.md

**Model thực hiện:** muse-spark-1.3-contributor-free
**Ngày:** 2026-09-05 (UTC)
**Nguyên tắc:** Chạy test độc lập trước, đối chiếu code hiện tại + commit fix `2d1c066` (29 findings đã được maintainer xác nhận fix ngày 2026-08-29 23:06), không sửa code, chỉ liệt kê fix để user duyệt. File này ghi mới vào `report.md` đang trống (0 dòng) nên không đè dữ liệu cũ.

## 1. Kết quả test độc lập (evidence thật, vừa chạy)

| # | Lệnh | Kết quả | Evidence |
|---|---|---|---|
| 1 | `npm test` | **389/389 PASS, 0 FAIL** | `tests 389 pass 389 fail 0 duration ~7854ms`, 30 file |
| 2 | `npm run test:py` | **87/87 OK** | `Ran 87 tests OK 0.452s`, traceback `RuntimeError secret path /home/abc` là test cố ý (`api/main.py:91`) |
| 3 | `npm run build:local` | **OK** | `index.local.html built`, 887490 byte |
| 4 | `npm run test:chrome` | **12/12 PASS** | Chrome `/usr/bin/google-chrome` headless, mock load → 30 rows → openScan 6 rows S:3 A:3 E:1 → Ops229444 S+1 → trùng không tăng → lạ E+1 → backToList → paste meal-move |
| 5 | `node scripts/check-drift.js` | **OK** | ScanLogic ↔ scanlogic + Config ↔ config đồng bộ |

**Tổng hiện tại: 389 + 87 + 12 = 488 PASS.** Chuẩn đối chiếu:
- Báo cáo 2026-08-29 ghi `368+85+11=464` là **đúng tại thời điểm đó** (pre-fix, trước commit `2d1c066` thêm +10 JS test pipeline +1 chrome paste test).
- Báo cáo 2026-09-05 ghi `389+87+12=488` là **đúng hiện tại**. `AGENTS.md §19` + `README` vẫn ghi `384+85+12=481` là **lỗi thời** (xem mục 4, P2-1).

Kiểm chứng bổ sung (đọc/grep trực tiếp, không dựa báo cáo cũ):
- `esc()` (`js.html:3478-3482`) nay đã escape `'` (có comment FIX-14) → các báo cáo cũ nói "thiếu" là đúng THEN, nay đã fix.
- `get_service()` (`api/sheets.py:46-62`) nay đã double-checked locking (comment FIX-09) → đúng THEN, nay đã fix.
- `updateLogRowScan_/Ra_` (`Database.gs`) nay đã verify taskId + `setNumberFormat HH:mm:ss` (FIX-03/FIX-10) → đúng THEN, nay đã fix.
- `zxingDecodeImageData` (`camera-scan.html:2097-2101`) nay đã try/catch per-call (FIX-01) → đúng THEN, nay đã fix.
- `hmac.compare_digest` (`api/main.py:138`) nay đã `.encode("utf-8")` (FIX-04) → đúng THEN, nay đã fix.
- `update_task_status` (`api/database.py:141-156`) nay đã 1 RPC 4 cột (FIX-05) → đúng THEN, nay đã fix.
- `cachedJsonRev_` (`CacheLayer.gs:46-62`) nay đã đọc revBefore/revAfter (FIX-06) → đúng THEN, nay đã fix.
- `overwriteStaffData_` (`Database.gs:906-932`) nay đã lock + ghi-trước-xóa-sau (FIX-02) → đúng THEN, nay đã fix.
- `findChrome()` (`scripts/test-local-mock.js:39-63`) nay đã detect puppeteer cache + waitUntil (FIX-13) → đúng THEN, nay đã fix.
- `hasScan` (`Database.gs:417`) nay đã `toEpochSafe_>0` (FIX-17) → đúng THEN, nay đã fix.
- `scanInput paste` (`js.html:251`) + dedup `(mode,code)` (`camera-scan.html:2665`) nay đã có (FIX-15/FIX-27) → đúng THEN, nay đã fix.
- Còn tồn tại: `Database.gs:917` vẫn `thử lại sync` (lệch 1 từ), `css.html` 222 hex ngoài `:root` (169 điểm không tính #fff/#000, 72 màu riêng), `js.html` 525 `var`/0 `let/const`, 48+45 query trực tiếp vs 151 `byId()`, 33 `innerHTML` vs 66 `textContent`, `STAFF_INFO` cache 12h không version (`js.html:156-174`), `api/main.py` không CORS header.

## 2. Bảng xếp hạng % đúng (cao → thấp)

Chấm theo: Test đúng 30đ (số liệu khớp baseline tại thời điểm báo cáo) + Recall bug thật 50đ (số FIX trong `2d1c066` tìm được) + Precision 20đ (trừ false-positive, số liệu sai, copy-paste).

| Hạng | Model (như ghi trong kiemtra.md) | Ngày | % đúng | Tóm tắt |
|---|---|---|---|---|
| 1 | glm-5.3-flash-free (GLM) | 2026-08-29 | **96%** | Duy nhất tìm P0 ladder-death + 8 Important, có chạy lib thật verify |
| 2 | bynara/deepseek-v4-flash | 2026-08-29 | **90%** | 3 unique confirmed (poll-race, dedup mode, token) + nêu rõ cái KHÔNG phải bug |
| 3 | nemotron-3-ultra-free (Sept #7) | 2026-09-05 | **88%** | Post-fix chính xác nhất: 488 đúng, 6 P2 còn tồn tại, số liệu hex gần đúng |
| 4 | poolside/laguna-s-2.1:free (Sept #32) | 2026-09-05 | **88%** | 8 P2 + phân tích stampede sâu, số liệu var/DOM chuẩn |
| 5 | agnes-2.5-flash | 2026-08-29 | **86%** | 2 unique confirmed (hasScan-epoch, paste-listener) + log-limit |
| 6 | muse-spark-1.2-contributor-free | 2026-08-29 | **84%** | 16 bug/O chi tiết, thành thật FAIL→PASS chrome, miss P0 |
| 7 | meituan/longcat-2.0-free | 2026-08-29 | **83%** | 20 bug sâu (mock-epoch, bump-rev), vài P2 overstated |
| 8 | kilo/poolside/laguna-s-2.1:free (Aug #7) | 2026-08-29 | **82%** | Cân bằng 10 bug, giải thích chrome install rõ, miss P0 |
| 9 | minimax/minimax-m3:free (Aug) | 2026-08-29 | **81%** | 10 bug chắc (race, format, esc, sleep), miss P0 |
| 10 | mimo-v2.5-free | 2026-08-29 | **78%** | Đúng nhưng nông (thread-safety, thiếu behavioral), miss P0 |
| 11 | stepfun/step-3.7-flash:free (Aug #5) | 2026-08-29 | **76%** | Tốt nhưng false-positive event-leak + type-hints overstated |
| 12 | stepfun/step-3.7-flash:free (Sept #11) | 2026-09-05 | **75%** | 7 P2 đúng hướng nhưng số hex sai (172 vs 240) |
| 13 | phi-1-codestral-22b | 2026-08-29 | **72%** | Mỏng, 1 unique (paste-test) + format, còn lại generic |
| 14 | minimax/minimax-m3:free (Sept #8) | 2026-09-05 | **70%** | Sai số học 481≠488, :root 39≠34, P1 overstated |
| 15 | kilo/nvidia/nemotron-3-ultra-550b-a55b:free | 2026-08-29 | **62%** | Copy nguyên văn báo cáo stepfun Aug, vi phạm độc lập |
| 16 | Inkling (thinkingmachines/inkling:free) | 2026-08-29 | **55%** | Báo "không bug", bỏ sót toàn bộ P0/P1 |
| 17 | kilo/nvidia/nemotron-3.5-lightning:free | 2026-08-29 | **35%** | Chỉ 8 dòng, không liệt kê bug, không evidence |

## 3. Chi tiết đúng/sai từng model (theo thứ tự xuất hiện trong kiemtra.md)

### 3.1 mimo-v2.5-free (2026-08-29) — 78%
- **Đúng:** Test 368/85/11=464 khớp pre-fix. P1 #1 sheets race (FIX-09 confirmed). P1 #2-3 thiếu behavioral test (FIX-07 confirmed, sau này thêm `scan-pipeline.test.js`). P2 FIFO 1-key (FIX-22), sleep magic + ws fallback (FIX-13), version race (FIX-06 liên quan).
- **Sai/thiếu:** Bỏ sót toàn bộ P0 (FIX-01/02/03). #8 indentation, #9 trùng lặp, #10 `pass` là cosmetic, không phải bug. Không chạy chrome fix env (báo PASS 11/11 trong khi muse chứng minh cần CHROME_PATH).

### 3.2 muse-spark-1.2-contributor-free (2026-08-29) — 84%
- **Đúng:** Test thành thật nhất (FAIL 8/11 → PASS sau CHROME_PATH + wait 4500/1500). BUG-001/002 chrome path+sleep (FIX-13). BUG-003/004 getDataRange (FIX-21). BUG-006 esc (FIX-14). BUG-007 lock-retry (FIX-16). BUG-008 drift (FIX-23). BUG-009 CDN (FIX-24). BUG-010 mock-epoch (FIX-12). BUG-013 paste-max (FIX-29).
- **Sai/thiếu:** BUG-005 traceback noise (test cố ý, không phải bug). BUG-011 839K nặng (info, không phải bug). BUG-016 `node --check js.html` (hiểu sai, file .html không check kiểu đó). Miss P0.

### 3.3 Inkling (2026-08-29) — 55%
- **Đúng:** Test số đúng. D1-D5 kiến trúc mô tả đúng. Lock 10s, payload lớn là rủi ro thật.
- **Sai/thiếu:** Kết luận "không bug chức năng" là **sai** (bỏ sót P0 ladder-death, stale-row, StaffData-blank — cả 3 đã được FIX-01/02/03 xác nhận). B2 nói kiemtra/report bị xóa là nhiễu ngoài scope. Không có file:line cụ thể cho bug.

### 3.4 nemotron-3.5-lightning:free (2026-08-29) — 35%
- **Đúng:** Test số đúng (368/85/11).
- **Sai/thiếu:** Không liệt kê bug nào có file:line. #6 secret-path (test cố ý). #7-8 là nhận xét chung, không verify. Giá trị kiểm chứng gần như 0.

### 3.5 minimax-m3:free (2026-08-29 lần 1) — 81%
- **Đúng:** Test đúng + evidence chi tiết. BUG-01 race (FIX-09). BUG-02/03 getDataRange (FIX-21). BUG-04 thiếu format (FIX-10). BUG-05 esc (FIX-14). BUG-06 lock (FIX-16). BUG-07 mock OR lỏng (FIX-12). BUG-08 sleep (FIX-13).
- **Sai/thiếu:** BUG-09 var-hoisting (đúng code nhưng không phải bug hành vi). BUG-10 spreadsheet rỗng (setup-time, không phải runtime). Miss P0.

### 3.6 stepfun-3.7-flash:free (2026-08-29 #5) — 76%
- **Đúng:** Test đúng. #1-2 chrome (FIX-13). #3 header-migration (FIX-20, đã verify comment BUG 2026-08-20 trong code). #5 lock, #6 getDataRange, #7 setValue, #10 FIFO, #11 CDN, #12 mock — đều confirmed.
- **Sai/thiếu:** #4 "20+ listener = memory leak" là **overstated** — kiosk SPA listener trên window/document sống cùng app lifetime, hiện 28 add/0 remove là bình thường, không phải leak (không có trong FIX list). #9 "thiếu type hints toàn bộ" overstated (FIX-26 chỉ thêm cho scanlogic). Miss P0.

### 3.7 nemotron-3-ultra-550b-a55b:free (2026-08-29 #6) — 62%
- **Đúng:** Nội dung đúng như stepfun (vì copy).
- **Sai:** **Copy nguyên văn** từng bảng/câu của 3.6 (so sánh dòng 599-680 vs 708-793 trùng 100%), vi phạm yêu cầu "không đọc đánh giá trước". Điểm trừ liêm chính, dù nội dung gốc 76%.

### 3.8 longcat-2.0-free (2026-08-29) — 83%
- **Đúng:** Test đúng. BUG-001 race (FIX-09). BUG-002 mock-status-vs-epoch sâu (đúng, FIX-12 đã thêm epoch cho Dư). BUG-003/004 2-RPC (FIX-05). BUG-005 FIFO, BUG-008 drift, BUG-009 lock, BUG-011/012 chrome, BUG-015 esc, BUG-016 paste-max, BUG-020 innerHTML — đều confirmed/liên quan FIX.
- **Sai/thiếu:** BUG-006 bump_rev race + BUG-007 sentinel-collision là **lý thuyết hiếm** (không có trong FIX, thực tế cached value không phải dict `{"v":..}`), overstated P2. Đánh 20 bug toàn P2 làm mờ ưu tiên. Miss P0.

### 3.9 laguna-s-2.1:free (2026-08-29 #7) — 82%
- **Đúng:** Test đúng + giải thích cài Chrome rõ nhất. BUG-01 race, BUG-02 thiếu behavioral (FIX-07), BUG-03 esc, BUG-04 format, BUG-05 lock, BUG-07 FIFO, BUG-08 drift, BUG-10 chrome-path — đều confirmed.
- **Sai/thiếu:** BUG-06 sheet_id-cache + BUG-09 sleep là đúng nhưng nhẹ. Miss P0 (không thấy ladder-death dù đã đọc camera-scan).

### 3.10 deepseek-v4-flash (2026-08-29) — 90%
- **Đúng:** Test đúng. BUG-001/002 poll-race (FIX-08 confirmed, sâu: `scanBusy` + `lastScanPollSig`). BUG-003 dedup `(mode,code)` (FIX-15 confirmed, duy nhất ngoài GLM). BUG-004 token-rỗng anonymous-write (FIX-18 confirmed, duy nhất). Mục 3.2 nêu rõ 4 cái KHÔNG phải bug (recount EXTRA, OUT counters, sanitize, JSONP) — **đúng hết** (đã đối chiếu code). Chất lượng > số lượng.
- **Sai/thiếu:** BUG-005 atomic-comment + BUG-006 dispatch-args + BUG-007 note-XSS là nhẹ/future-risk, không trong FIX chính. Bỏ sót P0 ladder (không chạy lib thật như GLM).

### 3.11 agnes-2.5-flash (2026-08-29 #8) — 86%
- **Đúng:** Test đúng. BUG-017 `hasScan=!!cell` vs epoch (FIX-17 confirmed, duy nhất). BUG-018 thiếu paste-listener (FIX-27 confirmed, duy nhất). BUG-022 log-limit (FIX-29). BUG-021 CDN, BUG-023 version-race (FIX-06 liên quan), BUG-024 sheets-race — đều đúng.
- **Sai:** BUG-019/020 gọi 2 `setValue` đơn là "vi phạm Hard Constraint #3" là **sai** — luật cấm loop, còn 2 điểm này ngoài loop (`Database.gs:111` tạo cột note, `:315` ghi note 1 task) nên không vi phạm (đã verify, Sept reports cũng xác nhận "ngoài loop — không vi phạm").

### 3.12 phi-1-codestral-22b (2026-08-29 #9) — 72%
- **Đúng:** Test đúng. BUG-027 thiếu format update-path (FIX-10). BUG-028 thiếu paste-test chrome (FIX-28, duy nhất, sau này thêm check 12).
- **Sai/thiếu:** BUG-025 constants phân tán + BUG-026 showToast-innerHTML là generic maintainability, không trong FIX, giá trị thấp. Bỏ sót P0/P1 lớn.

### 3.13 GLM glm-5.3-flash-free (2026-08-29 #10) — 96%
- **Đúng:** Test đúng. BUG-029 ladder-death (FIX-01, **duy nhất**, có chạy `@zxing/library@0.20.0` chứng minh throw vs null + chỉ ra mock test sai). BUG-033 hmac non-ASCII (FIX-04, có chạy `compare_digest` chứng minh TypeError). BUG-034 2-RPC (FIX-05). BUG-035 TOCTOU (FIX-06). BUG-036 StaffData-blank (FIX-02). BUG-037 wrong-row (FIX-03). BUG-030/031/032 client-race (FIX-08/FIX-11). BUG-038/039 OCR-dead (FIX-19). O-29..O-44 đa số khớp FIX-19..29.
- **Sai/thiếu:** Rất ít. BUG-040 `res.message` null-guard + BUG-041 refresh-timeout là micro, chưa chắc trigger thật. Nhưng có file:line + trích code nên vẫn giá trị.

### 3.14 stepfun Sept #11 (2026-09-05) — 75%
- **Đúng:** Test 389/87/12=488 + drift OK là đúng hiện tại. P2-5 env-puppeteer, P2-6 var, P2-7 byId là đúng hướng (đã verify).
- **Sai:** P2-1 đếm "172 hex, còn 124 riêng" là **sai số** (đo thật 240 total, 222 ngoài root, 169 không tính trắng/đen). Không phát hiện docs-lỗi-thời (481 vs 488). Mỏng hơn 2 báo cáo Sept cùng ngày.

### 3.15 laguna Sept #32 (2026-09-05) — 88%
- **Đúng:** Test 488 + drift đúng. P2-2 docs-lỗi-thời (đúng, AGENTS vẫn 481). P2-3 hex (222 ngoài root, 74 màu — đo thật 222/72, gần đúng). P2-4 525 var, P2-5 93 query, P2-6 33 innerHTML — **đúng hết**. P2-1 stampede phân tích 5 bước grep, đúng kỹ thuật (CacheLayer 0 lock).
- **Sai nhẹ:** P2-1 gọi stampede P2 là hơi overstated (GAS execution cách ly, CacheService distributed, worst-case chỉ rebuild thừa mỗi 5 phút, không crash). P2-8 `M AGENTS.md` là trạng thái git local, không phải bug.

### 3.16 minimax Sept #8 (2026-09-05 07:39) — 70%
- **Đúng:** Phát hiện `Database.gs:917` thừa từ "sync" là đúng file:line (vẫn tồn tại). Python warning, spacing, signature-thiếu-total, STAFF-cache là đúng hướng.
- **Sai:** Tổng "481 test pass (389+87+12)" là **sai số học** (phải 488). `:root` 39 token là **sai** (đo thật 34). "122 hit hex, 94 vi phạm" sai (thật 222/169). Gọi LOCK_BUSY P1 là overstated (editor-only `syncFromCsv`, không phải scan-path). R10/R11 vi phạm #9 đếm gộp cả ngoại lệ cho phép.

### 3.17 nemotron Sept #7 (2026-09-05) — 88%
- **Đúng:** Test 488 + drift đúng. P2-1 docs (481 vs 488) đúng. P2-2 hex "222 ngoài root, 169 điểm/74 màu" **gần đúng nhất** (thật 222/169/72). P2-3 500 var (thật 525, lệch 5%), P2-4 88 query (thật 93), P2-5 innerHTML — đều đúng hướng.
- **Sai nhẹ:** 500 vs 525, 88 vs 93 là lệch đếm nhỏ. Chưa đề xuất thứ tự fix rõ như laguna Sept.

## 4. Cái cần fix (đề xuất để user duyệt — chưa sửa code)

Ưu tiên theo giá trị/rủi ro, mỗi dòng 1 issue khi duyệt xong (luật #5: 1 issue = 1 commit).

| # | Sev | Vấn đề | Vị trí | Đề xuất | Sức nặng |
|---|---|---|---|---|---|
| F-01 | 🟡 P2 | Docs đếm test lỗi thời (luật #10) | `AGENTS.md §19`, `README.md`, `package.json:8` | Sync `384+85+12=481` → `389+87+12=488`; thêm `test:all` chạy cả 3 | Thấp, 1 commit docs |
| F-02 | 🟡 P2 | Màu hardcode ngoài `:root` (luật #9) | `css.html` 169 điểm/72 màu (`#ee4d2d`×12, `#8b98ab`×12, `#ff8a5c`×11…) | Đưa màu dùng lại vào `:root`, audit về 0 ngoài `#fff/#000`/fallback | TB, tách 2-3 commit (header/table/badge/modal) |
| F-03 | 🟡 P2 | 525 `var`, 0 `let/const` | `js.html` | Migration `var`→`let/const` theo block/loop, không đổi behavior | TB, làm dần |
| F-04 | 🟡 P2 | 88-93 query trực tiếp bypass `byId()` cache | `js.html` (`getElementById` 48 + `querySelector` 45 vs `byId(` 151) | Dùng `byId()` trong poll/render 3s | Thấp |
| F-05 | 🟡 P2 | 33 `innerHTML` (dù đã `esc`) vs 66 `textContent` | `js.html` | Chuyển text thuần sang `textContent`, giữ `innerHTML` chỉ cho template tĩnh đã esc | Thấp |
| F-06 | 🟡 P2 | `document.write` còn lại (deprecated) | `js.html:123` mock fallback (đã guard `readyState`) | Đổi `createElement('script')+appendChild` | Thấp |
| F-07 | 🟡 P2 | LOCK_BUSY_MSG thừa từ "sync" | `Database.gs:917` vs chuẩn 9 chỗ còn lại + `api/services.py:28` | Đổi thành `Hệ thống đang bận — thử lại sau giây lát` | 1 dòng |
| F-08 | 🟡 P2 | STAFF cache 12h không version | `js.html:156-174` (`rc2_staffIndex` + `rc2_staffIndexTs`) | Thêm version từ server meta hoặc giảm TTL (vd 30 phút) | Thấp |
| F-09 | 🟡 P2 | Cache stampede khi TTL hết đồng loạt | `CacheLayer.gs:27,49` (0 lock) + `Config.gs:128` TTL 300s | Bọc rebuild trong `LockService` + double-check (chỉ 1 rebuild), mirror Python nếu cần | TB |
| F-10 | ⚪ P3 | Thiếu CORS cho JSON non-cb | `api/main.py:140-180` | Thêm `Access-Control-Allow-Origin` cho nhánh JSON (hiện JSONP cover nên chưa chặn) | Thấp |
| F-11 | ⚪ P3 | `scanDetailSignature` thiếu `total` | `js.html:1645` (`parts` có scanned/absent/extra/out, thiếu total) | Thêm `c.total\|\|0` để poll không bỏ re-render khi reopen | 1 dòng |

Không đề xuất sửa ngay: event-listener "leak" (SPA lifetime, không phải leak), `setValue` đơn ngoài loop (không vi phạm luật #2), 839K payload (build artifact, không ảnh hưởng GAS), `ws` fallback (đã có `WebSocket` global Node 22+).

## 5. Cách kiểm chứng (đã chạy)

```bash
npm test                # 389 pass 0 fail
npm run test:py         # 87 OK (traceback cố ý)
npm run build:local     # 887490 byte
npm run test:chrome     # 12/12 PASS
node scripts/check-drift.js  # OK
python3 -c "grep esc/js.html, sheets.py lock, Database verify, camera FIX-01, main.py encode, css hex/var counts"
git show 2d1c066 --stat # 29 findings đã fix, dùng làm ground-truth chấm recall
```

**Rule check:** A: §1#4 (verify thật, không claim suông) §1#11 (grep SSOT trước khi kết luận) · B: §1#6 (mỗi dòng liên quan request) §1#8 (không comment rác) · C: sẽ kiểm `git log --stat` sau commit report.

*Báo cáo do **muse-spark-1.3-contributor-free** tạo — chỉ đánh giá + chạy test, không sửa code nguồn. Fix mục 4 chờ user duyệt từng cái.*
