// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Limits, TradeParams, VaultStateView} from "../../src/types/DataTypes.sol";
import {FactoryConfig, VaultInitParams} from "../../src/types/ConfigTypes.sol";
import {MandateVaultFactory} from "../../src/MandateVaultFactory.sol";
import {MandateVault, RuleBlocked, SwapMismatch, NotTrader} from "../../src/MandateVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockProcessor} from "../mocks/MockProcessor.sol";
import {MockBeacon} from "../mocks/MockBeacon.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";
import {
    MaliciousTokenReturnsFalse,
    MaliciousTokenFeeOnTransfer,
    MaliciousCircuitLongData,
    MaliciousCircuitReturnsTwo,
    GriefingTrader
} from "./AdversarialContracts.sol";

contract AdversarialTest is Test {
    MandateVaultFactory internal factory;
    MandateVault internal masterImpl;
    MandateVault internal vault;

    MockERC20 internal usdc;
    MockERC20 internal wokb;

    MockProcessor internal processor;
    MockBeacon internal beacon;
    address internal beaconImpl;
    MockSwapRouter internal router;

    address internal owner = address(0xAA);
    address internal trader = address(0xBB);

    Limits internal defaultLimits;

    function setUp() public {
        masterImpl = new MandateVault();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        wokb = new MockERC20("Wrapped OKB", "WOKB", 18);

        processor = new MockProcessor();
        processor.setEvaluateReference(true);
        bytes memory fakeNetlist = hex"000000030000040000000b00000b";
        processor.setNetlist(1, fakeNetlist);

        beaconImpl = address(new MockERC20("BeaconImpl", "BIMP", 18));
        beacon = new MockBeacon(beaconImpl, address(0));

        router = new MockSwapRouter();

        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(router),
            processor: address(processor),
            circuitId: 1,
            netlistHash: keccak256(fakeNetlist),
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        factory = new MandateVaultFactory(cfg);

        defaultLimits = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 30 days),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](1);
        tokens[0] = address(wokb);

        vm.prank(owner);
        vault = MandateVault(payable(factory.createVault(trader, defaultLimits, tokens)));

        usdc.mint(address(vault), 300e6);
        wokb.mint(address(vault), 50e18);
    }

    function test_adversarial_tokenReturnsFalse_failsClosed() public {
        MaliciousTokenReturnsFalse badToken = new MaliciousTokenReturnsFalse("Bad", "BAD", 18);
        badToken.mint(address(vault), 100e18);

        TradeParams memory p = TradeParams({
            tokenIn: address(badToken),
            tokenOut: address(usdc),
            feeTier: 500,
            amountIn: 10e18,
            amountOutMin: 5e6,
            deadline: uint64(block.timestamp + 300)
        });

        vm.prank(trader);
        vm.expectRevert(); // SafeERC20: ERC20 operation did not succeed
        vault.trade(p);
    }

    function test_adversarial_tokenFeeOnTransfer_revertsSwapMismatch() public {
        MaliciousTokenFeeOnTransfer feeToken = new MaliciousTokenFeeOnTransfer("FeeTok", "FEE", 18);
        feeToken.mint(address(vault), 100e18);

        TradeParams memory p = TradeParams({
            tokenIn: address(feeToken),
            tokenOut: address(usdc),
            feeTier: 500,
            amountIn: 10e18,
            amountOutMin: 5e6,
            deadline: uint64(block.timestamp + 300)
        });

        vm.prank(trader);
        vm.expectRevert(SwapMismatch.selector);
        vault.trade(p);
    }

    function test_adversarial_circuitReturnsLongGarbageData_failsClosed() public {
        MaliciousCircuitLongData badCircuit = new MaliciousCircuitLongData();

        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(router),
            processor: address(badCircuit),
            circuitId: 1,
            netlistHash: keccak256(hex"000000030000040000000b00000b"),
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        MandateVaultFactory badFactory = new MandateVaultFactory(cfg);

        address[] memory tokens = new address[](1);
        tokens[0] = address(wokb);

        vm.prank(owner);
        MandateVault badVault = MandateVault(payable(badFactory.createVault(trader, defaultLimits, tokens)));
        usdc.mint(address(badVault), 100e6);

        TradeParams memory p = TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: 10e6,
            amountOutMin: 1e18,
            deadline: uint64(block.timestamp + 300)
        });

        (, bool allowed) = badVault.previewTrade(p);
        assertFalse(allowed);

        vm.prank(trader);
        vm.expectRevert();
        badVault.trade(p);
    }

    function test_adversarial_circuitReturnsTwo_failsClosed() public {
        MaliciousCircuitReturnsTwo twoCircuit = new MaliciousCircuitReturnsTwo();

        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(router),
            processor: address(twoCircuit),
            circuitId: 1,
            netlistHash: keccak256(hex"000000030000040000000b00000b"),
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        MandateVaultFactory badFactory = new MandateVaultFactory(cfg);

        address[] memory tokens = new address[](1);
        tokens[0] = address(wokb);

        vm.prank(owner);
        MandateVault badVault = MandateVault(payable(badFactory.createVault(trader, defaultLimits, tokens)));
        usdc.mint(address(badVault), 100e6);

        TradeParams memory p = TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: 10e6,
            amountOutMin: 1e18,
            deadline: uint64(block.timestamp + 300)
        });

        (, bool allowed) = badVault.previewTrade(p);
        assertFalse(allowed);

        vm.prank(trader);
        vm.expectRevert();
        badVault.trade(p);
    }

    function test_adversarial_griefingTrader_freezeAndCancelLoosen() public {
        GriefingTrader griefBot = new GriefingTrader(vault);

        // Appoint griefBot as trader
        vm.prank(owner);
        vault.setTrader(address(griefBot));

        // Owner queues a loosening
        Limits memory next = defaultLimits;
        next.maxTradeBase = 80e6;
        vm.prank(owner);
        vault.queueLoosen(next, new address[](0), true);
        assertTrue(vault.state().pending.exists);

        // Grief bot immediately cancels the loosening
        griefBot.spamCancelLoosen();
        assertFalse(vault.state().pending.exists);

        // Grief bot spams freeze
        assertFalse(vault.frozen());
        griefBot.spamFreeze();
        assertTrue(vault.frozen());

        // Grief bot CANNOT loosen limits or withdraw funds
        vm.prank(address(griefBot));
        vm.expectRevert();
        vault.queueLoosen(next, new address[](0), true);

        vm.prank(address(griefBot));
        vm.expectRevert();
        vault.requestWithdraw(address(usdc), 10e6);

        // Owner can replace trader key at any time
        vm.prank(owner);
        vault.setTrader(trader);
        assertEq(vault.trader(), trader);
    }
}
