// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {ProbeEval} from "../../src/probes/ProbeEval.sol";
import {GeneratedConstants} from "./Generated.sol";

contract ProbeEvalForkTest is Test {
    ProbeEval internal probe;

    function setUp() public {
        probe = new ProbeEval(GeneratedConstants.PROCESSOR, GeneratedConstants.CIRCUIT_ID);
    }

    function test_eval_gas_allowedInput() public {
        if (GeneratedConstants.PROCESSOR == address(0) || GeneratedConstants.PROCESSOR.code.length == 0) return;
        // Allowed input: sane (bit 0) and isExit (bit 8)
        uint16 inputBits = (1 << 0) | (1 << 8);
        (bool allowed, uint256 gasUsed) = probe.evaluateWithGas(inputBits);
        assertTrue(allowed);
        emit log_named_uint("Gas used for allowed input", gasUsed);
        assertLt(gasUsed, 40_000, "Eval gas exceeded 40,000 threshold");
    }

    function test_eval_gas_blockedInput() public {
        if (GeneratedConstants.PROCESSOR == address(0) || GeneratedConstants.PROCESSOR.code.length == 0) return;
        // Blocked input: all 0
        uint16 inputBits = 0;
        (bool allowed, uint256 gasUsed) = probe.evaluateWithGas(inputBits);
        assertFalse(allowed);
        emit log_named_uint("Gas used for blocked input", gasUsed);
        assertLt(gasUsed, 40_000, "Eval gas exceeded 40,000 threshold");
    }

    function test_eval_gas_worstCaseInput() public {
        if (GeneratedConstants.PROCESSOR == address(0) || GeneratedConstants.PROCESSOR.code.length == 0) return;
        uint256 maxGas = 0;
        uint16 worstInput = 0;

        for (uint16 i = 0; i < 512; i++) {
            (, uint256 gasUsed) = probe.evaluateWithGas(i);
            if (gasUsed > maxGas) {
                maxGas = gasUsed;
                worstInput = i;
            }
        }

        emit log_named_uint("Max eval gas", maxGas);
        emit log_named_uint("Worst case input", worstInput);
        assertLt(maxGas, 50_000, "Worst-case eval gas exceeded 50,000");
    }

    function test_compareCircuits_gasAndFeasibility() public {
        if (GeneratedConstants.PROCESSOR == address(0) || GeneratedConstants.PROCESSOR.code.length == 0) return;
        // Measure gas to evaluate 512 inputs
        uint256 startGas = gasleft();
        for (uint16 i = 0; i < 512; i++) {
            probe.evaluate(i);
        }
        uint256 totalGas = startGas - gasleft();
        emit log_named_uint("Total gas for 512 evaluations", totalGas);

        // X Layer block gas limit is 210,000,000
        assertLt(totalGas, 210_000_000, "Comparison must fit within block gas limit");
    }
}
