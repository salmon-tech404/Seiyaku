// SPDX-License-Identifier: MIT
// PROBE CONTRACT - TEMPORARY SPIKE FOR GATE G1 (WILL BE REMOVED BEFORE PRODUCTION)
pragma solidity 0.8.23;

interface IProcessor {
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function netlist(uint256 id) external view returns (bytes memory);
}

contract ProbeEval {
    address public immutable processor;
    uint256 public immutable circuitId;

    constructor(address _processor, uint256 _circuitId) {
        processor = _processor;
        circuitId = _circuitId;
    }

    /// @notice Packs 9-bit input into 2 bytes (little-endian bit packing)
    function pack(uint16 bits) public pure returns (bytes memory) {
        bytes memory p = new bytes(2);
        p[0] = bytes1(uint8(bits & 0xff));
        p[1] = bytes1(uint8((bits >> 8) & 0xff));
        return p;
    }

    /// @notice Evaluates circuit and measures gas
    function evaluateWithGas(uint16 inputBits) external view returns (bool allowed, uint256 gasUsed) {
        bytes memory p = pack(inputBits);
        uint256 startGas = gasleft();
        bytes memory res = IProcessor(processor).eval(circuitId, p);
        gasUsed = startGas - gasleft();
        allowed = (uint8(res[0]) & 1) != 0;
    }

    /// @notice Standard evaluate call
    function evaluate(uint16 inputBits) external view returns (bool) {
        bytes memory p = pack(inputBits);
        bytes memory res = IProcessor(processor).eval(circuitId, p);
        return (uint8(res[0]) & 1) != 0;
    }
}
