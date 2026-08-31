---
name: writing-plans
description: Write implementation plans for multi-step tasks before touching code. Use when you have a spec or requirements and need a step-by-step plan.
license: MIT
metadata:
  author: van90bg
  version: "1.0"
  category: core
  triggers: ["write plan", "implementation plan", "spec to plan"]
---

# Writing Plans — Before Code

> Assume engineer has zero codebase context and needs bite-sized tasks with exact files, code, commands, and tests.

Announce at start: "I'm using the writing-plans skill to create the implementation plan."

## Save Location

`docs/plans/YYYY-MM-DD-<feature-name>.md` (user preference overrides).

## Scope Check

If spec covers multiple independent subsystems, split into separate plans — one per subsystem, each producing working, testable software.

## File Structure (before tasks)

Map files to be created/modified and each file's single responsibility. Prefer smaller, focused files. Files that change together live together. Follow existing patterns.

## Task Right-Sizing

A task is the smallest unit with its own test cycle and worth a fresh reviewer's gate. Fold setup/config/docs into the task that needs them; split only where a reviewer could reject one while approving its neighbor.

## Bite-Sized Granularity (2–5 min per step)

- Write failing test → Run to verify fail → Minimal impl → Run to verify pass → Commit

## Plan Header (every plan must start with)

```markdown
# [Feature] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** [one sentence]
**Architecture:** [2–3 sentences]
**Tech Stack:** [key libs]

## Global Constraints
[project-wide requirements, one line each, exact values from spec]
---
```

## Task Structure

```markdown
### Task N: [Component]

**Files:** Create: `exact/path` · Modify: `exact/path:123-145` · Test: `tests/...`

**Interfaces:** Consumes: [exact signatures] · Produces: [exact function names/types]

- [ ] Step 1: Write failing test
  ```python
  def test_x(): assert fn(input) == expected
  ```
- [ ] Step 2: Run test to verify fail (`pytest ...`)
- [ ] Step 3: Write minimal impl
- [ ] Step 4: Run to verify pass
- [ ] Step 5: Commit (`git add ... && git commit -m "feat: ..."`)
```

## No Placeholders (plan failures)

Never write: `TBD`/`TODO`/`implement later`/`fill in details`/`Add appropriate error handling`/`Write tests for the above`/`Similar to Task N`/`References to undefined types` — every step must contain actual content.

## Self-Review

1. Spec coverage: every requirement has a task?
2. Placeholder scan: no red-flag phrases?
3. Type consistency: signatures match across tasks?

## Execution Handoff

"Plan saved to `docs/plans/<file>.md`. Two options: 1. Subagent-Driven (fresh subagent per task + review) 2. Inline Execution (batch with checkpoints). Which approach?"
