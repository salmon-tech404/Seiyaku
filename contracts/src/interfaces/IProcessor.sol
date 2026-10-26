// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IProcessor {
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function netlist(uint256 id) external view returns (bytes memory);
}
