# Intent — Điểm Danh HN2 SOC (MVP)

> Xác nhận: 2026-08-02 (sau interview `/interview-me`)
> Repo: `C:\Users\Van90BG\Documents\AppScript\Điểm Danh HN2 SOC`
> Mẫu csv: `Att.csv` (242 dòng, 1 ngày 8/1/2026, 20 cột)

## Outcome

Điểm danh kiểm-soát có/vắng/trễ cho nhân viên/công nhân kho chuyển phát nhanh, nhiều ca chéo trong ngày. Đối chiếu "danh sách phải có" (theo csv) vs "quét thấy" → báo có/vắng/trễ/thừa. **Không sửa chấm công, không ghi đè giờ, không tự suy ca**.

## User

Quản lý / tổ trưởng tại 2 kho (HN SOC, HN2 SOC). Có quyền tạo task điểm danh, chọn phạm vi (station / slotcode / team), quét barcode NV.

## Why now (pain từ v1)

- **A — Perf/quota**: AuditLog per-scan tốn quota, `_rebuildAttendanceIndex` gọi `Session.getScriptTimeZone()` mỗi dòng, cache invalidation rác, deadline 6 phút khi log lớn.
- **B — Phễu scan phase-aware quá phức tạp** với nhiều bug: pha check-in/check-out-split + skip-check-in + reopen, giờ quét vs giờ check mơ hồ, trạng thái "Đã quét — chờ check".
- **C — UI mỏng / lỗi hiển thị**: font dot-matrix mờ, empty-state nói sai, spinner không load, toast nói 2 kiểu, nút lỗi `ReferenceError`, row có dấu `?` ở cột Team.
- **D — Cấu trúc task/handover deadlock**: Station A blocking B ("Đang quét"), reopen tranh chấp, deadlock khi A đóng task mà B chưa nhận.

V2 có dữ liệu csv đã định nghĩa ca sẵn (`Slot Code`)  + Clock In/Out bên ngoài → v2 không sinh giờ check-in/out → triệt B/D + nhiều C từ gốc.

## Khác biệt cốt lõi với v1

- **Không phase check-in/check-out-split**. 1 quét = 1 dấu "có mặt lúc T". Ca & vị trí duty lấy từ csv (`Slot Code`, `Station`, `Team`, `Workstation`).
- **Dữ liệu gốc = csv đồng bộ** từ hệ thống (định dạng `Att.csv` như mẫu: 20 cột, `Clock In/Out`, `Slot Code` text `HH:MM-HH:MM`, `Station` phân biệt). V2 chỉ **đọc** csv làm baseline đối chiếu, không sửa.
- **19 ca = bộ tham chiếu**, không validate. V2 group theo `Slot Code` text nguyên thô.

## 2 luồng nghiệp vụ

| | Luồng 1 (2 bước) | Luồng 2 (1 bước) |
|---|---|---|
| Thời điểm 1 | Quét lần 1 (lấy danh sách) | `taskCreated` (lúc tạo task) |
| Thời điểm 2 | Quét lần 2 (đối chiếu) | Quét từng NV |
| Cách nhập `timeRef` vào sheet | Quét NV-bond batch 50/100 | Batch 1 lần cho cả danh sách (csv_filtered) lúc tạo task |
| Sheet Log khởi tạo | Trống — NV điền qua quét lần 1 | Pre-fill toàn bộ NV khớp (station+slot+team) |
| Cột `timeScan` | Update lần 2 | Update mỗi lần quét |

Luồng "đi hỗ trợ": NV từ HN SOC sang HN2 SOC → csv của HN2 SOC sẽ phản ánh dòng mới với `Station=HN2 SOC`. Nếu csv chưa kịp cập nhật, người tạo task **tự chọn phạm vi** (station/slotcode/team) để bù. V2 không join csv giữa 2 station.

## Triển khai

1 GAS project duy nhất. Csv có thể gộp nhiều station vào 1 sheet (cột `Station` phân biệt), hoặc tách 2 sheet — do user chủ động khi xuất. Khi tạo task: chọn station nếu có nhiều, hoặc đọc Config/Script Properties mặc định.

## Ngôn ngữ (convention)

- **Cột sheet / file / code**: tiếng Anh — `staffId`, `staffName`, `slotCode`, `station`, `team`, `workstation`, `cardIn`, `cardOut`, `taskCreated`, `timeRef`, `timeScan`, `status`.
- **Hiển thị web** (header bảng, nút, badge, label): tiếng Việt — `Mã NV`, `Tên NV`, `Ca`, `Station`, `Team`, `Card In`, `Card Out`, `Giờ tạo task`, `Giờ có mặt`, `Giờ quét`, `Trạng thái`; nút `+ Đối chiếu` / `+ Điểm danh`, `Quét`, `Kết thúc`; badge `Có mặt` / `Vắng` / `Dư`.

## Trạng thái đối chiếu (badge)

| Hiện tượng | Badge | Màu |
|---|---|---|
| Trong csv + đã quét | `Có mặt` | xanh |
| Trong csv + chưa quét | `Vắng` | đỏ |
| Quét nhưng không trong danh sách chốt (không trong pre-fill, khác tổ hợp, hoặc không có trong StaffData) | `Dư` | cam |

## Schema sheet Log (1 dòng / NV — Q13=A)

`staffId`, `staffName`, `slotCode`, `station`, `team`, `workstation`, `cardIn` (csv), `cardOut` (csv), `taskCreated`, `timeRef`, `timeScan`, `status`.

- **Luồng 1**: `timeRef` = giờ quét lần 1, `timeScan` = giờ quét lần 2.
- **Luồng 2**: `timeRef` = `taskCreated` (điền batch lúc tạo task), `timeScan` = giờ quét từng NV.

## Task state (生命周期)

| State | Ý nghĩa | Áp dụng |
|---|---|---|
| `open` | Đang quét (lần 1 cho luồng 1, đối chiếu cho luồng 2) | cả 2 |
| `sealed` | Đã chốt danh sách (chỉ có luồng 1, sau nút `Chốt danh sách`) | luồng 1 |
| `done` | Kết thúc, khóa quét | cả 2 |

**Không có** state `Chờ bàn giao` / `Đang nhận` như v1 → tránh pain D.

## Pha triển khai (Q14 = A)

- **Phase 0 (MVP)**: Chỉ luồng 2 (1 bước đối chiếu từ csv). Nút `+ Đối chiếu`.
- **Phase 1** (sau khi Phase 0 ổn): Luồng 1 (2 bước). Nút `+ Điểm danh`, state `sealed`, nút `Chốt danh sách`.
- **Phase 2+**: Báo cáo/export, đồng bộ csv tự động, tiện ích bổ sung.

## Success

Quản lý mở task cho 1 (station, slotcode, team), quét NV, thấy ngay `Có mặt / Vắng / Dư` đúng như csv phản ánh. Không có deadlock/blocking Station A↔B. App performance ổn trên 500–1000 NV, không tốn quota AuditLog per-scan.

## Constraints

- GAS WebApp (GSheet + Apps Script + HTML).
- Peak load ~10–15 scan/giây (tham chiếu v1).
- 6 phút quota GAS.
- Tiếng Việt giao diện, font rõ (sans-serif, không dot-matrix), không dấu `?` ở cột Team, không over-engineer.

## Out of scope

- V2 **không** sinh/ghi giờ check-in/check-out (việc hệ thống chấm công bên ngoài).
- V2 **không** tự suy ca từ giờ quét.
- V2 **không** làm payroll, phạt đi trễ, tính công, overtime.
- V2 **không** làm scheduling / ca-changing.
- V2 **không** cài đặt phức tạp khi đơn giản đủ dùng.
- **Không copy source v1** — chỉ mượn pattern (cache wrapper, batch flush) nếu phù hợp.

---

## Câu hỏi còn bỏ ngỏ (xác định sau)

- Cơ chế đồng bộ `Att.csv` → GSheet (import thủ công / Apps Script API / Trigger). Chốt ở spec Phase 0.
- Phân quyền người dùng (ai được tạo task, ai chỉ quét). Chốt sau MVP.
- Báo cáo/export định dạng gì, khi nào. Phase 2+.

---

*Lưu: intent này là kết quả interview `/interview-me` ngày 2026-08-02. Spec chi tiết Phase 0 sẽ do `spec-driven-development` sản xuất kế tiếp.*
