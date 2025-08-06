// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

interface IE280 is IERC20 {
    function setWhitelistStatus(address _address, bool _to, bool _from) external;
}
