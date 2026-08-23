# Editing Conventions — SPX Điểm Danh (Điểm Danh HN2 SOC)

> Quy tắc sửa file an toàn trong repo này. Khác bản project-skill cũ (bản cũ bảo CRLF — SAI với repo này).

## 1. Line endings — LF, KHÔNG CRLF (quan trọng)

- Repo này: **mọi file nguồn là LF trên disk**, KHÔNG có `.gitattributes`, KHÔNG BOM (verify: `head -c 3 file | xxd -p` phải ra `3c`/`2f`, không `efbbbf`).
- Bản project-skill cũ từ `van90bg/diem-danh-hn2-socx` bảo CRLF + `.gitattributes` + `utf-8-sig` — **đó là repo KHÁC**, đừng áp dụng. Áp dụng sai → diff khổng lồ / BOM gây lỗi serve.
- **Dùng Edit tool trực tiếp** cho file `.gs`/`.html`/`.js` — an toàn, giữ LF. KHÔNG cần script Python `newline=''` như bản cũ.
- Verify sau edit lớn: `node --check <file.gs>` (syntax) + `npm test` (regression).

## 2. Comments

- Code (biến/hàm/cột): **tiếng Anh**. Giao diện web + lời nói user: **tiếng Việt** (quy tắc AGENTS.md §1).
- KHÔNG ghi date/marker vòng fix (`FIX(2026-08-XX):`, `B3:`, `P1:`). Lịch sử ở git log.
- Chỉ comment có giá trị: rationale "tại sao", gotcha "đừng regress", khớp wire/server.

## 3. Git workflow

- 1 issue → 1 commit → push → issue tiếp (AGENTS.md §5). Commit message tiếng Anh (`feat(kiosk):`, `fix(scan):`, `perf(kiosk):`, `docs(about):`).
- Không commit secrets: `.clasp.json` / `.clasprc.json` / `.env` bị `.claspignore` + `.gitignore` loại. Không log `scriptId`/token.
- Dữ liệu thật không push: `Att.csv` / `*.csv` ignore (chỉ `test-fixtures/Att.sample.csv` giữ).
- Push ngay khi verify xong (AGENTS.md §19) — không hỏi user trừ khi yêu cầu.

## 4. Không over-engineering (AGENTS.md §6)

- Mỗi dòng đổi liên quan trực tiếp request. Không refactor không cần thiết, không thêm dependency/abstraction phỏng đoán.
- Giữ behavior trừ khi được yêu cầu đổi. Xóa dead code do mình tạo.
- Reuse trước khi tạo mới; cải thiện hệ thống sẵn có trước khi thêm.

## 5. Test trước khi claim (AGENTS.md §8)

- Logic → `npm test` (337 tests) + `npm test:py` (đổi Python). UI/camera → test liên quan + `node --check`.
- KHÔNG claim "fixed"/"test pass" khi chưa chạy xong.
- Bug fix → viết failing reproduction test trước (RED → GREEN).
