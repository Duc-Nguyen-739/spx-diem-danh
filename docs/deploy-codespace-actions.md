# Deploy Điểm Danh HN2 SOC bằng Codespace + clasp

> Branch `main` → script: `1HmmGcLI8JBUU53JtyDY8qogYDIUpJMXa7PD3dW_XemBe_pTUMzhPTVED`
> Sheet: `1NQQnLnVDITrUIII59ibk6vVfuDnMHKqsDtfGmHgjNYo` (HR tự đồng bộ vào StaffData)
> ⚠️ Branch `lobe` đã gộp vào `main` và xoá (2026-08-03) — `main` là nguồn duy nhất.

## Cách 1: Deploy thủ công bằng clasp (Codespace)

### 1. Mở Codespace

GitHub → repo `diem-danh-hn2-soc` → **Code → Codespaces → Create codespace on `main`**
(máy ảo cloud của GitHub — có sẵn Node, terminal, VS Code trong browser).

### 2. Cài clasp

```bash
sudo npm install -g @google/clasp
```

### 3. Đăng nhập (chỉ 1 lần)

**Cần OAuth Desktop client** (Google Cloud Console → APIs & Services → Credentials → **Create credentials → OAuth client ID → Desktop app**) → tải file `credentials.json`.

```bash
clasp login --creds credentials.json
```

- Khi clasp in ra URL authorize → **mở URL đó trên trình duyệt của bạn** → đăng nhập tài khoản giống v1 → Approve.
- Sau approve, trình duyệt redirect về `localhost:<port>` — nếu không kết nối được (bạn đang ở Codespace, không phải máy local), dùng SSH tunnel từ máy local:

  ```bash
  # máy local: forward cổng clasp đang listen (thường 3000, xem output của clasp)
  ssh -L 3000:localhost:3000 <tên-codespace>
  ```

  Mở lại URL authorize → approve → redirect `localhost:3000` chạy qua tunnel → clasp nhận token → tạo `~/.clasprc.json`.

- Verify: `clasp login --status` → in email account.

> 💡 Nếu có máy local có sẵn clasp (như trước đây), chỉ cần chạy `clasp login --creds credentials.json` **trên máy local** 1 lần, rồi copy `~/.clasprc.json` vào Codespace — nhanh hơn, không cần SSH tunnel.

### 4. Push + Deploy

```bash
clasp push -f          # đẩy code lên script (scriptId trong .clasp.json)
clasp deploy           # tạo deployment webapp MỚI — CÁCH ĐÚNG (không dùng PUT deployments)
```

### 5. Verify

```bash
# URL /exec trả HTTP 200 + đủ marker HTML
curl -s -o /dev/null -w "%{http_code}\n" "<URL_WEBAPP>/exec"
```

---

## Lưu ý

- `~/.clasprc.json` chứa refresh token — **chỉ đặt trên repo private** (repo này đang private ✅), không in ra nơi công cộng.
- `clasp deploy` mỗi lần tạo 1 deployment mới (quy ước dự án: chỉ cách này giữ entryPoint hoạt động). Nhiều deployment cũ — dọn bằng tay khi cần (`clasp undeploy -i <deploymentId>`), giữ lại bản mới nhất.
- Branch `main` là nguồn duy nhất; workflow GitHub Actions cho branch `lobe` đã gỡ (branch đã xoá).
