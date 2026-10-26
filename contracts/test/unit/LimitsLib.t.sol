// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Limits} from "../../src/types/DataTypes.sol";
import {LimitsLib, InvalidLimits, NotStricter} from "../../src/libraries/LimitsLib.sol";

contract LimitsHarness {
    function validate(Limits memory limits, uint32 minWithdrawDelaySec) external view {
        LimitsLib.validate(limits, minWithdrawDelaySec);
    }

    function isStricterOrEqual(Limits memory next, Limits memory cur) external pure returns (bool) {
        return LimitsLib.isStricterOrEqual(next, cur);
    }
}

contract LimitsLibTest is Test {
    LimitsHarness internal harness;

    function setUp() public {
        harness = new LimitsHarness();
    }

    function _baseLimits() internal view returns (Limits memory) {
        return Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });
    }

    function test_validate_validLimitsPasses() public view {
        Limits memory l = _baseLimits();
        harness.validate(l, 3600);
    }

    function test_validate_revertsOnZeroMaxTradeBase() public {
        Limits memory l = _baseLimits();
        l.maxTradeBase = 0;

        vm.expectRevert(InvalidLimits.selector);
        harness.validate(l, 3600);
    }

    function test_validate_revertsOnMaxTradeExceedingDaily() public {
        Limits memory l = _baseLimits();
        l.maxTradeBase = 300e6;

        vm.expectRevert(InvalidLimits.selector);
        harness.validate(l, 3600);
    }

    function test_validate_revertsOnZeroTradesPerDay() public {
        Limits memory l = _baseLimits();
        l.maxTradesPerDay = 0;

        vm.expectRevert(InvalidLimits.selector);
        harness.validate(l, 3600);
    }

    function test_validate_revertsOnZeroMaxDailyBase() public {
        Limits memory l = _baseLimits();
        l.maxDailyBase = 0;

        vm.expectRevert(InvalidLimits.selector);
        harness.validate(l, 3600);
    }

    function test_validate_revertsOnExpiredOrPastTimestamp() public {
        Limits memory l = _baseLimits();
        l.expiresAt = uint64(block.timestamp);

        vm.expectRevert(InvalidLimits.selector);
        harness.validate(l, 3600);
    }

    function test_validate_revertsOnWithdrawDelayBelowMin() public {
        Limits memory l = _baseLimits();
        l.withdrawDelaySec = 1800;

        vm.expectRevert(InvalidLimits.selector);
        harness.validate(l, 3600);
    }

    function test_isStricterOrEqual_identicalLimitsReturnsTrue() public view {
        Limits memory l = _baseLimits();
        assertTrue(harness.isStricterOrEqual(l, l));
    }

    function test_isStricterOrEqual_tighterFieldsReturnTrue() public view {
        Limits memory cur = _baseLimits();

        Limits memory next = Limits({
            maxTradeBase: 40e6, // tighter
            maxDailyBase: 150e6, // tighter
            maxTradesPerDay: 4, // tighter
            cooldownSec: 120, // tighter
            expiresAt: uint64(block.timestamp + 43200), // tighter
            withdrawDelaySec: 7200 // tighter
        });

        assertTrue(harness.isStricterOrEqual(next, cur));
    }

    function test_isStricterOrEqual_looserFieldsReturnFalse() public view {
        Limits memory cur = _baseLimits();

        // Loose maxTradeBase
        Limits memory l1 = _baseLimits();
        l1.maxTradeBase = 60e6;
        assertFalse(harness.isStricterOrEqual(l1, cur));

        // Loose maxDailyBase
        Limits memory lDaily = _baseLimits();
        lDaily.maxDailyBase = 250e6;
        assertFalse(harness.isStricterOrEqual(lDaily, cur));

        // Loose maxTradesPerDay
        Limits memory lTrades = _baseLimits();
        lTrades.maxTradesPerDay = 10;
        assertFalse(harness.isStricterOrEqual(lTrades, cur));

        // Loose cooldownSec
        Limits memory l2 = _baseLimits();
        l2.cooldownSec = 30;
        assertFalse(harness.isStricterOrEqual(l2, cur));

        // Loose expiresAt (extended)
        Limits memory l3 = _baseLimits();
        l3.expiresAt = uint64(block.timestamp + 100000);
        assertFalse(harness.isStricterOrEqual(l3, cur));

        // Loose withdrawDelaySec (faster withdraw)
        Limits memory l4 = _baseLimits();
        l4.withdrawDelaySec = 1800;
        assertFalse(harness.isStricterOrEqual(l4, cur));
    }
}
