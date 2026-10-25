# Dependencies

All dependencies are pinned to exact versions. Checked on 2026-10-25.

| Package                 | Version | License    | Purpose                                                |
| ----------------------- | ------- | ---------- | ------------------------------------------------------ |
| `react`                 | 18.3.1  | MIT        | UI library                                             |
| `react-dom`             | 18.3.1  | MIT        | React DOM renderer                                     |
| `viem`                  | 2.21.34 | MIT        | Ethereum client library for contract/chain interaction |
| `wagmi`                 | 2.12.22 | MIT        | React hooks for Ethereum wallet & state                |
| `@tanstack/react-query` | 5.59.16 | MIT        | Async state management for wagmi                       |
| `zod`                   | 3.23.8  | MIT        | Data parsing and runtime validation schema             |
| `typescript`            | 5.6.3   | Apache-2.0 | Static type checker                                    |
| `tsx`                   | 4.23.15 | MIT        | TypeScript execution CLI                               |
| `vite`                  | 5.4.10  | MIT        | Static bundler & dev server                            |
| `@vitejs/plugin-react`  | 4.3.3   | MIT        | Vite plugin for React fast refresh                     |
| `@types/react`          | 18.3.12 | MIT        | TypeScript types for React                             |
| `@types/react-dom`      | 18.3.1  | MIT        | TypeScript types for React DOM                         |
| `@types/node`           | 20.17.0 | MIT        | TypeScript types for Node.js                           |
| `vitest`                | 2.1.3   | MIT        | Fast unit test runner                                  |
| `eslint`                | 9.13.0  | MIT        | JavaScript & TypeScript linter                         |
| `@eslint/js`            | 9.13.0  | MIT        | ESLint JavaScript configurations                       |
| `typescript-eslint`     | 8.11.0  | MIT        | ESLint tooling for TypeScript                          |
| `prettier`              | 3.3.3   | MIT        | Code formatting                                        |

## Security Audit (npm audit - 2026-10-25)

An `npm audit` on the pinned dependencies reports 31 vulnerabilities (7 low, 14 moderate, 8 high, 2 critical). Per coding rule 0.6, versions are pinned and not upgraded without owner direction:

| Package Affected                         | Severity        | Vulnerability Advisory / Cause                     | Used in Browser Bundle?                               | Impact & Context                                                                                       |
| ---------------------------------------- | --------------- | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ws` (via `viem`)                        | High            | GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p           | **No** (dev/node only; browser uses native WebSocket) | Node RPC scripts only.                                                                                 |
| `zod`                                    | High            | GHSA-mrhx-c7xc-m3w5 (DoS on oversized collections) | **Yes** (via `@seiyaku/circuit-tools`)                | Used for validating small local circuit AST structures; inputs are not unbounded user network strings. |
| `@coinbase/wallet-sdk` / `@metamask/sdk` | High / Moderate | GHSA-8rgj-285w-qcq4, GHSA-qj3p-xc97-xw74           | **Optional** (wallet connector dependencies in wagmi) | Sub-dependencies of wagmi connectors.                                                                  |
| `tinypool` (via `vitest`)                | Critical        | GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr           | **No** (test runner only)                             | Only executed during `npm test` / Vitest.                                                              |
| `esbuild` (via `vite`)                   | Moderate        | GHSA-67mh-4wv8-2f99                                | **No** (build-time compiler)                          | Does not ship in static bundle.                                                                        |
| `@eslint/plugin-kit`                     | Moderate        | GHSA-xffm-g5w8-qvg7                                | **No** (linter only)                                  | Dev tool only.                                                                                         |

No upgrades performed; flagged for review by owner.
