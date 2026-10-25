// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Version
/// @notice Simple placeholder contract exposing version constant
contract Version {
    string public constant VERSION = "0.1.0";

    /// @notice Returns the contract version
    /// @return The semantic version string
    function getVersion() external pure returns (string memory) {
        return VERSION;
    }
}
