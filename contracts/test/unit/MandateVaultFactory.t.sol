// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Limits} from "../../src/types/DataTypes.sol";
import {FactoryConfig} from "../../src/types/ConfigTypes.sol";
import {MandateVaultFactory, ZeroAddress, CircuitChanged} from "../../src/MandateVaultFactory.sol";
import {MandateVault} from "../../src/MandateVault.sol";
import {InvalidLimits} from "../../src/libraries/LimitsLib.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockProcessor} from "../mocks/MockProcessor.sol";
import {MockBeacon} from "../mocks/MockBeacon.sol";

contract MandateVaultFactoryTest is Test {
    MandateVaultFactory internal factory;
    MandateVault internal masterImpl;
    MockERC20 internal usdc;
    MockERC20 internal allowedToken;
    MockProcessor internal processor;
    MockBeacon internal beacon;
    address internal beaconImpl;

    bytes32 internal netlistHash;
    bytes internal fakeNetlist = hex"000000030000040000000b00000b";
    uint256 internal circuitId = 1;

    address internal owner = address(0xAA);
    address internal trader = address(0xBB);

    event VaultCreated(address indexed owner, address indexed vault, address indexed trader);

    function setUp() public {
        masterImpl = new MandateVault();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        allowedToken = new MockERC20("Wrapped OKB", "WOKB", 18);

        processor = new MockProcessor();
        processor.setNetlist(circuitId, fakeNetlist);
        netlistHash = keccak256(fakeNetlist);

        // Dummy beacon implementation
        beaconImpl = address(new MockERC20("BeaconImpl", "BIMP", 18));
        beacon = new MockBeacon(beaconImpl, address(0)); // owner is address(0)

        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
            processor: address(processor),
            circuitId: circuitId,
            netlistHash: netlistHash,
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        factory = new MandateVaultFactory(cfg);
    }

    function _validLimits() internal view returns (Limits memory) {
        return Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });
    }

    function test_constructor_success_gettersMatch() public view {
        assertEq(factory.implementation(), address(masterImpl));
        assertEq(factory.baseToken(), address(usdc));
        assertEq(factory.swapRouter(), address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA));
        assertEq(factory.processor(), address(processor));
        assertEq(factory.circuitId(), circuitId);
        assertEq(factory.netlistHash(), netlistHash);
        assertEq(factory.loosenDelaySec(), 120);
        assertEq(factory.minWithdrawDelaySec(), 3600);
        assertEq(factory.maxDepositBase(), 500e6);
        assertEq(factory.beacon(), address(beacon));
        assertEq(factory.beaconImplementation(), beaconImpl);
        assertEq(factory.beaconImplementationCodehash(), beaconImpl.codehash);
    }

    function test_createVault_revertsOnZeroTokenInAllowlist() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(0);

        vm.expectRevert(InvalidLimits.selector);
        factory.createVault(trader, _validLimits(), tokens);
    }

    function test_constructor_revertsOnZeroAddress() public {
        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(0), // zero
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
            processor: address(processor),
            circuitId: circuitId,
            netlistHash: netlistHash,
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        vm.expectRevert(ZeroAddress.selector);
        new MandateVaultFactory(cfg);
    }

    function test_constructor_revertsOnLoosenDelayBelow60() public {
        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
            processor: address(processor),
            circuitId: circuitId,
            netlistHash: netlistHash,
            loosenDelaySec: 59, // < 60
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        vm.expectRevert(InvalidLimits.selector);
        new MandateVaultFactory(cfg);
    }

    function test_constructor_revertsOnNetlistHashMismatch() public {
        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
            processor: address(processor),
            circuitId: circuitId,
            netlistHash: keccak256("wrong_hash"),
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        vm.expectRevert(CircuitChanged.selector);
        new MandateVaultFactory(cfg);
    }

    function test_constructor_revertsOnBeaconImplMismatch() public {
        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
            processor: address(processor),
            circuitId: circuitId,
            netlistHash: netlistHash,
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: address(0xDEAD), // mismatch
            beaconImplementationCodehash: beaconImpl.codehash
        });

        vm.expectRevert(CircuitChanged.selector);
        new MandateVaultFactory(cfg);
    }

    function test_constructor_revertsOnBeaconOwnerNotZero() public {
        MockBeacon nonRenouncedBeacon = new MockBeacon(beaconImpl, address(0x999));

        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
            processor: address(processor),
            circuitId: circuitId,
            netlistHash: netlistHash,
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(nonRenouncedBeacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        vm.expectRevert(CircuitChanged.selector);
        new MandateVaultFactory(cfg);
    }

    function test_createVault_success_andVaultsOf() public {
        Limits memory l = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](1);
        tokens[0] = address(allowedToken);

        vm.prank(owner);
        address vault = factory.createVault(trader, l, tokens);

        assertTrue(vault != address(0));
        address[] memory list = factory.vaultsOf(owner);
        assertEq(list.length, 1);
        assertEq(list[0], vault);

        MandateVault v = MandateVault(payable(vault));
        assertEq(v.owner(), owner);
        assertEq(v.trader(), trader);
        assertTrue(v.allowedTokens(address(allowedToken)));
        assertFalse(v.allowedTokens(address(usdc)));
    }

    function test_createVault_revertsOnZeroTrader() public {
        Limits memory l = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](0);

        vm.expectRevert(ZeroAddress.selector);
        factory.createVault(address(0), l, tokens);
    }

    function test_createVault_revertsOnTooManyTokens() public {
        Limits memory l = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](21); // > 20
        for (uint256 i = 0; i < 21; i++) {
            tokens[i] = address(uint160(0x1000 + i));
        }

        vm.expectRevert(InvalidLimits.selector);
        factory.createVault(trader, l, tokens);
    }

    function test_createVault_revertsOnBaseTokenInAllowlist() public {
        Limits memory l = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc); // baseToken not allowed in allowlist

        vm.expectRevert(InvalidLimits.selector);
        factory.createVault(trader, l, tokens);
    }

    function test_createVault_revertsOnDuplicateTokenInAllowlist() public {
        Limits memory l = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](2);
        tokens[0] = address(allowedToken);
        tokens[1] = address(allowedToken); // duplicate

        vm.expectRevert(InvalidLimits.selector);
        factory.createVault(trader, l, tokens);
    }
}
