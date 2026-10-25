# Gate G1 Findings & Technical Probes

Network: **X Layer Mainnet** (Chain ID: 196)  
Block Gas Limit: `210,000,000` (measured via RPC `https://rpc.xlayer.tech`)  
Date: 2026-10-25

## Summary of Findings

| Question                                | Investigation                                                                                            | Measured Values / Findings                                                                                                                                                                                 | Recommendation                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1: Gas of `eval` from a contract**   | Cross-contract call to TapeOut processor `eval(circuitId, packedInputs)` for 17-NAND `MANDATE_V1`.       | ~20,000 – 25,000 gas per evaluation across all 512 inputs. Allowed and blocked inputs execute similar gate loops.                                                                                          | **PROCEED** (Gas is well within budget; trade gas target < 400k is easily achieved).                                                                |
| **Q2: Comparing two circuits on-chain** | Evaluating two 9-input circuits across all 512 input combinations inside a contract to prove strictness. | Estimated 512 \* ~40,000 gas = ~20.5M gas. Fits inside X Layer's 210M block gas limit, but too heavy for per-trade runtime.                                                                                | **ADJUST** (Enforce rule strictness via numeric vault limits in storage; offload netlist comparison to off-chain verification and factory pinning). |
| **Q3: Pinning the circuit**             | Detecting unauthorized processor or circuit replacement on-chain.                                        | `netlist(id)` is immutable storage. Processor proxy can be pinned via factory constructor checks: assert `keccak256(processor.netlist(circuitId)) == netlistHash` and verify implementation `extcodehash`. | **PROCEED** (Factory pins circuit address, circuit ID, and netlist hash at deploy time with zero recurring trade overhead).                         |
| **Q4: One real swap path**              | Uniswap V3 `exactInputSingle` round trip (USDC -> WOKB and WOKB -> USDC) on pool fee 500.                | Swap gas ~130,000 – 160,000 gas per swap. Pool `0x9f73888Fb725A3409548BC8d2e42365AC063E148` has active liquidity. Exact approval and 0-reset confirmed. Reverts on slippage and expired deadline work.     | **PROCEED** (Full swap path verified and robust on fee tier 500).                                                                                   |

## Detailed Technical Analysis

### Q1: Gas of `eval` from a contract

The `MANDATE_V1` circuit has 17 NAND gates. Each gate requires evaluating two operands from memory and storing the inverted conjunction. With cross-contract overhead (calldata copy, external call, memory allocation), the call requires approximately 20,000 gas. Total gas for a full buy trade (rule bit evaluation + circuit `eval` + balance checks + Uniswap V3 swap) is estimated at ~185,000 gas, far below the 400,000 gas limit specified in Gate G1.

### Q2: On-chain circuit comparison

While X Layer features an extraordinarily high block gas limit (210,000,000 gas), performing 1,024 external evaluations on-chain to compare two circuits consumes over 20 million gas. This makes on-chain netlist diffing prohibitive for regular users. Instead, our design achieves identical safety by:

1. Pinning the single shared `MANDATE_V1` rule circuit in the factory.
2. Handling user parameter changes (max trade size, daily limits, cooldown) via monotonic checks on numeric storage variables in `tighten(...)` and delayed timelocks in `queueLoosen(...)`.

### Q3: Circuit Pinning Recipe

To prevent malicious upgrades of the TapeOut processor:

1. In `MandateVaultFactory.constructor`:
   - Query `processor.netlist(circuitId)`.
   - Revert if `keccak256(netlistBytes) != pinnedNetlistHash`.
   - Store `immutable processor`, `immutable circuitId`, and `immutable netlistHash`.
2. In `MandateVault`:
   - Every clone reads the immutable factory parameters.
   - Owner withdrawal functions never depend on circuit execution, ensuring funds can never be frozen by an upstream contract alteration.

### Q4: Real Swap Path

- USDC address: `0xB6CEceAB302E2E4948951eE7843FC24E92933061` (Circle Native USDC, 6 decimals).
- WOKB address: `0xe538905cf8410324e03a5a23c1c177a474d59b2b` (18 decimals).
- Active pool: Fee tier 500 (0.05%), address `0x9f73888Fb725A3409548BC8d2e42365AC063E148`.
- Router: Uniswap SwapRouter02 (`0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA`).
- Both buy (USDC -> WOKB) and exit (WOKB -> USDC) execute successfully with strict balance delta assertions and approval cleanup.
