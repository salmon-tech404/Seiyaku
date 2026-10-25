# Gate G1 Findings & Technical Probes

Network: **X Layer Mainnet** (Chain ID: 196)  
Block Gas Limit: `210,000,000` (MEASURED via RPC `https://rpc.xlayer.tech` and local fork at block 74175908 on 2026-10-25)  
Date: 2026-10-25

## Summary of Findings

| Question                                | Investigation                                                                                            | Measured Values / Findings                                                                                                                                                                                      | Recommendation                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1: Gas of `eval` from a contract**   | Cross-contract call to TapeOut processor `eval(circuitId, packedInputs)` for 17-NAND `MANDATE_V1`.       | **MEASURED**: 68,436 gas (allowed), 67,867 gas (blocked), 69,481 gas (worst-case at input 511). Gas report: min 68,688 / avg 69,438 / max 70,302 gas.                                                         | **PROCEED** (Gas is within budget; trade gas target < 400k is achieved with ~150k-170k total trade gas).                                           |
| **Q2: Comparing two circuits on-chain** | Evaluating two 9-input circuits across all 512 input combinations inside a contract to prove strictness. | **MEASURED**: 512 evaluations consumed 38,164,897 gas (~74.5k gas/eval). Fits inside X Layer's 210M block gas limit, but heavy for single runtime execution.                                                   | **ADJUST** (Enforce rule strictness via numeric vault limits in storage; offload netlist comparison to off-chain verification and factory pinning). |
| **Q3: Pinning the circuit**             | Detecting processor or circuit replacement on-chain.                                                     | **MEASURED**: `netlist(id)` is immutable storage. Processor is an UpgradeableBeacon proxy with implementation `0x977f217887E085D298Cb3819cDAD5A0ee35F29B2`. Implementation codehash: `0xc5d2460186f7...`.      | **PROCEED** (Factory pins circuit address, circuit ID, netlist hash, and implementation codehash at deploy time).                                  |
| **Q4: One real swap path**              | Uniswap V3 `exactInputSingle` round trip (USDC -> WOKB and WOKB -> USDC) on pool fee 500.                | **MEASURED**: Buy gas: 82,100 gas; Exit gas: 96,898 gas. Exact approval and 0-reset confirmed. Reverts on slippage (`revertsOnUnreachableSlippage`) and expired deadline (`revertsOnExpiredDeadline`) pass.   | **PROCEED** (Full swap path functional on fee tier 500).                                                                                            |

## Detailed Technical Analysis

### Q1: Gas of `eval` from a contract
- Call path: `ProbeEval.evaluateWithGas(uint16 inputBits)` -> calls `processor.eval(circuitId, packed)` -> beacon resolution -> implementation execution.
- Measured gas:
  - Allowed input (bits `(1<<0) | (1<<8)` = 257): **68,436 gas**
  - Blocked input (bits 0): **67,867 gas**
  - Worst case input (bits 511): **69,481 gas**
- Gas report table (514 calls): Min 68,688 / Avg 69,438 / Median 69,448 / Max 70,302.
- Total gas for buy trade: ~68.4k (eval) + ~82.1k (buy swap) + ~15k (checks) = ~165.5k gas (well below the 400,000 threshold).

### Q2: On-chain circuit comparison
- Gas for evaluating 512 inputs on-chain: **38,164,897 gas** (MEASURED via `ProbeEval.test_compareCircuits_gasAndFeasibility()`).
- Block gas limit on X Layer: **210,000,000 gas** (MEASURED via `cast block latest`).
- Verdict: Fits comfortably inside block limit (uses ~18.2% of the block), but consuming ~38M gas per comparison is costly. Numeric constraints on storage variables are preferred for instant parameter tightening.

### Q3: Circuit Pinning Recipe
- `netlist(id)` is immutable storage set upon tape-out. Submitting a new tapeout increments `circuitCount()` to a new id (tested on fork: tapeout created id 1, then id 2).
- Processor proxy structure:
  - Circuits contract is a BeaconProxy pointing to UpgradeableBeacon `0xf70d1ed4f62cf3780157b0b421b7e2f45bd0991c`.
  - UpgradeableBeacon implementation: `0x977f217887E085D298Cb3819cDAD5A0ee35F29B2`.
  - Beacon owner: `0x0000000000000000000000000000000000000000` (ownership renounced).
- Pinning recipe in factory:
  1. Pin `processor` address and `circuitId`.
  2. Pin expected `keccak256(processor.netlist(circuitId)) == MANDATE_V1_NETLIST_HASH` (`0xbe106fa891c4f0b430afdcf245df6a3df86508351ef76af2e1508b064dff24f5`).
  3. Optionally pin `extcodehash` of the processor proxy (`0x8c799a18cd8e0d5f5f3c0cec4fbc145e2daf79f70c2b131c09d0f380921db545`).

### Q4: Real Swap Path
- USDC: `0xB6CEceAB302E2E4948951eE7843FC24E92933061` (Native Circle USDC, 6 decimals).
- WOKB: `0xe538905cf8410324e03A5A23C1c177a474D59b2b` (18 decimals).
- Active pool: Fee tier 500 (0.05%), address `0x9f73888Fb725A3409548BC8d2e42365AC063E148`.
- Router: SwapRouter02 (`0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA`).
- Measured roundtrip swap for 10 USDC:
  - USDC -> WOKB buy: **82,100 gas**, received `92,899,559,766,608,064` wei WOKB (~0.0929 WOKB).
  - WOKB -> USDC exit: **96,898 gas**, received `9,990,002` wei USDC (~9.99 USDC).
  - Approvals reset to 0 after swaps: verified.
  - Revert on unreachable slippage: verified (`revertsOnUnreachableSlippage`).
  - Revert on expired deadline: verified (`revertsOnExpiredDeadline`).
