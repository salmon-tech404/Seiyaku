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
    ZeroAddress,
    NothingPending,
    TooEarly,
    DepositCapExceeded,
    TransferFailed,
    AlreadyInitialized
} from "../../src/MandateVault.sol";
import {NotStricter, InvalidLimits} from "../../src/libraries/LimitsLib.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockProcessor} from "../mocks/MockProcessor.sol";
import {MockBeacon} from "../mocks/MockBeacon.sol";

contract MandateVaultTest is Test {
    MandateVaultFactory internal factory;
    MandateVault internal masterImpl;
    MandateVault internal vault;
    MockERC20 internal usdc;
    MockERC20 internal wokb;
    MockProcessor internal processor;
    MockBeacon internal beacon;
    address internal beaconImpl;

    address internal owner = address(0xAA);
    address internal trader = address(0xBB);
    address internal stranger = address(0xCC);

    Limits internal defaultLimits;

    event Frozen(address indexed caller);
    event Tightened(address indexed caller, Limits next);
    event LoosenQueued(address indexed owner, Limits next, uint64 eta, bool unfreeze);
    event LoosenExecuted(address indexed owner, Limits applied);
    event LoosenCancelled(address indexed caller);
    event WithdrawRequested(address indexed owner, address indexed token, uint256 amount, uint64 eta);
    event WithdrawExecuted(address indexed owner, address indexed token, uint256 amount);
    event WithdrawCancelled(address indexed caller);
    event TraderChanged(address indexed owner, address indexed newTrader);
    event Deposited(address indexed owner, uint256 amount);

    function setUp() public {
        masterImpl = new MandateVault();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        wokb = new MockERC20("Wrapped OKB", "WOKB", 18);

        processor = new MockProcessor();
        bytes memory fakeNetlist = hex"000000030000040000000b00000b";
        processor.setNetlist(1, fakeNetlist);

        beaconImpl = address(new MockERC20("BeaconImpl", "BIMP", 18));
        beacon = new MockBeacon(beaconImpl, address(0));

        FactoryConfig memory cfg = FactoryConfig({
            implementation: address(masterImpl),
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
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
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](1);
        tokens[0] = address(wokb);

        vm.prank(owner);
        vault = MandateVault(payable(factory.createVault(trader, defaultLimits, tokens)));

        // Fund owner with USDC
        usdc.mint(owner, 1000e6);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _sampleInitParams() internal view returns (VaultInitParams memory) {
        address[] memory tokens = new address[](1);
        tokens[0] = address(wokb);
        return VaultInitParams({
            owner: owner,
            trader: trader,
            limits: defaultLimits,
            allowedTokens: tokens,
            baseToken: address(usdc),
            swapRouter: address(0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA),
            processor: address(processor),
            circuitId: 1,
            loosenDelaySec: 120,
            minWithdrawDelaySec: 3600,
            maxDepositBase: 500e6,
            beacon: address(beacon),
            beaconImplementation: beaconImpl,
            beaconImplementationCodehash: beaconImpl.codehash
        });
    }

    function test_masterImpl_cannotBeInitialized() public {
        VaultInitParams memory p = _sampleInitParams();
        vm.expectRevert(AlreadyInitialized.selector);
        masterImpl.initialize(p);
    }

    function test_clone_cannotBeInitializedTwice() public {
        VaultInitParams memory p = _sampleInitParams();
        vm.expectRevert(AlreadyInitialized.selector);
        vault.initialize(p);
    }

    function test_deposit_success_andCapExceeded() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit Deposited(owner, 200e6);
        vault.deposit(200e6);

        assertEq(usdc.balanceOf(address(vault)), 200e6);

        // Deposit exceeding maxDepositBase (500e6)
        vm.prank(owner);
        vm.expectRevert(DepositCapExceeded.selector);
        vault.deposit(301e6); // 200 + 301 > 500
    }

    function test_deposit_revertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(NotOwner.selector);
        vault.deposit(100e6);
    }

    function test_freeze_byOwnerAndTrader_blocksNonOwnerOrTrader() public {
        // Freeze by trader
        vm.prank(trader);
        vm.expectEmit(true, false, false, true);
        emit Frozen(trader);
        vault.freeze();
        assertTrue(vault.frozen());

        // Stranger cannot freeze
        vm.prank(stranger);
        vm.expectRevert(NotOwnerOrTrader.selector);
        vault.freeze();
    }

    function test_tighten_success() public {
        Limits memory next = defaultLimits;
        next.maxTradeBase = 40e6; // stricter

        address[] memory removeTokens = new address[](1);
        removeTokens[0] = address(wokb);

        vm.prank(trader);
        vm.expectEmit(true, false, false, true);
        emit Tightened(trader, next);
        vault.tighten(next, removeTokens);

        assertEq(vault.state().limits.maxTradeBase, 40e6);
        assertFalse(vault.allowedTokens(address(wokb)));
    }

    function test_tighten_revertsIfNotStricter() public {
        Limits memory next = defaultLimits;
        next.maxTradeBase = 60e6; // looser

        address[] memory removeTokens = new address[](0);

        vm.prank(owner);
        vm.expectRevert(NotStricter.selector);
        vault.tighten(next, removeTokens);
    }

    function test_looseningFlow_queue_execute_cancel() public {
        Limits memory next = defaultLimits;
        next.maxTradeBase = 80e6; // looser

        address[] memory addTokens = new address[](0);

        // Stranger cannot queue
        vm.prank(stranger);
        vm.expectRevert(NotOwner.selector);
        vault.queueLoosen(next, addTokens, true);

        // Owner queues
        vm.prank(owner);
        vault.queueLoosen(next, addTokens, true);

        // Execute too early
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TooEarly.selector, uint64(block.timestamp + 120)));
        vault.executeLoosen();

        // Warp past eta
        vm.warp(block.timestamp + 121);

        // Execute successfully
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit LoosenExecuted(owner, next);
        vault.executeLoosen();

        assertEq(vault.state().limits.maxTradeBase, 80e6);
        assertFalse(vault.frozen());

        // Execute again reverts NothingPending
        vm.prank(owner);
        vm.expectRevert(NothingPending.selector);
        vault.executeLoosen();

        // Queue and cancel by trader
        vm.prank(owner);
        vault.queueLoosen(next, addTokens, false);

        vm.prank(trader);
        vm.expectEmit(true, false, false, true);
        emit LoosenCancelled(trader);
        vault.cancelLoosen();
    }

    function test_withdrawFlow_request_execute_cancel() public {
        vm.prank(owner);
        vault.deposit(200e6);

        // Stranger cannot request
        vm.prank(stranger);
        vm.expectRevert(NotOwner.selector);
        vault.requestWithdraw(address(usdc), 100e6);

        // Owner requests
        vm.prank(owner);
        vault.requestWithdraw(address(usdc), 100e6);

        // Execute too early
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TooEarly.selector, uint64(block.timestamp + 3600)));
        vault.executeWithdraw();

        // Warp past eta
        vm.warp(block.timestamp + 3601);

        uint256 balBefore = usdc.balanceOf(owner);
        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit WithdrawExecuted(owner, address(usdc), 100e6);
        vault.executeWithdraw();

        assertEq(usdc.balanceOf(owner) - balBefore, 100e6);

        // Queue new withdrawal and cancel by trader
        vm.prank(owner);
        vault.requestWithdraw(address(usdc), 50e6);

        vm.prank(trader);
        vm.expectEmit(true, false, false, true);
        emit WithdrawCancelled(trader);
        vault.cancelWithdraw();
    }

    function test_setTrader_byOwner_andRevertsZeroAddress() public {
        address newTrader = address(0xEE);

        vm.prank(owner);
        vm.expectEmit(true, true, false, false);
        emit TraderChanged(owner, newTrader);
        vault.setTrader(newTrader);

        assertEq(vault.trader(), newTrader);

        vm.prank(owner);
        vm.expectRevert(ZeroAddress.selector);
        vault.setTrader(address(0));
    }

    function test_previewTrade_andTradeStub() public view {
        TradeParams memory p = TradeParams({
            tokenIn: address(usdc),
            tokenOut: address(wokb),
            feeTier: 500,
            amountIn: 10e6,
            amountOutMin: 1,
            deadline: uint64(block.timestamp + 300)
        });

        (uint16 bits, bool allowed) = vault.previewTrade(p);
        // vault has 0 usdc balance so sane condition bit 0 is 0
        assertEq(bits & 1, 0);
        assertFalse(allowed);
    }

    function test_state_viewReturnsExpectedStruct() public view {
        VaultStateView memory s = vault.state();
        assertEq(s.owner, owner);
        assertEq(s.trader, trader);
        assertEq(s.limits.maxTradeBase, 50e6);
        assertFalse(s.frozen);
    }
}
