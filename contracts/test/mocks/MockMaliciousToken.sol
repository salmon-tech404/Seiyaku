// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {MockERC20} from "./MockERC20.sol";
import {IMandateVault} from "../../src/interfaces/IMandateVault.sol";
import {TradeParams} from "../../src/types/DataTypes.sol";

contract MockMaliciousToken is MockERC20 {
    address public reenterTarget;
    TradeParams public reenterParams;
    bool public reenterOnTransfer;

    constructor(string memory name, string memory symbol, uint8 decimals_) MockERC20(name, symbol, decimals_) {}

    function setReentrancy(address target, TradeParams calldata p) external {
        reenterTarget = target;
        reenterParams = p;
        reenterOnTransfer = true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (reenterOnTransfer && reenterTarget != address(0)) {
            reenterOnTransfer = false; // prevent infinite loop
            IMandateVault(reenterTarget).trade(reenterParams);
        }
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (reenterOnTransfer && reenterTarget != address(0)) {
            reenterOnTransfer = false; // prevent infinite loop
            IMandateVault(reenterTarget).trade(reenterParams);
        }
        return super.transferFrom(from, to, amount);
    }
}
