// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Limits} from "./DataTypes.sol";

struct FactoryConfig {
    address implementation;
    address baseToken;
    address swapRouter;
    address processor;
    uint256 circuitId;
    bytes32 netlistHash;
    uint32 loosenDelaySec;
    uint32 minWithdrawDelaySec;
    uint128 maxDepositBase;
    address beacon;
    address beaconImplementation;
    bytes32 beaconImplementationCodehash;
}

struct VaultInitParams {
    address owner;
    address trader;
    Limits limits;
    address[] allowedTokens;
    address baseToken;
    address swapRouter;
    address processor;
    uint256 circuitId;
    uint32 loosenDelaySec;
    uint32 minWithdrawDelaySec;
    uint128 maxDepositBase;
    address beacon;
    address beaconImplementation;
    bytes32 beaconImplementationCodehash;
}
