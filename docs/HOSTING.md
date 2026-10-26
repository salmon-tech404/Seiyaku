# Hosting & Deployment Guide

This guide covers deployment instructions for the primary web interface on **Cloudflare Pages** and the decentralized on-chain mirror via **DeWEB** (SiteRegistry on X Layer).

---

## 1. Cloudflare Pages (Primary Endpoint)

The web frontend is a zero-dependency static Single-Page Application (SPA) designed to build without environment variables and run with strict security headers.

### Deployment Steps

1. **Log in to Cloudflare Dashboard** and navigate to **Compute (Workers) > Workers & Pages > Create application > Pages > Connect to Git**.
2. **Select the repository**: `seiyaku` (or fork).
3. **Configure build settings**:
   - **Framework preset**: None
   - **Build command**: `npm run build:static`
   - **Build output directory**: `apps/web/dist`
   - **Root directory**: `/` (repository root)
   - **Environment variables**: None required.
4. **Deploy**: Click **Save and Deploy**. Cloudflare automatically serves the static output and applies `apps/web/public/_headers` upon deployment.

### Custom Domain (Optional)

- In the Cloudflare Pages project settings, navigate to **Custom domains** and add your domain (e.g., `app.seiyaku.xyz`).
- Ensure DNS records (CNAME) are configured.

### Verifying Security Headers

After deployment, run `curl -I` against your live URL:

```bash
curl -I https://<your-project>.pages.dev/
```

Verify that the output contains:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-...'; style-src 'self' 'unsafe-inline'; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

---

## 2. DeWEB On-Chain Site Mirror (Backup Endpoint)

The web bundle is also publishable directly to the on-chain `SiteRegistry` on X Layer via ERC-6551 Token Bound Containers.

### Pre-Deployment Dry-Run

Run the publisher script without `--live` to inspect chunking and cost estimations:

```bash
npm run build:static
npx tsx scripts/deweb-publish.ts <CONTAINER_ADDRESS>
```

_Note: The script refuses to publish to X Layer mainnet (chain ID 196) unless both `--live` and `--mainnet` flags are supplied with `DEPLOYER_KEY` set in the environment._

### Live Publication (Owner Only)

1. Ensure your deployer wallet holds sufficient OKB for transaction gas (~0.003 OKB at standard 0.02 gwei mainnet gas prices).
2. Set the deployer private key:
   ```bash
   export DEPLOYER_KEY="0x..."
   ```
3. Run the live publisher:
   ```bash
   npx tsx scripts/deweb-publish.ts <CONTAINER_ADDRESS> --live --mainnet
   ```
4. Verify all files against on-chain state:
   ```bash
   npx tsx scripts/verify-deweb.ts <CONTAINER_ADDRESS>
   ```

### Rollback Procedure

If an invalid build is deployed to the on-chain container, rebuild the previous git tag or commit, and re-run `scripts/deweb-publish.ts`. `putFile` automatically overwrites the root chunks and resets the file size and SHA-256 hash to the previous version.

---

## 3. Post-Deployment Verification Checklist

Follow this checklist after every deployment:

1. **Header Verification**: Run `curl -I` on the primary URL and confirm all 5 security headers are present.
2. **Route Navigation**: Open `#/`, `#/create`, `#/verify`, `#/agents`, `#/about`, and `#/styleguide`. Confirm no 404 errors or console warnings.
3. **Wallet Connection**: Connect a test wallet on X Layer (chain ID 196) and ensure the account address and balance appear.
4. **On-Chain Verification**: Navigate to `#/verify`, paste the factory or vault address, and confirm all 17 NAND gates evaluate cleanly.
5. **Hash Parity**: Run `npm run check:static` and compare the local build SHA-256 hashes against `fileInfo` responses from the on-chain mirror.
