// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

struct Limits {
    uint128 maxTradeBase;
    uint128 maxDailyBase;
    uint16 maxTradesPerDay;
    uint32 cooldownSec;
    uint64 expiresAt;
    uint32 withdrawDelaySec;
}

struct TradeParams {
    address tokenIn;
    address tokenOut;
    uint24 feeTier;
    uint256 amountIn;
    uint256 amountOutMin;
    uint64 deadline;
}

struct PendingChange {
    Limits limits;
    address[] addTokens;
    uint64 eta;
    bool exists;
    bool unfreeze;
}

struct PendingWithdrawal {
    address token;
    uint256 amount;
    uint64 eta;
    bool exists;
}

struct VaultStateView {
    address owner;
    address trader;
    Limits limits;
    bool frozen;
    uint64 dayIndex;
    uint16 tradesToday;
    uint128 buyVolumeTodayBase;
    uint64 lastBuyAt;
    PendingChange pending;
    PendingWithdrawal withdrawal;
}
