---
name: code-research
description: Research external libraries, frameworks, and APIs via source code and official docs. Ground every claim in source or docs, never training data. Read-only on user project.
license: MIT
metadata:
  author: van90bg
  version: "1.0"
  category: core
  triggers: ["research library", "how to use X", "how does X implement", "api docs", "read source"]
---

# Code Research — Source Truth

> `MUST ground every claim in source code or official docs. NEVER use training data for API details.`

## Procedure

### 1. Classify

- **Conceptual:** "How do I use X?" — prioritize types, docs, usage examples.
- **Implementation:** "How does X implement Y?" — clone and read actual code.
- **Behavioral:** "Why does X behave this way?" — trace implementation, find default, check tests.

### 2. Locate Source: Local First

- Check `node_modules/<package>`, `vendor/`, etc. If installed, read there (prioritize `.d.ts` + exported types) — no clone.
- Otherwise: `web_search` canonical repo → `git clone --depth 1 <url> /tmp/research-<name>` (specific version: `git checkout tags/<version>`).
- If absent locally and clone fails → `web_search` official API docs as fallback.

### 3. Investigate

- Read `package.json`/`Cargo.toml` for version + entry points.
- `grep`/`glob`/`ast_grep` for relevant source/types/docs (parallel).
- Read implementation, not only README (READMEs are aspirational, source is truth).
- Trace defaults/config consumption/thrown errors; check tests for edge-case behavior.

### 4. Verify

- Cross-reference ≥2 locations: types + impl or source + tests.
- Copy API signatures verbatim from source — never paraphrase.
- Include investigated version in report; note breaking changes and caveats.

### 5. Report

- Every `sources` entry must include verbatim excerpt.
- `api` must contain exact signatures copied from source.
- Clean clones: `rm -rf /tmp/research-*`.

## Directives

- Parallelize searches.
- Empty results → try ≥2 fallbacks before concluding absent.
- Version-relevant breaking changes → populate `breaking_changes`.
- Undocumented gotchas → populate `caveats`.

## Output

Structured findings with `version`, `sources` (verbatim), `api` (exact signatures), `breaking_changes`, `caveats`.
