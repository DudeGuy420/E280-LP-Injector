// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IWhitelistRegistry {
    function isWhitelisted(address account) external view returns (bool);
    function setWhitelisted(address[] calldata accounts, bool _isWhitelisted) external;
}
