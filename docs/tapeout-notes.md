# TapeOut Technical Notes & Findings

Network: **X Layer Mainnet** (Chain ID: 196)  
Date: 2026-10-25

## 1. Confirmed Signatures & Interfaces

### Processor Factory (`0x1f09DAeFA827f02CBb40967cc91b259763760761`)

MEASURED via RPC and local fork:

- `deployFee() external view returns (uint256)`: Returns `6,600,000,000,000,000` (0.0066 OKB).
- `protocolFee() external view returns (uint256)`: Returns `660,000,000,000,000` (0.00066 OKB).
- `createCPU(string name, string symbol, string story, uint256 transistorSupply, uint256 mintPrice) external payable returns (address transistors, address circuits)`: Deploys a new CPU transistor token and circuit processor. Emits `CPUCreated(address indexed circuits, address indexed transistors, address creator, string name, uint256 transistorSupply, uint256 mintPrice)`. Note: topic 1 is circuits, topic 2 is transistors.
- Minimum `transistorSupply`: 10,000.

### Processor (`circuits` address deployed by factory)

MEASURED via local fork:

- `TAPEOUT_FEE() external view returns (uint256)`: Returns `1,300,000,000,000,000` (0.0013 OKB).
- `tapeout(bytes nl, uint32 nIn, uint32 nOut) external payable returns (uint256)`: Submits the binary netlist.
- `eval(uint256 id, bytes calldata inputs) external view returns (bytes memory)`: Evaluates a circuit with bit-packed inputs.
- `netlist(uint256 id) external view returns (bytes memory)`: Returns the original taped-out netlist bytes.
- `circuitCount() external view returns (uint256)`: Returns the number of taped-out circuits.

### Transistors (`transistors` address deployed by factory)

- ERC-1155 token representing logic gates.
- `mint(uint256 typeId, uint256 count) external payable`: Mints gate credits. `typeId = 0` corresponds to NAND gates.
- `protocolFee() external view returns (uint256)`: Returns `660,000,000,000,000` wei (0.00066 OKB).
- `mintPrice() external view returns (uint256)`: Returns `1,000,000,000` wei (1 gwei).
- Value required: `count * mintPrice + protocolFee`.

## 2. Input & Output Bit Packing Rules

For circuits with up to 16 inputs:

- Inputs are bit-packed into a byte array where bit index `i` drives input pin `2 + i`.
- **MEASURED Bit Packing Rule (Candidate 1 - Little-Endian bit order):**
  - Matched **512/512** truth table inputs against local fork tapeout on 2026-10-25.
  - Byte 0: Bit 0 is the least significant bit (`byte0 & 0x01`), driving Pin 2 (`sane`). Bit 7 is (`byte0 & 0x80`), driving Pin 9 (`cooldownOk`).
  - Byte 1: Bit 0 is the least significant bit (`byte1 & 0x01`), driving Pin 10 (`isExit`, bit 8).
  - In Solidity:
    ```solidity
    bytes memory packed = new bytes(2);
    packed[0] = bytes1(uint8(bits & 0xff));
    packed[1] = bytes1(uint8((bits >> 8) & 0xff));
    ```
- Outputs are packed identically: Bit 0 of Byte 0 indicates the result of output pin 0 (1 = allowed, 0 = blocked).

## 3. Circuit ID Discovery

- Primary method: Query `circuitCount()` on the processor contract before and after `tapeout(...)`.
- Secondary verification: Scan `netlist(id)` and compare against `MANDATE_V1_BYTES` (keccak256 hash `0xbe106fa891c4f0b430afdcf245df6a3df86508351ef76af2e1508b064dff24f5`).

## 4. Netlist Binary Representation for `MANDATE_V1`

- Inputs: 9
- Outputs: 1
- NAND Gates: 17
- Total Binary Length: 119 bytes (17 gates \* 7 bytes per gate)
- Keccak256 Hash: `0xbe106fa891c4f0b430afdcf245df6a3df86508351ef76af2e1508b064dff24f5`
