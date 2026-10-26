// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Limits, TradeParams} from "../../src/types/DataTypes.sol";
import {VaultInitParams} from "../../src/types/ConfigTypes.sol";
import {MandateVaultHarness} from "../harness/MandateVaultHarness.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockProcessor} from "../mocks/MockProcessor.sol";
import {MockBeacon} from "../mocks/MockBeacon.sol";

contract VectorsTest is Test {
    address internal constant JSON_USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    address internal constant JSON_WOKB = 0xe538905cf8410324e03A5A23C1c177a474D59b2b;
    address internal constant JSON_ALT = 0x1111111111111111111111111111111111111111;

    MandateVaultHarness internal harness;
    MockProcessor internal processor;
    MockBeacon internal beacon;
    address internal beaconImpl;

    MockERC20 internal baseToken;
    MockERC20 internal altToken;

    function setUp() public {
        MandateVaultHarness masterHarness = new MandateVaultHarness();
        harness = MandateVaultHarness(payable(Clones.clone(address(masterHarness))));
        processor = new MockProcessor();
        processor.setEvaluateReference(true);

        beaconImpl = address(new MockERC20("BeaconImpl", "BIMP", 18));
        beacon = new MockBeacon(beaconImpl, address(0));

        baseToken = new MockERC20("USD Coin", "USDC", 6);
        altToken = new MockERC20("Wrapped OKB", "WOKB", 18);

        address[] memory tokens = new address[](1);
        tokens[0] = address(altToken);

        Limits memory lim = Limits({
            maxTradeBase: 50e6,
            maxDailyBase: 200e6,
            maxTradesPerDay: 5,
            cooldownSec: 60,
            expiresAt: uint64(block.timestamp + 86400),
            withdrawDelaySec: 3600
        });

        VaultInitParams memory p = VaultInitParams({
            owner: address(0xAA),
            trader: address(0xBB),
            limits: lim,
            allowedTokens: tokens,
            baseToken: address(baseToken),
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

        harness.initialize(p);
    }

    function test_vectors_all512CombinationsMatch() public view {
        string memory path = "./test/vectors/mandate-v1.json";
        string memory json = vm.readFile(path);

        for (uint256 i = 0; i < 512; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            uint256 inputBits = vm.parseJsonUint(json, string.concat(prefix, ".inputBits"));
            uint256 allow = vm.parseJsonUint(json, string.concat(prefix, ".allow"));

            bool expectedAllow = allow == 1;
            bool actualAllow = harness.exposedIsAllowedByCircuit(uint16(inputBits));
            assertEq(actualAllow, expectedAllow, "Vector decision mismatch");
        }
    }

    function _setScenarioLimitsAndState(string memory json, string memory prefix) internal {
        Limits memory lim = Limits({
            maxTradeBase: uint128(vm.parseJsonUint(json, string.concat(prefix, ".limits.maxTradeBase"))),
            maxDailyBase: uint128(vm.parseJsonUint(json, string.concat(prefix, ".limits.maxDailyBase"))),
            maxTradesPerDay: uint16(vm.parseJsonUint(json, string.concat(prefix, ".limits.maxTradesPerDay"))),
            cooldownSec: uint32(vm.parseJsonUint(json, string.concat(prefix, ".limits.cooldownSec"))),
            expiresAt: uint64(vm.parseJsonUint(json, string.concat(prefix, ".limits.expiresAt"))),
            withdrawDelaySec: uint32(vm.parseJsonUint(json, string.concat(prefix, ".limits.withdrawDelaySec")))
        });

        bool frozenState = vm.parseJsonBool(json, string.concat(prefix, ".state.frozen"));
        uint64 dayIdx = uint64(vm.parseJsonUint(json, string.concat(prefix, ".state.dayIndex")));
        uint16 tradesToday = uint16(vm.parseJsonUint(json, string.concat(prefix, ".state.tradesToday")));
        uint128 volToday = uint128(vm.parseJsonUint(json, string.concat(prefix, ".state.buyVolumeTodayBase")));
        uint64 lastBuyAt = uint64(vm.parseJsonUint(json, string.concat(prefix, ".state.lastBuyAt")));

        harness.setTestState(lim, frozenState, dayIdx, tradesToday, volToday, lastBuyAt);
    }

    function _setScenarioTokensAndBalances(string memory json, string memory prefix, address) internal {
        address[] memory allowedToks = vm.parseJsonAddressArray(json, string.concat(prefix, ".state.allowedTokens"));
        harness.setTokenAllowed(JSON_USDC, false);
        harness.setTokenAllowed(JSON_WOKB, false);
        harness.setTokenAllowed(JSON_ALT, false);

        for (uint256 k = 0; k < allowedToks.length; k++) {
            harness.setTokenAllowed(allowedToks[k], true);
        }

        // Mock token balances using vm.mockCall for address independence
        string memory usdcKey = string.concat(prefix, ".state.balances.0xb6ceceab302e2e4948951ee7843fc24e92933061");
        if (vm.keyExistsJson(json, usdcKey)) {
            uint256 bal = vm.parseJsonUint(json, usdcKey);
            vm.mockCall(JSON_USDC, abi.encodeWithSelector(IERC20.balanceOf.selector, address(harness)), abi.encode(bal));
        } else {
            vm.mockCall(
                JSON_USDC, abi.encodeWithSelector(IERC20.balanceOf.selector, address(harness)), abi.encode(uint256(0))
            );
        }

        string memory wokbKey = string.concat(prefix, ".state.balances.0xe538905cf8410324e03a5a23c1c177a474d59b2b");
        if (vm.keyExistsJson(json, wokbKey)) {
            uint256 bal = vm.parseJsonUint(json, wokbKey);
            vm.mockCall(JSON_WOKB, abi.encodeWithSelector(IERC20.balanceOf.selector, address(harness)), abi.encode(bal));
        } else {
            vm.mockCall(
                JSON_WOKB, abi.encodeWithSelector(IERC20.balanceOf.selector, address(harness)), abi.encode(uint256(0))
            );
        }

        string memory altKey = string.concat(prefix, ".state.balances.0x1111111111111111111111111111111111111111");
        if (vm.keyExistsJson(json, altKey)) {
            uint256 bal = vm.parseJsonUint(json, altKey);
            vm.mockCall(JSON_ALT, abi.encodeWithSelector(IERC20.balanceOf.selector, address(harness)), abi.encode(bal));
        } else {
            vm.mockCall(
                JSON_ALT, abi.encodeWithSelector(IERC20.balanceOf.selector, address(harness)), abi.encode(uint256(0))
            );
        }
    }

    function _executeScenario(string memory json, string memory prefix, uint256 index) internal {
        uint256 nowTs = vm.parseJsonUint(json, string.concat(prefix, ".state.now"));
        vm.warp(nowTs);

        harness.setBaseToken(vm.parseJsonAddress(json, string.concat(prefix, ".state.baseToken")));

        _setScenarioLimitsAndState(json, prefix);

        address tokenIn = vm.parseJsonAddress(json, string.concat(prefix, ".request.tokenIn"));
        _setScenarioTokensAndBalances(json, prefix, tokenIn);

        TradeParams memory req = TradeParams({
            tokenIn: tokenIn,
            tokenOut: vm.parseJsonAddress(json, string.concat(prefix, ".request.tokenOut")),
            feeTier: uint24(vm.parseJsonUint(json, string.concat(prefix, ".request.feeTier"))),
            amountIn: vm.parseJsonUint(json, string.concat(prefix, ".request.amountIn")),
            amountOutMin: vm.parseJsonUint(json, string.concat(prefix, ".request.amountOutMin")),
            deadline: uint64(vm.parseJsonUint(json, string.concat(prefix, ".request.deadline")))
        });

        uint256 expectedBits = vm.parseJsonUint(json, string.concat(prefix, ".expected.bits"));
        uint256 expectedAllow = vm.parseJsonUint(json, string.concat(prefix, ".expected.allow"));

        (uint16 actualBits,) = harness.exposedInputBits(req);
        assertEq(actualBits, expectedBits, string.concat("Scenario bits mismatch at index ", vm.toString(index)));

        bool actualAllow = harness.exposedIsAllowedByCircuit(actualBits);
        assertEq(
            actualAllow, expectedAllow == 1, string.concat("Scenario allow mismatch at index ", vm.toString(index))
        );
    }

    function test_vectors_all60ScenariosMatch() public {
        string memory path = "./test/vectors/scenarios.json";
        string memory json = vm.readFile(path);
        uint256 totalScenarios = vm.parseJsonUint(json, ".totalScenarios");

        for (uint256 i = 0; i < totalScenarios; i++) {
            _executeScenario(json, string.concat(".scenarios[", vm.toString(i), "]"), i);
        }
    }

    function test_vectors_circuitBitEvaluationLogic() public pure {
        for (uint16 bits = 0; bits < 512; bits++) {
            bool sane = (bits & (1 << 0)) != 0;
            bool tokenAllowed = (bits & (1 << 1)) != 0;
            bool notExpired = (bits & (1 << 2)) != 0;
            bool notFrozen = (bits & (1 << 3)) != 0;
            bool sizeOk = (bits & (1 << 4)) != 0;
            bool dailyOk = (bits & (1 << 5)) != 0;
            bool tradesOk = (bits & (1 << 6)) != 0;
            bool cooldownOk = (bits & (1 << 7)) != 0;
            bool isExit = (bits & (1 << 8)) != 0;

            bool buyAllowed = tokenAllowed && notExpired && notFrozen && sizeOk && dailyOk && tradesOk && cooldownOk;
            bool allow = sane && (isExit || buyAllowed);

            uint8 b0 = uint8(bits & 0xff);
            uint8 b1 = uint8((bits >> 8) & 0xff);

            assertEq((b0 & 1) != 0, sane);
            assertEq((b1 & 1) != 0, isExit);
            if (allow) {
                assertTrue(sane, "Allow requires sane");
                assertTrue(isExit || buyAllowed, "Allow requires isExit or buyAllowed");
            }
        }
    }
}
