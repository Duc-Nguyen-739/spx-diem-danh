# Spec — RollCall v2: Hệ thống Điểm danh Nhân viên Kho

> **Version:**  2.0.0 | **Status:**  Final | **Last updated:**  2026-07-31

## 1. Tổng quan

**Tên dự án:**  RollCall v2
**Loại:**  Refactor mới hoàn toàn, tách riêng khỏi rollcall-kiosk
**Mục tiêu:**  Hệ thống điểm danh nhân viên kho bằng barcode, architecture đơn giản hơn, dễ maintain hơn

---

## 2. Đối tượng & Quy mô

| Thuộc tính            | Giá trị                                                             |
| :-------------------- | :------------------------------------------------------------------ |
| Đối tượng             | Nhân viên kho (warehouse staff)                                     |
| Quy mô                | 100-500 người, 1-3 địa điểm                                         |
| Tải trọng             | Concurrent scanning during shift changes, nhiều kiosk quét cùng lúc |
| Scan latency mục tiêu | < 2 giây                                                            |

---

## 3. Mô hình Ca làm việc (Shift Model)

### 3.1 Ca cố định, trồng lấn

Nhiều ca cố định trong ngày, **trồng lấn/gối nhau** (key difference so với v1):

| Slot Code | Giờ ca         |
| :-------- | :------------- |
| S1        | 08:00 - 17:00  |
| S2        | 13:00 - 22:00  |
| S3        | 18:00 - 02:00  |
| S4        | 20:00 - 06:00  |
| S5        | 22:00 - 06:00  |
| ...       | (tùy cấu hình) |

### 3.2 Slot Code = Ca làm việc

- Slot Code trong sheet HR chính là **mã giờ ca** (ví dụ: "08:00-17:00")
- Mỗi nhân viên gắn với 1 Slot Code (1 ca/ngày)
- Sheet HR có lịch ca cho từng ngày

### 3.3 Nhân viên - Ca

- **1 nhân viên / 1 ca mỗi ngày**
- Có thể tạo nhiều task để điểm danh nhiều lần trong ngày

---

## 4. Chức năng cốt lõi

### 4.1 Điểm danh

- **Cơ chế:**  Quét barcode (OpsID card)
- **Pipeline:**  5 bước (Validate → Cooldown → FindExisting → ExecuteStep → Flush) — giống v1
- **Attendance:**  Check-in + Check-out (2 lần quét riêng biệt)
- **Handover:**  Bàn giao thiết bị 2 bước — giống v1 exactly

### 4.2 Task Model

**Task name format:**  `T-YYYYMMDD-XXXX` (XXXX = random 4 chữ số)
**Duplicate handling:**  Random digits chống duplicate

**2 loại task:**

- **Handover** (bàn giao — 2 bước quét)
- **Attendance** (điểm danh — check-in/check-out)

**Task State Machine (4 states):**

```plain
Created → CheckIn → CheckOut → Closed
```

- Admin chuyển phase **thủ công** (bấm nút)
- **Phase restriction:**  Không — Check-in phase chỉ check-in được, CheckOut phase chỉ check-out được
- **Concurrent phase switch:**  1 thành công, 1 reject

**1 task có thể:**

- Gắn nhiều Slot Code (checkbox selection)
- Gắn nhiều Team (checkbox selection)
- Default: Tất cả Slot Codes + Teams được chọn

### 4.3 Phân quyền

- **2 cấp:**  Admin / User
- **Admin:**  Tạo/Open/Close/Reset/Reopen task, xem danh sách điểm danh
- **User:**  Điểm danh (quét barcode)
- **Paste batch:**  Bất kỳ ai cũng được

### 4.4 Scan Rules

| Rule                                 | Xử lý                                      |
| :----------------------------------- | :----------------------------------------- |
| Quét ngoài giờ ca                    | **Reject**                                 |
| Quét chéo Slot Code (A→B)            | **Reject**                                 |
| Quét chéo Task (A→B)                 | **Ghi cả 2 task**                          |
| 1 staff quét lần 2 trong task        | **Reject** (1 check-in + 1 check-out/task) |
| Duplicate scan trong X giây          | **Cooldown reject (15s)**                  |
| Validate Staff ID + Slot Code + Team | **Cả hai**                                 |
| Check-out trước check-in             | **Ghi + flag ngoại lệ**                    |
| Staff ID không tồn tại               | **Reject + toast**                         |
| Task đã đóng (Closed)                | **Reject**                                 |
| Rapid scan (2x trong 1s)             | **Reject (cooldown)**                      |
| Phase restriction violation          | **Reject**                                 |

### 4.5 Offline Mode

- Queue localStorage, tối đa **50-100 scans**
- Sync khi online lại (exponential backoff, **3 retries**)
- **Flush trigger:**  Auto on reconnect + Manual
- **Flush order:**  FIFO
- **Partial success:**  Giữ lại phần fail
- **Queue full:**  Flush first, rồi nhận scan mới
- **Offline banner:**  "Offline — X scans pending" (hiển thị khi > 0)

### 4.6 Paste Batch

- Dán danh sách Staff ID → auto scan từng người
- **Chunk size:**  100 items/chunk
- **Progress:**  Text progress "Processing X/Y"
- **Error handling:**  Retry failed items
- **Duplicate in batch:**  Skip duplicate

### 4.7 Audit Log

- **Actions:**  Scan, Create task, Close task
- **Storage:**  Sheet riêng (AuditLog)
- **Retention:**  Vĩnh viễn

---

## 5. Dữ liệu & Backend

### 5.1 Google Sheets (3 sheets)

#### Sheet 1: AttendanceData (Sheet HR)

Sheet HR có sẵn, **auto đọc** từ GAS:

| Cột           | Mô tả                                        |
| :------------ | :------------------------------------------- |
| Date          | Ngày làm việc                                |
| Staff ID      | Mã nhân viên (with prefix, unlimited length) |
| Staff Name    | Tên nhân viên                                |
| Team          | Đội nhóm                                     |
| Department    | Bộ phận                                      |
| Station       | Khu vực                                      |
| Slot Code     | Mã giờ ca (08:00-17:00)                      |
| Clock In Time | Giờ vào ca (hiển thị trên attendance list)   |

**HR sync:**  Sheet HR được cập nhật **thủ công** từ hệ thống HR bên ngoài, GAS tự đọc.
**Staff refresh:**  Cả hai — Manual reload + Auto reload mỗi X phút.

#### Sheet 2: AttendanceTask

Task được tạo **trên Google Sheet**:

| Cột               | Mô tả                                 |
| :---------------- | :------------------------------------ |
| Task ID           | T-YYYYMMDD-XXXX                       |
| Date              | Ngày tạo task                         |
| Created By        | Email admin tạo                       |
| Created Time      | Thời gian tạo                         |
| Ended Time        | Thời gian đóng                        |
| Status            | Created / CheckIn / CheckOut / Closed |
| Task Type         | Handover / Attendance                 |
| Allowed Slotcodes | Các Slot Code được phép               |
| Allowed Teams     | Các Team được phép                    |

#### Sheet 3: AttendanceLog

Batch flush (10 records hoặc 20s):

| Cột        | Mô tả                |
| :--------- | :------------------- |
| Log ID     | ID dòng log          |
| Task ID    | Task liên kết        |
| Staff ID   | Mã nhân viên         |
| Staff Name | Tên nhân viên        |
| Slot Code  | Mã giờ ca            |
| Team       | Đội nhóm             |
| Scan Time  | Giờ quét (HH:mm:ss)  |
| Check Time | Giờ check (nếu có)   |
| Phase      | check-in / check-out |

**Log tail read:**  10k dòng cuối
**Reset task:**  Chunk 5000 dòng/lần, cần confirm dialog

### 5.2 Backend

- **Google Apps Script** — V8 runtime
- **LockService** script-level lock (10s timeout, write only)
- **Lock retry:**  3 lần
- **Lock timeout action:**  Reject scan + hiển thị toast lỗi
- **Batch flush:**  Lock + retry khi ghi lên sheet
- **Concurrent task creation:**  1 thành công, 1 reject
- **Concurrent scan:**  Queue + batch

### 5.3 Sheet Limits

- **Sheet full handling:**  Reject scan + hiển thị toast lỗi
- **Archive:**  Chưa cần (lưu vĩnh viễn)

---

## 6. Scan Pipeline (5 bước)

```plain
1. Validate    → Kiểm tra Staff ID tồn tại + Slot Code khớp task + Team khớp task + Phase restriction
2. Cooldown    → Chống quét trùng trong 15 giây
3. FindExisting → Tìm record đã quét trong batch + log
4. ExecuteStep → Ghi vào pendingBatch (check-in hoặc check-out)
5. Flush       → Batch flush lên AttendanceLog (10 records / 20s)
```

---

## 7. Giao diện & UX

### 7.1 Thiết bị

- **PC/Laptop** — kiosk tại kho
- Responsive toàn bộ (3 breakpoints: desktop > 1200px, tablet 768-1200px, mobile < 768px)

### 7.2 UI Layout

**2 chế độ:**

1. **Task List** — Danh sách task, tạo task, quản lý
2. **Scan Mode** — Giao diện quét barcode

### 7.3 Tech Stack

- **Frontend:**  Vanilla HTML + Bootstrap 5.3
- **Backend:**  Google Apps Script
- **Ngôn ngữ:**  Tiếng Việt only

### 7.4 UX Features

| Feature            | Chi tiết                                                                     |
| :----------------- | :--------------------------------------------------------------------------- |
| Optimistic UI      | Cập nhật UI ngay, server confirm async                                       |
| Client Cache       | localStorage + SWR caching + IndexedDB (large data)                          |
| Toast Notification | Top-right, stack down, slide animation                                       |
| Toast success      | Green, 2s auto dismiss                                                       |
| Toast error        | Red, **manual dismiss** (bấm để đóng)                                        |
| Toast duration     | Success: 2s, Error: manual                                                   |
| Sound Feedback     | Beep (success) + Buzz (error), Base64 embedded, Toggle on/off (localStorage) |
| URL Deep-linking   | Hash + query params (?task=ID), browser back/forward                         |
| Filter             | Multi-select Team + Slot Code, Clear All button                              |
| Offline Indicator  | "Offline — X scans pending" (hiển thị khi > 0)                               |
| Loading            | Bootstrap spinner + disable button, Full overlay, Skeleton tables            |
| Empty state        | Message                                                                      |

### 7.5 UI Elements

**Scan Mode:**

- List đã quét + ô nhập barcode + nút quét
- Auto-focus vào input barcode
- Barcode format: With prefix

**Task List:**

- List + Create button
- Sorting mặc định: Newest first

**Task Card:**

- Task ID + Status badge (Gray) + Progress (X/Y) + Action buttons
- Phase switch button trên task card

**Attendance List:**

- Table: Staff ID + Name + Slot Code + Team + Clock In Time + Check-in time + Check-out time
- Sort mặc định: By slot
- Hiển thị cả check-in count + check-out count

**Task Creation:**

- Form popup
- Allowed Slotcodes: Checkbox (default: all selected)
- Allowed Teams: Checkbox (default: all selected)

**Phase Indicator:**

- Hiển thị trên cả header + task card

### 7.6 Staff Data Refresh

- **Cả hai:**  Manual reload (admin bấm sync) + Auto reload mỗi X phút

### 7.7 Error Handling

- **Pattern:**  try-catch với error types (giống v1)
- Toast error + retry logic (giống v1)
- Error message: Tiếng Việt, ngắn gọn

### 7.8 Accessibility

- ARIA labels
- Basic tab keyboard navigation
- No screen reader support

### 7.9 Responsive Layout

- **Desktop (> 1200px):**  Full layout
- **Tablet (768-1200px):**  Scaled desktop
- **Mobile (< 768px):**  Bottom navigation (bottom nav)
- **Font size:**  Auto scale theo viewport

---

## 8. Storage

### 8.1 localStorage

| Key              | Mô tả             |
| :--------------- | :---------------- |
| Sound preference | Toggle on/off     |
| Offline queue    | 50-100 scans      |
| Last scan result | Kết quả scan cuối |
| Task cache       | Cache task list   |

### 8.2 IndexedDB

| Store          | TTL | Fallback     |
| :------------- | :-- | :----------- |
| AttendanceData | 24h | localStorage |

### 8.3 Cache Strategy

| Cache           | TTL       | Scope           |
| :-------------- | :-------- | :-------------- |
| Staff info      | 5 min     | Server + Client |
| Task list       | 30s       | Server + Client |
| Attendance list | 30s       | Server + Client |
| Cache eviction  | TTL-based | Giống v1        |

### 8.4 SWR

- **Stale time:**  15s (giống v1)
- **Refetch on focus:**  Có (giống v1)
- **Refetch interval:**  Staggered (0s, +15s, +30s)

---

## 9. Config (Script Properties)

| Property          | Giá trị         | Mô tả             |
| :---------------- | :-------------- | :---------------- |
| SPREADSHEET\_ID   | Admin set ID    | Google Sheet ID   |
| ADMIN\_EMAILS     | Comma-separated | Danh sách admin   |
| KIOSK\_DEPARTMENT | Script Property | Department filter |
| COOLDOWN\_MS      | 15000           | Cooldown time     |

---

## 10. EDGE CASES

| Scenario                    | Xử lý                         |
| :-------------------------- | :---------------------------- |
| Rapid scan (2x trong 1s)    | Reject (cooldown)             |
| Mất mạng giữa chừng         | Banner + queue                |
| Task đóng khi đang quét     | Flush + close                 |
| Check-out trước check-in    | Ghi + flag ngoại lệ           |
| Staff ID không tồn tại      | Reject + toast                |
| Task đã đóng, quét lại      | Reject                        |
| Batch paste trùng           | Skip duplicate                |
| Offline queue đầy           | Flush first                   |
| Concurrent scan cùng staff  | Lock + wait                   |
| Task name duplicate         | Random digits                 |
| Sheet full                  | Reject + toast                |
| Concurrent phase switch     | 1 reject                      |
| Tab close                   | Flush on close                |
| Page refresh                | Restore state từ localStorage |
| Phase restriction violation | Reject                        |
| Lock timeout                | Reject + toast                |

---

## 11. Kỹ thuật

### 11.1 Testing

- **Jest:**  Unit test + Mock GAS API, Lock, Cache, UrlFetch
- **Browser test:**  Playwright
- **Coverage:**  > 80%
- **Modules test:**  ScanPipeline, TaskManager, Database, AttendanceList
- **Flows test:**  Scan E2E, Task lifecycle, Offline sync, Batch paste

### 11.2 Deployment

- **New GAS project** (tạo mới, không tái sử dụng)
- **Version control:**  Fork repo
- **Version scheme:**  v2.0.0 (tiếp nối v1)
- **Test environment:**  Separate project
- **Rollback:**  Git rollback
- **CI/CD:**  Chưa cần

### 11.3 Naming Convention

| Loại         | Convention | Ví dụ                           |
| :----------- | :--------- | :------------------------------ |
| Server files | PascalCase | ScanPipeline.js, TaskManager.js |
| Client files | PascalCase | Scan.html, Tasks.html           |
| Functions    | PascalCase | DoScan, GetTasks                |

### 11.4 Code Style

- **Comments:**  JSDoc cho functions
- **Code organization:**  1 file = 1 module
- **Error handling:**  try-catch với error types

### 11.5 Documentation

- README.md + inline comments

### 11.6 Monitoring

- **Logging:**  Không cần (no console.log)
- **Error tracking:**  console.error
- **Performance metrics:**  Không cần (web app nội bộ)

---

## 12. Scope

### MVP (Full features)

```plain
✅ Barcode quét 5-step pipeline
✅ 2 loại task: Handover + Attendance
✅ Task State Machine: Created → CheckIn → CheckOut → Closed
✅ Phase restriction: Check-in phase chỉ check-in, CheckOut phase chỉ check-out
✅ 2 quyền: Admin / User
✅ Offline mode (50-100 scans queue, FIFO, flush on reconnect)
✅ Paste batch (bất kỳ ai, 100 items/chunk, retry failed)
✅ Audit log đơn giản (Scan, Create, Close → Sheet riêng, vĩnh viễn)
✅ Sound beep + buzz (Base64, toggle localStorage)
✅ URL deep-linking (?task=ID)
✅ Filter Team + Slot Code (multi-select, Clear All)
✅ GAS + Sheets backend
✅ Vanilla HTML + Bootstrap 5 frontend
✅ Optimistic UI + SWR caching (15s stale, refetch on focus)
✅ IndexedDB (24h TTL) + localStorage fallback
✅ Skeleton loading tables
✅ ARIA labels + basic keyboard
✅ Bottom nav cho mobile (< 768px)
✅ try-catch error handling pattern
✅ Lock timeout → Reject + toast
✅ Sheet full → Reject + toast
```

### Post-MVP (Làm SAU)

```plain
⏳ Dashboard thống kê real-time
⏳ Tìm kiếm / filter nâng cao
⏳ PWA (Service Worker)
⏳ Multi-language support
```

---

## 13. So sánh RollCall v1 vs v2

| Thuộc tính        | v1 (rollcall-kiosk)      | v2 (mới)                                       |
| :---------------- | :----------------------- | :--------------------------------------------- |
| Cache             | 8+ layers                | **Đơn giản hơn**                               |
| Data source       | Import CSV               | **Sheet HR có sẵn (auto đọc)**                 |
| Shift model       | 1 ca/task                | **Nhiều ca trồng lấn (Slot Code)**             |
| Task state        | 3 states                 | **4 states (Created→CheckIn→CheckOut→Closed)** |
| Phase restriction | Không có                 | **Có (theo phase)**                            |
| Attendance        | Single-step scan         | **Check-in + Check-out (2 lần quét)**          |
| Audit             | Full (9 action types)    | **Đơn giản (3 actions, vĩnh viễn)**            |
| Cross-task scan   | Reject                   | **Ghi cả 2 task**                              |
| Batch paste       | Admin only               | **Bất kỳ ai**                                  |
| Batch chunk       | 50 items                 | **100 items**                                  |
| Permission        | 3 cấp (Admin/Owner/User) | **2 cấp (Admin/User)**                         |
| Frontend          | Vanilla HTML + Bootstrap | **Giữ nguyên**                                 |
| Backend           | GAS + Sheets             | **Giữ nguyên**                                 |
| Pipeline          | 5-step scan              | **Giữ nguyên**                                 |
| Offline           | Full offline sync        | **Giữ nguyên**                                 |
| Sound             | Beep toggle              | **Beep + Buzz**                                |
| Storage           | localStorage             | **localStorage + IndexedDB**                   |
| Browser test      | QUnit                    | **Playwright**                                 |
| Error toast       | Auto dismiss             | **Manual dismiss**                             |
| Loading           | Spinner                  | **Spinner + Skeleton**                         |
| Accessibility     | Basic                    | **ARIA + basic keyboard**                      |
| Mobile            | Responsive basic         | **Bottom nav**                                 |
| Error handling    | try-catch                | **try-catch (giữ nguyên)**                     |
| SWR               | Staggered                | **Giữ nguyên**                                 |
| Lock timeout      | Unknown                  | **Reject + toast**                             |
| Sheet full        | Unknown                  | **Reject + toast**                             |
| Version           | v3.0.0                   | **v2.0.0**                                     |
