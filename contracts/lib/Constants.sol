// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { IWhitelistRegistry } from "../interfaces/IWhitelistRegistry.sol";

// ===================== Contract Addresses ======================
address constant E280 = 0x058E7b30200d001130232e8fBfDF900590E0bAA9;
address constant UNISWAP_V2_ROUTER = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
IWhitelistRegistry constant WL_REGISTRY = IWhitelistRegistry(0x47E126330f9eF54FC9Ce64A672166C974A17ABDE);

uint16 constant BPS_BASE = 100_00;
