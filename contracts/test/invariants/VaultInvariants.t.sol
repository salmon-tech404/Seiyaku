// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {VaultHandler} from "./VaultHandler.sol";
import {MandateVaultFactory} from "../../src/MandateVaultFactory.sol";
import {MandateVault} from "../../src/MandateVault.sol";
import {Limits, VaultStateView} from "../../src/types/DataTypes.sol";
import {FactoryConfig} from "../../src/types/ConfigTypes.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockProcessor} from "../mocks/MockProcessor.sol";
import {MockBeacon} from "../mocks/MockBeacon.sol";
import {MockSwapRouter} from "../mocks/MockSwapRouter.sol";

contract VaultInvariantsTest is Test {
    MandateVaultFactory internal factory;
    MandateVault internal masterImpl;
    MandateVault internal vault;

    MockERC20 internal usdc;
    MockERC20 internal wokb;

    MockProcessor internal processor;
    MockBeacon internal beacon;
    address internal beaconImpl;
    MockSwapRouter internal router;

    VaultHandler internal handler;

    address internal owner = address(0xAA);
    address internal trader = address(0xBB);

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

        Limits memory baseLimits = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 365 days),
            withdrawDelaySec: 3600
        });

        address[] memory tokens = new address[](1);
        tokens[0] = address(wokb);

        vm.prank(owner);
        vault = MandateVault(payable(factory.createVault(trader, baseLimits, tokens)));

        // Initial deposit
        usdc.mint(owner, 100e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), 100e6);
        vault.deposit(100e6);
        vm.stopPrank();

        // Seed vault with WOKB
        wokb.mint(address(vault), 500e18);

        handler = new VaultHandler(vault, usdc, wokb, router, owner, trader);

        // Account for initial deposit in handler ghost
        // Note: initial 100e6 is already in vault, so we track from here or test conservation
        targetContract(address(handler));
    }

    // Invariant 1: Funds Conservation
    function invariant_fundsConservation() public view {
        uint256 vaultBal = usdc.balanceOf(address(vault));
        uint256 expectedBal = 100e6 + handler.ghost_totalDeposited() + handler.ghost_totalBaseReceived()
            - handler.ghost_totalWithdrawn() - handler.ghost_totalBaseSpent();
        assertEq(vaultBal, expectedBal, "Invariant broken: Vault base token balance conservation violated");
    }

    // Invariant 2: Limits maxTradeBase <= maxDailyBase always
    function invariant_limitsStrictnessOrder() public view {
        VaultStateView memory s = vault.state();
        assertTrue(
            s.limits.maxTradeBase <= s.limits.maxDailyBase,
            "Invariant broken: maxTradeBase must not exceed maxDailyBase"
        );
    }

    // Invariant 3: Router allowances are always 0
    function invariant_routerAllowanceAlwaysZero() public view {
        assertEq(usdc.allowance(address(vault), address(router)), 0, "USDC allowance must be 0");
        assertEq(wokb.allowance(address(vault), address(router)), 0, "WOKB allowance must be 0");
    }

    // Invariant 4: Counters within limits for current day
    function invariant_countersWithinLimitsForCurrentDay() public view {
        uint64 currentDay = uint64(block.timestamp / 86400);
        if (vault.dayIndex() == currentDay) {
            assertTrue(vault.tradesToday() <= vault.state().limits.maxTradesPerDay, "tradesToday exceeds limit");
            assertTrue(
                vault.buyVolumeTodayBase() <= vault.state().limits.maxDailyBase, "buyVolumeTodayBase exceeds limit"
            );
        }
    }
}
