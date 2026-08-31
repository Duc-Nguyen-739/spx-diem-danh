# Phụ lục — Nguồn gốc & lịch sử

> Tách từ `AGENTS.md` — chỉ để tra cứu provenance, **không phải luật** — không cần đọc trước khi code.
> File gốc `AGENTS.md` hiện chỉ giữ luật đang áp dụng; toàn bộ lịch sử migration/adapt nằm ở đây.
> Tham chiếu từ `AGENTS.md` → [`docs/appendix/nguon-goc-lich-su.md`](nguon-goc-lich-su.md).

---

- Bộ quy tắc gốc hợp nhất từ "Lobe AI — Senior Software Engineer & AI Coding Assistant" + "Hermes SOUL" (2026-08-08), chuyển thể cho Freebuff. Cơ chế riêng của LobeHub (memory API, `hintIsSkill`, layer "Context") không tồn tại ở đây — thay bằng file `AGENTS.md` này + skill ở `skills/<tên>/SKILL.md` (đã chốt `§15`).
- 2026-08-29: phần nhật ký debug tính năng quét camera (rất dài, thuần lịch sử) đã tách sang `docs/history/camera-scan-debug-log.md` (xem `AGENTS.md §18.1`).
- 2026-08-31: 12 "quy tắc vàng" trong bảng `§1` được đúc kết từ `attendance-portal AGENTS.md` §2 "12 quy tắc bất biến", adapt số liệu/kỹ thuật cho khớp `spx-diem-danh`:
  - LF thay CRLF (`core.autocrlf=true` bên attendance-portal không áp dụng ở đây).
  - 4 sheets thay 7.
  - 3-file split (`index.html`/`css.html`/`js.html`) thay 9 module.
  - 39 token thay 92.
  - Spec dùng tên file `Spec — Điểm Danh HN2 SOC.md` (không phải `RollCall v2.md`).
  - `npm run test` 219 test bên attendance-portal ~ tương đương `npm test` 378 test bên đây + audit `audit-css`/`audit-gs` riêng.
  - `build-local.js` + `test-local-mock.js` port nguyên văn từ attendance-portal, chỉ đổi DOM IDs (`viewList`/`viewScan`) + counters (`S:3`).
  - Tiền lệ checkpoint C (revert khi phát hiện vi phạm sau commit): attendance-portal `c7b4f56` → `a645309` → `d43d3b2` (2026-08-26).
  - Lesson BOM khi ghi file (utf-8-sig thêm BOM gây lỗi hiển thị GAS): commit `9982293` (2026-08-11, attendance-portal) — lý do pattern deterministic ở `AGENTS.md §1.1` bắt buộc dùng `utf-8` khi ghi, không dùng `utf-8-sig`.

---

## Di dời 2026-08-31

- Tạo thư mục `docs/appendix/` để chứa phụ lục; di dời toàn bộ nội dung phụ lục cũ (dòng 392–407 `AGENTS.md`) sang file này.
- `AGENTS.md` chỉ giữ stub tham chiếu → `docs/appendix/nguon-goc-lich-su.md`.
