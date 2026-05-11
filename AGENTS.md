# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is the "编译器祛魅" (Compiler Demystification) project — an educational compiler visualization platform. It is a **pure client-side** application: compiler logic runs in the browser, no backend server/database is needed.

### Architecture

- **Root**: TypeScript compiler modules (BNF parser, precedence-climbing, statements, CFG, linker, pointer, allocator) run with Bun
- **`frontend/`**: React 18 + Vite 5 + Tailwind CSS SPA that bundles the compiler modules and provides interactive visualizations

### Running the app

```bash
cd frontend && bun run dev
# Serves at http://localhost:5173
```

### Running tests

```bash
# Statement compiler tests (48 tests)
bun run test:statements

# CFG module test
cd cfg && bun run src/vm-runner.ts tests/grade-check.txt

# Pointer module test
cd pointer && bun run src/vm-runner.ts tests/test-pointer.txt
```

Note: `bun run test:all` in root references test files that don't exist in the repo (they may have been removed). Use `bun run test:statements` instead.

### Lint

```bash
cd frontend && bun run lint
```

ESLint is configured for the frontend only. There are pre-existing `@typescript-eslint/no-explicit-any` warnings in the codebase.

### Build

```bash
cd frontend && bun run build
```

### Key gotchas

- Bun must be available on PATH. It is installed to `~/.bun/bin/bun`.
- The root `test:all` script references missing test fixture files — this is a pre-existing issue.
- The linker's `link-runner.ts` test for `test-main.txt` has a pre-existing parse error (`Function 'add' is not declared`). Use the dynamic link runner or other test files instead.
- No Docker, no databases, no `.env` files needed.
