---
name: debug-systematic
description: 4-phase systematic debugging — root cause BEFORE fix. Use for EVERY technical bug: test fail, production bug, weird behavior, perf. Required when: emergency, 'quick fix only', many failed fixes, unclear problem.
---

# Skill: Systematic Debugging (4-phase)

> Dùng cho MỌI bug kỹ thuật: test fail, production bug, hành vi lạ, perf. **Bắt buộc khi:** gấp (emergency), "fix nhanh thôi", đã thử nhiều fix, fix trước không ăn, chưa hiểu rõ vấn đề.

**Iron Law: KHÔNG fix trước khi xong Phase 1 (root cause investigation).**

## Phase 1 — Root cause

1. **Đọc kỹ error** — stack trace đầy đủ, note line/file/error code. Đừng bỏ qua warning.
2. **Build tight feedback loop** — lệnh tái hiện ĐÚNG triệu chứng:
   - Test fail ở seam · curl HTTP · CLI với fixture · headless browser assert DOM · replay trace · harness nhỏ · bisection `git bisect run` · differential (cũ vs mới).
   - Loop phải: nhanh, deterministic, **red-capable** (fail đúng bug, pass khi fix).
   - Bug flaky → tăng reproduction rate (100x, stress, sleep) — 50% flake debug được, 1% không.
3. **Check recent changes**: `git log --oneline -10`, `git diff`, `git log -p --follow`.
4. **Multi-component**: instrument từng boundary (log in/out, env, state) — chạy 1 lần thu evidence rồi mới kết luận.
5. **Trace data flow** — bad value từ đâu? trace ngược về nguồn; fix tại nguồn, không tại triệu chứng.

**XONG khi:** đọc hết error, loop chạy ít nhất 1 lần + red, thay đổi gần đây đã review, evidence thu được, cô lập được component, nêu được hypothesis.

**STOP — chưa hiểu tại sao thì chưa qua Phase 2.**

## Phase 2 — Pattern analysis

1. **Minimize repro** — cắt input/caller/config từng cái một, mỗi lần chạy loop. Giữ lại chỉ phần load-bearing.
2. Tìm working example trong codebase.
3. So sánh reference implementation — đọc HẾT, không skim.
4. Liệt kê MỌI khác biệt working vs broken (đừng "cái đó không quan trọng").

## Phase 3 — Hypothesis & test

1. Form **3–5 falsifiable hypotheses**, rank theo likelihood + chi phí test.
   - Mỗi cái phải có prediction: "Nếu X là nguyên nhân, thì quan sát Y sẽ thấy Z."
   - User có mặt → show ranked list trước (domain knowledge re-rank).
2. Test **một biến một lần**. Không fix nhiều thứ cùng lúc.
3. Tag log tạm với prefix duy nhất (`[DEBUG-a4f2]`) để cleanup 1 lần grep.
4. Không hiểu → nói "tôi chưa hiểu X", không giả vờ.

## Phase 4 — Implementation

1. **Tạo failing test** (regression) TRƯỚC khi fix.
2. Fix root cause — MỘT thay đổi, không "tiện tay" refactor.
3. Verify: test riêng → full suite.
4. **Rule of Three**: fix thứ 3 không ăn → STOP, không thử fix 4; nghi vấn architecture (mỗi fix lòi coupling mới = sai pattern) — bàn với user trước.

## Red flags (STOP về Phase 1)

- "Quick fix, investigate sau" · "thử X xem sao" · "sửa nhiều chỗ chạy test" · "skip test" · "chắc là X"
- Đề xuất fix trước khi trace data flow
- Fix #4+ thất bại → nghi architecture

## Với Hermes

- Phase 1 tools: `search_files` (trace), `read_file` (đọc nguồn), `terminal` (test/repro), `web_search` (tra cứu lỗi).
- Complex multi-component → `delegate_task` subagent investigation (báo findings, KHÔNG fix).
- Kết hợp TDD: RED (test tái hiện) → debug → GREEN.

**Trong repo này:** CDP geometry (`getBoundingClientRect`, parent chain) là truth, screenshot chỉ cảm nhận. Kiểm SHA GAS đang chạy trước khi kết luận "fix không ăn" (user có thể test stale build).