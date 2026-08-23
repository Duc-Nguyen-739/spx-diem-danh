# Plan — Điểm Danh HN2 SOC Phase 0 (MVP: Luồng 2 — Đối chiếu từ csv)

> Ngày: 2026-08-02 · Spec: `docs/spec/2026-08-02-phase0-spec.md` · Intent: `docs/intent/diem-danh-hn2-soc.md`

## Mục tiêu Plan

Chuyển spec Phase 0 thành danh sách task implement được, có thứ tự dependency rõ ràng, mỗi task ≤ 5 files, có acceptance + verification.

## Thành phần chính và dependency

```
Config.gs ──────────┐
CsvUtil.gs ──────────┤
                     ↓
Database.gs ──── ScanService.gs
                     ↑
              TaskService.gs ─── index.html (UI)
                     ↑
              Code.gs (doGet + API dispatch)
                     ↑
              tests/ (Node thuần — chạy độc lập)
```

## Thứ tự implement (theo dependency)

1. **Foundation** — Config.gs + CsvUtil.gs (không dependency, dùng cho mọi task sau)
2. **Storage** — Database.gs (dùng Config + CsvUtil)
3. **Logic testable** — scan-classify + csv-normalize + task-filter (Node thuần, không cần GAS)
4. **Business** — ScanService.gs + TaskService.gs (dùng Database + Config)
5. **API + manifest** — Code.gs + appsscript.json
6. **UI** — index.html (gọi API)
7. **Setup GAS** — clasp login + .clasp.json + tạo GSheet thật + deploy
8. **Manual QA** — sync csv, tạo task, quét, đóng

## Risks & mitigation

| Rủi ro | Giảm thiểu |
|---|---|
| GAS 6 phút khi pre-fill 1000 NV | batch `setValues()` 1 lần (không loop appendRow) — đã có trong spec |
| Race condition khi 2 người quét cùng task | `LockService.getScriptLock()` quanh `scanStaff` + `createReconcileTask` |
| `Session.getScriptTimeZone()` trong loop (pain A v1) | cache timezone 1 lần ở đầu hàm, truyền vào |
| `.clasprc.json` lỡ commit | `.gitignore` đã chặn + kiểm pre-commit |
| Dữ liệu csv thay đổi sau khi tạo task (Q6) | danh sách chốt cố định lúc tạo; quét NV mới → `Dư` (đã chốt) |
| Test logic thuần không mô phỏng GAS | tách logic thuần ra module không dùng `SpreadsheetApp` (CsvUtil, classify) |

## Parallel vs sequential

- **Sequential**: Config → CsvUtil → Database → ScanService/TaskService → Code.gs → index.html
- **Parallel được**: tests/ Node thuần (csv-normalize, scan-classify, task-filter) có thể viết song song với step 2-3

## Verification checkpoints

- Sau task 3 (tests logic thuần): `npm test` phải xanh
- Sau task 6 (Code.gs): `clasp push` thành công, không lỗi syntax
- Sau task 7 (deploy): WebApp mở được `doGet()` trả HTML
- Sau task 8 (manual QA): tạo task thật + quét vài mã + kiểm counters đúng
