---
name: codebase-explorer
description: Fast codebase exploration — locate relevant files, trace dependencies, and return structured findings without re-reading everything. Use for quick lookups or thorough dependency tracing.
license: MIT
metadata:
  author: van90bg
  version: "1.0"
  category: core
  triggers: ["explore codebase", "find files", "trace dependencies", "locate code"]
---

# Codebase Explorer

> Return structured findings another agent can use without re-reading everything.

## Directives

- Use broad pattern matching / code search as much as possible.
- Invoke tools in parallel — finish in seconds.
- Empty results → try at least one alternate strategy (different pattern, broader path, AST search) before concluding absent.

## Thoroughness

Infer from task, default **Medium**:

- **Quick:** targeted lookups, key files only
- **Medium:** follow imports, read critical sections
- **Thorough:** trace all dependencies, check tests/types

## Procedure

1. Locate relevant code via `grep`/`glob`/`ast_grep` (parallel).
2. Read key sections only — never full files unless tiny.
3. Identify types/interfaces/key functions.
4. Note dependencies between files.

## Output

Structured summary: relevant files + types/interfaces + key functions + dependencies + entry points. No file edits, no builds.

## Architecture Deepening (from improve-codebase-architecture)

For deeper architectural review: surface friction, run deletion test ("would deleting this concentrate complexity?"), and present candidates as HTML report with Tailwind+Mermaid before/after diagrams (write to OS tmp, never in repo).
