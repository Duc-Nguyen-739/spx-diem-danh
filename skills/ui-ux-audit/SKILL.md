---
name: ui-ux-audit
description: Audit UI/UX toàn diện cho webapp GAS (SPX Điểm Danh) — design language nhất quán + WCAG 2.2 accessibility + performance + lớp verify tự động (audit-css/gs/style/ui + CDP). Gom ui-design-process + accessibility + performance + audit-webapp-optimize (3-phase project) thành 1 quy trình. Dùng khi: rà soát UI/UX toàn diện, trước refactor UI lớn, sau nhiều fix UI muốn verify, user nói "rà soát hết UI/style".
---

# Skill: UI/UX Audit toàn diện (SPX Điểm Danh)

> Bundle skill — 1 lần chạy được: design-language → accessibility → performance → verify tự động.
> Output: bảng P0/P1/P2 kèm file:line + đề xuất fix; **trình user duyệt TRƯỚC khi fix** (luật `audit-webapp-optimize`).

## Nguyên tắc cốt lõi

1. **Đo thật, không tưởng tượng**: geometry `getBoundingClientRect` + computed style qua CDP = truth; screenshot chỉ để cảm nhận.
2. **Không fix trước khi user thấy toàn cảnh** — audit = phát hiện + trình duyệt.
3. **Edit deterministic** nếu có fix (CRLF/VN — `project-skill` §8; Python read `utf-8-sig`/write `utf-8` + `newline=''`, anchor `\r\n`, assert count==1).
4. **Thành phần tương đồng → hiển thị tương đồng**: mọi lệch giữa view cùng loại component là issue (P1/P2 tùy mức).

## Phase 0 — Baseline (chạy trước, làm nền)

```bash
npm run test:css      # dead CSS class — exit 1 nếu có
npm run test:gs       # hàm/API dead + API treo client↔server
node scripts/audit-ui.js        # 7 view × 4 viewport geometry (hoặc --quick chỉ desktop)
node scripts/audit-style.js     # fingerprint computed style class chung (cần Chrome)
npm test              # 134 logic tests — chỉ khi đụng logic
```

Ghi nhận PASS/FAIL → audit chỉ tập trung vào FAIL + những gì script chưa đo (a11y, perf, ngôn ngữ thiết kế).

## Phase 1 — Design language audit

Mở đầu: đối chiếu **component-inventory.md** (6 nhóm + audit đúng từng nhóm + lỗ hổng tooling) — rà theo nhóm, không bỏ sót thành phần. Kiểm tra từng component chung xuyên view (bảng bên dưới là "chuẩn" đã chốt 2026-08-16):

| Component | Chuẩn (khớp mọi view) |
|---|---|
| Topbar (Tasks/Scan/Stats/Staff/Config/Reports) | `.view-topbar` + `.view-topbar-title` (`task-title` uppercase qua CSS + `task-meta`) + nút hành động |
| Bảng dữ liệu desktop (task/scan/staff/reports) | font 13px, th 13px surface-muted, hover `tr:hover td` row-hover, wrap `.table-wrap` scroll ngang; fixed-layout chỉ khi có cột text dài cần cap (reports PMO ellipsis) |
| Bảng → thẻ card mobile ≤640px | grid `minmax(0,1.2fr) minmax(0,1fr)` gap `3px 10px`; td block nowrap+ellipsis `15px/1.35`; nhãn `::before attr(data-label) ': '` 12px/600/muted; title cell 16px/700; badge/pill 13px; ẩn cột phụ; MỌI cell `text-align:left` |
| Search | `.list-search` chung + Escape clear + nút ✕ (`#btnListSearchClear` pattern) |
| Badge/pill/button | bộ token duy nhất (primary-bg/primary-dark, success, danger, amber-dark) — không hardcode màu lệch tông |
| Empty / skeleton / loading | `.empty` chung; skeleton cell count = số cột thật; spinner guard (không 2 spinner đè) |
| Modal | overlay+dialog chung, 44px touch, scale-in, Escape đóng |
| Trạng thái | loading skeleton → data · empty state · error toast · disabled + tooltip |

CDP verify: đo từng cell bảng card (computed `::before` content = `"Nhãn: "`, `white-space`, `grid-column/row`, font, `text-align`) — so sánh 4 bảng. Cảnh báo đã gặp (2026-08-16): rule cột desktop (`td:nth-child(5-9)` center, specificity 1,1,1) rò rỉ xuống card — thắng base mobile (1,0,2) bất kể thứ tự; phải ép `tbody td:nth-child(n)` (1,2,1) + `left`. Đối chiếu ngôn ngữ mockup: `project-skill` §12 + `references/mockup-design-language.md` (viewConfig, home shortcuts, chip/star/chevron pattern).

## Phase 2 — Accessibility audit (WCAG 2.2)

Load skill `accessibility` — checklist chính:

- **Contrast AA**: text thường ≥4.5:1, text ≥18.66px/14px-bold ≥3:1; kiểm tra mọi màu hardcode (đo computed style rồi tính ratio — không đoán). Chú ý: badge/amber/danger trên nền trắng, muted trên surface.
- **Keyboard**: mọi button/link thao tác bằng Tab+Enter; `:focus-visible` ring; skip-link → `#main-content`; Escape đóng modal + filter funnel.
- **Screen reader**: `th[scope=col]`; `aria-sort` (scanTable sortable); `aria-live` cho toast/scanLiveMsg/statsA11yMsg; icon `aria-hidden`; label đầy đủ cho ô tìm kiếm/select/input.
- **Touch (mobile)**: nút ≥44px, phễu ≥33px, pagination ≥36px, btn-sm ≥36px; không element <44px chặn thao tác chính.
- **Motion**: `prefers-reduced-motion` tôn trọng (đã có) — animation mới phải kiểm tra.
- **Landmarks/order**: header → main (`tabindex=-1`) → bottom-nav (aria-label); heading cấp đúng.

## Phase 3 — Performance audit

- **Payload**: task detail ≤90KB (CacheService 100KB/key) — logRow slim text+epoch trước khi cache; staffIndex slim (chỉ staffId/name/slot/station/team/workstation/agency); không trả Date qua `google.script.run`.
- **RPC**: đếm `google.script.run` mỗi luồng (refreshAll = 3 RPC có lock đếm; SWR cache 15s scan view; warmStaffCacheApi fire-and-forget). Thêm RPC mới → kiểm tra lock/chồng.
- **DOM**: bảng lớn (staff 100 NV × 20 cột ≈ 2000 td) re-render toàn bộ vs incremental; pagination giới hạn; skeleton ngắn.
- **CSS/JS**: 1 file local build; icon SVG inline (không request); logo external ẩn khi không tải được.
- **GAS quota**: getValues batch, setValues batch, cache TTL, LockService scope — xem `audit-webapp-optimize` §GAS perf patterns.

## Phase 4 — Tổng hợp + trình user

1. Gom issue thành bảng: `P0 (sai dữ liệu / không dùng được)` · `P1 (layout break / khó dùng)` · `P2 (cosmetic / cleanup)` — kèm file:line + fix đề xuất.
2. **Trình user duyệt** — không tự fix trước khi duyệt (trừ P0 rõ ràng).
3. Fix xong: chạy lại Phase 0 baseline → commit/push (`type(scope): mô tả`) → check CI SHA (`gh run list --limit 5`).

## References

- `../project-skill/SKILL.md` — architecture, gotchas, deterministic editing, pitfalls
- `../project-skill/references/mockup-design-language.md` — ngôn ngữ mockup viewConfig
- `component-inventory.md` — kiểm kê 6 nhóm thành phần + audit đúng từng nhóm + lỗ hổng tooling
- `../audit-webapp-optimize/SKILL.md` — 3-phase audit + GAS perf patterns
- `../review-gas-failure-modes/SKILL.md` — failure modes backend (confidence scoring)
- Skill hệ thống (load theo tên): `accessibility` · `performance` · `ui-design-process`
- Scripts: `scripts/audit-css.js` · `audit-gs.js` · `audit-style.js` · `audit-ui.js` · `cdp-helper.js` · `build-local.js`
