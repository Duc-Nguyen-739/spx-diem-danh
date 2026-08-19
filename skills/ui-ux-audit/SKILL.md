---
name: ui-ux-audit
description: Audit UI/UX toàn diện cho webapp GAS (SPX Điểm Danh) — design language nhất quán + WCAG 2.2 accessibility + performance + lớp verify tự động (node:test + CDP). Dùng khi: rà soát UI/UX toàn diện, trước refactor UI lớn, sau nhiều fix UI muốn verify, user nói "rà soát hết UI/style".
---

# Skill: UI/UX Audit toàn diện (SPX Điểm Danh — RollCall v2)

> Bundle skill — 1 lần chạy được: design-language → accessibility → performance → verify tự động.
> Output: bảng P0/P1/P2 kèm file:line + đề xuất fix; **trình user duyệt TRƯỚC khi fix** (luật `audit-webapp-optimize`).

## Nguyên tắc cốt lõi

1. **Đo thật, không tưởng tượng**: geometry `getBoundingClientRect` + computed style qua CDP = truth; screenshot chỉ để cảm nhận.
2. **Không fix trước khi user thấy toàn cảnh** — audit = phát hiện + trình duyệt.
3. **Edit deterministic** nếu có fix (LF/no-BOM — `project-skill` §4; dùng Edit tool trực tiếp, không thêm BOM).
4. **Thành phần tương đồng → hiển thị tương đồng**: mọi lệch giữa view cùng loại component là issue (P1/P2 tùy mức).

## Phase 0 — Baseline (chạy trước, làm nền)

```bash
npm test              # ~337 tests Node — verify logic + scriptlets + template parse
npm run test:py       # 4 file Python tests (nếu có sửa Python backend)
node --check Code.gs  # hoặc file GS vừa sửa
node scripts/cdp-helper.js open "file:///.../dist/index.html?t=N"  # đo geometry bằng Chrome CDP
```

Ghi nhận PASS/FAIL → audit chỉ tập trung vào FAIL + những gì script chưa đo (a11y, perf, ngôn ngữ thiết kế).

## Phase 1 — Design language audit

Mở đầu: đối chiếu **component-inventory.md** (8 nhóm + audit đúng từng nhóm) — rà theo nhóm, không bỏ sót thành phần. Kiểm tra từng component chung:

| Component | Chuẩn (khớp mọi view) |
|---|---|
| Header | `.brand` ("Điểm Danh HN2 SOC") + `#userEmail` + `.net-dot` + `#bgTaskIndicator` + `#btnSound` + `#btnRefresh` + `#headerSearchInput` |
| Bảng dữ liệu desktop (task/scan) | font 13px, th 13px surface-muted, hover `tr:hover td` row-hover, wrap `.table-wrap` scroll ngang; task 10 cột, scan 11 cột |
| Bảng → thẻ card mobile ≤640px | grid `minmax(0,1.2fr) minmax(0,1fr)` gap `3px 10px`; td block nowrap+ellipsis `15px/1.35`; nhãn `::before attr(data-label) ': '` 12px/600/muted; title cell 16px/700; badge/pill 13px; MỌI cell `text-align:left` |
| Search | `.list-search` chung (`#listSearch`, `#scanSearch`) + Escape clear + nút ✕ |
| Badge/pill/button | bộ token duy nhất (primary, success, danger, amber/extra, out-blue) — không hardcode màu lệch tông |
| Empty / skeleton / loading | `.empty` chung; skeleton cell count = số cột thật (task 10, scan 11); spinner guard (`showModalSpin` không đè overlay) |
| Modal | overlay+dialog chung, 44px touch, scale-in, Escape đóng (`#createModal`, `#pasteModal`, `#confirmModal`, `#spinModal`, `#cameraModal`) |
| Quét camera | `#btnCamScan` (mobile) → popup GAS top-level hoặc `#cameraModal` live; `#btnCamFile` chụp ảnh; decode ZXing→Quagga→jsQR + OCR + Worker |

CDP verify: đo từng cell bảng card (computed `::before` content = `"Nhãn: "`, `white-space`, font, `text-align`) — so sánh 2 bảng.

## Phase 2 — Accessibility audit (WCAG 2.2)

Load skill `accessibility` — checklist chính:

- **Contrast AA**: text thường ≥4.5:1, text ≥18.66px/14px-bold ≥3:1; kiểm tra mọi màu hardcode (đo computed style rồi tính ratio). Badge/amber/danger trên nền trắng, muted trên surface.
- **Keyboard**: mọi button/link thao tác bằng Tab+Enter; `:focus-visible` ring; skip-link → `#main-content`; Escape đóng modal.
- **Screen reader**: `th[scope=col]`; `aria-sort` (sortable); `aria-live` cho toast/liveMsg; icon `aria-hidden`; label đầy đủ cho input/select.
- **Touch (mobile)**: nút ≥44px, phễu/select ≥33px, pagination ≥36px, btn-sm ≥36px.
- **Motion**: `prefers-reduced-motion` tôn trọng — animation mới phải kiểm tra.
- **Landmarks/order**: header → main (`tabindex=-1`); heading cấp đúng.

## Phase 3 — Performance audit

- **Payload**: task detail ≤90KB (CacheService 100KB/key) — logRow slim text+epoch trước khi cache; staffIndex slim; không trả Date qua `google.script.run`.
- **RPC**: đếm `google.script.run` / JSONP mỗi luồng (poll list 3s, SWR cache 5-10s; warmStaffCacheApi fire-and-forget).
- **DOM**: re-render bảng lớn vs incremental; pagination giới hạn; skeleton ngắn.
- **CSS/JS**: UI 3-file (`index.html` + `css.html` + `js.html`) bọc sẵn `<style>`/`<script>`; icon SVG inline; logo external ẩn khi fail.
- **GAS quota**: getValues batch, setValues batch, cache TTL (TASK_DETAIL 5s, TASK_LIST 10s, LOG_ROWS 10s, STAFF_INDEX 60s), LockService scope (`waitLock(10000)`).

## Phase 4 — Tổng hợp + trình user

1. Gom issue thành bảng: `P0 (sai dữ liệu / không dùng được)` · `P1 (layout break / khó dùng)` · `P2 (cosmetic / cleanup)` — kèm file:line + fix đề xuất.
2. **Trình user duyệt** — không tự fix trước khi duyệt (trừ P0 rõ ràng).
3. Fix xong: chạy lại Phase 0 baseline → commit/push (`type(scope): mô tả`) → check CI SHA (`gh run list --limit 5`).

## References

- `../project-skill/SKILL.md` — architecture, gotchas, dual-runtime, editing conventions
- `../project-skill/references/architecture-gotchas.md` — gotchas sâu (doGet, epoch, lock, cache)
- `../project-skill/references/editing-conventions.md` — line endings LF, no BOM, git workflow
- `component-inventory.md` — kiểm kê 8 nhóm thành phần UI của RollCall v2
- `../audit-webapp-optimize/SKILL.md` — 3-phase audit + GAS perf patterns
- `../review-gas-failure-modes/SKILL.md` — failure modes backend
- Scripts: `scripts/serve.js` · `scripts/build-static.js` · `scripts/inline-html.js` · `scripts/cdp-helper.js`
