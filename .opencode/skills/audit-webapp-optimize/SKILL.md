---
name: audit-webapp-optimize
description: 3-phase webapp audit (code → UI/UX → optimize) with P0/P1/P2 and user approval before fix. Use when: starting review of unread project, user reports many unspecific issues, before big refactor, or after many fixes want verification. Skip for single bug fixes.
---

# Skill: WebApp Audit & Optimize (3-phase)

> Dùng khi: bắt đầu review dự án chưa đọc, user báo "có nhiều vấn đề" không chi tiết, trước refactor lớn, sau nhiều fix muốn verify. Bỏ qua khi chỉ fix 1 bug đơn lẻ.

**Nguyên tắc cốt lõi: READ ALL FILES → COMPILE ALL ISSUES → USER VERIFIES → FIX → OPTIMIZE.** Không bao giờ nhảy tới fix trước khi user thấy toàn cảnh.

## Phase 1 — Code audit

1. Đọc TẤT CẢ file `.gs` + `<script>` trong `.html` (GAS: cả client JS).
2. Với mỗi file note: mục đích, hàm chính + data flow, dependencies, vấn đề tiềm ẩn (logic/security/edge).
3. Check GAS failure modes:
   | Category | Check |
   |---|---|
   | Security | Server-side role gate fail-closed? executeAs USER_ACCESSING có gate? |
   | LockService | Silent failure? Double-checked re-read trong lock? |
   | CacheService | Read-merge-write race? Blind put() mất concurrent writes? |
   | Batch flush | `setValues` trước `cache.remove`? |
   | Timestamps | Timezone-aware? Session.getScriptTimeZone()? |
   | Cooldown | Server vs client value đồng bộ? |
   | API gates | Mọi mutator có server-side check? |
4. Compile issue list phân cấp:
   - **P0** — data loss, sai logic, security
   - **P1** — bug, logic error, edge case
   - **P2** — code quality, readability
5. **Verify từng claim với code hiện tại.** Reject line numbers cũ.
6. **Trình user full list + xin confirmation TRƯỚC khi fix.**

## Phase 2 — UI/UX audit

Checklist:
- Layout: flex/grid consistent? breakpoints? nút 44px mobile? scroll mượt?
- Tokens: CSS variables? font/space/radius/shadow nhất quán? contrast WCAG AA?
- States: loading skeleton · empty · error toast · disabled style?
- A11y: `th[scope]`, `aria-sort`, `role=listbox`+label, icon `aria-hidden`, `aria-live=polite`, `prefers-reduced-motion`, `:focus-visible`.
- Animation: transform/opacity thay top/left, transition consistent.
- Phân loại: P0 sai dữ liệu · P1 layout break / không dùng được · P2 cosmetic.

## Phase 3 — Optimize

- Simplify code: guard clauses, gom helper trùng, bỏ dead code/console.log/comment.
- Performance: `getValue()`→`getValues()`, `setValue()`→`setValues()`, không heavy work trong lock, cache fallback sheet.
- Quality gate: không secrets, input validation, error handling external calls, code mới có tests.

## Phase 4 — Final gate

- [ ] Phase 1–3 xong, user duyệt từng phase
- [ ] Mọi P0/P1 fix hoặc user cho bỏ qua
- [ ] Đã commit/push; app deploy + test thật

## GAS perf patterns
- Polling 15s thay 10s (tiết kiệm 33% RPC)
- Sheet read 2-6s → cache TTL 30-60s
- `Array.isArray` guard cho payload dán mã
- Cache payload ≤ 90KB (CacheService 100KB/key limit)

---

**Xem thêm:** `../review-gas-failure-modes/SKILL.md` (checklist 40+ failure modes cụ thể kèm confidence scoring) • `../debug-systematic/SKILL.md` (debug từng issue sau audit).