// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ISwapRouter02} from "../../src/interfaces/ISwapRouter02.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockERC20} from "./MockERC20.sol";
import {IMandateVault} from "../../src/interfaces/IMandateVault.sol";
import {TradeParams} from "../../src/types/DataTypes.sol";

contract MockSwapRouter is ISwapRouter02 {
    using SafeERC20 for IERC20;

    enum Behavior {
        Normal,
        ReturnLessThanMin,
        SpendLess,
        SpendMore,
        FeeOnTransfer,
        Reenter
    }

    Behavior public behavior = Behavior.Normal;
    address public reenterTarget;
    TradeParams public reenterParams;

    function setBehavior(Behavior b) external {
        behavior = b;
    }

    function setReentrancy(address target, TradeParams calldata p) external {
        behavior = Behavior.Reenter;
        reenterTarget = target;
        reenterParams = p;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (behavior == Behavior.Reenter) {
            // Attempt to re-enter the vault trade function
            IMandateVault(reenterTarget).trade(reenterParams);
        }

        uint256 spendAmount = params.amountIn;
        if (behavior == Behavior.SpendLess) {
            spendAmount = params.amountIn - 1;
        } else if (behavior == Behavior.SpendMore) {
            spendAmount = params.amountIn + 1;
        }

        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), spendAmount);

        if (behavior == Behavior.ReturnLessThanMin) {
            amountOut = params.amountOutMinimum > 1 ? params.amountOutMinimum - 1 : 0;
        } else {
            amountOut = params.amountOutMinimum;
        }

        // Mint or deliver tokenOut to recipient
        MockERC20(params.tokenOut).mint(address(this), amountOut);

        uint256 deliverAmount = amountOut;
        if (behavior == Behavior.FeeOnTransfer) {
            deliverAmount = amountOut > 1 ? amountOut - 1 : 0;
        }

        IERC20(params.tokenOut).safeTransfer(params.recipient, deliverAmount);
    }
}
