// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Limits} from "./types/DataTypes.sol";
import {FactoryConfig, VaultInitParams} from "./types/ConfigTypes.sol";
import {LimitsLib, InvalidLimits} from "./libraries/LimitsLib.sol";
import {IMandateVaultFactory} from "./interfaces/IMandateVaultFactory.sol";
import {IProcessor} from "./interfaces/IProcessor.sol";
import {IBeacon} from "./interfaces/IBeacon.sol";
import {MandateVault} from "./MandateVault.sol";

error ZeroAddress();
error CircuitChanged();

/**
 * @title MandateVaultFactory
 * @notice Deploys minimal clone mandate vaults on X Layer with pinned circuit verification.
 */
contract MandateVaultFactory is IMandateVaultFactory {
    FactoryConfig private _cfg;

    mapping(address => address[]) private _vaultsOf;

    constructor(FactoryConfig memory cfg) {
        if (
            cfg.implementation == address(0) || cfg.baseToken == address(0) || cfg.swapRouter == address(0)
                || cfg.processor == address(0) || cfg.beacon == address(0) || cfg.beaconImplementation == address(0)
        ) {
            revert ZeroAddress();
        }
        if (cfg.loosenDelaySec < 60) {
            revert InvalidLimits();
        }

        // D15 Circuit pinning checks
        bytes memory nl = IProcessor(cfg.processor).netlist(cfg.circuitId);
        if (keccak256(nl) != cfg.netlistHash) {
            revert CircuitChanged();
        }

        if (IBeacon(cfg.beacon).implementation() != cfg.beaconImplementation) {
            revert CircuitChanged();
        }

        if (cfg.beaconImplementation.codehash != cfg.beaconImplementationCodehash) {
            revert CircuitChanged();
        }

        if (Ownable(cfg.beacon).owner() != address(0)) {
            revert CircuitChanged();
        }

        _cfg = cfg;
    }

    function implementation() external view returns (address) {
        return _cfg.implementation;
    }

    function baseToken() external view returns (address) {
        return _cfg.baseToken;
    }

    function swapRouter() external view returns (address) {
        return _cfg.swapRouter;
    }

    function processor() external view returns (address) {
        return _cfg.processor;
    }

    function circuitId() external view returns (uint256) {
        return _cfg.circuitId;
    }

    function netlistHash() external view returns (bytes32) {
        return _cfg.netlistHash;
    }

    function loosenDelaySec() external view returns (uint32) {
        return _cfg.loosenDelaySec;
    }

    function minWithdrawDelaySec() external view returns (uint32) {
        return _cfg.minWithdrawDelaySec;
    }

    function maxDepositBase() external view returns (uint128) {
        return _cfg.maxDepositBase;
    }

    function beacon() external view returns (address) {
        return _cfg.beacon;
    }

    function beaconImplementation() external view returns (address) {
        return _cfg.beaconImplementation;
    }

    function beaconImplementationCodehash() external view returns (bytes32) {
        return _cfg.beaconImplementationCodehash;
    }

    /**
     * @notice Deploys a new clone vault for msg.sender.
     */
    function createVault(address trader, Limits calldata limits, address[] calldata allowedTokens)
        external
        returns (address vault)
    {
        if (trader == address(0)) revert ZeroAddress();
        if (allowedTokens.length > 20) revert InvalidLimits();

        // Validate limits
        LimitsLib.validate(limits, _cfg.minWithdrawDelaySec);

        // Validate allowed tokens: no baseToken, no duplicates, no address(0)
        for (uint256 i = 0; i < allowedTokens.length; i++) {
            address t = allowedTokens[i];
            if (t == address(0) || t == _cfg.baseToken) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                revert InvalidLimits();
            }
            for (uint256 j = i + 1; j < allowedTokens.length; j++) {
                if (t == allowedTokens[j]) {
                    // forge-lint: disable-next-line(require-revert-in-loop)
                    revert InvalidLimits();
                }
            }
        }

        vault = Clones.clone(_cfg.implementation);

        VaultInitParams memory p = VaultInitParams({
            owner: msg.sender,
            trader: trader,
            limits: limits,
            allowedTokens: allowedTokens,
            baseToken: _cfg.baseToken,
            swapRouter: _cfg.swapRouter,
            processor: _cfg.processor,
            circuitId: _cfg.circuitId,
            loosenDelaySec: _cfg.loosenDelaySec,
            minWithdrawDelaySec: _cfg.minWithdrawDelaySec,
            maxDepositBase: _cfg.maxDepositBase,
            beacon: _cfg.beacon,
            beaconImplementation: _cfg.beaconImplementation,
            beaconImplementationCodehash: _cfg.beaconImplementationCodehash
        });

        MandateVault(payable(vault)).initialize(p);

        _vaultsOf[msg.sender].push(vault);

        // forge-lint: disable-next-line(reentrancy-events)
        emit VaultCreated(msg.sender, vault, trader);
    }

    /**
     * @notice Returns all vault instances deployed for the given owner.
     */
    function vaultsOf(address owner) external view returns (address[] memory) {
        return _vaultsOf[owner];
    }
}
