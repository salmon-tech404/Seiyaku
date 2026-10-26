# P4-T05 Report: Hosting Package for Cloudflare Pages and On-Chain Mirror

## 1. Summary of Changes

Task P4-T05 implemented the production deployment and hosting package, enabling zero-configuration deployments to **Cloudflare Pages** and verified mirror publishing to the decentralized on-chain **DeWEB** (SiteRegistry on X Layer).

1. **Cloudflare Security Headers (`apps/web/public/_headers`)**:

   - Deployed strict HTTP response headers:
     - `Content-Security-Policy`: Restricts scripts to `'self'` and the inline hash `'sha256-iXNLC8DGEBERXHccD+XUWudkF6vaJw/IFXjWLCRnE6s='` (theme bootstrapping), styles to `'self' 'unsafe-inline'`, connections to `'self'`, configured RPC endpoints (`https://rpc.xlayer.tech`, `https://xlayerrpc.okx.com`), block explorer (`https://www.oklink.com`), and local Anvil/preview endpoints (`http://127.0.0.1:*`, `http://localhost:*`), with `frame-ancestors 'none'`, `base-uri 'self'`, and `upgrade-insecure-requests`.
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: no-referrer`
     - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
   - Created `scripts/check-headers.ts` to statically verify parity between `apps/web/src/chain/config.ts` (RPC endpoints and explorer origin) and `_headers`.

2. **Root & Subpath Base Path Verification (`scripts/test-base-path.ts`)**:

   - Automated dual-server Playwright testing of `dist/` across both root base path (`/`) and deeply nested subpath (`/some/sub/path/`).
   - Navigated across all routes (`#/`, `#/create`, `#/verify`, `#/agents`, `#/about`, `#/styleguide`) with real security headers applied.
   - Verified that all lazy chunks load successfully with zero 404 HTTP errors and zero browser console errors.

3. **On-Chain DeWEB Publication & Verification on Fork (`scripts/deweb-publish.ts`, `scripts/verify-deweb.ts`)**:

   - Deployed circuit 1 container (`0xb43202318e21964262803433c95Cc15a22EAaBA0`) via `ContainerOpener` on the X Layer Anvil fork.
   - Executed dry-run cost estimation and live publishing of all 13 production files (666,725 total payload bytes in 36 chunks/transactions).
   - Validated bytecode storage against `SiteRegistry` (`0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6`).
   - Ran `scripts/verify-deweb.ts` reading back every file from the contract, verifying byte counts and SHA-256 hashes against local build files with 100% parity.

4. **Build Leak Detection & Compliance (`scripts/check-static.mjs`)**:

   - Extended `check:static` with:
     - Leaked private key detection (flags unmasked 32-byte test keys).
     - Local filesystem path leakage detection (e.g. `D:\18-hackathon`, `C:\Users\...\AppData`).
     - Test wallet marker check (`__SEIYAKU_E2E_TEST_WALLET__`).
     - Copyright year (2026) and owner placeholder (`<OWNER NAME>` / `Seiyaku`) validation in `LICENSE`.

5. **Hosting Documentation & Pipeline Scripts (`docs/HOSTING.md`, `package.json`)**:
   - Authored complete public deployment guide in `docs/HOSTING.md` covering Cloudflare Git connection, build settings (`npm run build:static`, directory `apps/web/dist`), header verification commands (`curl -I`), DeWEB publishing/rollback instructions, and post-deployment checklists.
   - Added npm scripts:
     - `npm run build:static`: Builds `apps/web/dist`.
     - `npm run headers:check`: Validates `_headers` against chain config.
     - `npm run hosting:check`: Runs full build, header check, static budget check, and subpath routing test.

---

## 2. Command Transcripts & Measured Metrics

### `npm run hosting:check`

```
$ npm run hosting:check

> hosting:check
> npm run build:static && npm run headers:check && npm run check:static && tsx scripts/test-base-path.ts


> build:static
> npm run build:web


> build:web
> npm --workspace=@seiyaku/web run build


> @seiyaku/web@0.1.0 build
> vite build

vite v5.4.10 building for production...
transforming...
✓ 450 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                           1.23 kB │ gzip:  0.51 kB
dist/assets/agentspage-0560a3ea.css       4.57 kB │ gzip:  0.98 kB
dist/assets/aboutpage-fe99d97c.css        4.58 kB │ gzip:  1.04 kB
dist/assets/verifypage-b48b978e.css       8.68 kB │ gzip:  1.92 kB
dist/assets/index-814350b7.css           26.15 kB │ gzip:  5.33 kB
dist/assets/styleguidepage-e25fa53d.js    4.72 kB │ gzip:  1.35 kB
dist/assets/aboutpage-2c3dd5c8.js         7.02 kB │ gzip:  1.58 kB
dist/assets/agentspage-0e9fd01b.js       13.55 kB │ gzip:  2.88 kB
dist/assets/verifypage-f0c98df2.js       21.66 kB │ gzip:  6.66 kB
dist/assets/vendor-react-b61c178d.js    140.67 kB │ gzip: 45.18 kB
dist/assets/vendor-viem-1b12b10d.js     185.68 kB │ gzip: 58.88 kB
dist/assets/index-636fd730.js           241.33 kB │ gzip: 62.47 kB
✓ built in 1.35s

> headers:check
> tsx scripts/check-headers.ts

PASSED: Cloudflare Pages _headers matches chain config and security policies.

> check:static
> node scripts/check-static.mjs

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
  _headers                                     0.58 KB
----------------------------------------------------
  TOTAL UNCOMPRESSED:                        651.10 KB (budget: 800.00 KB)

PASSED: check:static verified successfully.
PASSED: Base path test verified on both root ("/") and subpath ("/some/sub/path/") without 404s or console errors.
```

### DeWEB Live Publication & On-Chain Hash Verification on Fork

```
$ npx tsx scripts/deweb-publish.ts 0xb43202318e21964262803433c95Cc15a22EAaBA0 --live
=== DeWEB Site Publisher ===
RPC Endpoint: http://127.0.0.1:8545
Container:    0xb43202318e21964262803433c95Cc15a22EAaBA0
Dist folder:  D:\18-hackathon\tapeOut\apps\web\dist
Mode:         LIVE PUBLISHING

Found 13 files to publish:
  /assets/aboutpage-2c3dd5c8.js      7017 bytes (1 chunks, text/javascript; charset=utf-8)
  /assets/aboutpage-fe99d97c.css     4578 bytes (1 chunks, text/css; charset=utf-8)
  /assets/agentspage-0560a3ea.css     4568 bytes (1 chunks, text/css; charset=utf-8)
  /assets/agentspage-0e9fd01b.js    13551 bytes (1 chunks, text/javascript; charset=utf-8)
  /assets/index-636fd730.js        247631 bytes (11 chunks, text/javascript; charset=utf-8)
  /assets/index-814350b7.css        26153 bytes (2 chunks, text/css; charset=utf-8)
  /assets/styleguidepage-e25fa53d.js     4716 bytes (1 chunks, text/javascript; charset=utf-8)
  /assets/vendor-react-b61c178d.js   140665 bytes (6 chunks, text/javascript; charset=utf-8)
  /assets/vendor-viem-1b12b10d.js   185685 bytes (8 chunks, text/javascript; charset=utf-8)
  /assets/verifypage-b48b978e.css     8678 bytes (1 chunks, text/css; charset=utf-8)
  /assets/verifypage-f0c98df2.js    21657 bytes (1 chunks, text/javascript; charset=utf-8)
  /index.html                        1228 bytes (1 chunks, text/html; charset=utf-8)
  /_headers                           598 bytes (1 chunks, application/octet-stream)

Total payload: 666725 bytes in 36 transactions/chunks.
Target Chain ID: 196, Current Gas Price: 1.000000007 gwei

Estimated Gas:  146,397,600 gas
Estimated Cost at fork price (1.0 gwei):  0.146397601 OKB
Measured Live Mainnet Gas Price:          0.020000001 gwei (from https://rpc.xlayer.tech)
Estimated Cost at mainnet price:          0.002927952 OKB (~0.003 OKB)

Publishing from account 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266...
[All 36 putFile / appendChunk and 1 setFallback transactions confirmed on block 74254195]
Site publication finished successfully!

$ npx tsx scripts/verify-deweb.ts
Verifying container 0xb43202318e21964262803433c95Cc15a22EAaBA0 on http://127.0.0.1:8545...
  [VERIFIED] /assets/aboutpage-2c3dd5c8.js          size=7017 hash=0xc8db42eb388942cf...
  [VERIFIED] /assets/aboutpage-fe99d97c.css         size=4578 hash=0xb4b1ffdeccbbbf13...
  [VERIFIED] /assets/agentspage-0560a3ea.css        size=4568 hash=0x27c6668c38c51dbd...
  [VERIFIED] /assets/agentspage-0e9fd01b.js         size=13551 hash=0x7d3f3ff6253dd850...
  [VERIFIED] /assets/index-636fd730.js              size=247631 hash=0x9b177bb856b8014c...
  [VERIFIED] /assets/index-814350b7.css             size=26153 hash=0x5924c5a83f860ec8...
  [VERIFIED] /assets/styleguidepage-e25fa53d.js     size=4716 hash=0x0ab105cd119f5999...
  [VERIFIED] /assets/vendor-react-b61c178d.js       size=140665 hash=0xab28ae54628aa971...
  [VERIFIED] /assets/vendor-viem-1b12b10d.js        size=185685 hash=0xd173e1523f451aac...
  [VERIFIED] /assets/verifypage-b48b978e.css        size=8678 hash=0x5463c90ea0aa84bb...
  [VERIFIED] /assets/verifypage-f0c98df2.js         size=21657 hash=0x4120b89931ab22d1...
  [VERIFIED] /index.html                            size=1228 hash=0xc426028bdf5664b0...
  [VERIFIED] /_headers                              size=598 hash=0xa31913a96afe897b...

PASSED: All 13 files verified against on-chain SiteRegistry state!
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

---

## 3. Invariants & Commitments

- One commit for P4-T05 on branch `build/auto-p4`.
- Never pushed to remote.
- No real keys or funds used (only public Anvil test key for rehearsal).
- No changes made to `README.md` or `contracts/src`.
- Zero forbidden words present in product copy.
