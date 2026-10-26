# Dependencies

All dependencies are pinned to exact versions. Checked on 2026-10-26.

| Package                     | Version | License    | Shipped in Browser? | Shipped in Agent SDK? | Purpose                                                |
| --------------------------- | ------- | ---------- | ------------------- | --------------------- | ------------------------------------------------------ |
| `react`                     | 18.3.1  | MIT        | **Yes**             | No                    | UI declarative view library                            |
| `react-dom`                 | 18.3.1  | MIT        | **Yes**             | No                    | React DOM renderer                                     |
| `viem`                      | 2.21.34 | MIT        | **Yes**             | **Yes**               | Ethereum client library for contract/chain interaction |
| `zod`                       | 3.23.8  | MIT        | No (docs only)      | **Yes**               | Data parsing and runtime validation schema             |
| `@modelcontextprotocol/sdk` | 1.32.2  | MIT        | No                  | **Yes** (CLI/server)  | Model Context Protocol (MCP) server & client SDK       |
| `@testing-library/react`    | 16.3.3  | MIT        | No (dev)            | No                    | React component unit testing utilities                 |
| `happy-dom`                 | 21.0.4  | MIT        | No (dev)            | No                    | Fast DOM implementation for Vitest                     |
| `typescript`                | 5.6.3   | Apache-2.0 | No (dev)            | No                    | Static type checker                                    |
| `tsx`                       | 4.23.15 | MIT        | No (dev)            | No                    | TypeScript execution CLI                               |
| `vite`                      | 5.4.10  | MIT        | No (dev)            | No                    | Static bundler & dev server                            |
| `@vitejs/plugin-react`      | 4.3.3   | MIT        | No (dev)            | No                    | Vite plugin for React fast refresh                     |
| `@types/react`              | 18.3.12 | MIT        | No (dev)            | No                    | TypeScript types for React                             |
| `@types/react-dom`          | 18.3.1  | MIT        | No (dev)            | No                    | TypeScript types for React DOM                         |
| `@types/node`               | 20.17.0 | MIT        | No (dev)            | No                    | TypeScript types for Node.js                           |
| `vitest`                    | 2.1.3   | MIT        | No (dev)            | No                    | Fast unit test runner                                  |
| `eslint`                    | 9.13.0  | MIT        | No (dev)            | No                    | JavaScript & TypeScript linter                         |
| `@eslint/js`                | 9.13.0  | MIT        | No (dev)            | No                    | ESLint JavaScript configurations                       |
| `typescript-eslint`         | 8.11.0  | MIT        | No (dev)            | No                    | ESLint tooling for TypeScript                          |
| `prettier`                  | 3.3.3   | MIT        | No (dev)            | No                    | Code formatting                                        |
| `@playwright/test`          | 1.48.2  | Apache-2.0 | No (dev)            | No                    | End-to-end and screenshot automation                   |

## Security Audit Summary (`npm audit` - 2026-10-26)

An `npm audit` reports 13 vulnerabilities (2 low, 2 moderate, 7 high, 2 critical) across dev-tooling and optional sub-dependencies:

| Package Affected     | Severity | Vulnerability Advisory / Cause                    | Shipped in Prod Bundle? | Impact & Context                                                       |
| -------------------- | -------- | ------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `tinypool`           | Critical | Prototype pollution in worker options (GHSA-5gmw) | **No** (test runner)    | Vitest internal test runner dependency; not present in client builds.  |
| `playwright`         | High     | Browser download certificate check (GHSA-7mvr)    | **No** (e2e testing)    | Dev tool only for running automated browser checks.                    |
| `ws` (via `viem`)    | High     | Memory disclosure & DoS on fragments (GHSA-58qx)  | **No** (node/dev only)  | Node RPC scripts only; browser bundles use native browser `WebSocket`. |
| `zod`                | High     | Memory exhaustion on oversized collections        | **No** (in web bundle)  | Only used in SDK CLI / MCP runtime for input schema validation.        |
| `esbuild`            | Moderate | Dev-server request handling (GHSA-67mh)           | **No** (bundler only)   | Build tool only; static assets are served statically.                  |
| `@eslint/plugin-kit` | Low      | ReDoS in ConfigCommentParser (GHSA-xffm)          | **No** (linter only)    | Lint tool only.                                                        |

All dependencies remain pinned in accordance with coding rule 0.6. No unexpected production runtime dependencies are included.
