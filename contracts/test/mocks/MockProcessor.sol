// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IProcessor} from "../../src/interfaces/IProcessor.sol";

contract MockProcessor is IProcessor {
    mapping(uint256 => bytes) private _netlists;
    mapping(uint256 => bytes) private _responses;

    function setNetlist(uint256 id, bytes memory nl) external {
        _netlists[id] = nl;
    }

    function setEvalResponse(uint256 id, bytes memory res) external {
        _responses[id] = res;
    }

    function netlist(uint256 id) external view returns (bytes memory) {
        return _netlists[id];
    }

    function eval(uint256 id, bytes calldata) external view returns (bytes memory) {
        return _responses[id];
    }
}
