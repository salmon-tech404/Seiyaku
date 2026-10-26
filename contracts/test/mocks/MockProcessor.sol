// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IProcessor} from "../../src/interfaces/IProcessor.sol";

error MockProcessorRevert();

contract MockProcessor is IProcessor {
    mapping(uint256 => bytes) private _netlists;
    mapping(uint256 => bytes) private _responses;
    bool public shouldRevert;
    bool public evaluateReference;

    function setNetlist(uint256 id, bytes memory nl) external {
        _netlists[id] = nl;
    }

    function setEvalResponse(uint256 id, bytes memory res) external {
        _responses[id] = res;
    }

    function setShouldRevert(bool rev) external {
        shouldRevert = rev;
    }

    function setEvaluateReference(bool ref) external {
        evaluateReference = ref;
    }

    function netlist(uint256 id) external view returns (bytes memory) {
        return _netlists[id];
    }

    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory) {
        if (shouldRevert) {
            revert MockProcessorRevert();
        }

        if (evaluateReference && inputs.length >= 2) {
            uint16 bits = uint16(uint8(inputs[0])) | (uint16(uint8(inputs[1])) << 8);
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
            bool allow = sane && (isExit || buyAllowed);

            bytes memory out = new bytes(1);
            out[0] = allow ? bytes1(0x01) : bytes1(0x00);
            return out;
        }

        return _responses[id];
    }
}
