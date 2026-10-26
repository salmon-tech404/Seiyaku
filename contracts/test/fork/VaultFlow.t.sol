// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GeneratedConstants} from "./Generated.sol";
import {MandateVault, RuleBlocked, TooEarly, NotOwner, NotTrader, NotOwnerOrTrader} from "../../src/MandateVault.sol";
import {MandateVaultFactory} from "../../src/MandateVaultFactory.sol";
import {Limits, TradeParams, VaultStateView} from "../../src/types/DataTypes.sol";

contract VaultFlowForkTest is Test {
    address internal constant USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    address internal constant WOKB = 0xe538905cf8410324e03A5A23C1c177a474D59b2b;
    address internal constant SWAP_ROUTER02 = 0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA;

    MandateVaultFactory internal factory;
    MandateVault internal vault;

    address internal owner = address(0xAA11);
    address internal trader = address(0xBB22);
    address internal stranger = address(0xCC33);

    address internal owner2 = address(0xDD44);
    address internal trader2 = address(0xEE55);

    Limits internal initialLimits;

    function setUp() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) {
            return;
        }

        factory = MandateVaultFactory(GeneratedConstants.FACTORY);

        initialLimits = Limits({
            maxTradeBase: 50 * 1e6, // 50 USDC
            maxDailyBase: 100 * 1e6, // 100 USDC
            maxTradesPerDay: 5,
            cooldownSec: 300, // 5 minutes
            expiresAt: uint64(block.timestamp + 30 days),
            withdrawDelaySec: 86400
        });

        address[] memory allowedTokens = new address[](1);
        allowedTokens[0] = WOKB;

        vm.prank(owner);
        address vaultAddr = factory.createVault(trader, initialLimits, allowedTokens);
        vault = MandateVault(vaultAddr);

        // Fund owner with USDC and deposit 100 USDC into vault
        deal(USDC, owner, 1_000 * 1e6);
        vm.startPrank(owner);
        IERC20(USDC).approve(address(vault), 100 * 1e6);
        vault.deposit(100 * 1e6);
        vm.stopPrank();
    }

    function test_vaultFlow_firstBuy_success_andGasMeasured() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) return;

        TradeParams memory params = TradeParams({
            tokenIn: USDC,
            tokenOut: WOKB,
            feeTier: 500,
            amountIn: 10 * 1e6, // 10 USDC
            amountOutMin: 1, // 1 wei WOKB
            deadline: uint64(block.timestamp + 300)
        });

        // 1. Preview agrees
        (uint16 bits, bool previewAllowed) = vault.previewTrade(params);
        assertTrue(previewAllowed, "Preview should allow valid first trade");
        assertEq(bits, 255, "Bits 0-7 should be 1, bit 8 (isExit) 0 for buy");

        // 2. Execute trade as trader and measure gas
        uint256 gasBefore = gasleft();
        vm.prank(trader);
        vault.trade(params);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for buy trade (USDC -> WOKB)", gasUsed);
        assertLt(gasUsed, 400_000, "Buy gas target is under 400,000");

        // 3. Verify state and counters
        VaultStateView memory st = vault.state();
        assertEq(st.tradesToday, 1, "Trades today should be 1");
        assertEq(st.buyVolumeTodayBase, 10 * 1e6, "Volume today should be 10 USDC");
        assertEq(st.lastBuyAt, block.timestamp, "lastBuyAt should equal current timestamp");

        // 4. Verify token balances and zero router allowance
        assertEq(IERC20(USDC).balanceOf(address(vault)), 90 * 1e6, "Vault USDC balance should be 90 USDC");
        assertTrue(IERC20(WOKB).balanceOf(address(vault)) > 0, "Vault should hold WOKB");
        assertEq(IERC20(USDC).allowance(address(vault), SWAP_ROUTER02), 0, "USDC allowance must be 0");
        assertEq(IERC20(WOKB).allowance(address(vault), SWAP_ROUTER02), 0, "WOKB allowance must be 0");
    }

    function test_vaultFlow_secondBuyBlockedByCooldown() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) return;

        TradeParams memory params = TradeParams({
            tokenIn: USDC,
            tokenOut: WOKB,
            feeTier: 500,
            amountIn: 10 * 1e6,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });

        // First buy succeeds
        vm.prank(trader);
        vault.trade(params);

        // Immediate second buy: cooldownOk bit 7 is 0. Expected inputBits: 255 & ~(1 << 7) = 127
        (uint16 bits, bool previewAllowed) = vault.previewTrade(params);
        assertFalse(previewAllowed, "Second trade before cooldown should be blocked in preview");
        assertEq(bits, 127, "Expected reason bitmask with bit 7 = 0 (127)");

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(127)));
        vault.trade(params);

        // Warp past cooldown (300 seconds)
        vm.warp(block.timestamp + 301);
        params.deadline = uint64(block.timestamp + 300);
        (bits, previewAllowed) = vault.previewTrade(params);
        assertTrue(previewAllowed, "Trade after cooldown should be allowed");
        assertEq(bits, 255);

        vm.prank(trader);
        vault.trade(params);
        assertEq(vault.state().tradesToday, 2, "Second buy after cooldown should increment tradesToday to 2");
    }

    function test_vaultFlow_freeze_blocksBuy_allowsExit() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) return;

        // Buy 10 USDC of WOKB first
        TradeParams memory buyParams = TradeParams({
            tokenIn: USDC,
            tokenOut: WOKB,
            feeTier: 500,
            amountIn: 10 * 1e6,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });
        vm.prank(trader);
        vault.trade(buyParams);

        uint256 wokbBal = IERC20(WOKB).balanceOf(address(vault));
        assertTrue(wokbBal > 0, "Vault should hold WOKB");

        // Freeze vault
        vm.prank(trader);
        vault.freeze();
        assertTrue(vault.state().frozen, "Vault should be frozen");

        // Warp past cooldown so only freeze blocks the buy
        vm.warp(block.timestamp + 400);
        buyParams.deadline = uint64(block.timestamp + 300);

        // Buy is blocked because notFrozen bit 3 is 0: 255 & ~(1 << 3) = 247
        (uint16 buyBits, bool buyAllowed) = vault.previewTrade(buyParams);
        assertFalse(buyAllowed, "Buy should be blocked while frozen");
        assertEq(buyBits, 247, "Expected bit 3 to be 0 (247)");

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(247)));
        vault.trade(buyParams);

        // Exit trade: selling all WOKB back to USDC
        TradeParams memory exitParams = TradeParams({
            tokenIn: WOKB,
            tokenOut: USDC,
            feeTier: 500,
            amountIn: wokbBal,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });

        (uint16 exitBits, bool exitAllowed) = vault.previewTrade(exitParams);
        assertTrue(exitAllowed, "Exit trade should be allowed even when frozen");
        assertTrue((exitBits & (1 << 8)) != 0, "isExit bit must be 1");

        uint256 gasBeforeExit = gasleft();
        vm.prank(trader);
        vault.trade(exitParams);
        uint256 exitGas = gasBeforeExit - gasleft();

        emit log_named_uint("Gas used for exit trade (WOKB -> USDC)", exitGas);
        assertLt(exitGas, 400_000, "Exit gas target is under 400,000");

        // Verify exit results: WOKB cleared, USDC returned
        assertEq(IERC20(WOKB).balanceOf(address(vault)), 0, "All WOKB should be sold");
        assertTrue(
            IERC20(USDC).balanceOf(address(vault)) > 99 * 1e6, "USDC balance should be nearly restored minus pool fee"
        );
        // Exits do not increment buy counters
        assertEq(vault.state().tradesToday, 1, "Exits must not increment tradesToday");
    }

    function test_vaultFlow_tightenAndLoosenFlow() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) return;

        // 1. Tighten instantly
        Limits memory tighter = initialLimits;
        tighter.maxTradeBase = 25 * 1e6; // tightened from 50 to 25
        tighter.maxDailyBase = 50 * 1e6; // tightened from 100 to 50
        tighter.maxTradesPerDay = 3;

        address[] memory emptyRemove = new address[](0);
        vm.prank(trader);
        vault.tighten(tighter, emptyRemove);
        assertEq(vault.state().limits.maxTradeBase, 25 * 1e6, "maxTradeBase should be tightened immediately");

        // Stranger cannot tighten
        vm.prank(stranger);
        vm.expectRevert(NotOwnerOrTrader.selector);
        vault.tighten(tighter, emptyRemove);

        // 2. Queue loosening
        Limits memory looser = initialLimits;
        looser.maxTradeBase = 75 * 1e6; // looser than current 25
        looser.maxDailyBase = 150 * 1e6;
        looser.maxTradesPerDay = 10;

        address[] memory newTokens = new address[](0);
        vm.prank(owner);
        vault.queueLoosen(looser, newTokens, true);

        VaultStateView memory st = vault.state();
        assertTrue(st.pending.exists, "Pending loosening should exist");
        uint64 eta = st.pending.eta;

        // Early execute reverts
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TooEarly.selector, eta));
        vault.executeLoosen();

        // Warp past loosen delay (86400 seconds)
        vm.warp(block.timestamp + 86401);

        vm.prank(owner);
        vault.executeLoosen();

        assertEq(vault.state().limits.maxTradeBase, 75 * 1e6, "Limits should be loosened after delay");
        assertFalse(vault.state().pending.exists, "Pending loosening should be cleared");
    }

    function test_vaultFlow_withdrawalRequestAndExecution() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) return;

        uint256 withdrawAmount = 20 * 1e6; // 20 USDC
        uint256 ownerInitialUsdc = IERC20(USDC).balanceOf(owner);

        // Request withdrawal
        vm.prank(owner);
        vault.requestWithdraw(USDC, withdrawAmount);

        VaultStateView memory st = vault.state();
        assertTrue(st.withdrawal.exists, "Pending withdrawal should exist");
        uint64 eta = st.withdrawal.eta;

        // Early execution reverts
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TooEarly.selector, eta));
        vault.executeWithdraw();

        // Warp past withdraw delay
        vm.warp(block.timestamp + 86401);

        vm.prank(owner);
        vault.executeWithdraw();

        assertEq(
            IERC20(USDC).balanceOf(owner),
            ownerInitialUsdc + withdrawAmount,
            "Owner should have received exactly 20 USDC"
        );
        assertEq(IERC20(USDC).balanceOf(address(vault)), 80 * 1e6, "Vault should have 80 USDC remaining");
        assertFalse(vault.state().withdrawal.exists, "Withdrawal should be cleared");
    }

    function test_vaultFlow_expiry_and_dailyLimitAcrossMidnightRoll() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) return;

        TradeParams memory params = TradeParams({
            tokenIn: USDC,
            tokenOut: WOKB,
            feeTier: 500,
            amountIn: 10 * 1e6,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });

        // 1. Expiry test
        // Warp past expiresAt (30 days + 1)
        uint256 futureTime = block.timestamp + 31 days;
        vm.warp(futureTime);
        params.deadline = uint64(futureTime + 300);

        // Expired: notExpired bit 2 is 0: 255 & ~(1 << 2) = 251
        (uint16 expBits, bool expAllowed) = vault.previewTrade(params);
        assertFalse(expAllowed, "Expired trade should be blocked");
        assertEq(expBits, 251, "Expected bit 2 to be 0 (251)");

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, uint16(251)));
        vault.trade(params);

        // 2. Daily limits and midnight roll test on a fresh vault
        Limits memory dailyLimits = initialLimits;
        dailyLimits.maxTradeBase = 10 * 1e6;
        dailyLimits.maxDailyBase = 20 * 1e6;
        dailyLimits.maxTradesPerDay = 2;
        dailyLimits.cooldownSec = 60;
        dailyLimits.expiresAt = uint64(block.timestamp + 100 days);

        address[] memory tokens = new address[](1);
        tokens[0] = WOKB;

        vm.prank(owner);
        MandateVault dailyVault = MandateVault(factory.createVault(trader, dailyLimits, tokens));

        vm.startPrank(owner);
        IERC20(USDC).approve(address(dailyVault), 50 * 1e6);
        dailyVault.deposit(50 * 1e6);
        vm.stopPrank();

        TradeParams memory dParams = TradeParams({
            tokenIn: USDC,
            tokenOut: WOKB,
            feeTier: 500,
            amountIn: 10 * 1e6,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });

        // Trade 1: succeeds
        vm.prank(trader);
        dailyVault.trade(dParams);

        // Warp past cooldown
        vm.warp(block.timestamp + 65);
        dParams.deadline = uint64(block.timestamp + 300);

        // Trade 2: reaches daily limit (20 USDC and 2 trades)
        vm.prank(trader);
        dailyVault.trade(dParams);
        assertEq(dailyVault.state().tradesToday, 2);

        // Warp past cooldown, but still within same UTC day
        vm.warp(block.timestamp + 65);
        dParams.deadline = uint64(block.timestamp + 300);

        // Trade 3: blocked by daily limits (tradesOk bit 6 is 0 and dailyOk bit 5 is 0)
        (uint16 dailyBits, bool dailyAllowed) = dailyVault.previewTrade(dParams);
        assertFalse(dailyAllowed, "Trade exceeding daily limit should be blocked");
        assertTrue((dailyBits & (1 << 6)) == 0, "tradesOk bit should be 0");

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(RuleBlocked.selector, dailyBits));
        dailyVault.trade(dParams);

        // Warp to next UTC day
        uint256 secondsUntilMidnight = 86400 - (block.timestamp % 86400);
        vm.warp(block.timestamp + secondsUntilMidnight + 1);
        dParams.deadline = uint64(block.timestamp + 300);

        // New day: counters reset, trade succeeds!
        (dailyBits, dailyAllowed) = dailyVault.previewTrade(dParams);
        assertTrue(dailyAllowed, "Trade on next UTC day should be allowed");
        assertEq(dailyBits, 255);

        vm.prank(trader);
        dailyVault.trade(dParams);
        assertEq(dailyVault.state().tradesToday, 1, "Counters should reset to 1 on new UTC day");
    }

    function test_vaultFlow_vaultIsolation_differentOwnerCannotAccess() public {
        if (GeneratedConstants.FACTORY == address(0) || GeneratedConstants.FACTORY.code.length == 0) return;

        // Create second vault with different owner and trader
        address[] memory tokens = new address[](1);
        tokens[0] = WOKB;

        vm.prank(owner2);
        MandateVault vault2 = MandateVault(factory.createVault(trader2, initialLimits, tokens));

        deal(USDC, owner2, 100 * 1e6);
        vm.startPrank(owner2);
        IERC20(USDC).approve(address(vault2), 100 * 1e6);
        vault2.deposit(100 * 1e6);
        vm.stopPrank();

        // 1. Owner 1 cannot deposit to Vault 2
        vm.prank(owner);
        vm.expectRevert(NotOwner.selector);
        vault2.deposit(10 * 1e6);

        // 2. Owner 1 cannot request withdrawal from Vault 2
        vm.prank(owner);
        vm.expectRevert(NotOwner.selector);
        vault2.requestWithdraw(USDC, 10 * 1e6);

        // 3. Trader 1 cannot trade on Vault 2
        TradeParams memory params = TradeParams({
            tokenIn: USDC,
            tokenOut: WOKB,
            feeTier: 500,
            amountIn: 10 * 1e6,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });
        vm.prank(trader);
        vm.expectRevert(NotTrader.selector);
        vault2.trade(params);

        // 4. Stranger cannot freeze or tighten Vault 2
        vm.prank(stranger);
        vm.expectRevert(NotOwnerOrTrader.selector);
        vault2.freeze();

        address[] memory emptyRemove = new address[](0);
        vm.prank(stranger);
        vm.expectRevert(NotOwnerOrTrader.selector);
        vault2.tighten(initialLimits, emptyRemove);
    }
}
