# X Layer Verified Addresses

Network: **X Layer Mainnet**  
Chain ID: `196`  
Verification RPC: `https://rpc.xlayer.tech`  
Verification Date: 2026-10-25

| Name                      | Address                                      | Explorer Link                                                                                       | How Verified                                                                                                                     | Status   |
| ------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Native USDC (Circle)      | `0xB6CEceAB302E2E4948951eE7843FC24E92933061` | [OKLink Explorer](https://www.oklink.com/xlayer/address/0xB6CEceAB302E2E4948951eE7843FC24E92933061) | Circle official docs, RPC `name()` ("USDC"), `symbol()` ("USDC"), `decimals()` (6), bytecode 1798 bytes                          | VERIFIED |
| Wrapped OKB (WOKB)        | `0xe538905cf8410324e03a5a23c1c177a474d59b2b` | [OKLink Explorer](https://www.oklink.com/xlayer/address/0xe538905cf8410324e03a5a23c1c177a474d59b2b) | Official X Layer wrapped native token, RPC `name()` ("Wrapped OKB"), `symbol()` ("WOKB"), `decimals()` (18), bytecode 3474 bytes | VERIFIED |
| Uniswap V3 Factory        | `0x4B2ab38DBF28D31D467aA8993f6c2585981D6804` | [OKLink Explorer](https://www.oklink.com/xlayer/address/0x4B2ab38DBF28D31D467aA8993f6c2585981D6804) | Official Uniswap deployment registry, RPC bytecode 24535 bytes, returns pools via `getPool`                                      | VERIFIED |
| SwapRouter02              | `0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA` | [OKLink Explorer](https://www.oklink.com/xlayer/address/0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA) | Official Uniswap deployment registry, RPC bytecode 24497 bytes                                                                   | VERIFIED |
| QuoterV2                  | `0xD1b797D92d87B688193A2B976eFc8D577D204343` | [OKLink Explorer](https://www.oklink.com/xlayer/address/0xD1b797D92d87B688193A2B976eFc8D577D204343) | Official Uniswap deployment registry, RPC bytecode 8273 bytes, simulated quote succeeded                                         | VERIFIED |
| USDC / WOKB Pool (500)    | `0x9f73888Fb725A3409548BC8d2e42365AC063E148` | [OKLink Explorer](https://www.oklink.com/xlayer/address/0x9f73888Fb725A3409548BC8d2e42365AC063E148) | Factory `getPool(USDC, WOKB, 500)`, liquidity > 0, live 10 USDC quote returned 0.093077 WOKB                                     | VERIFIED |
| TapeOut Processor Factory | `0x1f09DAeFA827f02CBb40967cc91b259763760761` | [OKLink Explorer](https://www.oklink.com/xlayer/address/0x1f09DAeFA827f02CBb40967cc91b259763760761) | TapeOut technical notes / tapemkt, RPC bytecode 130 bytes                                                                        | VERIFIED |

## Uniswap V3 Pool Liquidity Summary

| Pair        | Fee Tier      | Pool Address                                 | Liquidity            | Usable |
| ----------- | ------------- | -------------------------------------------- | -------------------- | ------ |
| USDC / WOKB | 500 (0.05%)   | `0x9f73888Fb725A3409548BC8d2e42365AC063E148` | `130641188506740819` | YES    |
| USDC / WOKB | 3000 (0.30%)  | None                                         | 0                    | NO     |
| USDC / WOKB | 10000 (1.00%) | None                                         | 0                    | NO     |

## Account Impersonation for Fork Tests

For local Anvil fork testing, account `0x9f73888Fb725A3409548BC8d2e42365AC063E148` holds over 470,000 USDC and can be impersonated via `anvil_impersonateAccount` to fund test accounts with native USDC.
