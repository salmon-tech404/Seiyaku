# P4-T04 Report: Web Polish, Performance, and Agents Page

## 1. Summary of Changes

Task P4-T04 focused on web performance optimization, mobile polish, chain clock synchronization, gate diagram readability, and replacing the temporary Agents placeholder with live SDK documentation and copyable snippets.

1. **Agents Page Replacement (`apps/web/src/features/agents/AgentsPage.tsx`)**:
   - Extracted typed documentation structures (`CLI_COMMAND_DOCS`, `CLI_EXIT_CODES_DOCS`, `MCP_TOOLS_DOCS`) to a clean sub-export `@seiyaku/agent-sdk/docs`.
   - Replaced "arrives in next release" banner with complete CLI command reference for all 8 commands (`state`, `check`, `trade`, `freeze`, `tighten`, `wait`, `explain`, `mcp`), complete with usage lines, option tables, and one-click copy buttons.
   - Added CLI exit code table (`0` OK, `1` BLOCKED, `2` TX_FAILED, `3` FROZEN, `4` USAGE_OR_RPC, `5` CANARY_TRIGGERED, `6` TIMEOUT).
   - Added Model Context Protocol (MCP) server reference detailing 4 tools (`seiyaku_get_state`, `seiyaku_check_trade`, `seiyaku_trade`, `seiyaku_freeze`) and copyable JSON configuration block for Claude Desktop and Cursor.
   - Documented on-chain security invariants and operator boundary constraints.
   - Added block reason code mapping table for all 8 circuit failure bits.
   - Full English and Vietnamese i18n parity verified via `check:i18n`.

2. **Web Performance & Code Splitting (`apps/web/src/App.tsx`, `apps/web/vite.config.ts`)**:
   - Introduced route-level `React.lazy()` and `Suspense` for heavy auxiliary pages: `VerifyPage`, `AboutPage`, `AgentsPage`, and `StyleguidePage`.
   - Configured manual vendor chunks for `vendor-react` and `vendor-viem` to maximize browser caching.
   - Enforced lowercase ASCII asset filenames to satisfy static deployment checks.
   - Kept subpath export `@seiyaku/agent-sdk/docs` lightweight to prevent bundling viem or MCP servers into client UI.
   - Main entry point reduced from ~590 KB to 241 KB. Total static build across all chunks: **650.51 KB**, strictly below the 800 KB budget.

3. **Performance Measurement (`scripts/measure-perf.ts`)**:
   - Instrumented headless Chrome with early `PerformanceObserver` injection via `page.addInitScript`.
   - Tested under realistic 4G network emulation (1.6 Mbps download, 750 Kbps upload, 150 ms RTT) and 4x CPU slowdown.
   - Real measured metrics:
     - First Contentful Paint (FCP): **1505 ms**
     - Largest Contentful Paint (LCP): **1505 ms**
     - DOMContentLoaded (DCL): **1269 ms**
     - Load Event End: **1269 ms**
     - Total uncompressed static bundle: **650.51 KB** (budget: 800.00 KB)
     - Total gzip transferred: **184.14 KB**

4. **Chain Clock Synchronization (`apps/web/src/shared/hooks/useChainClock.ts`)**:
   - Implemented `useChainClock` hook to avoid skew between the user's system clock and block timestamps on X Layer testnets or local forks.
   - Anchor block timestamp is fetched upon vault state read, and projected forward continuously every second using high-precision performance timers.
   - Updated `Countdown.tsx` with optional `currentTimestampSec` to eliminate negative drifts or jumpy timers.
   - Integrated into `VaultDashboardPage.tsx` for cooldown timers, daily UTC midnight rollovers, and pending timelock execution countdowns.

5. **Gate Diagram Readability & Controls (`apps/web/src/features/verify/GateDiagram.tsx`)**:
   - Added toolbar controls: "Fit", "100%", "Zoom In (+)", "Zoom Out (-)".
   - Added mouse wheel zoom support (`Ctrl` / `Cmd` + wheel) and click-and-drag panning.
   - Added sticky legend header, mobile horizontal scroll indicator pill, and halo strokes around text labels to prevent wire overlaps.
   - Added non-overlapping bounding-box layout unit test in `circuitLayout.test.ts`.

6. **Today Card & Banner Polish (`apps/web/src/features/vault/VaultDashboardPage.tsx`)**:
   - Added Vault Status chip and Last Buy timestamp row to the Today card.
   - Fixed meter caption margin spacing (`4px` top, `6px` bottom) ensuring captions never touch or overlap meter progress bars.
   - Parameterized demo mode top banner to dynamically display delay parameter ({delay}s).

---

## 2. Test Execution & Verification

### Unit & Integration Tests
```
$ npm test
Test Files  32 passed (32)
Tests       223 passed (223)
Duration    4.48s
```

### Static Build & Budget Check
```
$ npm run check:static
=== Static Build Output Report ===
  assets/aboutpage-2c3dd5c8.js                 6.85 KB
  assets/aboutpage-fe99d97c.css                4.47 KB
  assets/agentspage-0560a3ea.css               4.46 KB
  assets/agentspage-0e9fd01b.js               13.23 KB
  assets/index-636fd730.js                   241.83 KB
  assets/index-814350b7.css                   25.54 KB
  assets/styleguidepage-e25fa53d.js            4.61 KB
  assets/vendor-react-b61c178d.js            137.37 KB
  assets/vendor-viem-1b12b10d.js             181.33 KB
  assets/verifypage-b48b978e.css               8.47 KB
  assets/verifypage-f0c98df2.js               21.15 KB
  index.html                                   1.20 KB
----------------------------------------------------
  TOTAL UNCOMPRESSED:                        650.51 KB (budget: 800.00 KB)

PASSED: check:static verified successfully.
```

### Throttled Mobile Performance
```
$ npx tsx scripts/measure-perf.ts
=== Throttled Mobile Performance Report ===
Profile: Mobile (390x844), 4x CPU Throttling, 1.6 Mbps / 150ms RTT Network
First Contentful Paint (FCP):     1505 ms
Largest Contentful Paint (LCP):   1505 ms
DOMContentLoaded (DCL):          1269 ms
Load Event End:                  1269 ms
----------------------------------------------------
Total Uncompressed Bundle:       650.51 KB (budget: 800.00 KB)
Total Gzip Transferred:          184.14 KB
```

### Full Repository Verification
```
$ npm run verify
PASSED: forge fmt --check
PASSED: forge build
PASSED: ABI check
PASSED: ESLint
PASSED: Prettier check
PASSED: TypeScript typecheck (circuit-tools, agent-sdk, web)
PASSED: Vitest tests (223/223 passed)
PASSED: i18n check
PASSED: Color contrast check (WCAG AA)
PASSED: Web build
PASSED: Static build budget check
=== All verification checks passed successfully ===
```

### Forbidden Words Grep
```
$ git grep -i -E "silicon|hardware|battle-tested|guaranteed" -- apps/ packages/ examples/
[NO MATCHES - EXIT CODE 1]
```

---

## 3. Visual & Screenshot Inspection

56 automated screenshots were regenerated across 7 scenarios (390px mobile, 1280px desktop, dark/light themes, en/vi). All 56 files in `docs/screens/p3-fix01/manifest.json` have distinct SHA-256 hashes. In addition, `docs/screens/p3-fix01/agents-desktop-dark-en.png` was captured for the new Agents page.

- **Fixed:**
  - Today Card: Captions no longer overlap meter bars; Vault Status chip and Last Buy timestamps are clearly visible.
  - Gate Diagram: Fit and 100% controls allow easy toggling; wires have background halos ensuring gate names remain legible; toolbar is pinned cleanly above the diagram.
  - Agents Page: Replaces placeholder with styled code blocks, quick-copy buttons, exit codes, and MCP documentation.
  - Mobile Responsiveness: Command cards and tables reflow smoothly on 390px viewports with horizontal scroll containers where necessary.
- **Imperfect / Remaining Trade-offs:**
  - In mobile viewports (390px), the 17-gate DAG diagram remains dense. While panning and horizontal scrolling are fully functional and hinted, viewing the complete end-to-end path without zooming requires landscape orientation.
  - MCP configuration block contains placeholder RPC and key strings (`SEIYAKU_TRADER_KEY: '0x...'`), which users must populate manually.

---

## 4. Invariants & Commitments
- One commit for P4-T04 on branch `build/auto-p4`.
- Never pushed to remote.
- No real keys or funds used.
- No changes made to `README.md` or `contracts/src`.
- Zero forbidden words present in product copy.
