# AGENTS.md — Quy ước cho AI agent (Điểm Danh HN2 SOC)

> Repo: `spx-diem-danh`. GAS WebApp + Google Sheets + backend Python song song. Lịch sử migration/adapt từ các bộ quy tắc khác nằm ở [Phụ lục — Nguồn gốc & lịch sử](#phụ-lục--nguồn-gốc--lịch-sử) cuối file; phần thân chỉ chứa luật đang áp dụng.

> [!TIP]
> **TL;DR cho agent mới — đọc 60s trước khi code:**
> Đọc bảng luật `§1` → Checkpoint A (`§8.1`) trước khi sửa → sửa file có tiếng Việt qua script deterministic `§1.1` → verify thật (`§16`: `npm test` + `test:py` + `test:chrome` khi đổi UI) → Checkpoint B/C → commit 1 issue = 1 push. Không đoán mò, không hardcode token ngoài `:root`, không tạo hàm trùng.

## Mục lục — 4 phần

| Phần | Nội dung | Section |
| :--- | :------- | :------ |
| **1 — Luật bắt buộc** | Bảng luật duy nhất + cách edit deterministic | `§1` · `§1.1` |
| **2 — Cách làm việc** | Ngôn ngữ · Ưu tiên xung đột · Nguyên tắc · Quyết định · Coding · Workflow | `§2`–`§8` |
| **3 — Tiêu chuẩn** | Fix priority · Security · Performance · Review · Done · Communication | `§9`–`§14` |
| **4 — Kiến thức dự án** | Platform GAS/Web/Python · Multi-project · Ghi nhớ · Dự án · Giao việc · UI 3-file · Camera · Test · Output | `§15`–`§22` |

---

## PHẦN 1 — LUẬT BẮT BUỘC (đọc trước khi code)

## §1. Bảng luật

Mỗi luật có **đúng 1 số hiệu**, dùng xuyên suốt file này (không còn hệ đánh số song song). Cột "Override" quyết định user có thể yêu cầu bỏ qua luật đó không.

**Nhóm A — Không override được:**

| # | Luật | Chi tiết |
| :- | :-- | :-- |
| 1 | Không lộ secrets/tokens/credentials (code/log/output); không đọc/ghi API keys — thay bằng `[REDACTED]`. Áp dụng cho `.clasp.json`, `.clasprc.json`, `SPREADSHEET_ID`, `ROLLCALL_API_TOKEN`, `codegraph.json`, file tạm. | — |
| 2 | GAS: batch `getValues()`/`setValues()`, không loop `getValue()`/`setValue()`. | `§15` |
| 3 | Tôn trọng GAS timeout 6 phút. | `§15` |
| 4 | Không claim "fixed"/"test pass" khi chưa verify. Verify bằng kết quả thực (test/CDP/curl/log) — không đoán mò, mọi khẳng định phải có dẫn chứng test fail→pass hoặc output cụ thể. | `§16` |

**Nhóm B — Mặc định bật, override được nếu user yêu cầu rõ:**

| # | Luật | Chi tiết |
| :- | :-- | :-- |
| 5 | 1 issue → verify → commit → push → issue tiếp theo. Batch nhiều edit nhỏ cùng 1 issue vào 1 script/1-2 commit; không gộp issue khác nhau vào cùng commit. Tự động commit + push ngay, không chờ hỏi. Không tự `clasp push` (CI lo redeploy). | `§19` |
| 6 | Mỗi dòng thay đổi phải liên quan trực tiếp đến request — không sửa lan man. | `§6` |
| 7 | Giữ nguyên behavior trừ khi được yêu cầu đổi (đây là cách hợp lệ để "override" luật #6: đổi behavior khi user yêu cầu). | `§6` |

**Nhóm C — Luật quy trình (không có cột override — luôn áp dụng, có miễn trừ ghi rõ trong luật):**

| # | Luật | Chi tiết |
| :- | :-- | :-- |
| 8 | Không thêm comment rác (`FIX(YYYY-MM-DD):`, `P1:`, `B3:`, restatement). Chỉ giữ comment dạng rationale non-obvious / gotcha đừng regress / `KHỚP server`. Marker cũ trong codebase giữ nguyên, không đụng vào nếu không cần. | `§6.1` |
| 9 | Không hardcode màu/spacing/type/radius ngoài `:root`. Thêm giá trị mới = thêm token vào `:root`. | `§6.2` |
| 10 | Đổi API/UI/flow/số liệu → sync `README.md` + file Spec dự án (+ `AGENTS.md` nếu ảnh hưởng luật) **cùng 1 commit**. Miễn trừ: fix nội bộ không đổi hành vi quan sát được. | `§20` |
| 11 | Không tạo hàm trùng — 1 logic 1 nơi (SSOT). Grep trước khi tạo hàm mới; nếu đã có → reuse. Duplicate được whitelist (client/server phải khớp) cần comment `KHỚP server` + guard test ở cả 2 phía. | `§6.3` |
| 12 | Checkpoint A/B/C bắt buộc trước – trong – sau khi sửa code, đối chiếu với `§1`. | `§8.1` |
| 13 | Plan → duyệt → review gate khi chạm ≥1 P0/P1, ≥3 file, hoặc đổi API/UI/flow/số liệu. | `§8.2` |

> **Thứ tự ưu tiên khi xung đột:** Nhóm A > yêu cầu user > Nhóm B > Core Principles mặc định (`§4`). User yêu cầu vi phạm luật Nhóm A → từ chối phần đó, nêu lý do, đề xuất cách đúng.

### §1.1 Cách edit deterministic (bắt buộc khi sửa file có tiếng Việt)

Repo dùng **LF** (không CRLF) — kiểm tra bằng `git ls-files --eol` (kỳ vọng `i/lf w/lf`).

Pattern chuẩn (Python, `execute_code`):

```python
path = r"..."  # .gs hay index.html/css.html/js.html
# ĐỌC với newline='' — dùng utf-8-sig (strip BOM nếu file cũ có)
with open(path, 'r', encoding='utf-8-sig', newline='') as f:
    content = f.read()
# SỬA bằng string replace CHÍNH XÁC, assert count==1 cho từng anchor
# GHI với newline='' — BẮT BUỘC dùng utf-8 (KHÔNG sig): utf-8-sig khi write THÊM BOM
# (EF BB BF) → index.html serve qua GAS sinh khoảng trống phía trên header.
with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
```

- String literal trong Python phải khớp LF — file spx dùng `\n` (không `\r\n`).
- Khối lớn: tách nhỏ thành file tạm (write_file `.txt`) rồi ghép bằng index (`content.find(marker)`).
- Sau mỗi edit HTML, verify LF:
  ```bash
  python3 -c "data=open('index.html','rb').read(); print('CRLF',data.count(b'\r\n'),'LF-only',data.count(b'\n')-data.count(b'\r\n'), 'BOM', data[:3]==b'\xef\xbb\xbf')"
  ```
  CRLF ≠ 0 hoặc BOM True → normalize + ghi lại.
- Sau mỗi edit HTML: JS parse `new Function`, CSS brace balance (`{}` = 0), chạy `npm test` nếu đụng logic.

---

## PHẦN 2 — CÁCH LÀM VIỆC

## §2. Ngôn ngữ (bắt buộc)

- Nghĩ bằng tiếng Anh, **luôn trả lời/giải thích/bình luận cho user bằng tiếng Việt** (trừ khi user yêu cầu khác).
- Tên biến/hàm/file/cột sheet: **tiếng Anh**. Giao diện web (header, nút, badge, label) + lời nói với user: **tiếng Việt**.

## §3. Core Principles

- Correctness > speed. Simplicity > cleverness.
- Chỉ giải quyết đúng scope yêu cầu — không bịa yêu cầu thiếu (never invent missing requirements).
- Nêu assumption khi cần; chỉ hỏi khi ambiguity chặn đường đúng.
- Verify trước khi kết luận (xem `§1` luật 4).
- Cải tiến hệ thống sẵn có trước khi tạo mới (xem `§1` luật 11 — SSOT).

**Engineering Philosophy** — mỗi bước *trước* việc tương ứng: Understand *before* modifying · Read *before* writing · Reuse *before* creating · Measure *before* optimizing · Verify *before* concluding · Reflect *before* forgetting · Document chỉ khi có giá trị lâu dài · để dự án sạch hơn lúc nhận.

## §4. Decision & Ambiguity

Trước khi code, trả lời 5 câu hỏi: **(1)** vấn đề thật là gì? **(2)** constraint nào áp dụng? **(3)** thiếu thông tin gì? **(4)** assumption nào đang đặt? **(5)** rủi ro gì? → Chọn giải pháp đơn giản nhất thỏa mọi constraint.

Nếu thiếu thông tin:
- **Rẻ để sửa sau** (local, không đổi state) → ghi rõ assumption, cứ làm.
- **Đắt để sửa sau** (mất data, đổi production, refactor lớn) / nhiều cách hiểu khác kết quả hẳn / thiếu info có thể gây sai/hại → hỏi ngay, tối đa 1 câu/task, không đoán.

## §5. Coding Rules

**Prefer:** code đơn giản · dễ đọc · behavior deterministic · logic tường minh · hàm nhỏ đúng 1 việc · theo convention dự án sẵn có.

**Avoid:** abstraction phỏng đoán · refactor không cần thiết · dependency không cần thiết · feature creep · over-engineering · viết lại code không liên quan (xem `§1` luật 6).

- Đơn giản hóa code (guard clause, tên mô tả, hàm nhỏ) — không bao giờ đổi behavior.
- Xóa dead code do mình tạo, logic trùng, wrapper thừa, conditional lồng nhau khi gặp.

### §5.1 Comment (chi tiết luật #8)

Chỉ comment rationale/gotcha cần thiết. Không thêm marker vòng fix mới (`FIX(2026-XX):`, `B3:`, `P1:`) — lịch sử nằm ở git log + commit message, không nằm trong comment.

### §5.2 Token (chi tiết luật #9)

Toàn bộ màu/spacing/type/radius phải nằm trong `:root` (hiện 39 token — `--primary`, `--danger`, `--space-1..5`, `--text-xs..3xl`, `--card-radius`, `--header-h`…). Thêm màu/spacing mới = thêm token vào `:root`, không hardcode.

- **Ngoại lệ chủ đích:** micro 1–3px, `#fff`/`#000`, fallback `var(--x,#hex)`, px đo runtime.
- **Audit:** `grep -E "#[0-9a-f]{3,6}" css.html` phải về 0 ngoài các ngoại lệ trên.

### §5.3 SSOT — Không tạo hàm trùng (chi tiết luật #11)

Trước khi tạo hàm mới:
1. `grep -rn "function <tên>" --include="*.gs" --include="*.html"` + `grep -rn "<keyword>"` (vd `normalize`, `formatTime`, `cache`, `computeCounters`) — nếu đã có → **reuse**, không copy.
2. **Map SSOT bắt buộc của dự án:**

   | Nhóm logic | Vị trí |
   | :--- | :--- |
   | `normalize*` | `CsvUtil.gs:55` |
   | `formatTime` / `formatDate` | `CacheLayer.gs:112` |
   | `cache` / `cachedJson` | `CacheLayer.gs:27` |
   | `filter` / `dedupe` / `buildStation` | `CsvUtil.gs:242` |
   | `classifyScan` / `computeCounters` / `findLogRow` | `ScanLogic.gs:37` |
   | `invalidation` | `Database.gs` / `CacheLayer.gs` |

   Không tạo bản thứ 2 cho các nhóm trên.
3. Client/server duplicate (`classifyScan` vs bản trong `js.html`, `computeCounters`) là **ngoại lệ có chủ đích** — bắt buộc đủ 3 điều kiện: comment `KHỚP server` ở CẢ 2 phía + guard trong `tests/drift.test.js` + ghi `whitelist: <tên hàm> — lý do` trong commit message. Thiếu 1 trong 3 = chưa hợp lệ. Duplicate mới ngoài whitelist → P1.
4. Sau khi tạo hàm: `node scripts/check-drift.js 2>&1 | head` + `npm test` — audit báo `DEAD`/`API treo` là P0, semantic duplicate (grep ≥2 hit cùng intent) là P1.

## §6. Workflow

**Understand → Plan → Test (nếu đổi behavior) → Implement → Verify → Review.**

- **TDD:** RED (test fail) → GREEN (implement tối thiểu) → REFACTOR. Test verify behavior, không phải implementation. Test double ưu tiên: Real → Fake → Stub → Mock. Bug fix → viết failing reproduction test trước.
- **Debug:** Reproduce → Localize → Reduce → Root cause → Fix → Regression test → Verify. Không bao giờ đoán. Fix nguyên nhân, không fix triệu chứng.
- **Rule of Three:** fix thứ 3 không ăn → STOP, không thử fix 4 — nghi vấn architecture, bàn với user trước. Red flags: "quick fix, investigate sau" · "thử X xem sao" · "sửa nhiều chỗ chạy test" → dừng, quay lại root cause.

### §6.1 Checkpoint A/B/C (chi tiết luật #12)

| Checkpoint | Khi nào | Làm gì |
| :--- | :--- | :--- |
| **A — Trước khi code** | Đọc `§1`, `§1.1`, `§5`, `§6` + skill liên quan | Liệt kê luật áp dụng cho thay đổi này, ghi cách áp dụng; xung đột → báo user TRƯỚC khi code |
| **B — Sau khi sửa, trước commit** | `git diff --stat` + `git diff <file>` | So từng file với bảng luật `§1`; flag dòng ngoài phạm vi / comment rác (luật 8) / hardcode (luật 9) / thiếu sync docs (luật 10) / hàm trùng (luật 11); vi phạm → sửa trước khi commit |
| **C — Sau commit, trước push** | `git log -1 --stat` + `git show HEAD` | Soát lại comment và dòng ngoài phạm vi; vi phạm → `git revert HEAD` rồi làm lại |

Khi xuất output theo `§22`, thêm 1 dòng `**Rule check:** A: <tóm tắt> · B: <tóm tắt> · C: <tóm tắt>` ngay sau phần tóm tắt.

### §6.2 Plan → duyệt → review gate (chi tiết luật #13)

Áp dụng khi ≥1 P0/P1, hoặc chạm ≥3 file, hoặc đổi API/UI/flow/số liệu:

- **Khi áp dụng:** tạo `plan.md` (working file, gitignored — không commit) theo template: Bối cảnh · Quyết định · Chi tiết file:line · Verify · Rủi ro; dừng lại chờ user duyệt (`duyệt`/`LGTM`/`OK`) — chưa duyệt thì **không được sửa code**.
- **Khi code xong:** verify thực tế (luật 4) rồi ghi `review.md` (gitignored) theo `§22`: tóm tắt + bảng P0/P1/P2 + Rule check A/B/C; không commit plan/review.
- **Lưu vết (tuỳ chọn):** nếu cần audit sau, copy nội dung sang `docs/plans/YYYY-MM-DD-<slug>.md` và commit CÙNG commit code (1 issue = 1 commit).
- **Miễn trừ:** fix trivial <5 dòng, 1 file, không đổi hành vi/API/UI → bỏ qua gate, ghi 1 dòng lý do trong commit message.

---

## PHẦN 3 — TIÊU CHUẨN CHẤT LƯỢNG

## §7. Fix Priority

| Mức | Nghĩa |
| :-- | :-- |
| **P0** | Data loss / logic sai / crash — fix ngay |
| **P1** | Bug ảnh hưởng tính năng |
| **P2** | Cosmetic / UI |

1 issue/commit (luật 5); verify trước khi accept claim (luật 4).

## §8. Security

- Mọi dữ liệu ngoài (external) đều là untrusted.
- Không lộ secrets/tokens/credentials (luật 1).
- Validate input. Escape output.
- Ưu tiên parameterized queries (không ghép chuỗi SQL).

## §9. Performance

Để ý: N+1 queries · allocation lặp lại · loop không cần thiết · render không cần thiết · blocking đồng bộ. Optimize chỉ sau khi correctness đã đúng — measure trước khi optimize.

## §10. Code Review

Xét theo thứ tự: **(1)** Correctness **(2)** Readability **(3)** Architecture **(4)** Security **(5)** Performance. Tách required vs optional, luôn giải thích + đề xuất fix.

| Mức | Tiêu chí |
| :-- | :-- |
| **Critical** | Data loss, crash, lỗ hổng bảo mật |
| **Important** | Tính năng hỏng, logic sai, edge case lớn |
| **Suggestion** | Chất lượng code, readability, maintainability |

## §11. Verification ("Done")

Cần ≥1: test suite pass · manual reproduction hết bug · static/type check không regression · (trivial: behavior giữ + build pass).

Checklist nhanh: requirement ✓ · test ✓ · build ✓ · behavior giữ ✓ · không đổi thừa ✓ · assumption đã ghi ✓ · risk đã nêu ✓.

## §12. Communication

- Trực tiếp, không hoa mỹ, không phóng đại chắc chắn. Không rõ → nói rõ.
- Nhiều giải pháp → so sánh ngắn → recommend 1 → giải thích lý do.
- Task không trivial → cấu trúc: Problem → Analysis → Solution → Verification → Risks.
- Task đơn giản → trả lời thẳng, bỏ cấu trúc.
- Dùng markdown, ngắn gọn.

---

## PHẦN 4 — KIẾN THỨC DỰ ÁN spx-diem-danh

## §13. Platform Guidelines

**GAS:**
- Timeout 6 phút.
- `CacheService`: 100KB/key, luôn có fallback (có thể bị evict bất kỳ lúc — không xem cache là source of truth).
- `LockService`: script-level, timeout mặc định 10s, scope tối thiểu (không làm việc nặng trong lock).
- `UrlFetchApp`: 20MB / 60s.
- Không npm — chỉ `require()` qua library/bundled.
- `google.script.run` = async callback (không phải Promise).
- `HtmlService`: sandbox CSP.
- Timestamp: `Session.getScriptTimeZone()` + `Utilities.formatDate()`.

**Anti-patterns GAS:** loop `getValue()`/`setValue()` (phải batch) · `getDataRange()` khi chỉ cần 1 dòng (dùng `getRange(row, col, 1, n)`) · việc nặng trong `LockService` · tin cache như nguồn sự thật · dùng `console.log` ở production (dùng `Logger.log`).

**Review checklist GAS:** batch reads ✓ · batch writes ✓ · lock scope tối thiểu ✓ · cache có fallback ✓ · timestamp timezone-aware ✓ · timeout 6 phút ổn ✓ · `Logger.log` thay `console.log` ✓.

**Web:** ưu tiên framework sẵn có (Bootstrap/Tailwind) · check state consistency (cache/optimistic UI/offline) · cleanup event listener · check XSS khi inject dynamic content.

**Python:** explicit > implicit · type hints cho public API · `pathlib` thay `os.path` · context manager cho resource.

## §14. Multi-Project Context & Context Loading

User làm nhiều project nhỏ — mỗi project có kiến trúc, convention, bug history, kế hoạch tối ưu riêng.

- Khi làm việc trong 1 project: đọc tài liệu project trước (README, spec, docs, AGENTS.md, skill) trước khi review/implement.
- Không có tài liệu → áp dụng nguyên tắc chung và hỏi nếu cần.
- Không giả định pattern của project A áp dụng cho project B khi chưa verify.

## §15. Ghi nhớ & Self-learning

- Sau mỗi task (5–10s): Pause → Extract → Reuse (đáng ghi skill?) → Save (nếu có gì đáng lưu). Lưu tối đa 1 entry/task.
- **Ghi nhớ dài hạn:** quy tắc/quy ước dự án → ghi vào `AGENTS.md`; pattern tái sử dụng xuất hiện >1 lần → viết skill vào `skills/<tên>/SKILL.md` (đã chốt — không dùng `.agents/skills/`).
- **Trigger tạo skill:** cùng loại bug lặp lại · user hỏi cùng workflow >1 lần · có quy trình tin cậy giải 1 lớp vấn đề · quy trình setup không-trivial và lặp lại.
- **Skip ghi nhớ:** câu hỏi one-off, sửa typo, bug thoáng qua, lời xã giao, info chỉ có nghĩa trong hội thoại hiện tại.
- **Tự sửa lỗi:** thừa nhận rõ với user → lưu bài học → nếu lặp pattern → tạo skill + checklist.

> **Đã chốt 2026-08-31 — vị trí skill chuẩn:** `skills/<tên>/SKILL.md` (ví dụ `skills/project-skill/SKILL.md`, `skills/review-gas-failure-modes/SKILL.md`). Đã kiểm tra thực tế `spx-diem-danh`: `.agents/` **không tồn tại**, `skills/` có 5 skill (`audit-webapp-optimize`/`debug-systematic`/`project-skill`/`review-gas-failure-modes`/`ui-ux-audit`). Trước đây bản nháp ghi `.agents/skills/...` là tiền tố của opencode, không áp dụng ở repo này — đã sửa thống nhất.

## §16. Dự án

**Điểm Danh HN2 SOC** — hệ thống điểm danh nhân viên kho (warehouse) bằng barcode cho Shopee Express: Google Apps Script WebApp + Google Sheets; frontend vanilla HTML/CSS/JS 3 file (`index.html` + `css.html` + `js.html`, xem `§18`).

**Dual runtime — cùng domain logic:** GAS (`*.gs`) là webapp chính + backend Python song song (`api/*.py`, hosting top-level). Đổi logic quét/classify → sửa CẢ `.gs` LẪN `api/*.py` + chạy cả `npm test` (`tests/*.test.js`) lẫn `npm run test:py` (`python3 -m unittest discover -s api -p 'test_*.py'`).

Chi tiết: `README.md`, `docs/intent/diem-danh-hn2-soc.md`, `docs/spec/2026-08-02-phase0-spec.md`, `skills/project-skill/SKILL.md` (kiến trúc + gotchas), `skills/review-gas-failure-modes/SKILL.md` (checklist 40+ failure mode GAS).

## §17. Quy trình giao việc của user

- **Không cần làm link test mockup.** User không yêu cầu preview/test link cho từng thay đổi.
- Quy trình chuẩn: sửa code → verify (`node --check`, `npm test`, mô phỏng mock nếu cần) → push GitHub ngay khi mọi thứ OK — không hỏi, không làm preview.
- Chỉ dùng preview/test link khi user chủ động yêu cầu.
- Commit message tiếng Anh, mô tả rõ vấn đề + giải pháp + verification, theo phong cách commit trước (`feat(kiosk): ...` / `fix(kiosk): ...` / `perf(kiosk): ...` / `docs(about): ...`).

## §18. UI tách 3 file — sửa đúng chỗ

- `index.html` = **chỉ HTML** (437 dòng); `css.html` = toàn bộ CSS; `js.html` = toàn bộ client JS (marker khối logic như `TASK-MENU-*`, `PURE-LOGIC-*` nằm ở `js.html`).
- Khi sửa UI: đổi nội dung ở `css.html`/`js.html`/`index.html`; **đừng thêm `<style>`/`<script>` khối mới vào `index.html`**.
- CSS/JS nhúng qua scriptlet GAS template `<?!= include('css') ?>` / `<?!= include('js') ?>`: `Code.gs doGet` dùng `createTemplateFromFile('index').evaluate()` + hàm `include()` — **không dùng `createHtmlOutput`/`setContent`** (GAS sẽ sanitize, strip `<script>` → app không load). `scripts/serve.js` + `scripts/build-static.js` thay cùng scriptlet bằng nội dung file qua `scripts/inline-html.js` — sửa transform phải sửa đủ 3 nơi + chạy `npm test` (`inline-html.test.js`, `code-doget.test.js`).
- Test client đọc marker từ `js.html` (task-menu/header-search/meal-create/scan-logic).

### §18.1 Camera scanning — kiến trúc hiện tại

> Tính năng này đã trải qua nhiều vòng debug/tối ưu. Toàn bộ lịch sử — từng bug, từng con số đã thử, lý do revert — nằm trong `docs/history/camera-scan-debug-log.md`. **Đọc file đó trước khi sửa** `camera-scan.html`, phần camera trong `js.html`, hoặc bất kỳ hàm decode nào — nhiều "tối ưu tưởng hiển nhiên" đã từng gây regression.

**Kiến trúc:**
- File: `camera-scan.html` (logic decode + popup GAS), `lib-jsqr.html`/`lib-quagga.html` (thư viện vendor), `camera-css.html` (overlay CSS). Nút `#btnCamScan`/`#camFile` ở `index.html`; wiring ở `js.html`.
- **Trong GAS iframe:** `getUserMedia` bị chặn trên iOS → `openCameraScan` mở popup top-level để quét live; fallback `<input capture>` nếu popup bị chặn.
- **Ở host top-level** (preview/hosting qua `serve.js`/`build-static.js`): quét live trực tiếp trong `#cameraModal`, không cần popup (detect qua `window.self !== window.top`). Gọi API qua JSONP (`JsonpApi.gs`) vì không có `google.script.run` ngoài GAS. `?demo=1` dùng mock data khi org khóa quyền 'Anyone'.
- **Decode:** ZXing-js (CDN, không vendor) là engine chính, chạy nhiều bậc fallback mỗi tick (full frame → downscale 1280 → crop khung → crop upscale 1.4×+TRY_HARDER → GlobalHistogram binarizer) rồi mới tới Quagga (2-config) làm fallback cuối; jsQR chỉ còn trong full chain/ảnh chụp. Một Web Worker chạy ZXing nền liên tục với 3–4 chiến lược binarizer xoay vòng (Hybrid/GlobalHistogram/Normalize/Sharpen); fail-open nếu môi trường không hỗ trợ Worker. `canvas filter: contrast(1.35)` áp cho mọi frame decode. Tick 200ms. OCR (Tesseract.js, CDN) chạy song song để đọc chữ "Ops…" khi vạch không decode được.
- **Quét liên tục:** camera không tự đóng sau 1 mã; kết quả hiện thành danh sách cuộn bên dưới; dedup 1.5s, merge optimistic+server 2.5s.

**Gotcha bắt buộc nhớ (đúng lâu dài, không đổi theo thời gian):**
- Quagga vendored có 2 quirk checksum Code128 (thừa 1 ký tự) → luôn chạy qua `normalizeQuaggaCode128` + yêu cầu ≥2 config đồng thuận + lọc theo format kỳ vọng (numeric-only không được thắng mã dạng "Ops…").
- iOS Safari **không thể** điều khiển focus camera qua web API — giới hạn nền tảng, không fix được bằng code; chỉ mitigate bằng hint khoảng cách trên UI.
- Element bị set `.textContent` sẽ xóa sạch mọi element con bên trong nó — không bao giờ đặt indicator/cờ UI lồng bên trong một element như vậy.
- Mọi test file mới phải được thêm vào script `test` trong `package.json` — nếu không nó không bao giờ chạy trong `npm test` dù vẫn tồn tại trong repo.

## §19. Quy tắc test (bắt buộc trước khi push)

**Dual runtime** — mọi đổi logic quét/classify phải verify cả 2 nơi (`§16`): `npm test` + `npm run test:py`. Đổi UI/scan phải thêm `test:chrome` (CDP headless).

| Lệnh | Chạy gì | Khi nào bắt buộc |
| :--- | :------ | :--------------- |
| `npm test` | 378 test JS (29 file, Node `node:test` — ScanLogic/CsvUtil/TaskSearch + smoke 10 file `.gs` + contract mock↔server) — `node --test tests/*.test.js` (glob, tránh sót file) | Mọi commit |
| `npm run test:py` | 85 test Python (`python3 -m unittest discover -s api -p 'test_*.py'`) — `api/database.py`/`scanlogic.py`/`services.py` mirror GAS | Đổi `*.gs`/`api/*.py` |
| `npm run build:local` | `scripts/build-local.js` gộp GAS template `index.html` (`<?!= include() ?>` → `css/js/mobile/lib/camera`) → `index.local.html` cho `file://` | Trước `test:chrome` |
| `npm run test:chrome` | `scripts/test-local-mock.js` — boot Chrome `--headless=new --remote-debugging-port=9222` (tự spawn nếu chưa có) → mở `file://index.local.html` → mock `google.script.run` → 11 check: load mock / task list 30 rows / openScan 6 rows S:3 A:3 E:1 / quét `Ops229444` S+1 A-1 / trùng / Dư+1 / backToList — yêu cầu Node ≥22 (global `WebSocket`), Chrome `google-chrome` | Đổi UI/scan/mock |

> Tổng test hiện tại: 378 JS + 85 Python = **463 test**. *(Bản gốc ghi 464 ở một vài chỗ — lệch 1 so với số cộng thực tế trong bảng trên; cần đối chiếu lại con số thật khi có dịp, bản này dùng số tính được từ bảng.)*

**Workflow chuẩn trước push:** `build:local` → `npm test` → `test:py` → `test:chrome` (nếu đổi UI) → commit → push. Không claim pass khi chưa có số liệu (luật 4). `index.local.html` đã `.gitignore`/`.claspignore`.

**Công cụ CDP:** `node scripts/cdp-helper.js list|open <url>|eval <expr>|shot <png>|evalframe|evaliframe|click <x> <y>` — dùng `WebSocket` global (Node 22+), timeout 10–15s, không treo. Chrome path: `CHROME_PATH` env hoặc tự tìm `google-chrome`/`chromium`.

CI gate `.github/workflows/deploy.yml` chạy đủ `npm test` + `test:py` + `build:local` + `test:chrome`.

## §20. Định dạng output (chuẩn chung — BẮT BUỘC khi trả kết quả skill)

> Khi in kết quả chạy skill (`audit`/`review`/`debug`), TUÂN THỦ format này — dễ quét, có marker, không tường thuật.
> Chỉ áp dụng cho OUTPUT CỦA SKILL; với Q&A/sửa bug đơn lẻ, ưu tiên trả lời ngắn gọn (<4 dòng) — không đắp bảng P0/P1/P2.

### §20.1 TL;DR 1 dòng — verdict + đếm issue
`✅ Approve — 0 P0 · 2 P1 · 5 P2` | `⚠️ Cần duyệt — 1 P0` | `🔴 Blocked — 3 P0`

### §20.1b Dòng Rule check (luật #12, bắt buộc khi đã chạy checkpoint A/B/C — tức có sửa code) — ngay sau TL;DR
`**Rule check:** A: <rule đã áp dụng> · B: <rule đã kiểm diff> · C: <rule đã kiểm commit>`  
VD: `**Rule check:** A: §1#8 §1#9 §1#11 · B: §1#8 · C: §1#8`  
Bỏ dòng này khi task không đụng code (đọc/phân tích/trả lời câu hỏi).

### §20.2 Bảng findings (audit/review/debug — bảng mặc định) — mỗi dòng = 1 issue, cell ≤1 dòng
| # | Sev | Vấn đề | Vị trí | Đề xuất |
|---|---|---|---|---|
| P0-1 | 🔴 P0 | quét ngoài DS ghi PRESENT | `ScanLogic.gs:142` | mirror server EXTRA |
| P1-1 | 🟠 P1 | card mobile lệch tông | `css.html:88` | override `tbody td:nth-child(n)` |
| P2-1 | 🟡 P2 | comment thừa | `Code.gs:30` | xóa |

Marker: 🔴 P0 (blocker/sai data) · 🟠 P1 (break/khó dùng) · 🟡 P2 (cosmetic). ID đếm liên tục: P0-1, P0-2… → P1-1… → P2-1…

### §20.3 Đánh giá tổng thể — ngay sau bảng findings, 3–5 dòng ngắn gọn
- Tổng quan: <chất lượng chung / rủi ro chính>
- Blocker: <có/không — P0 nào chặn deploy/data>
- Ưu tiên fix: P0 → P1 → P2 (liệt kê ID, vd: P0-1, P1-2)
- Nếu 0 P0: nêu 1–2 điểm mạnh để cân bằng

### §20.4 Nhóm theo chủ đề (chỉ khi >5 issue — đếm TỔNG số dòng bảng §20.2)
`### Nhóm + bullet 1 dòng/cái.`

### §20.5 Khối hành động cuối (bắt buộc khi có ≥1 P0/P1 · optional khi chỉ toàn P2 hoặc empty-state)
> **Tiếp theo:** [làm gì] · [ai] · [duyệt?] — khớp gate `§6.2`

### §20.6 Quy tắc vàng (khi in bảng)
- Không tóm tắt lại nội dung skill — chỉ in kết quả.
- Không đoạn văn >3 dòng không chia ý.
- Dùng marker 🔴🟠🟡 ✅ ⚠️ ✓ thay chữ "lỗi/nghiêm trọng/đã xong".
- Số liệu đi đầu (đếm trước, kể sau): 5 P2 chứ không "có vài issue nhỏ".
- Mỗi finding có `file:line` cụ thể — không "ở đâu đó trong scan".

### §20.7 Confidence score — biến thể của bảng §20.2, CHỈ dùng khi skill yêu cầu độ tin cậy (hiện: `review-gas-failure-modes`)
| # | Sev | Vấn đề | Vị trí | Conf | Đề xuất |
|---|---|---|---|---|---|
| P0-1 | 🔴 P0 | cache blind put mất write | `Cache.gs:55` | 92 | read-merge-write |
- Blocker/security: LUÔN report dù conf thấp. P0/P1 ≥70 · P2 ≥80 · dưới ngưỡng → bỏ.

### §20.8 Empty-state — KHÔNG có issue thì in 1 dòng, không bỏ trống
`✅ Sạch — 0 P0 · 0 P1 · 0 P2 (kèm scope đã quét: test:css + test:gs + audit-ui)`

### §20.9 Anti-pattern (CẤM)
✗ Tôi đã đọc qua code và thấy có một số vấn đề nhỏ về giao diện, cụ thể là màu sắc ở vài chỗ có vẻ không nhất quán...  
→ Thay bằng: `⚠️ Cần duyệt — 0 P0 · 2 P1` + bảng 2 hàng (vị trí + đề xuất cụ thể). Quy tắc: không tường thuật, không "vài chỗ/có vẻ", mỗi claim có `file:line`.

### §20.10 Wireframe khi đánh giá đề xuất UI — vẽ ASCII trước khi chốt
- Vẽ ≥2 trạng thái: Đóng/Mở (hoặc Trước/Sau), và **Mobile (≤991px)** nếu ảnh hưởng responsive.
- Dùng box-drawing `│─┌┐└┘▾▴` + label class/function **thật** (`.view-topbar`, `#scanLoadPane`, `canScanLoad_()`…) — khớp code, không vẽ chung chung.
- Ghi rõ **luật tương tác** (mở/đóng, clear-selection khi đổi Station, disable điều kiện) ngay dưới khung.
- KHÔNG thay thế bảng findings P0/P1/P2 — wireframe là minh họa kèm verdict.

### §20.11 Đọc thêm — link chuẩn spx-diem-danh
- `README.md` — tổng quan cập nhật.
- `Spec — Điểm Danh HN2 SOC.md` — spec đầy đủ.
- `skills/` — bộ skill chuẩn `SKILL.md` (`skills/project-skill/SKILL.md`, `skills/review-gas-failure-modes/SKILL.md`, `skills/audit-webapp-optimize/SKILL.md`, `skills/ui-ux-audit/SKILL.md`, `skills/debug-systematic/SKILL.md`).

---

## Phụ lục — Nguồn gốc & lịch sử

Phần này chỉ để tra cứu provenance, **không phải luật** — không cần đọc trước khi code.

- Bộ quy tắc gốc hợp nhất từ "Lobe AI — Senior Software Engineer & AI Coding Assistant" + "Hermes SOUL" (2026-08-08), chuyển thể cho Freebuff. Cơ chế riêng của LobeHub (memory API, `hintIsSkill`, layer "Context") không tồn tại ở đây — thay bằng file `AGENTS.md` này + skill ở `skills/<tên>/SKILL.md` (đã chốt `§15`).
- 2026-08-29: phần nhật ký debug tính năng quét camera (rất dài, thuần lịch sử) đã tách sang `docs/history/camera-scan-debug-log.md` (xem `§18.1`).
- 2026-08-31: 12 "quy tắc vàng" trong bảng `§1` được đúc kết từ `attendance-portal AGENTS.md` §2 "12 quy tắc bất biến", adapt số liệu/kỹ thuật cho khớp `spx-diem-danh`:
  - LF thay CRLF (`core.autocrlf=true` bên attendance-portal không áp dụng ở đây).
  - 4 sheets thay 7.
  - 3-file split (`index.html`/`css.html`/`js.html`) thay 9 module.
  - 39 token thay 92.
  - Spec dùng tên file `Spec — Điểm Danh HN2 SOC.md` (không phải `RollCall v2.md`).
  - `npm run test` 219 test bên attendance-portal ~ tương đương `npm test` 378 test bên đây + audit `audit-css`/`audit-gs` riêng.
  - `build-local.js` + `test-local-mock.js` port nguyên văn từ attendance-portal, chỉ đổi DOM IDs (`viewList`/`viewScan`) + counters (`S:3`).
  - Tiền lệ checkpoint C (revert khi phát hiện vi phạm sau commit): attendance-portal `c7b4f56` → `a645309` → `d43d3b2` (2026-08-26).
  - Lesson BOM khi ghi file (utf-8-sig thêm BOM gây lỗi hiển thị GAS): commit `9982293` (2026-08-11, attendance-portal) — lý do pattern deterministic ở `§1.1` bắt buộc dùng `utf-8` khi ghi, không dùng `utf-8-sig`.
