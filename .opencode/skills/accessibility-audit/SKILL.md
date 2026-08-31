---
name: accessibility-audit
description: Audit and improve web accessibility following WCAG 2.2 (POUR). Use for a11y audit, WCAG compliance, screen reader, keyboard, focus, contrast, or making a webapp accessible.
license: MIT
metadata:
  author: van90bg
  version: "1.0"
  category: web
  triggers: ["accessibility", "a11y", "wcag", "screen reader", "keyboard navigation"]
---

# Accessibility Audit — WCAG 2.2

## Principles — POUR

| Principle | Meaning |
|---|---|
| Perceivable | Content perceivable via different senses |
| Operable | Interface operable by all |
| Understandable | Content and interface understandable |
| Robust | Works with assistive tech |

## Conformance

- **A** — minimum (must pass)
- **AA** — standard (should pass, legal requirement in many jurisdictions)
- **AAA** — enhanced (nice to have)

## Quick Checks (from WCAG 2.2)

### Perceivable

- **Text alternatives (1.1):** every `img` needs `alt` (empty `alt=""` + `role="presentation"` for decorative); icon buttons need `aria-label` or visually-hidden text; complex images need `aria-describedby`.
- **Contrast (1.4.3/1.4.6):** normal text ≥4.5:1 (AA) / 7:1 (AAA); large (≥18px or 14px bold) ≥3:1 / 4.5:1; UI components ≥3:1. Don't rely on color alone — add icon + text + `aria-invalid`/`aria-describedby`.
- **Media (1.2):** `video` with `track kind="captions"` + `descriptions`; `audio` with transcript in `<details>`.

### Operable

- **Keyboard (2.1):** all functionality via keyboard; prefer native `<button>`, `<a href>`; no keyboard traps; modals need focus trap (`<dialog>` does it natively).
- **Focus visible (2.4.7):** never `*:focus {outline:none}`; use `:focus-visible {outline:2px solid currentColor; outline-offset:2px}`.
- **Focus not obscured (2.4.11):** focused element not hidden by sticky header; use `scroll-margin-top`.
- **Skip link (2.4.1):** provide skip to main content.
- **Target size (2.5.8):** ≥24×24px AA (recommended 44×44); `min-width`/`min-height` on buttons.
- **Dragging (2.5.7):** provide single-pointer alternative.
- **Motion (2.3):** `@media (prefers-reduced-motion: reduce) { * { animation: none } }`.

### Understandable

- **Language (3.1.1):** `<html lang="en">` + `lang` on inline changes.
- **Labels (3.3.2):** every input has associated `label`; errors use `role="alert"` or `aria-live` + `aria-invalid="true"` and focus first error.
- **Auth (3.3.8):** don't require cognitive tests unless copy-paste/autofill or alternative (passkey/email link) exists.

### Robust

- **ARIA (4.1.2):** prefer native elements; when ARIA needed, use correct roles/states.
- **Live regions (4.1.3):** `aria-live="polite"` for dynamic updates without moving focus.

## Testing Checklist

- Keyboard: Tab through entire page, Enter/Space activate
- Screen reader: VoiceOver / NVDA / TalkBack
- Zoom 200%, High Contrast, Reduced motion, Focus order, Target size
- Automated: `npx lighthouse --only-categories=accessibility` or `axe https://example.com`

## Output Format

`TL;DR` + table `| # | Sev | Issue | Location | Fix |` + markers. Group critical (missing labels, alt, contrast, traps, focus) first. See `AGENTS.md §8` for full format if host repo defines it.
