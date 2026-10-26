// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Limits} from "../types/DataTypes.sol";

interface IMandateVaultFactory {
    event VaultCreated(address indexed owner, address indexed vault, address indexed trader);

    function createVault(address trader, Limits calldata limits, address[] calldata allowedTokens)
        external
        returns (address vault);
    function vaultsOf(address owner) external view returns (address[] memory);
}
