<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12&height=240&section=header&text=Shopee%20Express&fontSize=44&fontColor=fff&animation=fadeIn&fontAlignY=36&desc=Kiosk%20%E2%80%A2%20Barcode%20%2B%20Camera%20AI%20%E2%80%A2%20Dual%20Runtime&descAlignY=57&descAlign=50" width="100%" />

<p align="center">
  <a href="https://github.com/Duc-Nguyen-739/spx-diem-danh"><img src="https://img.shields.io/badge/Repo-Duc--Nguyen--739%2Fspx--diem--danh-EE4D2D?style=for-the-badge&logo=github&logoColor=white" alt="repo" /></a>
  <img src="https://img.shields.io/badge/Branch-main-0d111a?style=for-the-badge" alt="branch" />
  <img src="https://img.shields.io/badge/version-v0.1.0-FF8A5C?style=for-the-badge" alt="version" />
  <img src="https://img.shields.io/badge/GAS-V8%20%7C%20DOMAIN-4285F4?style=for-the-badge&logo=googleappsscript&logoColor=white" alt="gas" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-481%20passing-188038?style=for-the-badge&logo=vitest&logoColor=white" alt="tests 481" />
  <img src="https://img.shields.io/badge/Node-%3E%3D22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="node" />
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="python" />
  <img src="https://img.shields.io/badge/Sheets-API-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" alt="sheets" />
  <img src="https://img.shields.io/badge/deploy-clasp%20redeploy-0d111a?style=for-the-badge&logo=googlecloud&logoColor=white" alt="deploy" />
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=800&size=18&duration=2200&pause=900&color=EE4D2D&center=true&vCenter=true&width=760&lines=Kiosk+1+m%C3%A0n+%E2%80%A2+qu%C3%A9t+10-15+m%C3%A3%2Fgi%C3%A2y+%E2%80%A2+epoch+l%C3%A0+s%E1%BB%B1+th%E1%BA%ADt;GAS+WebApp+%2B+Python+backend+%E2%80%A2+c%C3%B9ng+1+domain+logic;Ops...+%E2%86%92+C%C3%B3+m%E1%BA%B7t+%2F+V%E1%BA%AFng+%2F+D%C6%B0+%2F+Ra+ngo%C3%A0i" alt="typing" />
</p>

<p align="center">
  <b>Repo:</b> <code>Duc-Nguyen-739/spx-diem-danh</code> &nbsp;•&nbsp; <b>Branch:</b> <code>main</code> &nbsp;•&nbsp; <b>Timezone:</b> <code>Asia/Ho_Chi_Minh</code><br/>
  <a href="docs/spec/2026-08-02-phase0-spec.md">📄 Spec Phase 0</a> &nbsp;•&nbsp;
  <a href="docs/intent/diem-danh-hn2-soc.md">🎯 Intent</a> &nbsp;•&nbsp;
  <a href="AGENTS.md">📜 AGENTS</a> &nbsp;•&nbsp;
  <a href="skills/project-skill/SKILL.md">🧠 Skill</a>
</p>

<p align="center">
  <sub><b>Tạo hình 2026:</b> Aurora mesh + Bento grid + Glassmorphism 2.0 + Dark Industrial HUD &nbsp;•&nbsp; <b>Neon:</b> <code>#EE4D2D</code> &nbsp;•&nbsp; <b>Tokens:</b> 39 <code>:root</code> &nbsp;•&nbsp; <b>Kiosk:</b> 1 màn, không sidebar</sub>
</p>

---

### 🧭 Mục lục

<p align="center">

`🎯 TL;DR` • `✨ Bento` • `🏗️ Kiến trúc` • `🧱 Tech` • `📁 Cấu trúc` • `🗄️ Sheets` • `⚡ 30s Start` • `🧪 481 Tests` • `🚀 Deploy` • `📏 Quy ước`

</p>

---

## 🎯 TL;DR — Kiosk điểm danh kho HN2 SOC

> **Shopee Express — Điểm Danh HN2 SOC** · Quét barcode `Ops…` trên kiosk kho, đối chiếu với `StaffData` (20 cột từ `Att.csv`) theo tổ hợp `Station / Slot Code / Team / Ngày / Loại HĐ` → badge **Có mặt / Vắng / Dư / Ra ngoài** · **Epoch `timeScanEpoch`/`timeRaEpoch` là nguồn sự thật** — không dùng text `HH:mm:ss` để đếm/sort.

- **Không sửa chấm công, không ghi đè giờ.** 1 task = 1 tổ hợp lọc `StaffData` → pre-fill `AttendanceLog` batch 1 lần (`timeRef = createdAt`).
- **2 loại task:** `reconcile` (1 mốc Vào) · `meal-move` (2 mốc Ra/Vào + agency/Vender, paste 200 mã/lần, dedup 1.5s).
- **Camera AI liên tục:** ZXing (chính) → fallback Quagga 2-config + jsQR → Tesseract OCR; Web Worker 3–4 binarizer xoay vòng; `contrast(1.35)`; tick 200ms; dedup 1.5s; scan liên tục không đóng camera.
- **Dual runtime:** GAS WebApp (kiosk chính, `DOMAIN`) + Python `api/` mirror cùng logic — hosting top-level khi org khóa `Anyone`.

---

## ✨ Tính năng — Bento 2026

<table>
<tr>
<td width="33%" valign="top">

#### 🎫 Tạo task
`reconcile` / `meal-move`
- Station · Ca · Team · Ngày · Loại HĐ
- Chip filter 1 chạm (kiosk touch)
- 1 task = 1 tổ hợp `StaffData`
- **meal-move** Station+Team trống → tạo task rỗng rồi paste

</td>
<td width="33%" valign="top">

#### ⚡ Quét & đối chiếu
- `Ops…` case-insensitive → **Có mặt / Đã điểm danh / Dư / Ra ngoài**
- **Counters epoch** `timeScanEpoch`/`timeRaEpoch` — xuyên nửa đêm chuẩn
- **Queue 1ms** + optimistic + `STALE row` guard (`taskId`+`staffId`)
- `DUPLICATE_WINDOW 1.5s` ↔ `CAM_COOLDOWN 1.5s`

</td>
<td width="33%" valign="top">

#### 📷 Camera AI
- **ZXing** (chính) + Quagga + jsQR — fallback đa bậc + `TRY_HARDER`
- Tesseract **OCR** đọc `Ops…` khi vạch mờ
- **Web Worker** 3–4 binarizer + fail-open
- Popup GAS iframe · Live modal standalone — quét liên tục, list cuộn

</td>
</tr>
<tr>
<td width="33%" valign="top">

#### 🔍 Tìm kiếm
- Header search `Ops…` → hồ sơ NV + filter task đã điểm danh
- Bảng scan: search · filter status · sort cột (debounce 150ms)
- `?demo=1` mock data không cần GAS

</td>
<td width="33%" valign="top">

#### 🎨 Kiosk UX
- **Scan card projector** + **toast** (không `alert`) + `stampIn` + `scanLine` aurora
- **Dark Industrial HUD** `#0d111a` + neon `#EE4D2D` + glass overlay
- **beep/buzz** Web Audio 🔊/🔇 + `AudioContext` unlock on gesture
- **Poll 3s** · skeleton · focus trap 3s · sticky topbar

</td>
<td width="33%" valign="top">

#### ♿ A11y & Polish
- Skip-link · `prefers-contrast` · badge nền đặc · chip `aria-pressed`
- 39 tokens `:root` — không hardcode màu/spacing/radius
- Truck `SPX` chạy dưới logo · `±` zoom camera thủ công (auto zoom đã tắt)
- `table-layout:fixed` + `content-visibility:auto` — 600 dòng vẫn mượt

</td>
</tr>
</table>

> **Kết thúc task** → dòng chưa quét gán **Vắng** (modal confirm) · `PRESENT` có `timeScan` nhưng `PENDING` sẽ auto-repair → `reopenTask` reset `Vắng→PENDING` · **Dư** linh hoạt — mã ngoài hệ thống vẫn ghi `Dư` không chặn luồng.

---

## 🏗️ Kiến trúc dual runtime — 1 logic, 2 nơi chạy

> Đổi logic quét/classify → sửa **cả `.gs` lẫn `api/*.py`** + chạy `npm test` + `npm run test:py` (§19 `AGENTS.md`)

```mermaid
graph TD
    A["GAS WebApp<br/>kiosk chính<br/>Code.gs doGet + isEditor_"] <--> C[("Google Sheets<br/>4 sheets<br/>SPREADSHEET_ID via Properties")]
    B["Python Backend<br/>hosting top-level<br/>api/main.py JSONP/POST"] <--> C

    A --> A1["ScanService.gs → ScanLogic.gs<br/>pure classify"]
    A --> A2["Database.gs + CacheLayer.gs<br/>rc2 v1/v2 · bump rev"]
    A --> A3["TaskService / TaskSearch<br/>index.html + css/js/camera"]
    B --> B1["services.py → scanlogic.py<br/>port y hệt .gs"]
    B --> B2["database.py + cache.py"]
    B --> B3["sheets.py / config / csvutil<br/>dist/index.html inline"]

    style A fill:#EE4D2D,stroke:#0d111a,color:#fff
    style B fill:#3776AB,stroke:#0d111a,color:#fff
    style C fill:#34A853,stroke:#0d111a,color:#fff
```

<details>
<summary><b>📐 Luồng quét chi tiết (click mở)</b></summary>

```
scanStaffApi (Code.gs) → scanStaff (ScanService.gs) → classifyScan / classifyMealMoveScan (ScanLogic.gs pure)
  + readTaskCached_ / readLogRowsCached_ / appendLogRow_ / updateLogRowScan_ / updateLogRowRa_ (Database.gs)
  + readStaffIndex_ (lazy, chỉ khi NV lạ) + LockService.waitLock(10000) + releaseLock() finally
  + isValidBarcodeId() guard "Ops" + DUPLICATE_WINDOW_MS 1500ms ↔ CAM_CODE_COOLDOWN_MS
  + STALE guard: verify TASK_ID + STAFF_ID tại _rowIndex trước khi ghi (chống sheet bị sort tay)
```

</details>

---

## 🧱 Tech Stack — hot 2026

| Thành phần | Công nghệ | Ghi chú 2026 |
| :--------- | :-------- | :----------- |
| 🎨 **Frontend** | ![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) ![CSS](https://img.shields.io/badge/CSS-1572B6?style=flat-square&logo=css3&logoColor=white) ![JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=flat-square&logo=javascript&logoColor=000) | **3-file split** `index.html` + `css.html` (`<style>`) + `js.html` (`<script>`) qua `<?!= include() ?>` · 39 tokens `:root` · HUD dark |
| 📷 **Camera** | ![ZXing](https://img.shields.io/badge/ZXing-CDN-FF6B35?style=flat-square) ![Quagga](https://img.shields.io/badge/Quagga-vendored-0d111a?style=flat-square) ![Tesseract](https://img.shields.io/badge/Tesseract-OCR-34A853?style=flat-square) | `camera-scan.html` + Worker 3–4 binarizer + `contrast(1.35)` · **manual `−/+` zoom** (auto zoom off) · tick 200ms |
| ☁️ **Backend GAS** | ![GAS](https://img.shields.io/badge/Google_Apps_Script-V8-4285F4?style=flat-square&logo=googleappsscript&logoColor=white) | `Code.gs` + 8 module `.gs` · `V8` · `Asia/Ho_Chi_Minh` · `USER_DEPLOYING` · `DOMAIN` · `LockService 10s` |
| 🐍 **Backend Python** | ![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white) ![API](https://img.shields.io/badge/API-JSONP%2FPOST-009688?style=flat-square) | `api/main.py` · `scanlogic.py` · `services.py` · `database.py` · `sheets.py` · `google-api-python-client` |
| 🗄️ **Database** | ![Sheets](https://img.shields.io/badge/Google_Sheets-4_sheets-34A853?style=flat-square&logo=googlesheets&logoColor=white) | ID via **Script Properties** `SPREADSHEET_ID` — **không commit** (FIX-25) · batch `getValues`/`setValues` |
| 🧪 **Test** | ![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Tests](https://img.shields.io/badge/tests-481_passing-188038?style=flat-square) | `node:test` 29f/384 + `unittest` 85 + Chrome 12 = **481** · `check:drift` SSOT guard |
| 🔧 **Build** | ![Scripts](https://img.shields.io/badge/scripts-inline--html-FF8A5C?style=flat-square) | `inline-html.js` · `serve.js :4173` · `build-static.js → dist/` · `build-local.js → index.local.html` |
| 🚀 **Deploy** | ![clasp](https://img.shields.io/badge/clasp-redeploy-0d111a?style=flat-square&logo=googlecloud&logoColor=white) ![Actions](https://img.shields.io/badge/GitHub_Actions-CI-2088FF?style=flat-square&logo=githubactions&logoColor=white) | `push -f` + `version` + `redeploy` (không `deploy` mới) · `concurrency: deploy-gas` |

---

## 📁 Cấu trúc dự án

<details>
<summary><b>🌳 Cây thư mục — click mở</b></summary>

```
spx-diem-danh/
├── appsscript.json        # manifest GAS — webapp block (USER_DEPLOYING, DOMAIN, V8, Asia/Ho_Chi_Minh)
├── .clasp.json            # scriptId + rootDir — GITIGNORE, không commit
├── .claspignore
├── Code.gs                # doGet (createTemplateFromFile+include) + gate isEditor_ + JSONP
├── Config.gs              # SHEETS/COLS/STATUS/TASK_STATUS/TASK_TYPE/CACHE_TTL/CACHE_KEYS/UI_LABELS
├── CsvUtil.gs             # parse/normalize CSV + isValidBarcodeId() (pure)
├── Database.gs            # StaffData index / task CRUD / log rows / cache 5m/15s/30s + STALE guard
├── CacheLayer.gs          # helper cache versioned rc2_*_v1/v2 + bump rev
├── ScanLogic.gs           # classifyScan / classifyMealMoveScan / computeCounters (pure, dual-runtime)
├── ScanService.gs         # scanStaff / pasteMealMoveScan — guard Ops + LockService + update/append
├── TaskService.gs         # createReconcile/MealMove + complete/reopen + markUnscannedAbsent_
├── TaskSearch.gs          # searchStaffApi — tìm Ops → profile + task đã điểm danh
├── JsonpApi.gs            # JSONP standalone (whitelist + cb /^[A-Za-z0-9_$.]+$/)
├── index.html             # UI: CHỈ HTML — scriptlet include('css'/'js'/'mobile'/'camera')
├── css.html               # toàn bộ CSS — 39 tokens :root + HUD + bento + aurora + truck
├── js.html                # toàn bộ client JS (marker TASK-MENU-*/PURE-LOGIC-*/SCAN-LOGIC/OCR-SCAN-*)
├── camera-scan.html       # chain decode ZXing→Quagga→jsQR + OCR + Worker + manual zoom
├── camera-css.html        # overlay CSS camera (+ hide #btnCamScan trên desktop ≥992px)
├── lib-jsqr.html / lib-quagga.html  # vendored
├── mobile.html            # variant mobile
├── api/                   # backend Python (mirror GAS)
│   ├── main.py            # handler JSONP/POST (mirror JsonpApi.gs) + ROLLCALL_API_TOKEN gate
│   ├── scanlogic.py       # port ScanLogic.gs
│   ├── services.py        # port ScanService/TaskService
│   ├── database.py        # port Database.gs (+ stale guard)
│   ├── sheets.py / cache.py / config.py / csvutil.py
│   └── test_*.py          # 85 tests (5 files)
├── mock/mock-google.js    # mock google.script.run + ?demo=1
├── scripts/
│   ├── serve.js           # preview :4173 (inline + inject __RC_STANDALONE__/__RC_DEMO__)
│   ├── build-static.js    # → dist/ (tự chứa)
│   ├── build-local.js     # → index.local.html (cho file:// + test:chrome)
│   ├── inline-html.js     # transform <?!= include() ?>
│   └── cdp-helper.js      # CDP list/open/eval/shot/click (Node 22 WebSocket global)
├── tests/                 # 29 file, 384 tests — node:test
├── docs/intent/diem-danh-hn2-soc.md
├── docs/spec/2026-08-02-phase0-spec.md
├── skills/                # 10 skills: project-skill, review-gas-failure-modes, audit-webapp-optimize...
├── .github/workflows/deploy.yml  # deploy-gas (push -f + version+redeploy)
├── package.json           # v0.1.0 — test/test:py/test:chrome/dev/build/build:local/check:drift
└── requirements.txt
```

> **3-file split (§18 AGENTS.md):** GAS `HtmlService` không serve `.css`/`.js` tĩnh (clasp chỉ push `.gs/.html/.json`) nên CSS/JS ở `css.html`/`js.html` và nhúng qua scriptlet `<?!= include('css') ?>`. `serve.js` + `build-static.js` thay bằng nội dung file qua `inline-html.js` — sửa transform phải sửa đủ 3 nơi + `npm test` (`inline-html.test.js`, `code-doget.test.js`).

</details>

---

## 🗄️ Schema Google Sheets

> **Bảo mật FIX-25:** `DEFAULT_SPREADSHEET_ID = ''` trong `Config.gs` — set ID thật vào **Script Properties** `SPREADSHEET_ID` (GAS → Project Settings → Properties) hoặc env Python `RC_SPREADSHEET_ID`. Không commit ID.

| Sheet | Vai trò | Cột | Cache |
| :---- | :------ | :-- | :---- |
| 🟦 **Config** | Cấu hình optional | `STATIONS`, `DEFAULT_STATION` | `5m` |
| 🟩 **StaffData** | Dữ liệu HR — **20 cột** giữ nguyên header `Att.csv` | `No., Staff ID, Staff Name, ..., Slot Code, Workstation, Team, Station` — read-only, HR tự đồng bộ | `STAFF_INDEX 5m` |
| 🟧 **AttendanceTask** | Task — **10 cột** | `Task ID, Type (reconcile/meal-move), Station, Slot Code, Team, Status (open/done), Created At/By, Completed At, Note` | `TASK 15s` · `TASK_LIST 30s` |
| 🟨 **AttendanceLog** | Log đối chiếu — **13 cột** | `Task ID, Staff ID/Name, Slot/Team/Station/Workstation, Time Ref, Time Scan, Status (-/Có mặt/Vắng/Dư/Ra ngoài), Date, Time Ra, Agency` | `LOG_ROWS 30s` · `TASK_DETAIL 15s` |

> Đã bỏ `cardIn`/`cardOut` khỏi Log (2026-08-03) — StaffData giữ nguyên, chỉ hiển thị. `timeRa`/`agency` chỉ `meal-move` có giá trị.

<p align="center">
  <img src="https://img.shields.io/badge/STATUS--%3E_PRESENT-C%C3%B3%20m%E1%BA%B7t-188038?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_ABSENT-V%E1%BA%AFng-D93025?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_EXTRA-D%C6%B0-E37400?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_OUT-Ra%20ngo%C3%A0i-FF8A5C?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_PENDING---8B98AB?style=for-the-badge" />
</p>

<details>
<summary><b>🧊 Cache versioned — click mở</b></summary>

| Key | TTL | Ghi chú |
| :-- | :-- | :------ |
| `rc2_staffIndex_v1` | 5m | StaffData slim (6 field) — ~130B/NV, <100KB đến ~750 NV |
| `rc2_filterOptions_v1` | 5m | distinct station/slot/team/contract/date |
| `rc2_taskList_v1` + `rc2_taskListRev_v1` | 30s | version-gated — scan bump rev thay vì `remove()` (3 thiết bị poll không miss) |
| `rc2_task_v1_<id>` | 15s | task theo id (đường quét) |
| `rc2_logRows_v2_<id>` | 30s | log rows slim + incremental `updateLogRowCache_` mỗi scan |
| `rc2_taskDetail_v2_<id>` | 15s | detail build từ 2 cache trên — không chạm sheet |
| `rc2_tz_v2` | 24h | timezone |

Bump `v1→v2` khi đổi schema log (ví dụ `LOG_ROWS v2` thêm `timeRaEpoch`/agency).

</details>

---

## ⚡ Bắt đầu nhanh — 30s

<table>
<tr>
<td width="50%" valign="top">

#### 📦 Cài đặt

```bash
# Clone
git clone https://github.com/Duc-Nguyen-739/spx-diem-danh.git
cd spx-diem-danh

# Dependencies
npm ci
pip install -r requirements.txt
```

</td>
<td width="50%" valign="top">

#### 🧪 Kiểm thử bắt buộc

```bash
npm test            # 384 — node --test tests/*.test.js
npm run test:py     # 85  — python -m unittest discover -s api -p 'test_*.py'
npm run build:local && npm run test:chrome  # 12 Chrome
npm run check:drift # SSOT guard (KHỚP server)
```

</td>
</tr>
<tr>
<td width="50%" valign="top">

#### 👀 Preview local (không cần GAS)

```bash
npm run dev
# → http://localhost:4173           # mặc định ?demo=1 (mock)
# → http://localhost:4173/?demo=1   # demo mock (camera + 30 tasks giả)
# → http://localhost:4173/?prod=1   # nối GAS/Python thật (cần RC_API_BASE)
npm run build        # → dist/index.html tự chứa (hosting tĩnh)
```

Mock UI: mở `index.html` trực tiếp — `js.html` tự nạp `mock/mock-google.js` khi thiếu `google.script.run`. `serve.js`/`build-static.js` inject `__RC_STANDALONE__` + `__RC_API_BASE__` để gọi JSONP.

</td>
<td width="50%" valign="top">

#### 🖥️ Yêu cầu hệ thống

| Yêu cầu | Phiên bản |
| :------ | :-------- |
| ![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?style=flat-square) | ≥ 22 (`WebSocket` global cho CDP) |
| ![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square) | ≥ 3.12 |
| ![Chrome](https://img.shields.io/badge/Chrome-headless-4285F4?style=flat-square) | `google-chrome` / `chromium` |
| ![clasp](https://img.shields.io/badge/clasp-latest-0d111a?style=flat-square) | `@google/clasp` |

`index.local.html` đã `.gitignore`/`.claspignore` — chỉ dùng cho `test:chrome` file://.

</td>
</tr>
</table>

---

## 🧪 Kiểm thử — 481 tests

<p align="center">
  <img src="https://img.shields.io/badge/Node-384%2F384-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Python-85%2F85-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Chrome-12%2F12-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/total-481%20passing-188038?style=for-the-badge" />
</p>

**Workflow chuẩn trước push (§19 AGENTS.md):**

```bash
npm run build:local
npm test              # 384/384 pass — 29 files
npm run test:py       # 85/85 pass — 5 files api/test_*.py
npm run test:chrome   # 12/12 pass (khi đổi UI/scan/mock) — cần Node ≥22 + Chrome
```

| Lệnh | Chạy gì | Khi nào bắt buộc |
| :--- | :------ | :--------------- |
| `npm test` | 29 file, 384 tests `node:test` — ScanLogic/CsvUtil/TaskSearch + smoke `.gs` + camera/OCR/drift | **Mọi commit** |
| `npm run test:py` | 85 tests `api/database.py`/`scanlogic.py`/`services.py` mirror GAS | Đổi `*.gs`/`api/*.py` |
| `npm run test:chrome` | 12 checks CDP — boot `index.local.html` + mock → task list 30 rows / openScan 6 rows · quét `Ops229444` S+1/A-1 / trùng / Dư+1 / backToList | Đổi **UI/scan/mock** |
| `npm run check:drift` | guard `KHỚP server` + dead code — audit duplicate client/server | Sau khi tạo hàm mới |

> CDP: `node scripts/cdp-helper.js list|open <url>|eval <expr>|shot <png>|click <x> <y>` — `WebSocket` global (Node 22+)

---

## 🚀 Deploy

### 🤖 Tự động — GitHub Actions

Push `main` → `.github/workflows/deploy.yml` (`concurrency: deploy-gas`):

```mermaid
flowchart LR
    A[push main] --> B[clasp push -f]
    B --> C[clasp version auto SHA]
    C --> D[redeploy versioned /exec]
    D --> G[curl verify /exec 200 + marker]
    style G fill:#EE4D2D,color:#fff
```

- `push -f` → `version` → `deployments --json` tìm `versionNumber` → `redeploy` (không `deploy` mới).
- Bài học 2026-08-11: `PUT /deployments/{id}` đổi version **luôn làm mất `entryPoints`** → `/exec` 404 nếu dùng `deploy` mới.
- `dist/` (từ `build-static.js`) dùng cho hosting tĩnh riêng (không qua GAS).

### 🔐 Deploy backend Python (hosting riêng) — bắt buộc set token

Backend Python (`api/*.py`) không có lá chắn deployment access như GAS — **khi deploy production hosting bắt buộc set env `ROLLCALL_API_TOKEN`** (đã ghi docstring `api/main.py`, FIX-18). Token rỗng = **mọi action anonymous** (backward-compat cho preview/demo/test) — bao gồm `probe` (lộ số dòng StaffData). Kiosk frontend đọc token từ `window.__RC_API_TOKEN__` (serve/hosting inject). GAS webapp không dùng cơ chế này — lá chắn của GAS là deployment access `DOMAIN`.

CB sanitize `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$` + chặn `__proto__/constructor/prototype` — cả `JsonpApi.gs` lẫn `api/main.py`.

### 🛠️ Thủ công (local)

```bash
clasp login
clasp push -f

VERSION=$(clasp version "auto $(git rev-parse --short HEAD)" | grep -oE '[0-9]+' | tail -1)
DEPLOY_ID=$(clasp deployments --json | node -e "...")  # xem deploy.yml
clasp redeploy "$DEPLOY_ID" --versionNumber "$VERSION" --description "auto $(git rev-parse --short HEAD)"

curl -s -o /dev/null -w '%{http_code}' "https://script.google.com/macros/s/<DEPLOY_ID>/exec"
# phải 200 + chứa marker — không claim chạy khi chưa running:true + curl 200
```

---

## 📏 Quy ước phát triển — neon HUD

> Chi tiết đầy đủ: [`AGENTS.md`](AGENTS.md) (§1 Bảng luật, §13 Platform GAS, §18 UI 3-file + Camera, §19 test) và [`skills/project-skill/SKILL.md`](skills/project-skill/SKILL.md)

- 🌐 **Ngôn ngữ:** cột sheet / biến / file = **tiếng Anh**; hiển thị web = **tiếng Việt**
- 📦 **Hằng số tập trung** `Config.gs` — không hardcode rải rác; client mirror `STATUS`/`TASK_STATUS` trong `js.html` (1 nguồn mỗi phía)
- 🗝️ **Cache versioned** `rc2_*_v1/v2`, bump khi đổi schema; **bump rev** thay vì `remove()` cho `TASK_LIST` — poll 3 thiết bị không miss
- 🔤 **Barcode guard** `isValidBarcodeId()` + regex `/^ops/i` · `normalizeStaffId` uppercase
- ⏱️ **Epoch source of truth** `timeScanEpoch`/`timeRaEpoch` (number) — không dùng text `HH:mm:ss`
- 🍱 **Meal-move** `DUPLICATE_WINDOW_MS=1500` ↔ `CAM_CODE_COOLDOWN_MS` · `resolveMealMoveMode_` fail-closed nếu thiếu `createdBy`
- 🔒 **LockService** `waitLock(10000)` scope tối thiểu · `releaseLock()` trong `finally` · **STALE guard** `taskId`+`staffId` tại `_rowIndex`
- ⚙️ **GAS constraints** batch `getValues()`/`setValues()` · timeout 6 phút · `google.script.run` không trả `Date` (trả text) · `doGet` via `createTemplateFromFile('index').evaluate()` + `include()` (không `createHtmlOutput`)
- 🔄 **Dual runtime** đổi logic → sửa cả `.gs` lẫn `api/*.py` + tests cả 2 · `KHỚP server` + `drift.test.js` guard
- 🔐 **Bảo mật** không commit `.clasp.json`/`.clasprc.json`/`*.csv` (trừ `test-fixtures/Att.sample.csv`) · whitelist + sanitize `cb` cả 2 phía · `sanitizeCellText_` chặn `=+-@` formula injection
- 🎨 **Tokens** 39 `:root` (`--primary`, `--danger`, `--space-1..5`, `--text-xs..3xl`, `--card-radius`, `--header-h`…) · hardcode audit `grep -E "#[0-9a-f]{3,6}" css.html` → 0
- 🌿 **Git** 1 issue / 1 commit → push · `main` duy nhất · `type(scope): mô tả` tiếng Anh (`feat`/`fix`/`perf`/`docs`/`chore`/`ci`)

---

## ✅ Trạng thái — 2026-09-01

<p align="center">
  <img src="https://img.shields.io/badge/dual--runtime-GAS%20%2B%20Python-EE4D2D?style=for-the-badge" />
  <img src="https://img.shields.io/badge/camera-ZXing%2BQuagga%2BjsQR%2BOCR-4285F4?style=for-the-badge" />
  <img src="https://img.shields.io/badge/security-FIX--25%2F26-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/stale--guard-taskId%2BstaffId-0d111a?style=for-the-badge" />
</p>

- ✅ **Dual-runtime** — GAS WebApp + Python `api/` port cùng logic ScanLogic — hosting top-level khi JSONP GAS bị chặn (org Shopee khóa `Anyone`)
- ✅ **2 loại task** — `reconcile` (1 mốc) + `meal-move` (Ra/Vào, paste 200 mã/lần, dedup 1.5s, `PASTE_LOG_ROWS_MAX 1000`)
- ✅ **Camera AI** — ZXing (chính) + Quagga + jsQR + Tesseract OCR + Web Worker 3–4 binarizer; popup GAS iframe, live modal standalone; **manual `−/+` zoom** (auto zoom off 2026-09-01)
- ✅ **Tìm kiếm + queue optimistic + counters epoch + âm thanh** mp3 beep/buzz + `AudioContext` unlock
- ✅ **Poll 3s + cache versioned + LockService 10s + stale guard**
- ✅ **Test 384 + 85 + 12 = 481 pass** · `check:drift` guard · CI `deploy-gas` concurrency
- ✅ **Bảo mật FIX-25/26 + stale + formula sanitize** — xóa spreadsheet ID khỏi repo + fail CI khi deploy lỗi
- ⏳ **P2** — QA prod với mã NV thật · tối ưu bento animation trên kiosk cấu hình thấp

---

## 📄 Giấy phép

Private — repo `Duc-Nguyen-739/spx-diem-danh`. Không commit `Att.csv` thật; chỉ commit bản ẩn danh `test-fixtures/Att.sample.csv` nếu cần fixture.

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12&height=120&section=footer&text=&fontSize=0" width="100%" />

<p align="center">
  <sub>Cập nhật README — <b>2026-09-01</b> · hot 2026: <b>aurora + bento + glassmorphism 2.0 + dark industrial HUD + neon #EE4D2D</b> · đồng bộ <code>AGENTS.md §19</code> · <code>Config.gs</code> TTL 15s/30s · <code>package.json v0.1.0</code> · <code>appsscript.json Asia/Ho_Chi_Minh/DOMAIN</code> · workflow <code>deploy.yml redeploy</code> &nbsp;•&nbsp; Spec: <a href="docs/spec/2026-08-02-phase0-spec.md">Phase 0</a></sub>
</p>
