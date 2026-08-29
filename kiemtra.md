# Báo cáo rà soát & đánh giá mã nguồn — Điểm Danh HN2 SOC

- **Ngày đánh giá:** 2026-08-29
- **Model đánh giá:** hy3-free (opencode)
- **Phạm vi:** Toàn bộ repo (10 file `.gs` + `api/*.py` + `tests/*` + UI 3 file `index.html`/`css.html`/`js.html` + camera + scripts)
- **Quy tắc:** Chỉ rà soát + chạy test độc lập. **KHÔNG sửa code** (theo yêu cầu user).

---

## 1. Kết quả chạy test (độc lập, toàn bộ)

| Bộ test | Lệnh | Kết quả |
| :--- | :--- | :--- |
| JS (`node --test`) | `npm test` | **368 pass / 0 fail** (27 file, 7.3s) |
| Python (`unittest`) | `npm run test:py` | **85 pass / 0 fail** (0.5s) |
| Chrome (CDP headless) | `npm run test:chrome` | **11 / 11 pass** |
| Syntax check `.gs` | `node --check *.gs` | 10/10 file OK |
| Syntax check `.py` | `python3 -m py_compile api/*.py` | OK (1 warning nhỏ, xem B4) |

**Ghi chú về test:chrome:** Môi trường sandbox không có Chrome (`spawn google-chrome ENOENT`),
và `apt` chỉ cài được stub `chromium-browser` (snap) không chạy được. Để khắc phục và chạy được
test (không sửa code), tôi đã tải **Chrome-for-Testing 152.0.7977.64 (linux64)** về `/tmp` và chạy
với `CHROME_PATH=/tmp/chrome-linux64/chrome npm run test:chrome` → 11/11 pass.

**Kết luận test:** Không có test nào fail. Contract JS↔Python khớp (cả 2 runtime đều xanh).

---

## 2. Danh sách BUG / lỗi (chi tiết)

### [B1] Bảo mật — JSONP callback sanitize quá lỏng (reflected gadget)
- **Vị trí:** `JsonpApi.gs:70-78` (`sanitizeCallback_`)
- **Mô tả:** Regex cho phép member-expression dạng `a.b.c`
  (`/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/`), chỉ chặn `__proto__`/`constructor`/`prototype`.
  → Kẻ tấn công có thể truyền `?cb=window.alert` (hoặc `window.open`, `console.log`, `document.<x>`…).
  Output phản chiếu thành `window.alert({...api response...});`. Dù argument là dữ liệu server (không
  do attacker kiểm soát), cuộc gọi hàm phản chiếu vẫn có thể **lấy cắp response API chứa dữ liệu nội bộ**
  (danh sách NV, task) hiển thị / chuyển tiếp cho nạn nhân qua một link độc.
- **Bằng chứng:** `tests/jsonp-api.test.js:96-99` chỉ assert fallback với `__proto__`, `constructor`,
  `$.ajax`, `a.b$c_1`… — **không** bắt `window.alert` hay `document.x.y`. Test xanh nhưng lỗ hổng còn.
- **Mức độ:** Quan trọng (Security / P1)
- **Gợi ý fix (chưa sửa):** chỉ cho phép identifier đơn `^[A-Za-z_$][A-Za-z0-9_$]*$`, không cho dấu chấm.

### [B2] Đúng đắn — Counter danh sách task không tính trạng thái "Ra ngoài" (OUT) cho meal-move
- **Vị trí:** `Database.gs:367-389` (`taskCountersForList_`)
- **Mô tả:** Hàm chỉ tính `total / scanned (có TIME_SCAN) / extra (status EXTRA)`. Một NV meal-move
  đã quét **Ra** nhưng **chưa Vào** (status `OUT`) được tính vào `total` nhưng không nằm ở `scanned`,
  `extra` hay `absent` → **S + A + E ≠ total** trên danh sách task. Trong khi `computeCounters`
  (`ScanLogic.gs:78-96`) đã có trường `out` riêng và detail view dùng nó.
- **Hậu quả:** Người dùng nhìn tổng task thấy số không khớp (thiếu nhóm "Ra ngoài" chưa Vào).
- **Mức độ:** Quan trọng (Correctness / P1)
- **Gợi ý fix (chưa sửa):** đưa trường `out` vào `taskCountersForList_` + đưa vào `computeTaskListSig`
  và client hiển thị counter `out`.

### [B3] Robustness — Meal-move quét thiếu `mode` → NV mới bị ghi "Dư" (EXTRA)
- **Vị trí:** `ScanService.gs:208-214` (`resolveMealMoveMode_`) + `ScanLogic.gs:224-225`
- **Mô tả:** Khi client gửi thiếu `mode`, `resolveMealMoveMode_` mặc định `'vao'`. Với mã NV **chưa có
  trong log** (append), nhánh `mode === 'vao'` → `buildMealMoveExtraRow` status `EXTRA` (Dư). Tức là
  lần quét đầu của 1 người hoàn toàn mới vào meal-move mà thiếu mode sẽ bị ghi **Dư** thay vì **Ra**.
- **Hậu quả:** Dữ liệu sai (nhầm Dư) nếu UI/client lỡ gửi thiếu mode.
- **Mức độ:** Trung bình (P2)
- **Gợi ý fix (chưa sửa):** fail-closed bắt buộc `mode` hợp lệ cho meal-move, hoặc ưu tiên `'ra'`
  khi task meal-move chưa có log Ra nào.

### [B4] Code quality (nhỏ) — Python `SyntaxWarning: invalid escape sequence` trong docstring
- **Vị trí:** `api/main.py:1` (docstring chứa `\.` chưa phải raw string)
- **Mô tả:** `python3 -m py_compile` báo `SyntaxWarning: invalid escape sequence '\.'`. Không ảnh
  hưởng runtime, nhưng là warning rác và sẽ thành error ở Python 3.12+ strict.
- **Mức độ:** Nhỏ (P3)
- **Gợi ý fix (chưa sửa):** dùng raw string `r"..."` cho docstring chứa regex.

---

## 3. Đề xuất TỐI ƯU (performance / kiến trúc)

### [O1] `searchStaffApi` đọc full StaffData (20 cột) chỉ để tìm 1 mã
- **Vị trí:** `Code.gs:219` (`searchStaffApi` gọi `readStaffList_()`)
- **Mô tả:** Hàm đọc toàn bộ StaffData (parse 20 cột) chỉ để tìm profile của mã đang tìm, trong khi
  đã có `readStaffIndex_()` (slim, cached 5m) đủ dùng cho tra cứu. Lãng phí 1 lần đọc/parse sheet lớn
  mỗi lần search.
- **Gợi ý:** thay `readStaffList_()` bằng `readStaffIndex_()` cho phần tìm `staff`.

### [O2] `getStaffIndexApi` trả TOÀN BỘ index mỗi lần (không delta/signature)
- **Vị trí:** `Code.gs:272-287`
- **Mô tả:** Không có signature như `getTaskListApi`/`getTaskDetailApi` → mỗi lần gọi truyền toàn bộ
  index (lên tới ~100KB với 750 NV). Client có localStorage cache nhưng lần đầu (và mỗi khi cache hết)
  tốn băng thông lớn.
- **Gợi ý:** thêm `clientSig` + trả `{ok, unchanged:true}` khi không đổi (như O-A delta poll).

### [O3] `createReconcileTask` đọc StaffData 2 lần trong lock
- **Vị trí:** `TaskService.gs:66` (`readStaffList_()`) + `TaskService.gs:72` (`readStaffIndex_()`)
- **Mô tả:** Trong cùng 1 lock, hàm đọc full StaffData (để lọc tổ hợp) rồi lại đọc staffIndex (slim).
  Có thể dùng chung 1 lần đọc `readStaffList_` để vừa lọc vừa build index tạm, giảm 1 lần parse sheet.
- **Gợi ý:** tái dùng kết quả `readStaffList_` đã có thay vì gọi `readStaffIndex_()` riêng.

### [O4] `taskCountersForList_` đọc lại toàn bộ AttendanceLog mỗi lần miss cache
- **Vị trí:** `Database.gs:367-389`
- **Mô tả:** Với log rất lớn (10k+ dòng) chạy mỗi 30s (cache). Đã cached nên chấp nhận, nhưng có thể
  chuyển sang incremental index theo taskId để tránh quét full sheet khi log phình.
- **Mức độ:** Tùy chọn (P3) — chỉ can thiệp khi log thực tế >10k dòng.

### [O5] `pasteMealMoveScan` không ghi `durationMinutes` (không phải bug)
- **Vị trí:** `ScanService.gs:313-322`
- **Mô tả:** Batch paste không set cột duration. Tuy nhiên `LOG_COLS` không có cột duration (tính lại
  khi đọc ở `logFromRow_` — `Database.gs:431`), nên data hiển thị vẫn đúng. Chỉ là redundancy, không
  cần sửa. Ghi nhận để tránh hiểu nhầm sau này.

---

## 4. Đánh giá tổng quan

- **Chất lượng chung:** Rất tốt. Code tuân thủ chặt chẽ quy ước GAS (batch `getValues`/`setValues`,
  cache có fallback, lock scope tối thiểu, timezone cache, sanitize formula injection A1, fail-closed
  permission). Phủ test rộng (368 JS + 85 py + 11 chrome) và contract JS↔Python khớp.
- **Bug nghiêm trọng (P0):** Không có.
- **Cần ưu tiên fix:** **B1 (bảo mật JSONP)** > **B2 (counter meal-move)** > B3.
- **Không tự sửa code** theo yêu cầu — các gợi ý trên chỉ để tham khảo, chưa áp dụng.
- **Test:** Toàn bộ xanh sau khi khắc phục môi trường thiếu Chrome (cài Chrome-for-Testing).

---

*Báo cáo do model **hy3-free (opencode)** tạo ra — chỉ rà soát, không thay đổi mã nguồn.*
