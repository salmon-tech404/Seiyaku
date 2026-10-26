// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Limits, TradeParams, VaultStateView} from "../types/DataTypes.sol";

interface IMandateVault {
    event Traded(
        address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, bool indexed isExit
    );
    event Frozen(address indexed caller);
    event Tightened(address indexed caller, Limits next);
    event LoosenQueued(address indexed owner, Limits next, address[] addTokens, uint64 eta, bool unfreeze);
    event LoosenExecuted(address indexed owner, Limits applied);
    event LoosenCancelled(address indexed caller);
    event WithdrawRequested(address indexed owner, address indexed token, uint256 amount, uint64 eta);
    event WithdrawExecuted(address indexed owner, address indexed token, uint256 amount);
    event WithdrawCancelled(address indexed caller);
    event TraderChanged(address indexed owner, address indexed newTrader);
    event Deposited(address indexed owner, uint256 amount);

    function trade(TradeParams calldata p) external returns (uint256 amountOut);
    function freeze() external;
    function tighten(Limits calldata next, address[] calldata removeTokens) external;
    function queueLoosen(Limits calldata next, address[] calldata addTokens, bool unfreeze) external;
    function executeLoosen() external;
    function cancelLoosen() external;
    function requestWithdraw(address token, uint256 amount) external;
    function executeWithdraw() external;
    function cancelWithdraw() external;
    function setTrader(address newTrader) external;
    function deposit(uint256 amount) external;
    function state() external view returns (VaultStateView memory);
    function previewTrade(TradeParams calldata p) external view returns (uint16 inputBits, bool allowed);
}
