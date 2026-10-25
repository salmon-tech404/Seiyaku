// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";

interface IERC20Metadata {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams calldata params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

contract AddressesForkTest is Test {
    address internal constant USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    address internal constant WOKB = 0xe538905cf8410324e03A5A23C1c177a474D59b2b;
    address internal constant UNISWAP_V3_FACTORY = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;
    address internal constant SWAP_ROUTER02 = 0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA;
    address internal constant QUOTER_V2 = 0xD1b797D92d87B688193A2B976eFc8D577D204343;
    address internal constant TAPEOUT_PROCESSOR_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address internal constant USDC_HOLDER = 0x9f73888Fb725A3409548BC8d2e42365AC063E148;

    function test_addresses_haveNonEmptyBytecode() public view {
        assertTrue(USDC.code.length > 0, "USDC has empty bytecode");
        assertTrue(WOKB.code.length > 0, "WOKB has empty bytecode");
        assertTrue(UNISWAP_V3_FACTORY.code.length > 0, "UniswapV3Factory has empty bytecode");
        assertTrue(SWAP_ROUTER02.code.length > 0, "SwapRouter02 has empty bytecode");
        assertTrue(QUOTER_V2.code.length > 0, "QuoterV2 has empty bytecode");
        assertTrue(TAPEOUT_PROCESSOR_FACTORY.code.length > 0, "TapeOutProcessorFactory has empty bytecode");
    }

    function test_tokens_decimalsMatchRecordedValues() public view {
        assertEq(IERC20Metadata(USDC).decimals(), 6, "USDC decimals mismatch");
        assertEq(IERC20Metadata(WOKB).decimals(), 18, "WOKB decimals mismatch");
    }

    function test_quoter_tenUsdcQuoteSucceedsOnFee500() public {
        IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2.QuoteExactInputSingleParams({
            tokenIn: USDC,
            tokenOut: WOKB,
            amountIn: 10 * 1e6, // 10 USDC
            fee: 500,
            sqrtPriceLimitX96: 0
        });

        (uint256 amountOut,,,) = IQuoterV2(QUOTER_V2).quoteExactInputSingle(params);
        assertTrue(amountOut > 0, "Quoted amountOut must be greater than zero");
    }

    function test_funding_dealOrSlotBalances() public {
        address recipient = address(0xCAFE);
        uint256 fundAmount = 100 * 1e6; // 100 USDC

        // Deal using Foundry deal cheatcode with storage slot 9 for FiatTokenV2
        deal(USDC, recipient, fundAmount);
        assertEq(IERC20Metadata(USDC).balanceOf(recipient), fundAmount, "Recipient balance mismatch after deal");
    }
}
