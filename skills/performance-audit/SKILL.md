---
name: performance-audit
description: Optimize web performance for loading and runtime. Use to speed up site, reduce load time, fix slow loading, or run a performance audit.
license: MIT
metadata:
  author: van90bg
  version: "1.0"
  category: web
  triggers: ["performance", "speed up", "lighthouse", "core web vitals", "optimize"]
---

# Performance Audit — Loading & Runtime

## Budgets

| Resource | Budget | Rationale |
|---|---|---|
| Total page weight | <1.5 MB | 3G ~4s |
| JS (compressed) | <300 KB | Parse + exec |
| CSS (compressed) | <100 KB | Render blocking |
| Above-fold images | <500 KB | LCP |
| Fonts | <100 KB | FOIT/FOUT |
| 3rd party | <200 KB | Uncontrolled latency |

## Critical Rendering Path

- **TTFB <800ms** — CDN, caching, efficient backend.
- **Compression:** Brotli (15–20% smaller than gzip) for text assets.
- **HTTP/2 or 3** + **Edge caching** + **103 Early Hints** (`Link: </hero.webp>; rel=preload; as=image`) for 20–30% LCP improvement (Chromium, safe fallback).
- **Preconnect:** `<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>`
- **Preload LCP:** `<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">`
- **Speculation Rules:** prerender likely next navigations (`eagerness: moderate`).

## Resource Loading

- **Defer non-critical CSS:** inline critical CSS, preload rest with `onload`.
- **JS:** `defer` for app, `async` for independent, `type="module"` deferred by default; route/component-based code splitting via `lazy(() => import(...))`; tree-shake (`import debounce from 'lodash/debounce'` not `import _ from 'lodash'`).

## Images

- Formats: AVIF (best) → WebP → PNG/SVG; responsive `<picture>` with `srcset`/`sizes`; `loading="lazy"` below fold, `eager` + `fetchpriority="high"` for LCP; `decoding="async"`; explicit `width`/`height` to avoid CLS.

## Fonts

- `@font-face { font-display: swap; unicode-range: U+0000-00FF; }` + `<link rel="preload" as="font" crossorigin>`; prefer variable fonts.

## Caching

- HTML: `no-cache, must-revalidate` · Hashed assets: `public, max-age=31536000, immutable` · Unhashed: `public, max-age=86400, stale-while-revalidate` · API: `private, max-age=0`.

## Runtime

- **Layout thrashing:** batch reads then writes; **debounce** scroll/resize; **`requestAnimationFrame`** for animations; **virtualize** lists >100 items (`content-visibility: auto`); **View Transitions** (`document.startViewTransition`) for SPA navigations.

## Measurement

| Metric | Target |
|---|---|
| LCP | <2.5s |
| FCP | <1.8s |
| TBT | <200ms |
| CLS | <0.1 |

Commands: `npx lighthouse https://example.com --output html`, `import {onLCP,onINP,onCLS} from 'web-vitals'`.

## Output Format

`TL;DR` + table `| # | Sev | Issue | Location | Fix |` + markers. Prioritize by Core Web Vitals impact. See host `AGENTS.md §8` if present.
