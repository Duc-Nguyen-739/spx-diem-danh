---
name: design-system
description: Build scalable design systems with Tailwind CSS v4, design tokens, and component libraries. Use when creating component libraries, theming, or standardizing UI patterns.
license: MIT
metadata:
  author: van90bg
  version: "1.0"
  category: web
  triggers: ["design system", "design tokens", "tailwind", "component library", "theming"]
---

# Design System — Tailwind v4 + Tokens

> Targets Tailwind v4 (2024+). For v3, see upgrade guide.

## v4 Key Changes

| v3 | v4 |
|---|---|
| `tailwind.config.ts` | `@theme` in CSS |
| `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| `darkMode: "class"` | `@custom-variant dark (&:where(.dark, .dark *))` |
| `theme.extend.colors` | `@theme { --color-*: value }` |

## Quick Start

```css
@import "tailwindcss";
@theme {
  --color-background: oklch(100% 0 0);
  --color-foreground: oklch(14.5% 0.025 264);
  --color-primary: oklch(53% 0.22 27);
  --color-border: oklch(91% 0.01 264);
  --radius-sm: 0.25rem; --radius-md: 0.375rem; --radius-lg: 0.5rem;
  --animate-fade-in: fade-in 0.2s ease-out;
  @keyframes fade-in { from {opacity:0} to {opacity:1} }
}
@custom-variant dark (&:where(.dark, .dark *));
.dark { --color-background: oklch(14.5% 0.025 264); }
@layer base { * { @apply border-border; } body { @apply bg-background text-foreground; } }
```

## Token Hierarchy

```
Brand Tokens (abstract) → Semantic Tokens (purpose) → Component Tokens (specific)
Example: oklch(45% 0.2 260) → --color-primary → bg-primary
```

## Process (from ui-design-process)

1. **Surface-first:** name one archetype before tokens — Monitor (dashboards), Operate (admin/queues), Compare (pricing/tables), Configure (settings/forms), Decide/Learn (landing/docs), Explore (galleries), Command/Inspect (command bars).
2. **System:** color, type, spacing (4pt grid), radii, elevation/shadows, motion, component treatment.
3. **Slop blacklist (never):** glassmorphism everywhere, cyan-purple gradient, gradient text, repeated card grids, nested cards, large rounded icons above headings, hero metric layout, center-align all, pure #000/#fff, bounce easing.

## Component Architecture

```
Base styles → Variants → Sizes → States → Overrides
```

See `references/details.md` for advanced patterns. Validate tokens with `npx -y @google/design.md lint DESIGN.md` if using DESIGN.md spec.

## Output Format

For audit tasks: `TL;DR` + table `| Component | Before | After | Token | Location |` + ASCII 📐 layout before→after. All colors/spacing must point to `:root` tokens. For component tasks: list variants/sizes/states.
