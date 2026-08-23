# Todo — Điểm Danh HN2 SOC Phase 0 (MVP: Luồng 2)

> Spec: `docs/spec/2026-08-02-phase0-spec.md` · Plan: `tasks/plan.md`

## T-1: Config.gs — hằng số toàn cục
- [ ] Task: Định nghĩa `SHEETS` (Config, StaffData, AttendanceTask, AttendanceLog), `COLS` (tên cột từng sheet), `STATUS` (Có mặt/Vắng/Dư), `CACHE_TTL`, `UI_LABELS` (tiếng Việt), `TASK_TYPE` (`reconcile`)
- Acceptance: tất cả sheet/cột/status/label tập trung 1 chỗ, không hardcode string rải rác
- Verify: đọc file không lỗi; `npm test` (nếu có test import) — Phase 0 manual
- Files: `Config.gs`

## T-2: CsvUtil.gs — normalize dữ liệu csv
- [ ] Task: Parse raw csv → mảng objects; chuẩn hóa `staffId` (trim, loại bỏ ký tự lạ đầu/cuối), `staffName` (trim double-space như `Đào  Quang  Hà` → `Đào Quang Hà`), giữ nguyên `slotCode`/`station`/`team` text; map header `Att.csv` → tên field tiếng Anh (`Staff ID`→`staffId`, `Clock In Time`→`cardIn`, `Slot Code`→`slotCode`...)
- Acceptance: dùng `test-fixtures/Att.sample.csv` → parse đúng 12 dòng, tên hết double-space, staffId sạch
- Verify: `node --test tests/csv-normalize.test.js` xanh
- Files: `CsvUtil.gs`, `tests/csv-normalize.test.js`

## T-3: Database.gs — đọc/ghi sheet (StaffData index cache, Task, Log)
- [ ] Task:
  - `readStaffIndex_()` — đọc StaffData → map `{ [staffId]: {staffName, slotCode, station, team, workstation, cardIn, cardOut} }`, cache version-key (5m)
  - `readTask_(taskId)` / `writeTask_(task)` — AttendanceTask
  - `readLogRows_(taskId)` / `writeLogRows_(taskId, rows)` — AttendanceLog (batch setValues)
  - `findLogRow_(taskId, staffId)` — tìm dòng NV trong log của task
  - `appendLogRow_(taskId, row)` — thêm dòng `Dư`
  - `updateLogRow_(taskId, staffId, {timeScan, status})` — update cột
  - Timezone: cache `Session.getScriptTimeZone()` 1 lần, KHÔNG gọi trong loop
- Acceptance: đọc/ghi đúng schema; batch setValues; không gọi timezone trong loop
- Verify: manual test với sheet thật (T-8)
- Files: `Database.gs`

## T-4: Logic testable (Node thuần, không cần GAS)
- [ ] Task: Tách `classifyScan(task, logRow, staffIndex)` thành module Node thuần (hoặc mirror trong `tests/helpers/`) để test:
  - NV trong log + timeScan rỗng → `Có mặt`
  - NV trong log + timeScan có → từ chối `already-scanned`
  - NV không trong log + trong StaffData khớp tổ hợp → thêm `Dư`
  - NV không trong log + khác tổ hợp / không có → `Dư`
  - Task status != open → từ chối `task-closed`
  - Counters: `Đã quét` = Có mặt + Dư (có timeScan); `Vắng` = pre-fill chưa quét; `Dư` = status Dư
- Acceptance: đầy đủ case trên, `npm test` xanh
- Verify: `node --test tests/scan-classify.test.js`
- Files: `tests/scan-classify.test.js`, `tests/helpers/classify.js` (hoặc `ScanService.gs` mirror)

## T-5: ScanService.gs — nghiệp vụ quét
- [ ] Task: `scanStaff(taskId, staffId)` — LockService; validate task open; tìm NV trong log/staffIndex; gọi classify; ghi update/append; trả `{row, status, counters}`
- Acceptance: đúng logic classify; lock khi ghi; chặn khi task đóng
- Verify: manual + `npm test` (nếu test server) — Phase 0 manual chính
- Files: `ScanService.gs`

## T-6: TaskService.gs — nghiệp vụ task
- [ ] Task: `createReconcileTask({station, slotCode, team})` — validate tổ hợp có NV trong StaffData; tạo taskId (`R<YYYYMMDD>-<HHMM>`); ghi AttendanceTask status `open`; pre-fill Log batch 1 lần (mỗi NV `timeRef=now`, `timeScan=null`, status `Vắng`); LockService
  - `getTaskList()` / `getTaskDetail(taskId)` / `completeTask(taskId)`
- Acceptance: pre-fill đúng số NV khớp; 1 lần batch; taskId unique; complete chuyển `done`
- Verify: manual T-8
- Files: `TaskService.gs`

## T-7: Code.gs + appsscript.json — API entry + manifest
- [ ] Task: `doGet()` serve index.html; `getMeta()`, `getFilterOptions(station)`, `createReconcileTask`, `getTaskList`, `getTaskDetail`, `scanStaff`, `completeTask` (gọi service); `syncFromCsv()` (dán raw csv → parse → ghi đè StaffData — chạy editor)
- Acceptance: mọi hàm dispatch đúng; syncFromCsv ghi đè đúng
- Verify: `clasp push` không lỗi; mở WebApp thấy HTML
- Files: `Code.gs`, `appsscript.json`

## T-8: index.html — UI tiếng Việt (danh sách task + tạo task + màn hình quét)
- [ ] Task:
  - Danh sách task: bảng `Mã task | Station | Ca | Team | Trạng thái | Tạo lúc`; nút `+ Đối chiếu`
  - Modal tạo: dropdown Station (mặc định Config) → Ca → Team (load theo station); nút Tạo
  - Màn hình quét: input `Quét mã nhân viên…` (auto-focus, font sans-serif rõ); bộ đếm `Đã quét / Vắng / Dư`; bảng NV `Mã NV | Tên NV | Ca | Team | Card In | Card Out | Giờ có mặt | Giờ quét | Trạng thái` (badge Có mặt xanh / Vắng đỏ / Dư cam); nút `Kết thúc` (nền đỏ)
  - Empty-state đúng: "Chưa có nhân viên nào quét" chỉ khi chưa có timeScan; nếu pre-fill → bảng với badge Vắng
  - Không có state `Chờ bàn giao`
- Acceptance: UI tiếng Việt, font rõ, không dot-matrix, không `?` cột Team
- Verify: manual QA (mở WebApp, tạo task, quét)
- Files: `index.html`

## T-9: Setup GAS + deploy
- [ ] Task: `clasp login`; tạo `.clasp.json` (scriptId — từ Script ID sau khi tạo project GAS/Sheet); tạo GSheet mới (Config, StaffData, AttendanceTask, AttendanceLog + header); `clasp push`; `clasp deploy` (WebApp, execute as me, who has access: anyone with link — hoặc theo quyết định)
- Acceptance: WebApp mở được; sheet có sẵn header
- Verify: mở URL WebApp
- Files: `.clasp.json` (KHÔNG commit scriptId nếu nhạy cảm — thêm vào .gitignore hoặc .clasp.json.example)

## T-10: Manual QA (Phase 0 hoàn chỉnh)
- [ ] Task: sync `Att.sample.csv` (hoặc dữ liệu thật) qua `syncFromCsv()`; tạo task HN2 SOC + 08:00-17:00 + Outbound; quét NV đúng → `Có mặt`; quét NV lạ → `Dư`; quét khi done → từ chối; kiểm counters
- Acceptance: đạt success criteria spec (mục 1-6)
- Verify: chạy trên WebApp thật + xem sheet
- Files: (không — QA)

## Sau Phase 0 (KHÔNG làm trong Phase này)
- [ ] Phase 1: Luồng 1 (2 bước) — `+ Điểm danh`, state `sealed`, nút `Chốt danh sách`
- [ ] Phase 2+: Báo cáo/export, đồng bộ csv trigger tự động, phân quyền
