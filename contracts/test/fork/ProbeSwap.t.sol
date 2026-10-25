// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ProbeSwap} from "../../src/probes/ProbeSwap.sol";

contract ProbeSwapForkTest is Test {
    address internal constant USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    address internal constant WOKB = 0xe538905cf8410324e03a5a23c1c177a474d59b2b;
    address internal constant SWAP_ROUTER02 = 0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA;
    address internal constant USDC_WHALE = 0x9f73888Fb725A3409548BC8d2e42365AC063E148;

    ProbeSwap internal probe;

    function setUp() public {
        probe = new ProbeSwap(SWAP_ROUTER02);
    }

    function fundProbeWithUsdc(uint256 amount) internal {
        vm.prank(USDC_WHALE);
        IERC20(USDC).transfer(address(probe), amount);
    }

    function test_swap_usdcToWokb_and_wokbToUsdc_roundtrip() public {
        if (SWAP_ROUTER02.code.length == 0) return;

        uint256 tradeAmountUsdc = 10 * 1e6; // 10 USDC
        fundProbeWithUsdc(tradeAmountUsdc);

        uint64 deadline = uint64(block.timestamp + 300);

        // 1. Swap USDC -> WOKB
        (uint256 amountOutWokb, uint256 gasUsedBuy) = probe.swap(
            USDC,
            WOKB,
            500,
            tradeAmountUsdc,
            1, // min 1 wei WOKB
            deadline
        );

        emit log_named_uint("Gas used for buy (USDC -> WOKB)", gasUsedBuy);
        emit log_named_uint("Received WOKB", amountOutWokb);

        assertTrue(amountOutWokb > 0, "Received WOKB must be > 0");
        assertEq(IERC20(USDC).balanceOf(address(probe)), 0, "All USDC should be spent");
        assertEq(IERC20(USDC).allowance(address(probe), SWAP_ROUTER02), 0, "USDC approval must be 0");
        assertLt(gasUsedBuy, 250_000, "Buy gas should be well under 250k");

        // 2. Swap WOKB -> USDC (exit path)
        (uint256 amountOutUsdc, uint256 gasUsedExit) = probe.swap(
            WOKB,
            USDC,
            500,
            amountOutWokb,
            1, // min 1 wei USDC
            deadline
        );

        emit log_named_uint("Gas used for exit (WOKB -> USDC)", gasUsedExit);
        emit log_named_uint("Received USDC back", amountOutUsdc);

        assertTrue(amountOutUsdc > 0, "Received USDC back must be > 0");
        assertEq(IERC20(WOKB).balanceOf(address(probe)), 0, "All WOKB should be spent");
        assertEq(IERC20(WOKB).allowance(address(probe), SWAP_ROUTER02), 0, "WOKB allowance must be 0");
        assertLt(gasUsedExit, 250_000, "Exit gas should be well under 250k");
    }

    function test_swap_revertsOnUnreachableSlippage() public {
        if (SWAP_ROUTER02.code.length == 0) return;

        uint256 tradeAmountUsdc = 10 * 1e6;
        fundProbeWithUsdc(tradeAmountUsdc);

        uint64 deadline = uint64(block.timestamp + 300);
        uint256 impossibleMinOut = 1_000_000 * 1e18; // 1 million WOKB for 10 USDC

        vm.expectRevert();
        probe.swap(USDC, WOKB, 500, tradeAmountUsdc, impossibleMinOut, deadline);
    }

    function test_swap_revertsOnExpiredDeadline() public {
        if (SWAP_ROUTER02.code.length == 0) return;

        uint256 tradeAmountUsdc = 10 * 1e6;
        fundProbeWithUsdc(tradeAmountUsdc);

        uint64 expiredDeadline = uint64(block.timestamp - 1);

        vm.expectRevert(ProbeSwap.DeadlineExpired.selector);
        probe.swap(USDC, WOKB, 500, tradeAmountUsdc, 1, expiredDeadline);
    }
}
