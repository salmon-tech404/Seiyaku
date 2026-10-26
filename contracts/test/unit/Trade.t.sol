// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Limits, TradeParams, VaultStateView} from "../../src/types/DataTypes.sol";
import {FactoryConfig, VaultInitParams} from "../../src/types/ConfigTypes.sol";
import {MandateVaultFactory} from "../../src/MandateVaultFactory.sol";
import {MandateVault, NotTrader, RuleBlocked, CircuitChanged, SwapMismatch} from "../../src/MandateVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockProcessor} from "../mocks/MockProcessor.sol";
import {MockBeacon} from "../mocks/MockBeacon.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";
import {MockMaliciousToken} from "../mocks/MockMaliciousToken.sol";

contract TradeTest is Test {
    MandateVaultFactory internal factory;
    MandateVault internal masterImpl;
    MandateVault internal vault;

    MockERC20 internal usdc; // Base token (6 decimals)
    MockERC20 internal wokb; // Allowed token (18 decimals)
    MockERC20 internal unallowed; // Unallowed token

    MockProcessor internal processor;
    MockBeacon internal beacon;
    address internal beaconImpl;
    MockSwapRouter internal router;

    address internal owner = address(0xAA);
    address internal trader = address(0xBB);
    address internal stranger = address(0xCC);

    Limits internal defaultLimits;

    event Traded(
        address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, bool indexed isExit
    );

    function setUp() public {
        masterImpl = new MandateVault();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        wokb = new MockERC20("Wrapped OKB", "WOKB", 18);
        unallowed = new MockERC20("Shitcoin", "SHIT", 18);

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

        // Fund vault with USDC and WOKB
        usdc.mint(address(vault), 400e6);
        wokb.mint(address(vault), 50e18);
    }

    function _validBuyParams() internal view returns (TradeParams memory) {
        return TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: 20e6,
            amountOutMin: 1e18,
            deadline: uint64(block.timestamp + 300)
        });
    }

    function _validExitParams() internal view returns (TradeParams memory) {
        return TradeParams({
            tokenIn: address(wokb),
            tokenOut: address(usdc),
            feeTier: 500,
            amountIn: 5e18,
            amountOutMin: 10e6,
            deadline: uint64(block.timestamp + 300)
        });
    }

    function test_trade_accessControl_onlyTraderCanTrade() public {
        TradeParams memory p = _validBuyParams();

        vm.prank(stranger);
        vm.expectRevert(NotTrader.selector);
        vault.trade(p);

        vm.prank(owner);
        vm.expectRevert(NotTrader.selector);
        vault.trade(p);
    }

    function test_trade_buySuccess_updatesCountersAndEmitsEvent() public {
        TradeParams memory p = _validBuyParams();

        vm.prank(trader);
        vm.expectEmit(true, true, true, true);
        emit Traded(address(usdc), address(wokb), 20e6, 1e18, false);
        uint256 out = vault.trade(p);

        assertEq(out, 1e18);
        assertEq(vault.tradesToday(), 1);
        assertEq(vault.buyVolumeTodayBase(), 20e6);
        assertEq(vault.lastBuyAt(), block.timestamp);
        assertEq(usdc.balanceOf(address(vault)), 380e6);
        assertEq(wokb.balanceOf(address(vault)), 51e18);
    }

    function test_trade_exitSuccess_doesNotTouchCounters() public {
        TradeParams memory p = _validExitParams();

        vm.prank(trader);
        vm.expectEmit(true, true, true, true);
        emit Traded(address(wokb), address(usdc), 5e18, 10e6, true);
        uint256 out = vault.trade(p);

        assertEq(out, 10e6);
        assertEq(vault.tradesToday(), 0);
        assertEq(vault.buyVolumeTodayBase(), 0);
        assertEq(vault.lastBuyAt(), 0);
        assertEq(wokb.balanceOf(address(vault)), 45e18);
        assertEq(usdc.balanceOf(address(vault)), 410e6);
    }

    // --- Bit-by-bit failure tests for buys ---

    function test_trade_buyBlocked_bit0_sane_zeroAmountIn() public {
        TradeParams memory p = _validBuyParams();
        p.amountIn = 0;

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FE))); // all 1 except bit 0
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit0_sane_zeroAmountOutMin() public {
        TradeParams memory p = _validBuyParams();
        p.amountOutMin = 0;

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FE)));
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit0_sane_pastDeadline() public {
        TradeParams memory p = _validBuyParams();
        p.deadline = uint64(block.timestamp - 1);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FE)));
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit0_sane_farFutureDeadline() public {
        TradeParams memory p = _validBuyParams();
        p.deadline = uint64(block.timestamp + 601);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FE)));
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit0_sane_invalidFeeTier() public {
        TradeParams memory p = _validBuyParams();
        p.feeTier = 100;

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FE)));
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit0_sane_exceedsVaultBalance() public {
        TradeParams memory p = _validBuyParams();
        p.amountIn = 401e6; // balance is 400e6

        vm.prank(trader);
        // Note: sizeOk (50e6) and dailyOk (200e6) will also fail since 401e6 > 50e6
        vm.expectRevert();
        vault.trade(p);
    }

    function test_trade_buyAllowed_feeTiers_3000_and_10000() public {
        TradeParams memory p3000 = _validBuyParams();
        p3000.feeTier = 3000;
        vm.prank(trader);
        vault.trade(p3000);

        vm.warp(block.timestamp + 61);

        TradeParams memory p10000 = _validBuyParams();
        p10000.feeTier = 10000;
        vm.prank(trader);
        vault.trade(p10000);
    }

    function test_trade_neitherBase_orBothBase_blocksSane() public view {
        // Neither base
        TradeParams memory pNeither = _validBuyParams();
        pNeither.tokenIn = address(wokb);
        pNeither.tokenOut = address(unallowed);
        (uint16 bitsNeither, bool allowedNeither) = vault.previewTrade(pNeither);
        assertEq(bitsNeither & 1, 0);
        assertFalse(allowedNeither);

        // Both base
        TradeParams memory pBoth = _validBuyParams();
        pBoth.tokenIn = address(usdc);
        pBoth.tokenOut = address(usdc);
        (uint16 bitsBoth, bool allowedBoth) = vault.previewTrade(pBoth);
        assertEq(bitsBoth & 1, 0);
        assertFalse(allowedBoth);
    }

    function test_trade_buyBlocked_bit1_tokenAllowed() public {
        TradeParams memory p = _validBuyParams();
        p.tokenOut = address(unallowed);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FD))); // all 1 except bit 1
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit2_notExpired() public {
        vm.warp(block.timestamp + 30 days + 1);
        TradeParams memory p = _validBuyParams();

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FB))); // all 1 except bit 2
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit3_notFrozen() public {
        vm.prank(owner);
        vault.freeze();

        TradeParams memory p = _validBuyParams();

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00F7))); // all 1 except bit 3
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit4_sizeOk() public {
        TradeParams memory p = _validBuyParams();
        p.amountIn = 51e6; // limit is 50e6

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00EF))); // all 1 except bit 4
        vault.trade(p);
    }

    function test_trade_buyBlocked_bit5_dailyOk_boundaryAndOver() public {
        // Trade 1: 50e6
        TradeParams memory p1 = _validBuyParams();
        p1.amountIn = 50e6;
        vm.prank(trader);
        vault.trade(p1);

        // Advance past cooldown
        vm.warp(block.timestamp + 61);

        // Trade 2: 50e6
        TradeParams memory p2 = _validBuyParams();
        p2.amountIn = 50e6;
        vm.prank(trader);
        vault.trade(p2);

        vm.warp(block.timestamp + 61);

        // Trade 3: 50e6
        TradeParams memory p3 = _validBuyParams();
        p3.amountIn = 50e6;
        vm.prank(trader);
        vault.trade(p3);

        vm.warp(block.timestamp + 61);

        // Trade 4: exact daily limit: 150e6 + 50e6 = 200e6
        TradeParams memory p4 = _validBuyParams();
        p4.amountIn = 50e6;
        vm.prank(trader);
        vault.trade(p4);
        assertEq(vault.buyVolumeTodayBase(), 200e6);

        vm.warp(block.timestamp + 61);

        // Trade 5: 1 over daily limit: 200e6 + 1e6 > 200e6 -> blocked by bit 5
        TradeParams memory p5 = _validBuyParams();
        p5.amountIn = 1e6;
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00DF))); // all 1 except bit 5
        vault.trade(p5);
    }

    function test_trade_buyBlocked_bit6_tradesOk_tradesPerDay() public {
        for (uint256 i = 0; i < 5; i++) {
            TradeParams memory p = _validBuyParams();
            p.amountIn = 10e6;
            vm.prank(trader);
            vault.trade(p);
            vm.warp(block.timestamp + 61);
        }
        assertEq(vault.tradesToday(), 5);

        // 6th trade exceeds maxTradesPerDay (5)
        TradeParams memory p6 = _validBuyParams();
        p6.amountIn = 10e6;
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00BF))); // all 1 except bit 6
        vault.trade(p6);
    }

    function test_trade_cooldown_atExactBoundaryAndUnder() public {
        TradeParams memory p = _validBuyParams();
        vm.prank(trader);
        vault.trade(p);

        // Under cooldown (59 seconds, cooldown is 60) -> blocked by bit 7
        vm.warp(block.timestamp + 59);
        TradeParams memory pUnder = _validBuyParams();
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x007F))); // all 1 except bit 7
        vault.trade(pUnder);

        // At exact boundary (60 seconds) -> allowed!
        vm.warp(block.timestamp + 1);
        TradeParams memory pExact = _validBuyParams();
        vm.prank(trader);
        vault.trade(pExact);
        assertEq(vault.tradesToday(), 2);
    }

    function test_trade_midnightRoll_resetsCounters() public {
        TradeParams memory p = _validBuyParams();
        p.amountIn = 40e6;
        vm.prank(trader);
        vault.trade(p);

        assertEq(vault.tradesToday(), 1);
        assertEq(vault.buyVolumeTodayBase(), 40e6);

        // Warp past midnight UTC
        uint256 nextMidnight = ((block.timestamp / 86400) + 1) * 86400;
        vm.warp(nextMidnight + 10);

        TradeParams memory pNext = _validBuyParams();
        pNext.amountIn = 30e6;
        vm.prank(trader);
        vault.trade(pNext);

        assertEq(vault.tradesToday(), 1);
        assertEq(vault.buyVolumeTodayBase(), 30e6);
    }

    // --- Exits ignore rules 1 through 7 ---

    function test_trade_exit_passesWhileFrozenAndExpired() public {
        vm.prank(owner);
        vault.freeze();

        vm.warp(block.timestamp + 30 days + 1); // expired

        TradeParams memory p = _validExitParams();

        (uint16 bits, bool allowed) = vault.previewTrade(p);
        assertTrue(allowed);
        // Bit 8 (isExit) is 1, bit 0 (sane) is 1, bits 4..7 are 1, but bit 2 (expired) and bit 3 (frozen) are 0
        assertEq(bits & (1 << 8), 1 << 8);
        assertEq(bits & (1 << 0), 1 << 0);
        assertEq(bits & (1 << 2), 0);
        assertEq(bits & (1 << 3), 0);

        vm.prank(trader);
        uint256 out = vault.trade(p);
        assertEq(out, 10e6);
    }

    // --- Circuit anomaly and security tests ---

    function test_trade_circuitReturningZero_revertsRuleBlocked() public {
        processor.setEvaluateReference(false);
        processor.setEvalResponse(1, abi.encode(hex"00"));

        TradeParams memory p = _validBuyParams();
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FF)));
        vault.trade(p);
    }

    function test_trade_circuitReverting_failsClosed() public {
        processor.setShouldRevert(true);

        TradeParams memory p = _validBuyParams();

        // previewTrade returns false without reverting
        (uint16 bits, bool allowed) = vault.previewTrade(p);
        assertFalse(allowed);
        assertEq(bits, 0x00FF);

        // trade reverts RuleBlocked
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FF)));
        vault.trade(p);
    }

    function test_trade_circuitReturningEmptyBytes_failsClosed() public {
        processor.setEvaluateReference(false);
        processor.setEvalResponse(1, hex"");

        TradeParams memory p = _validBuyParams();

        (uint16 bits, bool allowed) = vault.previewTrade(p);
        assertFalse(allowed);
        assertEq(bits, 0x00FF);

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(0x00FF)));
        vault.trade(p);
    }

    function test_trade_circuitChanged_revertsCircuitChanged() public {
        // Change beacon implementation
        address newImpl = address(new MockERC20("NewImpl", "NIMP", 18));
        beacon.setImplementation(newImpl);

        TradeParams memory p = _validBuyParams();

        // previewTrade returns (bits, false)
        (, bool allowed) = vault.previewTrade(p);
        assertFalse(allowed);

        // trade reverts CircuitChanged
        vm.prank(trader);
        vm.expectRevert(CircuitChanged.selector);
        vault.trade(p);
    }

    function test_trade_routerReturnsLessThanMin_revertsSwapMismatch() public {
        router.setBehavior(MockSwapRouter.Behavior.ReturnLessThanMin);

        TradeParams memory p = _validBuyParams();
        vm.prank(trader);
        vm.expectRevert(SwapMismatch.selector);
        vault.trade(p);
    }

    function test_trade_routerSpendsLess_revertsSwapMismatch() public {
        router.setBehavior(MockSwapRouter.Behavior.SpendLess);

        TradeParams memory p = _validBuyParams();
        vm.prank(trader);
        vm.expectRevert(SwapMismatch.selector);
        vault.trade(p);
    }

    function test_trade_routerSpendsMore_revertsSwapMismatch() public {
        router.setBehavior(MockSwapRouter.Behavior.SpendMore);

        TradeParams memory p = _validBuyParams();
        vm.prank(trader);
        vm.expectRevert(); // reverts on insufficient allowance
        vault.trade(p);
    }

    function test_trade_feeOnTransfer_revertsSwapMismatch() public {
        router.setBehavior(MockSwapRouter.Behavior.FeeOnTransfer);

        TradeParams memory p = _validBuyParams();
        vm.prank(trader);
        vm.expectRevert(SwapMismatch.selector);
        vault.trade(p);
    }

    function test_trade_reentrancyAttemptFromRouter_reverts() public {
        TradeParams memory p = _validBuyParams();
        router.setReentrancy(address(vault), p);

        vm.prank(trader);
        vm.expectRevert(); // ReentrancyGuard: reentrant call
        vault.trade(p);
    }

    function test_trade_reentrancyAttemptFromMaliciousToken_reverts() public {
        MockMaliciousToken mal = new MockMaliciousToken("Malicious", "MAL", 18);
        mal.mint(address(vault), 100e18);

        address[] memory addTokens = new address[](1);
        addTokens[0] = address(mal);
        vm.prank(owner);
        vault.tighten(defaultLimits, new address[](0)); // just testing allowed

        TradeParams memory p = TradeParams({
            tokenIn: address(mal),
            tokenOut: address(usdc),
            feeTier: 500,
            amountIn: 10e18,
            amountOutMin: 5e6,
            deadline: uint64(block.timestamp + 300)
        });

        mal.setReentrancy(address(vault), p);

        vm.prank(trader);
        vm.expectRevert(); // ReentrancyGuard: reentrant call
        vault.trade(p);
    }
}
