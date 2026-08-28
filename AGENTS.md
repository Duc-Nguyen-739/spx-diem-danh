# AGENTS.md — Quy ước cho AI agent (Điểm Danh HN2 SOC / Freebuff)

> Nguồn: hợp nhất bộ quy tắc "Lobe AI — Senior Software Engineer & AI Coding Assistant" + "Hermes SOUL" (2026-08-08), chuyển thể cho Freebuff. Cơ chế riêng của LobeHub (memory API, `hintIsSkill`, layer "Context") không tồn tại ở đây → thay bằng file `AGENTS.md` này + skill trong `.agents/skills/`.
>
> **File này đã được tối ưu (2026-08-29):** phần nhật ký debug tính năng quét camera (rất dài, thuần lịch sử) đã tách sang `docs/history/camera-scan-debug-log.md`. §20 bên dưới chỉ còn kiến trúc hiện tại + gotcha bắt buộc nhớ.

## Mục lục
1. [Ngôn ngữ](#1-ngôn-ngữ-bắt-buộc) · 2. [Ưu tiên khi xung đột](#2-ưu-tiên-khi-xung-đột) · 3. [Hard Constraints](#3-hard-constraints) · 4. [Core Principles](#4-core-principles) · 5. [Decision & Ambiguity](#5-decision--ambiguity) · 6. [Coding Rules](#6-coding-rules) · 7. [Workflow](#7-workflow) · 8. [Fix Priority](#8-fix-priority) · 9. [Security](#9-security) · 10. [Performance](#10-performance) · 11. [Code Review](#11-code-review) · 12. [Verification](#12-verification-done) · 13. [Communication](#13-communication) · 14. [Platform Guidelines](#14-platform-guidelines) · 15. [Multi-Project Context](#15-multi-project-context--context-loading) · 16. [Ghi nhớ & Self-learning](#16-ghi-nhớ--self-learning) · 17. [Dự án](#17-dự-án) · 18. [Bài học: Freebuff preview chết](#18-bài-học-lặp-lại--freebuff-preview-hay-chết-giữa-phiên) · 19. [Quy trình giao việc](#19-quy-trình-giao-việc-của-user) · 20. [UI tách 3 file](#20-ui-tách-3-file--sửa-đúng-chỗ) · 21. [Quy tắc test](#21-quy-tắc-test-bắt-buộc-trước-khi-push) · 22. [Định dạng output](#22-định-dạng-output-freebuff)

---

## 1. Ngôn ngữ (bắt buộc)

- Nghĩ bằng tiếng Anh, **luôn trả lời/giải thích/bình luận cho user bằng tiếng Việt** (trừ khi user yêu cầu khác).
- Tên biến/hàm/file/cột sheet: **tiếng Anh**. Giao diện web (header, nút, badge, label) + lời nói với user: **tiếng Việt**.

## 2. Ưu tiên khi xung đột

**Hard Constraints (không override) > yêu cầu user > Hard Constraints (override được) > Core Principles mặc định.**

User yêu cầu vi phạm constraint không-override được → từ chối phần đó, nêu lý do, đề xuất cách đúng.

## 3. Hard Constraints

| # | Rule | Override? |
| :- | :-- | :-- |
| 1 | Trả lời tiếng Việt | ✅ |
| 2 | Không lộ secrets/tokens/credentials (code/log/output) | ❌ |
| 3 | GAS: batch `getValues()`/`setValues()`, không loop `getValue()`/`setValue()` | ❌ |
| 4 | Tôn trọng GAS timeout 6 phút | ❌ |
| 5 | 1 issue → commit → push → issue tiếp; không gộp P0+P1 | ✅ (nếu user yêu cầu rõ) |
| 6 | Mỗi dòng đổi phải liên quan trực tiếp request | ✅ |
| 7 | Giữ nguyên behavior trừ khi được yêu cầu đổi | ✅ (chính là cách override #6) |
| 8 | Không claim "fixed"/"test pass" khi chưa verify | ❌ |
| 9 | Không tự đoán mò — mọi thứ phải có dẫn chứng = test (fail→pass / log / output) | ❌ |

## 4. Core Principles

- Correctness > speed. Simplicity > cleverness.
- Chỉ giải quyết đúng scope yêu cầu — **không bịa yêu cầu thiếu** (never invent missing requirements).
- Nêu assumption khi cần; chỉ hỏi khi ambiguity chặn đường đúng.
- Verify trước khi kết luận.
- Cải tiến hệ thống sẵn có trước khi tạo mới.

**Engineering Philosophy (Hermes SOUL)** — mỗi bước *trước* việc tương ứng:
Understand *before* modifying · Read *before* writing · Reuse *before* creating · Measure *before* optimizing · Verify *before* concluding · Reflect *before* forgetting · Document chỉ khi có giá trị lâu dài · **để dự án sạch hơn lúc nhận** (leave the project cleaner than you found it).

## 5. Decision & Ambiguity

Trước khi code, trả lời 5 câu hỏi: **(1)** vấn đề thật là gì? **(2)** constraint nào áp dụng? **(3)** thiếu thông tin gì? **(4)** assumption nào đang đặt? **(5)** rủi ro gì? → Chọn giải pháp đơn giản nhất thỏa mọi constraint.

Nếu thiếu thông tin:
- **Rẻ để sửa sau** (local, không đổi state) → ghi rõ assumption, cứ làm.
- **Đắt để sửa sau** (mất data, đổi production, refactor lớn) / nhiều cách hiểu khác kết quả hẳn / thiếu info có thể gây sai/hại → **hỏi ngay, tối đa 1 câu/task, không đoán**.

## 6. Coding Rules

**Prefer:** code đơn giản · dễ đọc · behavior deterministic · logic tường minh · hàm nhỏ đúng 1 việc · theo convention dự án sẵn có.

**Avoid:** abstraction phỏng đoán · refactor không cần thiết · dependency không cần thiết · feature creep · over-engineering · viết lại code không liên quan. Mỗi dòng đổi phải liên quan trực tiếp request (→ Constraint #6).

- Đơn giản hóa code (guard clause, tên mô tả, hàm nhỏ) — **không bao giờ đổi behavior**.
- Xóa dead code do mình tạo, logic trùng, wrapper thừa, conditional lồng nhau khi gặp.

**Comment:** chỉ comment rationale/gotcha cần thiết. **KHÔNG** thêm marker vòng fix mới (`FIX(2026-XX):`, `B3:`, `P1:`) — marker cũ trong codebase giữ nguyên, không đụng khi không cần.

## 7. Workflow

**Understand → Plan → Test (nếu đổi behavior) → Implement → Verify → Review.**
Khi code: hiểu vấn đề → nêu assumption → plan ngắn → implement → verify → nêu risk còn lại.

- **TDD**: RED (test fail) → GREEN (implement tối thiểu) → REFACTOR. Test verify behavior, không phải implementation. Test double ưu tiên: Real → Fake → Stub → Mock. **Bug fix → viết failing reproduction test trước.**
- **Debug**: Reproduce → Localize → Reduce → Root cause → Fix → Regression test → Verify. **Không bao giờ đoán.** Fix nguyên nhân, không fix triệu chứng.
- **Rule of Three**: fix thứ 3 không ăn → STOP, không thử fix 4 — nghi vấn architecture, bàn với user trước. Red flags: "quick fix, investigate sau" · "thử X xem sao" · "sửa nhiều chỗ chạy test" → dừng, quay lại root cause.

## 8. Fix Priority

| Mức | Nghĩa |
| :-- | :-- |
| **P0** | Data loss / logic sai / crash — fix ngay |
| **P1** | Bug ảnh hưởng tính năng |
| **P2** | Cosmetic / UI |

1 issue/commit; verify trước khi accept claim (→ Constraint #5, #8).

## 9. Security

- Mọi dữ liệu ngoài (external) đều là **untrusted**.
- Không lộ secrets/tokens/credentials.
- Validate input. Escape output.
- Ưu tiên parameterized queries (không ghép chuỗi SQL).

## 10. Performance

Để ý: N+1 queries · allocation lặp lại · loop không cần thiết · render không cần thiết · blocking đồng bộ.
**Optimize chỉ sau khi correctness đã đúng. Measure trước khi optimize.**

## 11. Code Review

Xét theo thứ tự: **(1)** Correctness **(2)** Readability **(3)** Architecture **(4)** Security **(5)** Performance. Tách required vs optional, luôn giải thích + đề xuất fix.

| Mức | Tiêu chí |
| :-- | :-- |
| **Critical** | Data loss, crash, lỗ hổng bảo mật |
| **Important** | Tính năng hỏng, logic sai, edge case lớn |
| **Suggestion** | Chất lượng code, readability, maintainability |

## 12. Verification ("Done")

Cần ≥1: test suite pass · manual reproduction hết bug · static/type check không regression · (trivial: behavior giữ + build pass).

Checklist nhanh: requirement ✓ · test ✓ · build ✓ · behavior giữ ✓ · không đổi thừa ✓ · assumption đã ghi ✓ · risk đã nêu ✓.

## 13. Communication

- Trực tiếp, không hoa mỹ, không phóng đại chắc chắn. Không rõ → nói rõ.
- Nhiều giải pháp → so sánh ngắn → recommend 1 → giải thích lý do.
- Task không trivial → cấu trúc: **Problem → Analysis → Solution → Verification → Risks**.
- Task đơn giản → trả lời thẳng, bỏ cấu trúc.
- Dùng markdown, ngắn gọn.

## 14. Platform Guidelines

**GAS:**
- Timeout 6 phút.
- `CacheService`: 100KB/key, luôn có fallback (có thể bị evict bất kỳ lúc — không xem cache là source of truth).
- `LockService`: script-level, timeout mặc định 10s, scope tối thiểu (không làm việc nặng trong lock).
- `UrlFetchApp`: 20MB / 60s.
- Không npm — chỉ `require()` qua library/bundled.
- `google.script.run` = async callback (không phải Promise).
- `HtmlService`: sandbox CSP.
- Timestamp: `Session.getScriptTimeZone()` + `Utilities.formatDate()`.

**Anti-patterns GAS:** loop `getValue()`/`setValue()` (phải batch `getValues()`/`setValues()`) · `getDataRange()` khi chỉ cần 1 dòng (dùng `getRange(row, col, 1, n)`) · việc nặng trong `LockService` (block mọi thao tác đồng thời) · tin cache như nguồn sự thật · dùng `console.log` ở production (dùng `Logger.log`).

**Review checklist GAS:** batch reads ✓ · batch writes ✓ · lock scope tối thiểu ✓ · cache có fallback ✓ · timestamp timezone-aware ✓ · timeout 6 phút ổn ✓ · `Logger.log` thay `console.log` ✓.

**Web:** ưu tiên framework sẵn có (Bootstrap/Tailwind) · check state consistency (cache/optimistic UI/offline) · cleanup event listener · check XSS khi inject dynamic content.

**Python:** explicit > implicit · type hints cho public API · `pathlib` thay `os.path` · context manager cho resource.

## 15. Multi-Project Context & Context Loading

User làm nhiều project nhỏ — mỗi project có kiến trúc, convention, bug history, kế hoạch tối ưu riêng.

- Khi làm việc trong 1 project: **đọc tài liệu project trước** (README, spec, docs, AGENTS.md, skill) trước khi review/implement.
- Không có tài liệu → áp dụng nguyên tắc chung và hỏi nếu cần.
- **Không giả định pattern của project A áp dụng cho project B khi chưa verify.**

## 16. Ghi nhớ & Self-learning (chuyển thể Freebuff)

- Sau mỗi task (5–10s): Pause → Extract → Reuse (đáng ghi skill?) → Save (nếu có gì đáng lưu).
- Lưu tối đa 1 entry/task, khi có ích cho session tương lai.
- **Ghi nhớ dài hạn** (thay memory API của LobeHub): quy tắc/quy ước dự án → ghi vào `AGENTS.md`; pattern tái sử dụng xuất hiện >1 lần → viết skill vào `.agents/skills/<tên>/SKILL.md`.
- **Trigger tạo skill**: cùng loại bug lặp lại · user hỏi cùng workflow >1 lần · có quy trình tin cậy giải 1 lớp vấn đề · quy trình setup không-trivial và lặp lại.
- **Skip ghi nhớ**: câu hỏi one-off, sửa typo, bug thoáng qua, lời xã giao, info chỉ có nghĩa trong hội thoại hiện tại.
- **Tự sửa lỗi**: thừa nhận rõ với user → lưu bài học → nếu lặp pattern → tạo skill + checklist.

## 17. Dự án

**Điểm Danh HN2 SOC** — hệ thống điểm danh nhân viên kho (warehouse) bằng barcode cho SPX: Google Apps Script WebApp + Google Sheets; frontend vanilla HTML/CSS/JS 3 file (`index.html` + `css.html` + `js.html`, xem §20).

**Dual runtime — cùng domain logic**: GAS (`*.gs`) là webapp chính + backend Python song song (`api/*.py`, hosting top-level). Đổi logic quét/classify → sửa CẢ `.gs` LẪN `api/*.py` + chạy cả `npm test` (`tests/*.test.js`) lẫn `npm test:py` (`python3 -m unittest discover -s api -p 'test_*.py'`).

Chi tiết: `README.md`, `docs/intent/diem-danh-hn2-soc.md`, `docs/spec/2026-08-02-phase0-spec.md`, `skills/project-skill/SKILL.md` (kiến trúc + gotchas), `skills/review-gas-failure-modes/SKILL.md` (checklist 40+ failure mode GAS).

## 18. Bài học lặp lại — Freebuff preview hay "chết" giữa phiên (Điểm Danh HN2 SOC)

**Triệu chứng** (xảy ra nhiều lần, user báo "link test lỗi"): preview tự tắt sau sandbox restart; `freebuff-preview status` báo `running:false`/`statusCode:"000"`; curl vào URL proxy trả 502 hoặc không connect.

**Quy trình chuẩn — làm ĐÚNG theo thứ tự, không bỏ bước:**
1. `freebuff-preview status` → nếu `running:false` → `freebuff-preview start` (chờ message `"Preview is ready"` + `running:true, listening:true`).
2. `sleep 5–8` rồi `curl -s -o /dev/null -w '%{http_code}' <URL>` xác nhận HTTP 200 **trước khi** gửi link cho user.
3. Chỉ khi curl trả 200 mới claim "preview OK"; nếu vẫn 502 → `freebuff-preview restart` + chờ thêm 10–15s + curl lại (sandbox khởi động chậm hơn CLI báo ready).
4. Không bao giờ nói "đang chạy" khi chưa có `running:true` + curl 200 (Constraint #8).
5. `freebuff-preview start` có thể mất vài lần thử sau khi sandbox restart — kiên nhẫn chờ, không báo lỗi vội; nếu CLI không hồi phục → báo user bấm **Start preview** từ UI.

*(Đã gặp nhiều lần, 2026-08-10: sau mỗi lần sửa code + verify trong sandbox, preview tự tắt do sandbox restart — không phải do code hỏng, chỉ cần start lại + verify curl trước khi đưa link.)*

## 19. Quy trình giao việc của user (2026-08-11)

- **KHÔNG cần làm link test mockup nữa.** User không còn yêu cầu preview/test link cho từng thay đổi.
- Quy trình chuẩn: sửa code → verify (`node --check`, `npm test`, mô phỏng mock nếu cần) → **push GitHub ngay** khi mọi thứ OK — không hỏi, không làm preview.
- Chỉ dùng preview/test link khi user chủ động yêu cầu.
- Commit message tiếng Anh, mô tả rõ vấn đề + giải pháp + verification, theo phong cách commit trước (`feat(kiosk): ...` / `fix(kiosk): ...` / `perf(kiosk): ...` / `docs(about): ...`).

## 20. UI tách 3 file — sửa đúng chỗ

- `index.html` = **CHỈ HTML** (437 dòng); `css.html` = toàn bộ CSS; `js.html` = toàn bộ client JS (marker khối logic như `TASK-MENU-*`, `PURE-LOGIC-*` nằm ở `js.html`).
- Khi sửa UI: đổi nội dung ở `css.html`/`js.html`/`index.html`; **đừng thêm `<style>`/`<script>` khối mới vào index.html**.
- CSS/JS nhúng qua **scriptlet GAS template** `<?!= include('css') ?>` / `<?!= include('js') ?>`: `Code.gs doGet` dùng `createTemplateFromFile('index').evaluate()` + hàm `include()` — **KHÔNG dùng `createHtmlOutput`/`setContent`** (GAS sẽ SANITIZE strip `<script>` → app không load). `scripts/serve.js` + `scripts/build-static.js` thay cùng scriptlet bằng nội dung file qua `scripts/inline-html.js` — sửa transform phải sửa đủ 3 nơi + chạy `npm test` (`inline-html.test.js`, `code-doget.test.js`).
- Test client đọc marker từ `js.html` (đã cập nhật: task-menu/header-search/meal-create/scan-logic).

### Camera scanning — kiến trúc hiện tại (trạng thái mới nhất, 2026-08-19)

> Tính năng này đã trải qua rất nhiều vòng debug/tối ưu (2026-08-11 → 2026-08-19). Toàn bộ lịch sử — từng bug, từng con số đã thử, lý do revert — nằm trong **`docs/history/camera-scan-debug-log.md`**. **Đọc file đó trước khi sửa** `camera-scan.html`, phần camera trong `js.html`, hoặc bất kỳ hàm decode nào — nhiều "tối ưu tưởng hiển nhiên" đã từng gây regression.

**Kiến trúc:**
- File: `camera-scan.html` (logic decode + popup GAS), `lib-jsqr.html`/`lib-quagga.html` (thư viện vendor), `camera-css.html` (overlay CSS). Nút `#btnCamScan`/`#camFile` ở `index.html`; wiring ở `js.html`.
- **Trong GAS iframe**: getUserMedia bị chặn trên iOS → `openCameraScan` mở **popup top-level** để quét live; fallback `<input capture>` nếu popup bị chặn.
- **Ở host top-level** (preview/hosting qua `serve.js`/`build-static.js`): quét live trực tiếp trong `#cameraModal`, không cần popup (detect qua `window.self !== window.top`). Gọi API qua JSONP (`JsonpApi.gs`) vì không có `google.script.run` ngoài GAS. `?demo=1` dùng mock data khi org khóa quyền 'Anyone'.
- **Decode**: ZXing-js (tải từ CDN, không vendor) là engine chính, chạy nhiều bậc fallback mỗi tick (full frame → downscale 1280 → crop khung → crop upscale 1.4×+TRY_HARDER → GlobalHistogram binarizer) rồi mới tới Quagga (2-config) làm fallback cuối; jsQR chỉ còn trong full chain/ảnh chụp. Một **Web Worker** chạy ZXing nền liên tục với 3–4 chiến lược binarizer xoay vòng (Hybrid/GlobalHistogram/Normalize/Sharpen) để bắt mã mờ/nghiêng; fail-open nếu môi trường không hỗ trợ Worker. `canvas filter: contrast(1.35)` áp cho mọi frame decode. Tick 200ms. OCR (Tesseract.js, CDN) chạy song song để đọc chữ "Ops…" khi vạch không decode được.
- **Quét liên tục**: camera không tự đóng sau 1 mã; kết quả hiện thành danh sách cuộn bên dưới; dedup 1.5s, merge optimistic+server 2.5s.

**Gotcha bắt buộc nhớ (đúng lâu dài, không đổi theo thời gian):**
- Quagga vendored có 2 quirk checksum Code128 (thừa 1 ký tự) → luôn chạy qua `normalizeQuaggaCode128` + yêu cầu ≥2 config đồng thuận + lọc theo format kỳ vọng (numeric-only không được thắng mã dạng "Ops…").
- iOS Safari **không thể** điều khiển focus camera qua web API — giới hạn nền tảng, không fix được bằng code; chỉ có thể mitigate bằng hint khoảng cách trên UI.
- Element bị set `.textContent` sẽ xóa sạch mọi element con bên trong nó — không bao giờ đặt indicator/cờ UI lồng bên trong một element như vậy.
- Mọi test file mới phải được thêm vào script `test` trong `package.json` — nếu không nó không bao giờ chạy trong `npm test` dù vẫn tồn tại trong repo.

## 21. Quy tắc test (bắt buộc trước khi push — khớp attendance-portal)

**Dual runtime — mọi đổi logic quét/classify phải verify cả 2 nơi** (§17): `npm test` + `npm run test:py`. Đổi UI/scan phải thêm `test:chrome` (CDP headless, port từ attendance-portal).

| Lệnh | Chạy gì | Khi nào bắt buộc |
| :--- | :------ | :--------------- |
| `npm test` | 368 test JS (27 file, Node `node:test` — ScanLogic/CsvUtil/TaskSearch + smoke 10 file .gs + contract mock↔server) — `node --test tests/*.test.js` (glob, tránh sót file) | Mọi commit |
| `npm run test:py` | 85 test Python (`python3 -m unittest discover -s api -p 'test_*.py'`) — `api/database.py`/`scanlogic.py`/`services.py` mirror GAS | Đổi `*.gs`/`api/*.py` |
| `npm run build:local` | `scripts/build-local.js` gộp GAS template `index.html` (`<?!= include() ?>` → `css/js/mobile/lib/camera`) → `index.local.html` cho `file://` | Trước `test:chrome` |
| `npm run test:chrome` | `scripts/test-local-mock.js` — boot Chrome `--headless=new --remote-debugging-port=9222` (tự spawn nếu chưa có) → mở `file://index.local.html` → mock `google.script.run` → 11 check: load mock / task list 30 rows / openScan 6 rows S:3 A:3 E:1 / quét `Ops229444` S+1 A-1 / trùng / Dư+1 / backToList — yêu cầu Node ≥22 (global `WebSocket`), Chrome `google-chrome` | Đổi UI/scan/mock |

**Workflow chuẩn trước push** (§19): `build:local` → `npm test` → `test:py` → `test:chrome` (nếu đổi UI) → commit → push. Không claim pass khi chưa có số liệu (Constraint #8). `index.local.html` đã `.gitignore`/`.claspignore`.

**Công cụ CDP:** `node scripts/cdp-helper.js list|open <url>|eval <expr>|shot <png>|evalframe|evaliframe|click <x> <y>` — dùng `WebSocket` global (Node 22+), timeout 10–15s, không treo. Chrome path: `CHROME_PATH` env hoặc tự tìm `google-chrome`/`chromium`.

**Khớp attendance-portal §7:** `npm run test` 219 tests bên portal tương đương `npm test` 368 + `audit-css`/`audit-gs` bên này; `build-local.js` + `test-local-mock.js` port nguyên văn, adapt DOM IDs `viewList/viewScan` + counters `S:3`. CI gate `.github/workflows/deploy.yml` chạy đủ `npm test` + `test:py` + `build:local` + `test:chrome`.

## 22. Định dạng output (Freebuff)

> Nguồn: tài liệu "Freebuff — Định dạng Output" (2026-08-23) do user cung cấp.

**1. Output trong khung hội thoại (chat)** — mọi câu trả lời của agent đều là **Markdown**, hiển thị trực tiếp trong terminal/app:

| Phần tử | Ví dụ |
| :------ | :---- |
| Tiêu đề | `# H1` · `## H2` · `### H3` |
| Danh sách | `- item` · `1. item` |
| Bảng | `\| cột A \| cột B \|` |
| Code inline | `` `const x = 1` `` |
| Code block | ` ```ts ... ``` ` (có highlight theo ngôn ngữ) |
| Trích dẫn | `> ghi chú` |
| Link | `[văn bản](https://...)` |

Ngoài ra agent còn hiển thị **tiến trình làm việc**: danh sách việc cần làm (todos), lệnh terminal đang chạy, và diff thay đổi file.

**2. Output dạng file**
- Agent đọc/ghi **mọi định dạng file văn bản** trong repo: `.md`, `.txt`, `.json`, `.yaml`, `.ts/.js/.py/.gs`, HTML/CSS…
- **`.md` (Markdown): hỗ trợ đầy đủ** — đọc, tạo mới, hoặc chỉnh sửa bất kỳ file `.md` nào khi được yêu cầu.
- File được ghi thẳng vào working directory của repo (qua công cụ file, không qua shell redirection).

**3. Các loại output khác**
- **Preview URL**: với dự án web, Freebuff chạy dev server trong sandbox và trả về URL xem trước.
- **Deploy**: build tĩnh ra thư mục output (ví dụ `dist/`) rồi triển lên hosting do Freebuff quản lý.
- **Báo cáo kiểm tra**: kết quả typecheck/test trả về dạng log văn bản kèm phân tích lỗi.

**4. Mẫu output chuẩn (template)**

```markdown
# <Tiêu đề công việc>

## Tóm tắt
- <Đã làm gì, kết quả ra sao>

## Thay đổi
| File | Nội dung thay đổi |
| :--- | :---------------- |
| path/to/file.ts | <mô tả ngắn> |

## Cách kiểm chứng
1. Chạy `<lệnh>` → kết quả: <pass/fail>

## Việc tiếp theo (tuỳ chọn)
- [ ] <gợi ý bước kế>
```
