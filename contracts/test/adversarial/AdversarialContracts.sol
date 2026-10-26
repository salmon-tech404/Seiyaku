// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {MockERC20} from "../mocks/MockERC20.sol";
import {ISwapRouter02} from "../../src/interfaces/ISwapRouter02.sol";
import {IProcessor} from "../../src/interfaces/IProcessor.sol";
import {IMandateVault} from "../../src/interfaces/IMandateVault.sol";
import {TradeParams} from "../../src/types/DataTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MaliciousTokenReturnsFalse is MockERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals_) MockERC20(name, symbol, decimals_) {}

    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

contract MaliciousTokenFeeOnTransfer is MockERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals_) MockERC20(name, symbol, decimals_) {}

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 10; // 10% fee
        return super.transfer(to, amount - fee);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 10;
        return super.transferFrom(from, to, amount - fee);
    }
}

contract MaliciousCircuitLongData is IProcessor {
    function netlist(uint256) external pure returns (bytes memory) {
        return hex"000000030000040000000b00000b";
    }

    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        // Return 1024 bytes of garbage with lowest bit 0
        bytes memory longData = new bytes(1024);
        for (uint256 i = 0; i < 1024; i++) {
            longData[i] = bytes1(0xaa); // 0xaa & 1 == 0
        }
        return longData;
    }
}

contract MaliciousCircuitReturnsTwo is IProcessor {
    function netlist(uint256) external pure returns (bytes memory) {
        return hex"000000030000040000000b00000b";
    }

    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        bytes memory out = new bytes(1);
        out[0] = bytes1(0x02); // lowest bit is 0!
        return out;
    }
}

contract GriefingTrader {
    IMandateVault public vault;

    constructor(IMandateVault _vault) {
        vault = _vault;
    }

    function spamFreeze() external {
        vault.freeze();
    }

    function spamCancelLoosen() external {
        vault.cancelLoosen();
    }
}
