// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {MandateVault} from "../../src/MandateVault.sol";
import {Limits, TradeParams} from "../../src/types/DataTypes.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";

contract VaultHandler is Test {
    MandateVault internal vault;
    MockERC20 internal usdc;
    MockERC20 internal wokb;
    MockSwapRouter internal router;

    address internal owner;
    address internal trader;

    // Ghost variables for conservation checks
    uint256 public ghost_totalDeposited;
    uint256 public ghost_totalWithdrawn;
    uint256 public ghost_totalBaseSpent;
    uint256 public ghost_totalBaseReceived;

    constructor(
        MandateVault _vault,
        MockERC20 _usdc,
        MockERC20 _wokb,
        MockSwapRouter _router,
        address _owner,
        address _trader
    ) {
        vault = _vault;
        usdc = _usdc;
        wokb = _wokb;
        router = _router;
        owner = _owner;
        trader = _trader;
    }

    function deposit(uint256 amount) external {
        uint256 vaultBal = usdc.balanceOf(address(vault));
        uint256 maxDeposit = vault.maxDepositBase();
        if (vaultBal >= maxDeposit) return;

        amount = bound(amount, 1, maxDeposit - vaultBal);

        usdc.mint(owner, amount);
        vm.startPrank(owner);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        ghost_totalDeposited += amount;
    }

    function freezeVault() external {
        vm.prank(owner);
        vault.freeze();
    }

    function tightenLimits(uint128 newMaxTrade) external {
        Limits memory cur = vault.state().limits;
        newMaxTrade = uint128(bound(newMaxTrade, 1e6, cur.maxTradeBase));

        Limits memory next = cur;
        next.maxTradeBase = newMaxTrade;

        vm.prank(trader);
        vault.tighten(next, new address[](0));
    }

    function queueLoosening(uint128 newMaxTrade, bool unfreeze) external {
        Limits memory cur = vault.state().limits;
        newMaxTrade = uint128(bound(newMaxTrade, cur.maxTradeBase, cur.maxDailyBase));

        Limits memory next = cur;
        next.maxTradeBase = newMaxTrade;

        vm.prank(owner);
        vault.queueLoosen(next, new address[](0), unfreeze);
    }

    function executeLoosening() external {
        if (!vault.state().pending.exists) return;
        if (block.timestamp < vault.state().pending.eta) return;

        vm.prank(owner);
        vault.executeLoosen();
    }

    function cancelLoosening() external {
        if (!vault.state().pending.exists) return;

        vm.prank(trader);
        vault.cancelLoosen();
    }

    function requestWithdrawal(uint256 amount) external {
        if (vault.state().withdrawal.exists) return;
        uint256 bal = usdc.balanceOf(address(vault));
        if (bal == 0) return;

        amount = bound(amount, 1, bal);

        vm.prank(owner);
        vault.requestWithdraw(address(usdc), amount);
    }

    function executeWithdrawal() external {
        if (!vault.state().withdrawal.exists) return;
        if (block.timestamp < vault.state().withdrawal.eta) return;

        uint256 balBefore = usdc.balanceOf(owner);

        vm.prank(owner);
        vault.executeWithdraw();

        uint256 withdrawn = usdc.balanceOf(owner) - balBefore;
        ghost_totalWithdrawn += withdrawn;
    }

    function tradeBuy(uint256 amount) external {
        uint256 bal = usdc.balanceOf(address(vault));
        Limits memory cur = vault.state().limits;
        if (bal == 0 || cur.maxTradeBase == 0) return;

        amount = bound(amount, 1, cur.maxTradeBase);
        if (amount > bal) return;

        TradeParams memory p = TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: amount,
            amountOutMin: 1e18,
            deadline: uint64(block.timestamp + 300)
        });

        (, bool allowed) = vault.previewTrade(p);
        if (!allowed) return;

        vm.prank(trader);
        vault.trade(p);

        ghost_totalBaseSpent += amount;
    }

    function tradeExit(uint256 amount) external {
        uint256 bal = wokb.balanceOf(address(vault));
        if (bal == 0) return;

        amount = bound(amount, 1, bal);

        TradeParams memory p = TradeParams({
            tokenIn: address(wokb),
            tokenOut: address(usdc),
            feeTier: 500,
            amountIn: amount,
            amountOutMin: 10e6,
            deadline: uint64(block.timestamp + 300)
        });

        (, bool allowed) = vault.previewTrade(p);
        if (!allowed) return;

        uint256 balBefore = usdc.balanceOf(address(vault));

        vm.prank(trader);
        vault.trade(p);

        uint256 received = usdc.balanceOf(address(vault)) - balBefore;
        ghost_totalBaseReceived += received;
    }

    function warpTime(uint256 secs) external {
        secs = bound(secs, 1, 86400 * 2);
        vm.warp(block.timestamp + secs);
    }
}
