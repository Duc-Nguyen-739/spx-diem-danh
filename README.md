<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12&height=220&section=header&text=Shopee%20Express&fontSize=42&fontColor=fff&animation=fadeIn&fontAlignY=38&desc=Kiosk%20Barcode%20%2B%20Camera%20%2B%20Dual%20Runtime&descAlignY=58&descAlign=50" width="100%" />

<p align="center">
  <a href="https://github.com/Duc-Nguyen-739/spx-diem-danh"><img src="https://img.shields.io/badge/Repo-Duc--Nguyen--739%2Fspx--diem--danh-EE4D2D?style=for-the-badge&logo=github&logoColor=white" alt="repo" /></a>
  <img src="https://img.shields.io/badge/Branch-main-0d111a?style=for-the-badge" alt="branch" />
  <img src="https://img.shields.io/badge/version-v0.1.0-FF8A5C?style=for-the-badge" alt="version" />
  <img src="https://img.shields.io/badge/GAS-V8%20%7C%20DOMAIN-4285F4?style=for-the-badge&logo=googleappsscript&logoColor=white" alt="gas" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/tests-464%20passing-188038?style=for-the-badge&logo=vitest&logoColor=white" alt="tests 464" />
  <img src="https://img.shields.io/badge/Node-%3E%3D22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="node" />
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="python" />
  <img src="https://img.shields.io/badge/Sheets-API-34A853?style=for-the-badge&logo=googlesheets&logoColor=white" alt="sheets" />
  <img src="https://img.shields.io/badge/deploy-clasp%20redeploy-0d111a?style=for-the-badge&logo=googlecloud&logoColor=white" alt="deploy" />
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=800&size=18&duration=2200&pause=900&color=EE4D2D&center=true&vCenter=true&width=720&lines=H%E1%BB%87+th%E1%BB%91ng+%C4%91i%E1%BB%83m+danh+kho+b%E1%BA%B1ng+barcode+%2B+camera;GAS+WebApp+%2B+Python+backend+%E2%80%A2+c%C3%B9ng+1+domain+logic;Qu%C3%A9t+Ops...++%E2%86%92+C%C3%B3+m%E1%BA%B7t+%2F+V%E1%BA%AFng+%2F+D%C6%B0+%2F+Ra+ngo%C3%A0i" alt="typing" />
</p>

<p align="center">
  <b>Repo:</b> <code>Duc-Nguyen-739/spx-diem-danh</code> &nbsp;•&nbsp; <b>Branch:</b> <code>main</code> &nbsp;•&nbsp; <b>Timezone:</b> <code>Asia/Ho_Chi_Minh</code><br/>
  <a href="docs/spec/2026-08-02-phase0-spec.md">📄 Spec Phase 0</a> &nbsp;•&nbsp;
  <a href="docs/intent/diem-danh-hn2-soc.md">🎯 Intent</a> &nbsp;•&nbsp;
  <a href="AGENTS.md">📜 AGENTS</a> &nbsp;•&nbsp;
  <a href="skills/project-skill/SKILL.md">🧠 Skill</a>
</p>

---

### 🧭 Mục lục

<p align="center">

`✨ Tính năng` • `🏗️ Kiến trúc` • `🧱 Tech Stack` • `📁 Cấu trúc` • `🗄️ Sheets` • `⚡ Bắt đầu nhanh` • `🧪 Kiểm thử` • `🚀 Deploy` • `📏 Quy ước`

</p>

---

## ✨ Tính năng — Bento hot 2026

<table>
<tr>
<td width="33%" valign="top">

#### 🎫 Tạo task
`reconcile` / `meal-move`
- Station · Ca · Team · Ngày · Loại HĐ
- 1 task = 1 tổ hợp lọc `StaffData`
- **meal-move 2 mốc** Ra/Vào + agency

</td>
<td width="33%" valign="top">

#### ⚡ Quét & đối chiếu
- `Ops…` case-insensitive → **Có mặt / Đã điểm danh / Dư / Ra ngoài**
- **Counters epoch** `timeScanEpoch`/`timeRaEpoch`
- **Queue 1ms** + optimistic, dedup 1.5s

</td>
<td width="33%" valign="top">

#### 📷 Camera AI
- **ZXing** (chính) + Quagga + jsQR
- Tesseract **OCR** + **Web Worker** 3-4 binarizer
- GAS **popup** · Standalone **live modal** — quét liên tục

</td>
</tr>
<tr>
<td width="33%" valign="top">

#### 🔍 Tìm kiếm
- Header search `Ops…` → hồ sơ + task đã điểm danh
- Bảng NV: search · filter status · sort cột

</td>
<td width="33%" valign="top">

#### 🎨 Trải nghiệm kiosk
- Scan **card projector** + **toast** (không `alert`)
- **beep/buzz** Web Audio 🔊/🔇 + `failure-alert-new.*.mp3`
- **Poll 3s** · loading overlay · focus trap

</td>
<td width="33%" valign="top">

#### ♿ A11y & polish
- Skip-link · `prefers-contrast` · badge nền đặc
- Chip filter · HUD dark industrial · Neon Shopee Express `#EE4D2D`
- Gradient `scanLine` + `stampIn` + glass overlay

</td>
</tr>
</table>

> **Kết thúc task** → dòng chưa quét gán **Vắng** (modal confirm) · có thể **mở lại** `reopenTask` · **Dư** linh hoạt — mã ngoài hệ thống vẫn ghi `Dư` không chặn luồng.

---

## 🏗️ Kiến trúc dual runtime — 1 logic, 2 nơi chạy

> Đổi logic quét/classify → sửa **cả `.gs` lẫn `api/*.py`** + chạy `npm test` + `npm run test:py` (§21 `AGENTS.md`)

```mermaid
graph TD
    A["GAS WebApp<br>kiosk chinh<br>Code.gs doGet + isEditor_"] <--> C[("Google Sheets<br>4 sheets<br>SPREADSHEET_ID via Properties")]
    B["Python Backend<br>hosting top-level<br>api/main.py JSONP/POST"] <--> C

    A --> A1["ScanService.gs -> ScanLogic.gs<br>pure classify"]
    A --> A2["Database.gs + CacheLayer.gs<br>rc2 v1/v2"]
    A --> A3["TaskService / TaskSearch<br>index.html + css/js/camera"]
    B --> B1["services.py -> scanlogic.py<br>port y het .gs"]
    B --> B2["database.py + cache.py"]
    B --> B3["sheets.py / config / csvutil<br>dist/index.html inline"]

    A -.-> C
    B -.-> C

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
```

</details>

---

## 🧱 Tech Stack — neon badges

| Thành phần | Công nghệ | Ghi chú hot |
| :--------- | :-------- | :---------- |
| 🎨 **Frontend** | ![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) ![CSS](https://img.shields.io/badge/CSS-1572B6?style=flat-square&logo=css3&logoColor=white) ![JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=flat-square&logo=javascript&logoColor=000) | 3-file split `index.html` + `css.html` (`<style>`) + `js.html` (`<script>`) qua `<?!= include() ?>` |
| 📷 **Camera** | ![ZXing](https://img.shields.io/badge/ZXing-CDN-FF6B35?style=flat-square) ![Quagga](https://img.shields.io/badge/Quagga-vendored-0d111a?style=flat-square) ![Tesseract](https://img.shields.io/badge/Tesseract-OCR-34A853?style=flat-square) | `camera-scan.html` + `camera-css.html` + `lib-jsqr/quagga` + **Web Worker 3-4 binarizer** + `contrast(1.35)` |
| ☁️ **Backend GAS** | ![GAS](https://img.shields.io/badge/Google_Apps_Script-V8-4285F4?style=flat-square&logo=googleappsscript&logoColor=white) | `Code.gs` + 8 module `.gs` · `V8` · `Asia/Ho_Chi_Minh` · `USER_DEPLOYING` · `DOMAIN` |
| 🐍 **Backend Python** | ![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/API-JSONP%2FPOST-009688?style=flat-square) | `api/main.py` · `scanlogic.py` · `services.py` · `database.py` · `sheets.py` · `google-api-python-client` |
| 🗄️ **Database** | ![Sheets](https://img.shields.io/badge/Google_Sheets-4_sheets-34A853?style=flat-square&logo=googlesheets&logoColor=white) | ID via **Script Properties** `SPREADSHEET_ID` — **không commit** (FIX-25) |
| 🧪 **Test** | ![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Tests](https://img.shields.io/badge/tests-464_passing-188038?style=flat-square) | `node:test` 27f/368 + `unittest` 85 + Chrome 11 = **464** |
| 🔧 **Build** | ![Scripts](https://img.shields.io/badge/scripts-inline--html-FF8A5C?style=flat-square) | `inline-html.js` · `serve.js :4173` · `build-static.js → dist/` · `build-local.js → index.local.html` |
| 🚀 **Deploy** | ![clasp](https://img.shields.io/badge/clasp-redeploy-0d111a?style=flat-square&logo=googlecloud&logoColor=white) ![Actions](https://img.shields.io/badge/GitHub_Actions-CI_gate-2088FF?style=flat-square&logo=githubactions&logoColor=white) | `push -f` + `version` + `redeploy` (không `deploy` mới) |

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
├── Database.gs            # StaffData index / task CRUD / log rows / cache 5m/15s/30s
├── CacheLayer.gs          # helper cache versioned rc2_*_v1/v2
├── ScanLogic.gs           # classifyScan / classifyMealMoveScan / computeCounters (pure, dual-runtime)
├── ScanService.gs         # scanStaff / pasteMealMoveScan — guard Ops + LockService + update/append
├── TaskService.gs         # createReconcile/MealMove + complete/reopen + markUnscannedAbsent_
├── TaskSearch.gs          # searchStaffApi — tìm Ops → profile + task đã điểm danh
├── JsonpApi.gs            # JSONP standalone (whitelist + cb /^[A-Za-z0-9_$.]+$/)
├── index.html             # UI: CHỈ HTML — scriptlet include('css'/'js'/'mobile'/'camera')
├── css.html               # toàn bộ CSS (inline lúc serve — GAS không serve .css tĩnh)
├── js.html                # toàn bộ client JS (marker TASK-MENU-*/PURE-LOGIC-*/SCAN-LOGIC/OCR-SCAN-*)
├── camera-scan.html       # chain decode ZXing→Quagga→jsQR + OCR + Worker
├── camera-css.html        # overlay CSS camera
├── lib-jsqr.html / lib-quagga.html  # vendored
├── mobile.html            # variant mobile
├── api/                   # backend Python (mirror GAS)
│   ├── main.py            # handler JSONP/POST (mirror JsonpApi.gs)
│   ├── scanlogic.py       # port ScanLogic.gs
│   ├── services.py        # port ScanService/TaskService
│   ├── database.py        # port Database.gs
│   ├── sheets.py / cache.py / config.py / csvutil.py
│   └── test_*.py          # 85 tests
├── mock/mock-google.js    # mock google.script.run + ?demo=1
├── scripts/
│   ├── serve.js           # preview :4173 (inline + inject __RC_STANDALONE__/__RC_DEMO__)
│   ├── build-static.js    # → dist/ (tự chứa)
│   ├── build-local.js     # → index.local.html (cho file:// + test:chrome)
│   ├── inline-html.js     # transform <?!= include() ?>
│   └── cdp-helper.js      # CDP list/open/eval/shot/click
├── tests/                 # 27 file, 368 tests — node:test
├── docs/intent/diem-danh-hn2-soc.md
├── docs/spec/2026-08-02-phase0-spec.md
├── skills/project-skill/ + review-gas-failure-modes/
├── .github/workflows/deploy.yml  # CI gate + push + redeploy
├── package.json           # v0.1.0 — test/test:py/test:chrome/dev/build/build:local
└── requirements.txt
```

> **3-file split (§20 AGENTS.md):** GAS `HtmlService` không serve `.css`/`.js` tĩnh (clasp chỉ push `.gs/.html/.json`) nên CSS/JS ở `css.html`/`js.html` và nhúng qua scriptlet `<?!= include('css') ?>`. `serve.js` + `build-static.js` thay bằng nội dung file qua `inline-html.js` — sửa transform phải sửa đủ 3 nơi + `npm test` (`inline-html.test.js`, `code-doget.test.js`).

</details>

---

## 🗄️ Schema Google Sheets

> **Bảo mật FIX-25:** `DEFAULT_SPREADSHEET_ID = ''` trong `Config.gs` — set ID thật vào **Script Properties** `SPREADSHEET_ID` (GAS → Project Settings → Properties) hoặc env Python. Không commit ID.

| Sheet | Vai trò | Cột | Cache |
| :---- | :------ | :-- | :---- |
| 🟦 **Config** | Cấu hình optional | `STATIONS`, `DEFAULT_STATION` | `5m` |
| 🟩 **StaffData** | Dữ liệu HR — **20 cột** giữ nguyên header `Att.csv` | `No., Staff ID, Staff Name, ..., Slot Code, Workstation, Team, Station` — read-only, HR tự đồng bộ | `STAFF_INDEX 5m` |
| 🟧 **AttendanceTask** | Task — **10 cột** | `Task ID, Type (reconcile/meal-move), Station, Slot Code, Team, Status (open/done), Created At/By, Completed At, Note` | `15–30s` |
| 🟨 **AttendanceLog** | Log đối chiếu — **13 cột** | `Task ID, Staff ID/Name, Slot/Team/Station/Workstation, Time Ref, Time Scan, Status (-/Có mặt/Vắng/Dư/Ra ngoài), Date, Time Ra, Agency` | `LOG_ROWS 30s` |

> Đã bỏ `cardIn`/`cardOut` khỏi Log (2026-08-03) — StaffData giữ nguyên, chỉ hiển thị.

<p align="center">
  <img src="https://img.shields.io/badge/STATUS--%3E_PRESENT-C%C3%B3%20m%E1%BA%B7t-188038?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_ABSENT-V%E1%BA%AFng-D93025?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_EXTRA-D%C6%B0-E37400?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_OUT-Ra%20ngo%C3%A0i-FF8A5C?style=for-the-badge" />
  <img src="https://img.shields.io/badge/STATUS--%3E_PENDING---8B98AB?style=for-the-badge" />
</p>

---

## ⚡ Bắt đầu nhanh

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
npm test            # 368 — node --test tests/*.test.js
npm run test:py     # 85  — python -m unittest discover -s api -p 'test_*.py'
npm run build:local && npm run test:chrome  # 11 Chrome
```

</td>
</tr>
<tr>
<td width="50%" valign="top">

#### 👀 Preview local (không cần GAS)

```bash
npm run dev
# → http://localhost:4173
# → http://localhost:4173/?demo=1  # demo mock
npm run build        # → dist/index.html tự chứa
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

</td>
</tr>
</table>

---

## 🧪 Kiểm thử — 464 tests hot

<p align="center">
  <img src="https://img.shields.io/badge/Node-368%2F368-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Python-85%2F85-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Chrome-11%2F11-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/total-464%20passing-188038?style=for-the-badge" />
</p>

**Workflow chuẩn trước push (§21 AGENTS.md — khớp `attendance-portal`):**

```bash
npm run build:local
npm test              # 368/368 pass
npm run test:py       # 85/85 pass
npm run test:chrome   # 11/11 pass (khi đổi UI/scan/mock) — cần Node ≥22 + Chrome
```

| Lệnh | Chạy gì | Khi nào bắt buộc |
| :--- | :------ | :--------------- |
| `npm test` | 27 file, 368 tests `node:test` — ScanLogic/CsvUtil/TaskSearch + smoke `.gs` + camera/OCR | **Mọi commit** |
| `npm run test:py` | 85 tests `api/database.py`/`scanlogic.py`/`services.py` mirror GAS | Đổi `*.gs`/`api/*.py` |
| `npm run test:chrome` | 11 checks CDP — boot `index.local.html` + mock → task list 30 rows / openScan / quét `Ops229444` / trùng / Dư / backToList | Đổi **UI/scan/mock** |

> CDP: `node scripts/cdp-helper.js list|open <url>|eval <expr>|shot <png>|click <x> <y>` — `WebSocket` global (Node 22+)

---

## 🚀 Deploy

### 🤖 Tự động — GitHub Actions

Push `main` → `.github/workflows/deploy.yml`:

```mermaid
flowchart LR
    A[push main] --> B[CI gate<br>npm ci - npm test - pip - unittest<br>build local - test chrome]
    B -->|fail chan| Z[khong deploy]
    B -->|pass| C[install clasp]
    C --> D[create .clasp.json<br>from GAS_SCRIPT_ID]
    D --> E[clasp push -f]
    E --> F[clasp version -> deployments --json<br>redeploy versioned]
    F --> G[curl verify /exec 200 + marker]
    style B fill:#188038,color:#fff
    style Z fill:#D93025,color:#fff
    style G fill:#EE4D2D,color:#fff
```

`dist/` (từ `build-static.js`) dùng cho hosting tĩnh riêng (không qua GAS).

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

> [!CAUTION]
> **Bài học deploy 2026-08-11:** `PUT /deployments/{id}` đổi version **luôn làm mất `entryPoints`** → `/exec` 404. `clasp deploy` tạo deployment mới nhưng workflow dùng `redeploy` vào deployment versioned hiện có mới đúng. Sau mọi thao tác phải **curl verify** `/exec`.

---

## 📏 Quy ước phát triển — neon HUD

> [!TIP]
> Chi tiết đầy đủ: [`AGENTS.md`](AGENTS.md) (§3 Hard Constraints, §14 GAS, §20 camera gotchas, §21 test) và [`skills/project-skill/SKILL.md`](skills/project-skill/SKILL.md)

- 🌐 **Ngôn ngữ:** cột sheet / biến / file = **tiếng Anh**; hiển thị web = **tiếng Việt**
- 📦 **Hằng số tập trung** `Config.gs` — không hardcode rải rác; client mirror `STATUS`/`TASK_STATUS` trong `js.html` (1 nguồn mỗi phía)
- 🗝️ **Cache versioned** `rc2_*_v1/v2`, bump khi đổi schema; TTL: `STAFF_INDEX 5m` · `TASK_DETAIL 15s` · `LOG_ROWS 30s` · `TASK_LIST 30s`
- 🔤 **Barcode guard** `isValidBarcodeId()` + regex `/^ops/i` (0ms) · `normalizeStaffId` uppercase
- ⏱️ **Epoch source of truth** `timeScanEpoch`/`timeRaEpoch` (number) — không dùng text `HH:mm:ss`
- 🍱 **Meal-move** `DUPLICATE_WINDOW_MS=1500` ↔ `CAM_CODE_COOLDOWN_MS` · `resolveMealMoveMode_` fail-closed nếu thiếu `createdBy`
- 🔒 **LockService** `waitLock(10000)` scope tối thiểu · `releaseLock()` trong `finally`
- ⚙️ **GAS constraints** batch `getValues()`/`setValues()` · timeout 6 phút · `google.script.run` không trả `Date` (trả text) · `doGet` via `createTemplateFromFile('index').evaluate()` + `include()` (không `createHtmlOutput`)
- 🔄 **Dual runtime** đổi logic → sửa cả `.gs` lẫn `api/*.py` + tests cả 2
- 🔐 **Bảo mật** không commit `.clasp.json`/`.clasprc.json`/`*.csv` (trừ `test-fixtures/Att.sample.csv`) · whitelist + sanitize `cb /^[A-Za-z0-9_$.]+$/` cả `JsonpApi.gs` lẫn `api/main.py`
- 🌿 **Git** 1 issue / 1 commit → push · `main` duy nhất · `type(scope): mô tả` tiếng Anh (`feat`/`fix`/`perf`/`docs`/`chore`/`ci`)

---

## ✅ Trạng thái — 2026-08-28

<p align="center">
  <img src="https://img.shields.io/badge/dual--runtime-GAS%20%2B%20Python-EE4D2D?style=for-the-badge" />
  <img src="https://img.shields.io/badge/camera-ZXing%2BQuagga%2BjsQR%2BOCR-4285F4?style=for-the-badge" />
  <img src="https://img.shields.io/badge/security-FIX--25%2F26-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/CI-gate%20blocking-188038?style=for-the-badge" />
</p>

- ✅ **Dual-runtime** — GAS WebApp + Python `api/` port cùng logic ScanLogic — hosting top-level khi JSONP GAS bị chặn (org Shopee khóa `Anyone`)
- ✅ **2 loại task** — `reconcile` (1 mốc) + `meal-move` (Ra/Vào, paste 200 mã/lần, dedup 1.5s)
- ✅ **Camera AI** — ZXing (chính) + Quagga + jsQR + Tesseract OCR + Web Worker 3-4 binarizer; popup GAS iframe, live modal standalone
- ✅ **Tìm kiếm + queue optimistic + counters epoch + âm thanh** mp3 beep/buzz
- ✅ **Poll 3s + cache versioned + LockService 10s**
- ✅ **Test 368 + 85 + 11 = 464 pass** · CI gate `.github/workflows/deploy.yml` chặn regression trước `clasp push` + `redeploy`
- ✅ **Bảo mật FIX-25/26** — xóa spreadsheet ID khỏi repo + fail CI khi deploy lỗi
- ⏳ **P2** — QA prod với mã NV thật

---

## 📄 Giấy phép

Private — repo `Duc-Nguyen-739/spx-diem-danh`. Không commit `Att.csv` thật; chỉ commit bản ẩn danh `test-fixtures/Att.sample.csv` nếu cần fixture.

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=12&height=120&section=footer&text=&fontSize=0" width="100%" />

<p align="center">
  <sub>Cập nhật README hot 2026-08-28 — đồng bộ <code>AGENTS.md §21</code> · <code>Config.gs</code> TTL 15s/30s · <code>package.json v0.1.0</code> · <code>appsscript.json Asia/Ho_Chi_Minh/DOMAIN</code> · workflow <code>deploy.yml version+redeploy</code> &nbsp;•&nbsp; Spec: <a href="docs/spec/2026-08-02-phase0-spec.md">Phase 0</a> &nbsp;•&nbsp; Phong cách: <b>aurora gradient + bento + glassmorphism + neon Shopee Express #EE4D2D</b></sub>
</p>
