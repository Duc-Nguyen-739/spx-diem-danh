---
name: review-gas-failure-modes
description: GAS review with failure-modes checklist + confidence scoring (+ MoA option). Use: post-feature git diff review, pre-deploy sanity check, or full-base review of attendance/queue GAS web apps.
---

# Skill: GAS Review — Failure Modes & Confidence Scoring

> Dùng khi: review sau feature mới (git diff), review code vừa viết trước khi declare done, pre-deploy sanity check, hoặc full-base review không git. Eco: attendance/queue-style GAS tools.

## Approach

- Review **diff mặc định** (unstaged). User có thể chỉ định scope khác.
- 5 stage: Requirements → Correctness → Quality → Testing → Security/Performance.
- Report findings với **confidence 0–100**:
  - Blocker/security: LUÔN report dù confidence thấp
  - Major: cần confidence ≥ 70
  - Minor/Nit: ≥ 80
  - Dưới ngưỡng: bỏ im lặng (quality over quantity)
- Verdict: **Approve / Request Changes / Comment**.

## Failure modes checklist (GAS webapp)

- `getUserRole()` fallback `'admin'` khi exception — phải fail CLOSED.
- Lock helper nuốt timeout trả `null` → caller phải check `{__lockError:true}`.
- `genTaskId() = Date.now().toString(36)+Math.random()` (1ms resolution) — dùng `Utilities.getUuid()`.
- Client cooldown early-return → bypass bằng clock; **server là sole authority**.
- Batch cache `put(key)` blind → mất concurrent writes; phải read-merge-write.
- `queue.slice(idx+1)` retry mất cả items sau — per-item retry counter.
- `getLogTail()`: `startRow <= 1` kéo theo header — dùng `Math.max(2, lastRow - tailRows + 1)`.
- `var SS = _ensureSS()` module scope — cache null nếu sheet chưa sẵn; dùng getter.
- Task meta helpers `getDataRange()` mỗi call hot path — cache TTL ngắn keyed taskId.
- Flush ordering: `setValues` xong mới `cache.remove(batchKey)`.
- Reset task giữa active scan batch — đọc pending trong lock, abort nếu còn unflushed.
- Cache invalidation giới hạn 2 date keys — dùng versioned keys (`staffInfo:v1:{date}`).
- `setAdminEmails`/`setSpreadsheetId` phải invalidate role cache (tránh privilege escalation).
- Client timestamps trong write → broken cooldown; dùng server `new Date()` + grace window.
- Deep link `#scan:<id>` không check task tồn tại.
- `appendRow` column order vs header — đếm độ dài, off-by-one ghi sai cột.
- `headers.indexOf('X')` = -1 → `data[-1]` undefined → `String(undefined)` — guard `< 0`.
- Duy nhất cache invalidation: 1 helper gọi mọi mutation path; quên nhất: `attListCache`.
- Client flush gate: `_pendingScanCount` — skip RPC khi 0 (tiết kiệm ~240 calls/h).
- `executeAs USER_ACCESSING` — bắt buộc server gate mọi mutator ("client ẩn nút" KHÔNG phải gate).
- Cooldown client/server mismatch (20s vs 15s) — đồng bộ 1 nguồn.

## UI/A11y tối thiểu

- `th[scope="col"]` · sort headers `aria-sort` · filter `role=listbox`+label · icon trang trí `aria-hidden` · các vùng động `aria-live="polite"` (bỏ aria-live static) · `prefers-reduced-motion` cho scan-line.

## MoA-assisted review (Hermes)

Khi thêm thì dùng để tăng detection (trước deploy / critical code). KHÔNG dùng cho debug (debug cần loop reproduce→fix→verify).
- Scope document PHẢI self-contained (reference models không đọc file).
- `/moa <scope>` → "Review as independent reviewer. Confidence 0-100, severity, file+line, fixes, verdict."
- Host merge: dedupe, giữ severity, đánh dấu disagreement, output final.

**Trong repo này: chạy `gh run list --limit 5` trước khi kết luận bug — CI có thể deploy trễ (user test trên GAS build cũ).**