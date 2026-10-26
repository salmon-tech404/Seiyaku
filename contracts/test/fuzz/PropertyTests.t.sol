// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Limits, TradeParams, VaultStateView} from "../../src/types/DataTypes.sol";
import {FactoryConfig, VaultInitParams} from "../../src/types/ConfigTypes.sol";
import {MandateVaultFactory} from "../../src/MandateVaultFactory.sol";
import {
    MandateVault,
    NotOwner,
    NotTrader,
    NotOwnerOrTrader,
    TooEarly,
    RuleBlocked,
    DepositCapExceeded,
    SwapMismatch
} from "../../src/MandateVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockProcessor} from "../mocks/MockProcessor.sol";
import {MockBeacon} from "../mocks/MockBeacon.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";

contract PropertyTests is Test {
    MandateVaultFactory internal factory;
    MandateVault internal masterImpl;
    MandateVault internal vault;

    MockERC20 internal usdc;
    MockERC20 internal wokb;
    MockERC20 internal unlisted;

    MockProcessor internal processor;
    MockBeacon internal beacon;
    address internal beaconImpl;
    MockSwapRouter internal router;

    address internal owner = address(0xAA);
    address internal trader = address(0xBB);
    address internal stranger = address(0xCC);

    Limits internal baseLimits;
    uint32 internal constant LOOSEN_DELAY = 120;
    uint32 internal constant MIN_WITHDRAW_DELAY = 3600;

    function setUp() public {
        masterImpl = new MandateVault();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        wokb = new MockERC20("Wrapped OKB", "WOKB", 18);
        unlisted = new MockERC20("Unlisted", "UNL", 18);

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
            loosenDelaySec: LOOSEN_DELAY,
            minWithdrawDelaySec: MIN_WITHDRAW_DELAY,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });

        factory = new MandateVaultFactory(cfg);

        baseLimits = Limits({
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
        vault = MandateVault(payable(factory.createVault(trader, baseLimits, tokens)));

        // Fund vault with USDC and WOKB
        usdc.mint(address(vault), 400e6);
        wokb.mint(address(vault), 100e18);
    }

    // Property 1: Loosening is never instant
    function testFuzz_p1_looseningIsNeverInstant(uint32 advanceSec, uint128 looseMaxTrade) public {
        looseMaxTrade = uint128(bound(looseMaxTrade, 60e6, 150e6));
        advanceSec = uint32(bound(advanceSec, 0, LOOSEN_DELAY - 1));

        Limits memory next = baseLimits;
        next.maxTradeBase = looseMaxTrade;

        vm.prank(owner);
        vault.queueLoosen(next, new address[](0), true);

        // Before loosenDelay has passed, executeLoosen must revert TooEarly
        vm.warp(block.timestamp + advanceSec);

        vm.prank(owner);
        vm.expectRevert();
        vault.executeLoosen();

        // Ensure limits are not updated
        assertEq(vault.state().limits.maxTradeBase, baseLimits.maxTradeBase);
    }

    // Property 2: Tightening is always instant and owner or trader only
    function testFuzz_p2_tighteningInstantAndAuthorizedOnly(uint128 tightMaxTrade, bool callerIsTrader) public {
        tightMaxTrade = uint128(bound(tightMaxTrade, 1e6, baseLimits.maxTradeBase));

        Limits memory next = baseLimits;
        next.maxTradeBase = tightMaxTrade;

        // Stranger cannot tighten
        vm.prank(stranger);
        vm.expectRevert(NotOwnerOrTrader.selector);
        vault.tighten(next, new address[](0));

        // Authorized caller tightens instantly in the same block
        address authorized = callerIsTrader ? trader : owner;
        vm.prank(authorized);
        vault.tighten(next, new address[](0));

        assertEq(vault.state().limits.maxTradeBase, tightMaxTrade);
    }

    // Property 3: Trader power is bounded
    function testFuzz_p3_traderPowerIsBounded(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1, 100e6);
        withdrawAmt = bound(withdrawAmt, 1, 10e6);

        vm.startPrank(trader);

        // Trader cannot deposit
        vm.expectRevert(NotOwner.selector);
        vault.deposit(depositAmt);

        // Trader cannot request withdraw
        vm.expectRevert(NotOwner.selector);
        vault.requestWithdraw(address(usdc), withdrawAmt);

        // Trader cannot execute withdraw
        vm.expectRevert(NotOwner.selector);
        vault.executeWithdraw();

        // Trader cannot queue loosening
        vm.expectRevert(NotOwner.selector);
        vault.queueLoosen(baseLimits, new address[](0), false);

        // Trader cannot execute loosening
        vm.expectRevert(NotOwner.selector);
        vault.executeLoosen();

        // Trader cannot set trader
        vm.expectRevert(NotOwner.selector);
        vault.setTrader(stranger);

        vm.stopPrank();
    }

    // Property 4: Exits are never blocked by anything except sane
    function testFuzz_p4_exitsNeverBlockedExceptSane(bool freezeVault, uint32 timeWarpSec, uint256 exitAmount) public {
        exitAmount = bound(exitAmount, 1, 50e18);
        timeWarpSec = uint32(bound(timeWarpSec, 0, 60 days));

        if (freezeVault) {
            vm.prank(owner);
            vault.freeze();
        }

        vm.warp(block.timestamp + timeWarpSec);

        TradeParams memory p = TradeParams({
            tokenIn: address(wokb),
            tokenOut: address(usdc),
            feeTier: 500,
            amountIn: exitAmount,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });

        // previewTrade must say allowed = true
        (, bool allowed) = vault.previewTrade(p);
        assertTrue(allowed);

        // trade must succeed
        vm.prank(trader);
        uint256 out = vault.trade(p);
        assertGt(out, 0);
    }

    // Property 5: Funds conservation
    function testFuzz_p5_fundsConservation(uint256 buyAmount) public {
        buyAmount = bound(buyAmount, 1e6, baseLimits.maxTradeBase);

        uint256 usdcBefore = usdc.balanceOf(address(vault));
        uint256 wokbBefore = wokb.balanceOf(address(vault));

        TradeParams memory p = TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: buyAmount,
            amountOutMin: 1e18,
            deadline: uint64(block.timestamp + 300)
        });

        vm.prank(trader);
        vault.trade(p);

        uint256 usdcAfter = usdc.balanceOf(address(vault));
        uint256 wokbAfter = wokb.balanceOf(address(vault));

        assertEq(usdcBefore - usdcAfter, buyAmount);
        assertGe(wokbAfter - wokbBefore, 1e18);
    }

    // Property 6: Counters never exceed limits in one day
    function testFuzz_p6_countersWithinOneUtcDay(uint8 numTrades, uint128 tradeAmount) public {
        numTrades = uint8(bound(numTrades, 1, 10));
        tradeAmount = uint128(bound(tradeAmount, 1e6, 30e6));

        for (uint8 i = 0; i < numTrades; i++) {
            TradeParams memory p = TradeParams({
                tokenIn: address(usdc),
                tokenOut: address(wokb),
                feeTier: 500,
                amountIn: tradeAmount,
                amountOutMin: 1e18,
                deadline: uint64(block.timestamp + 300)
            });

            (uint16 bits, bool allowed) = vault.previewTrade(p);
            if (allowed) {
                vm.prank(trader);
                vault.trade(p);

                assertTrue(vault.tradesToday() <= baseLimits.maxTradesPerDay);
                assertTrue(vault.buyVolumeTodayBase() <= baseLimits.maxDailyBase);

                vm.warp(block.timestamp + baseLimits.cooldownSec);
            } else {
                // Must be blocked because trade count or daily volume reached
                assertTrue((bits & (1 << 5)) == 0 || (bits & (1 << 6)) == 0);
                break;
            }
        }
    }

    // Property 7: Withdraw delay cannot be bypassed
    function testFuzz_p7_withdrawDelayNeverBeforeEta(uint32 earlyAdvance) public {
        earlyAdvance = uint32(bound(earlyAdvance, 0, MIN_WITHDRAW_DELAY - 1));

        vm.prank(owner);
        vault.requestWithdraw(address(usdc), 50e6);

        vm.warp(block.timestamp + earlyAdvance);

        vm.prank(owner);
        vm.expectRevert();
        vault.executeWithdraw();

        // Exact eta allows execution
        vm.warp(block.timestamp + (MIN_WITHDRAW_DELAY - earlyAdvance));
        vm.prank(owner);
        vault.executeWithdraw();
        assertEq(usdc.balanceOf(owner), 50e6);
    }

    // Property 8: Approvals are strictly 0 after trade
    function testFuzz_p8_approvalsZeroAfterTrade(uint128 amount) public {
        amount = uint128(bound(amount, 1e6, baseLimits.maxTradeBase));

        TradeParams memory p = TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: amount,
            amountOutMin: 1e18,
            deadline: uint64(block.timestamp + 300)
        });

        vm.prank(trader);
        vault.trade(p);

        assertEq(usdc.allowance(address(vault), address(router)), 0);
        assertEq(wokb.allowance(address(vault), address(router)), 0);
    }

    // Property 9: Fail closed on circuit anomaly
    function testFuzz_p9_failClosedOnCircuitAnomaly(uint8 anomalyByte) public {
        // If lowest bit is 0, trade must be blocked
        vm.assume((anomalyByte & 1) == 0);

        processor.setEvaluateReference(false);
        processor.setEvalResponse(1, abi.encode(bytes1(anomalyByte)));

        TradeParams memory p = TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: 10e6,
            amountOutMin: 1e18,
            deadline: uint64(block.timestamp + 300)
        });

        (, bool allowed) = vault.previewTrade(p);
        assertFalse(allowed);

        vm.prank(trader);
        vm.expectRevert();
        vault.trade(p);
    }

    // Property 1b (review addition): token additions and unfreezing are never instant either
    function testFuzz_p1b_tokenAdditionAndUnfreezeNeverInstant(uint32 advanceSec) public {
        advanceSec = uint32(bound(advanceSec, 0, LOOSEN_DELAY - 1));

        vm.prank(owner);
        vault.freeze();
        assertTrue(vault.frozen());
        assertFalse(vault.allowedTokens(address(unlisted)));

        address[] memory add = new address[](1);
        add[0] = address(unlisted);
        vm.prank(owner);
        vault.queueLoosen(baseLimits, add, true);

        vm.warp(block.timestamp + advanceSec);
        vm.prank(owner);
        vm.expectRevert();
        vault.executeLoosen();

        assertTrue(vault.frozen(), "must stay frozen before the delay");
        assertFalse(vault.allowedTokens(address(unlisted)), "token must not be allowed before the delay");

        // after the delay both take effect
        vm.warp(block.timestamp + LOOSEN_DELAY);
        vm.prank(owner);
        vault.executeLoosen();
        assertFalse(vault.frozen());
        assertTrue(vault.allowedTokens(address(unlisted)));
    }
}
