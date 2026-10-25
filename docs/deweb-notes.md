# DeWEB (On-Chain Website Store) Technical Notes & Spike Results

Primary Sources:

- `TapeKit/SPEC.md` (CC0 specification, draft v0.2)
- `TapeKit/GUIDE.md` (Technical implementation guide)
- `TapeKit/kernel/src/config.js` (Multi-chain network constants and contract addresses)
- `TAPs/TAPs/TAP-11.zh.md` (TapeOut standards and deployed contract registry)

Network: **X Layer Mainnet** (Chain ID: 196)  
Date: 2026-10-25

---

## 1. Protocol Architecture & Mechanics

### What a Container is

- An ERC-6551 Token Bound Account (TBA) bound uniquely to a circuit NFT (tokenId #ID on a TapeOut processor contract) (`TapeKit/SPEC.md` §1).
- Derived deterministically on-chain via `opener.accountOf(processorContract, #ID)` (`TapeKit/SPEC.md` §1, §3.2). One container hosts one on-chain website.

### How a Container is Created

- When a circuit is taped out, the circuit owner opens the container by calling the Container Opener contract (`TapeKit/SPEC.md` §3.2).
- The opener deploys an ERC-6551 proxy pointing to the pinned container implementation.

### How Files are Stored

- Stored by `(container, path)` in the `SiteRegistry` contract (`TapeKit/SPEC.md` §1, §5).
- Chunks: Files are split into chunks of maximum `CHUNK_MAX = 24,000` bytes (`TapeKit/SPEC.md` Appendix B.5).
- Upload calls:
  1. `putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data)`: Writes the first chunk (up to 24,000 bytes) and records the total file SHA-256 hash. If the file already exists, it replaces the entire file (`TapeKit/SPEC.md` Appendix B.5).
  2. `appendChunk(address container, string path, uint256 expectIndex, bytes data)`: Appends additional chunks. `expectIndex` must strictly equal the current chunk count (1, 2, 3...) to prevent duplicate or out-of-order appends (`TapeKit/SPEC.md` Appendix B.5).
  3. `setFallback(address container, string path)`: Configures a fallback path (e.g. `/index.html`) for single-page applications (`TapeKit/SPEC.md` §6, Appendix B.5).
- Physical storage: Each chunk's raw bytes are stored as the runtime bytecode of a minimal contract deployed with a `STOP` (0x00) opcode prefix (`TapeKit/SPEC.md` Appendix B.5).

### How a Name is Bound

- Canonical on-chain name format: `<#ID>.<areaCode>.<processorNumber>.tape` (`TapeKit/README.md` line 237).
- For X Layer (area code 2): `<#ID>.2.<processorNumber>.tape` (e.g. `1.2.0.tape`).
- Paid via `DomainBinding(bindingAddress).bind(name, container, months)` (`TapeKit/GUIDE.md` lines 27-31).
- On X Layer, `monthlyFee()` returns `0` (0 OKB), allowing domain binding without monthly protocol fees.

### What the Reader Verifies

- When a client reads a site using `@tapekit/kernel`:
  1. Queries `SiteRegistry.fileInfo(container, path)` to obtain `size`, `contentType`, `sha256Hash`, and `chunkCount` (`TapeKit/SPEC.md` §5).
  2. Reads file bytes in 96 KB slices via `read(container, path)` or `readRange(...)` (`TapeKit/SPEC.md` §5).
  3. Verifies that the reconstructed byte length equals `size` and that `SHA256(bytes) == sha256Hash`. If a mismatch occurs, the file is rejected as corrupted or incomplete (`TapeKit/SPEC.md` §5).
  4. Resolves missing paths to `fallbackPath` (`/index.html`).

---

## 2. Verified X Layer Contract Addresses

All addresses verified with non-empty bytecode on live X Layer mainnet (`https://rpc.xlayer.tech`, Chain ID 196):

| Contract Role                 | Proxy Address                                | Implementation Address                       | Verified Bytecode Size |
| ----------------------------- | -------------------------------------------- | -------------------------------------------- | ---------------------- |
| **Processor Factory**         | `0x1f09DAeFA827f02CBb40967cc91b259763760761` | `0x74956236Ab64eD143933040B4137E8A352e4d17b` | 130 bytes              |
| **Container Opener**          | `0x536add8f30f03b69f6fbf29d425a816a0dc50106` | —                                            | 2,604 bytes            |
| **SiteRegistry** (Site Store) | `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` | `0xa85c4143d1D4A77f54b8e4ecc9e6d1418afea45f` | 176 bytes              |
| **DomainBinding** (Payment)   | `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9` | `0x5eBF29b80789e548907C707530C3C7607C4347Df` | 176 bytes              |

---

## 3. Estimated Costs & Limits Table

Estimated at X Layer gas price (formula: `65,000 gas base + 216 gas/byte` per chunk + `45,000 gas` fallback):

| Payload Size                                  | Transactions / Chunks                         | Gas (ESTIMATE)     | Cost in OKB (ESTIMATE at 1.0 gwei) |
| --------------------------------------------- | --------------------------------------------- | ------------------ | ---------------------------------- |
| **1 KB** (hello-world / icon)                 | 1 tx (`putFile`)                              | ~280,000 gas       | ~0.00028 OKB                       |
| **24 KB** (1 full chunk)                      | 1 tx (`putFile`)                              | ~5,250,000 gas     | ~0.00525 OKB                       |
| **100 KB**                                    | 5 txs (1 `putFile` + 4 `appendChunk`)         | ~22,000,000 gas    | ~0.02200 OKB                       |
| **Full Web Bundle (143.4 KB, 143,449 bytes)** | 7 txs (1 HTML, 6 JS chunks) + 1 `setFallback` | **31,484,984 gas** | **0.03170 OKB**                    |
| **Name Binding**                              | 1 tx (`DomainBinding.bind`)                   | ~80,000 gas        | ~0.00008 OKB                       |

Note: Figures above are ESTIMATES calculated via `scripts/deweb-publish.ts` dry-run on 2026-10-25.

### Hard Protocol Limits (DOCUMENTED ONLY)

- Chunk Size: Maximum 24,000 bytes per chunk (`TapeKit/SPEC.md` Appendix B.5).
- File Size: Maximum 350 chunks = 8,400,000 bytes (~8.4 MB) per file (`TapeKit/SPEC.md` §5).
- Paths Count: Maximum 5,000 manifest paths per container (`TapeKit/kernel/src/config.js` `LIMITS.maxManifestPaths`).
- Reader Chunk Size: Single `read` supports files up to 96 KB; larger files must use paged `readRange` in 96 KB increments.

---

## 4. Single-Page Application (SPA) & Wallet Compatibility (DOCUMENTED ONLY / UNVERIFIED)

- **Hash Routing (`#/route`):** DOCUMENTED ONLY. Hash fragments are processed purely client-side by the browser runtime.
- **Fallback (`setFallback`):** DOCUMENTED ONLY. Direct navigation to non-asset paths falls back to `/index.html`.
- **Wallet Connection (`window.ethereum`):** DOCUMENTED ONLY / UNVERIFIED. The TapeKit Service Worker gateway documentation describes serving sites under an origin domain allowing wallet provider injection. Live wallet behavior on an on-chain hosted mirror has not been tested with real transactions.

---

## 5. Recommendation & Verdict

**Verdict: MIRROR FEASIBLE WITH CONSTRAINTS (TO BE TESTED)**

### Recommendations:

1. **Bundle Budget:** Maintain total uncompressed static web bundle under **300 KB** (current build is 143.13 KB JS + 0.32 KB HTML = 143.45 KB).
2. **Chunking Automation:** Use `scripts/deweb-publish.ts` to automate chunking at 24,000 bytes with SHA-256 computation and fallback assignment.
3. **Primary + Mirror Strategy:** Keep Cloudflare Pages as the primary production endpoint, and evaluate on-chain DeWEB publishing when real deployment is requested.
