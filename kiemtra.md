# Báo cáo kiểm tra code — Điểm Danh HN2 SOC

**Model đánh giá:** ling-3.0-flash-fin-free  
**Ngày:** 2026-08-29

---

## 1. Tổng kết

| Lệnh | Test | Pass | Fail |
| :--- | :--- | :--- | :--- |
| `npm test` | JS (Node `node --test`) | 368 | 0 |
| `npm run test:py` | Python (`unittest discover`) | 85 | 0 |
| `npm run build:local` + `npm run test:chrome` | Chrome CDP headless | 11 | 0 |

**Tổng cộng: 464 tests, 0 failures.**

---

## 2. Chi tiết từng lệnh

### 2.1. `npm test` — 368 tests JS

```
node --test tests/*.test.js
```

- 27 file test, tất cả pass.
- Cover: ScanLogic, CsvUtil, TaskSearch, camera (autosnap/code128/continuous/popup), css/inline-html, scan-classify, submit-scan-guard, task-cards/task-menu/task-search, jsonp-api, header-search, meal-create, note-edit, ocr-scan, scan-cards/scan-update-epoch, gs-syntax, formula-injection, cache-layer, cdp-helper, code-doget, js-scanmode.
- Duration: ~7521ms.
- Không có test nào fail, không có lỗi runtime.

### 2.2. `npm run test:py` — 85 tests Python

```
python3 -m unittest discover -s api -p 'test_*.py'
```

- 5 file test (`test_database.py`, `test_logic.py`, `test_main.py`, `test_services.py`, `test_sheets.py`).
- Tất cả pass, duration ~446ms.
- **Lưu ý:** output in ra 1 traceback từ `api/main.py:87` — `RuntimeError: secret path /home/abc`. Đây là lỗi được test cố ý kích hoạt để kiểm tra handling, nhưng traceback in ra stdout thay vì bị swallow. Xem mục bug bên dưới.

### 2.3. `npm run build:local` + `npm run test:chrome` — 11 tests Chrome CDP

```
node scripts/build-local.js  →  index.local.html
CHROME_PATH=<puppeteer-chrome> node scripts/test-local-mock.js
```

- 11 check pass: load mock, task list 30 rows, openScan 6 rows (S:3 A:3 E:1), quét Ops229444 (S+1 A-1), quét trùng (S không tăng), quét NV lạ (Dư+1), backToList.
- Duration: vài giây.
- **Lưu ý:** Chrome không tìm tự động — phải đặt `CHROME_PATH` thủ công. Xem mục bug/optimization bên dưới.

---

## 3. Bug & Vấn đề phát hiện

### 3.1. [P2] Traceback in stdout trong test Python

- **Vị trí:** `api/main.py:87` — hàm `_bad_request` raise `RuntimeError("secret path /home/abc")`.
- **Triệu chứng:** Khi chạy `npm run test:py`, output in ra `RuntimeError: secret path /home/abc` traceback dù tất cả test đều pass.
- **Gốc:** Test mock đang gọi hàm raise error để verify error handling, nhưng traceback bị in ra stdout thay vì bị catch/supress.
- **Ảnh hưởng:** Chỉ là noise trong log, không ảnh hưởng kết quả test.
- **Ghi chú:** Đây là test đang verify behavior error path — không phải bug thực sự của ứng dụng.

### 3.2. [P3] Chrome test không tự động tìm được Chrome trên hệ thống

- **Vị trí:** `scripts/test-local-mock.js:41-45` — danh sách path tìm Chrome.
- **Triệu chứng:** Trên hệ thống này, `/usr/bin/chromium-browser` chỉ là script chuyển tiếp (transitional package) trỏ đến `/snap/bin/chromium` không tồn tại. Script tìm không được Chrome thật, fallback vào `google-chrome` → `ENOENT`.
- **Cách khắc phục tạm:** Phải đặt `CHROME_PATH=/home/caigicungdc98/.cache/puppeteer/chrome/linux-152.0.7977.64/chrome-linux64/chrome`.
- **Gợi ý fix:** Thêm path puppeteer Chrome cache vào danh sách auto-detect, hoặc dùng `puppeteer` package để tự tìm Chrome.

### 3.3. [P3] Glob pattern `tests/*.test.js` có thể sót file trong subdirectory

- **Vị trí:** `package.json:8` — `"test": "node --test tests/*.test.js"`.
- **Ghi chú:** Bash expand glob trước khi truyền cho Node, nên không ảnh hưởng hiện tại. Nhưng nếu thêm test file trong subdirectory `tests/unit/` sẽ bị bỏ qua. `node --test tests/**/*.test.js` hoặc dùng `node --test 'tests/**/*.test.js'` sẽ an toàn hơn.

---

## 4. Đề xuất tối ưu

### 4.1. [P3] Nên suppress traceback trong test Python error path

- Trong `api/main.py`, hàm `_bad_request` hoặc test mock nên wrap error trong try/catch hoặc dùng `warnings.catch_warnings` để không in traceback ra stdout khi test error handling.

### 4.2. [P3] Nâng cấp auto-detection Chrome trong `test-local-mock.js`

- Thêm các path thường gặp của puppeteer cache: `~/.cache/puppeteer/chrome/*/chrome-linux64/chrome`.
- Hoặc cài `puppeteer` làm devDependency để dùng `puppeteer.executablePath()`.
- Hoặc simplest: thêm `CHROME_PATH` vào `.env` hoặc script wrapper.

### 4.3. [P2] Nên tách `npm test:py` output sạch hơn

- Hiện tại output của Python test trộn traceback với kết quả pass/fail. Nên dùng `-v` flag hoặc redirect stderr riêng để user dễ đọc.

### 4.4. [P3] Xem xét thêm `test:chrome` vào CI gate

- Theo AGENTS.md §21, `test:chrome` nên chạy trong CI (`.github/workflows/deploy.yml`). Đã được đề cập nhưng cần verify script CI có đủ `CHROME_PATH` setup không.

---

## 5. Tình trạng tổng thể

- **Correctness:** ✅ Tất cả 464 tests pass.
- **Readability:** ✅ Test naming rõ ràng, cover cả edge case.
- **Security:** ✅ Không lộ secrets, test XSS/SQL injection paths.
- **Performance:** ✅ JS test ~7.5s, Python ~0.5s — hợp lý.
- **Reliability:** ⚠️ Chrome test cần setup thủ công CHROME_PATH.

---

## 6. Verification

1. `npm test` → 368 pass, 0 fail ✅
2. `npm run test:py` → 85 pass, 0 fail ✅
3. `npm run build:local` → `index.local.html` built ✅
4. `CHROME_PATH=<path> npm run test:chrome` → 11 pass, 0 fail ✅
