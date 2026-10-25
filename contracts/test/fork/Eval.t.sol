// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {GeneratedConstants} from "./Generated.sol";

interface IProcessor {
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function netlist(uint256 id) external view returns (bytes memory);
}

contract EvalForkTest is Test {
    address internal processor;
    uint256 internal circuitId;

    function setUp() public {
        processor = GeneratedConstants.PROCESSOR;
        circuitId = GeneratedConstants.CIRCUIT_ID;
    }

    function packInputs(uint16 bits) internal pure returns (bytes memory) {
        // Packing rule: two bytes, little-endian bit order (bit 0 in byte 0 lowest bit, bit 8 in byte 1 lowest bit)
        bytes memory packed = new bytes(2);
        packed[0] = bytes1(uint8(bits & 0xff));
        packed[1] = bytes1(uint8((bits >> 8) & 0xff));
        return packed;
    }

    function referenceAllowed(uint16 bits) internal pure returns (bool) {
        bool sane = (bits & (1 << 0)) != 0;
        bool tokenAllowed = (bits & (1 << 1)) != 0;
        bool notExpired = (bits & (1 << 2)) != 0;
        bool notFrozen = (bits & (1 << 3)) != 0;
        bool sizeOk = (bits & (1 << 4)) != 0;
        bool dailyOk = (bits & (1 << 5)) != 0;
        bool tradesOk = (bits & (1 << 6)) != 0;
        bool cooldownOk = (bits & (1 << 7)) != 0;
        bool isExit = (bits & (1 << 8)) != 0;

        bool buyAllowed = tokenAllowed && notExpired && notFrozen && sizeOk && dailyOk && tradesOk && cooldownOk;
        return sane && (isExit || buyAllowed);
    }

    function test_eval_all512InputsMatchSimulator() public view {
        if (processor.code.length == 0) {
            // Skips if running without active fork tapeout
            return;
        }

        for (uint16 i = 0; i < 512; i++) {
            bytes memory packed = packInputs(i);
            bytes memory outputBytes = IProcessor(processor).eval(circuitId, packed);
            bool actualAllowed = (uint8(outputBytes[0]) & 1) != 0;
            bool expectedAllowed = referenceAllowed(i);
            assertEq(actualAllowed, expectedAllowed, "Eval mismatch for input bits");
        }
    }
}
