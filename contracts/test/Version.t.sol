// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Version} from "../src/Version.sol";

contract VersionTest is Test {
    Version internal versionContract;

    function setUp() public {
        versionContract = new Version();
    }

    function test_getVersion_returnsExpectedConstant() public view {
        assertEq(versionContract.getVersion(), "0.1.0");
        assertEq(versionContract.VERSION(), "0.1.0");
    }
}
