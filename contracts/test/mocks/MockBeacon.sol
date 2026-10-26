// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IBeacon} from "../../src/interfaces/IBeacon.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockBeacon is IBeacon, Ownable {
    address private _implementation;

    constructor(address initialImpl, address initialOwner)
        Ownable(initialOwner == address(0) ? msg.sender : initialOwner)
    {
        _implementation = initialImpl;
        if (initialOwner == address(0)) {
            _transferOwnership(address(0));
        }
    }

    function implementation() external view returns (address) {
        return _implementation;
    }

    function setImplementation(address newImpl) external {
        _implementation = newImpl;
    }
}
