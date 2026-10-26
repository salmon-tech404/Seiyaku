// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Limits} from "../types/DataTypes.sol";

error InvalidLimits();
error NotStricter();

library LimitsLib {
    /**
     * @notice Validates structural sanity of limits.
     * @param limits Limits struct to validate.
     * @param minWithdrawDelaySec Minimum withdraw delay allowed by the factory.
     */
    function validate(Limits memory limits, uint32 minWithdrawDelaySec) internal view {
        // block.timestamp drift tolerance: second-level comparison is sufficient for expiration bounds
        if (
            limits.maxTradeBase == 0 || limits.maxDailyBase == 0 || limits.maxTradeBase > limits.maxDailyBase
                // forge-lint: disable-next-line(block-timestamp)
                || limits.maxTradesPerDay == 0 || limits.expiresAt <= block.timestamp
                || limits.withdrawDelaySec < minWithdrawDelaySec
        ) {
            revert InvalidLimits();
        }
    }

    /**
     * @notice Checks whether next limits are strictly tighter or equal to current limits.
     * @dev next is at least as strict as cur iff:
     * maxTradeBase <= cur.maxTradeBase,
     * maxDailyBase <= cur.maxDailyBase,
     * maxTradesPerDay <= cur.maxTradesPerDay,
     * cooldownSec >= cur.cooldownSec,
     * expiresAt <= cur.expiresAt,
     * withdrawDelaySec >= cur.withdrawDelaySec.
     */
    function isStricterOrEqual(Limits memory next, Limits memory cur) internal pure returns (bool) {
        return next.maxTradeBase <= cur.maxTradeBase && next.maxDailyBase <= cur.maxDailyBase
            && next.maxTradesPerDay <= cur.maxTradesPerDay && next.cooldownSec >= cur.cooldownSec
            && next.expiresAt <= cur.expiresAt && next.withdrawDelaySec >= cur.withdrawDelaySec;
    }
}
