// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {MandateVault} from "../../src/MandateVault.sol";
import {Limits, TradeParams} from "../../src/types/DataTypes.sol";

contract MandateVaultHarness is MandateVault {
    function exposedInputBits(TradeParams calldata p) external view returns (uint16 bits, bool isExit) {
        return _inputBits(p);
    }

    function exposedIsAllowedByCircuit(uint16 bits) external view returns (bool) {
        return _isAllowedByCircuit(bits);
    }

    function exposedPackInputs(uint16 bits) external pure returns (bytes memory) {
        return _packInputs(bits);
    }

    function setTestState(
        Limits calldata newLimits,
        bool newFrozen,
        uint64 newDayIndex,
        uint16 newTradesToday,
        uint128 newBuyVolumeTodayBase,
        uint64 newLastBuyAt
    ) external {
        limits = newLimits;
        frozen = newFrozen;
        dayIndex = newDayIndex;
        tradesToday = newTradesToday;
        buyVolumeTodayBase = newBuyVolumeTodayBase;
        lastBuyAt = newLastBuyAt;
    }

    function setTokenAllowed(address token, bool isAllowed) external {
        allowedTokens[token] = isAllowed;
    }

    function setBaseToken(address token) external {
        baseToken = token;
    }
}
