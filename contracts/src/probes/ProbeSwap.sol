// SPDX-License-Identifier: MIT
// PROBE CONTRACT - TEMPORARY SPIKE FOR GATE G1 (WILL BE REMOVED BEFORE PRODUCTION)
pragma solidity 0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract ProbeSwap {
    using SafeERC20 for IERC20;

    address public immutable swapRouter;

    error SlippageExceeded(uint256 received, uint256 minExpected);
    error DeadlineExpired();
    error InsufficientBalance();

    constructor(address _swapRouter) {
        swapRouter = _swapRouter;
    }

    /// @notice Swaps tokenIn for tokenOut via Uniswap V3 exactInputSingle
    function swap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMin,
        uint64 deadline
    ) external returns (uint256 amountOut, uint256 gasUsed) {
        if (block.timestamp > deadline) {
            revert DeadlineExpired();
        }

        uint256 balInBefore = IERC20(tokenIn).balanceOf(address(this));
        if (balInBefore < amountIn) {
            revert InsufficientBalance();
        }
        uint256 balOutBefore = IERC20(tokenOut).balanceOf(address(this));

        // 1. Approve exact amount
        IERC20(tokenIn).forceApprove(swapRouter, amountIn);

        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });

        uint256 startGas = gasleft();
        amountOut = ISwapRouter02(swapRouter).exactInputSingle(params);
        gasUsed = startGas - gasleft();

        // 2. Reset approval to 0
        IERC20(tokenIn).forceApprove(swapRouter, 0);

        // 3. Verify balance deltas
        uint256 balInAfter = IERC20(tokenIn).balanceOf(address(this));
        uint256 balOutAfter = IERC20(tokenOut).balanceOf(address(this));

        require(balInBefore - balInAfter == amountIn, "Spent amount mismatch");
        uint256 actualReceived = balOutAfter - balOutBefore;
        if (actualReceived < amountOutMin) {
            revert SlippageExceeded(actualReceived, amountOutMin);
        }
    }

    // Support receiving native or tokens if needed
    receive() external payable {}
}
