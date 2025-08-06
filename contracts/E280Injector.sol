// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./lib/Constants.sol";

/// @title E280 LP Injector Contract
contract E280Injector is Ownable2Step {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    // -------------------------- STATE VARIABLES -------------------------- //

    /// @notice Next token in the array to be used for injection.
    uint16 public nextTokenIndex;

    /// @notice Basis point incentive fee paid out for calling Inject function.
    uint16 public incentiveFeeBps = 3;

    /// @notice Cooldown interval for injection calls in seconds.
    uint32 public interval = 60 minutes;

    /// @notice Timestamp of the last performed injection.
    uint256 public lastInjection;

    /// @notice Maximum amount of E280 to be swapped and then injected in a single call.
    uint256 public capPerCall = 1_000_000_000 ether;

    EnumerableSet.AddressSet private _whitelistedTokens;

    // ------------------------------- EVENTS ------------------------------ //

    event Injection();
    event SettingsUpdated();

    // ------------------------------- ERRORS ------------------------------ //

    error Cooldown();
    error Prohibited();
    error InjectorDisabled();
    error ZeroAddress();
    error InsufficientBalance();
    error Unauthorized();

    // ------------------------------ MODIFIERS ---------------------------- //

    modifier onlyWhitelisted() {
        if (!WL_REGISTRY.isWhitelisted(msg.sender)) revert Unauthorized();
        _;
    }

    // ----------------------------- CONSTRUCTOR --------------------------- //

    constructor(address _owner) Ownable(_owner) {}

    // --------------------------- PUBLIC FUNCTIONS ------------------------ //

    /// @notice Uses E280 balance to add to the next E280 pair.
    /// @param minAmountOut Minimum amount of Target tokens to receive from E280 swap (in WEI).
    /// @param amountDesiredE280 Minimum amount of E280 tokens to add to the E280 pair (in WEI).
    /// @param amountDesiredToken Minimum amount of Target tokens to add to the E280 pair (in WEI).
    /// @param deadline Deadline to perform the transaction (in seconds).
    function inject(
        uint256 minAmountOut,
        uint256 amountDesiredE280,
        uint256 amountDesiredToken,
        uint256 deadline
    ) external onlyWhitelisted {
        if (_whitelistedTokens.length() == 0) revert InjectorDisabled();
        if (lastInjection + interval > block.timestamp) revert Cooldown();
        address tokenAddress =  _whitelistedTokens.at(nextTokenIndex);
        IERC20 e280 = IERC20(E280);
        IERC20 token = IERC20(tokenAddress);
        uint256 e280Balance = e280.balanceOf(address(this));
        uint256 callAmount = e280Balance > capPerCall ? capPerCall : e280Balance;
        if (callAmount == 0) revert InsufficientBalance();

        lastInjection = block.timestamp;
        callAmount = _processIncentiveFee(callAmount);

        uint256 half = callAmount / 2;
        uint256 e280InjectionAmount = callAmount - half;
        _swapFeeToken(E280, tokenAddress, half, minAmountOut, deadline);

        uint256 tokenBalance = token.balanceOf(address(this));

        e280.safeIncreaseAllowance(UNISWAP_V2_ROUTER, e280InjectionAmount);
        token.safeIncreaseAllowance(UNISWAP_V2_ROUTER, tokenBalance);

        (uint256 e280Used, uint256 tokenUsed, ) = IUniswapV2Router02(UNISWAP_V2_ROUTER).addLiquidity(
            E280,
            tokenAddress,
            e280InjectionAmount,
            tokenBalance,
            amountDesiredE280,
            amountDesiredToken,
            address(0),
            deadline
        );

        if (e280Used < e280InjectionAmount) {
            e280.safeDecreaseAllowance(UNISWAP_V2_ROUTER, e280InjectionAmount - e280Used);
        }
        if (tokenUsed < tokenBalance) {
            token.safeDecreaseAllowance(UNISWAP_V2_ROUTER, tokenBalance - tokenUsed);
        }

        emit Injection();
    }

    // ----------------------- ADMINISTRATIVE FUNCTIONS -------------------- //

    /// @notice Adds a new token to the Whitelist.
    /// @param token Address of the Target token.
    function addToken(address token) external onlyOwner {
        _whitelistedTokens.add(token);
        emit SettingsUpdated();
    }

    /// @notice Removes a token from the Whitelist.
    /// @param token Address of the Target token.
    function removeToken(address token) external onlyOwner {
        if (_whitelistedTokens.remove(token)) {
            if (nextTokenIndex >= _whitelistedTokens.length()) {
                nextTokenIndex = 0;
            }
        }
        emit SettingsUpdated();
    }

    /// @notice Sets the cap per call limit applied to E280 balance.
    /// @param limit Max amount of E280 tokens to be used in a single injection (in WEI).
    function setCapPerCall(uint256 limit) external onlyOwner {
        capPerCall = limit;
        emit SettingsUpdated();
    }

    /// @notice Sets a new cooldown interval for injection calls.
    /// @param limit Cooldown interval in seconds.
    function setInterval(uint32 limit) external onlyOwner {
        if (limit == 0) revert Prohibited();
        interval = limit;
        emit SettingsUpdated();
    }

    /// @notice Sets a new incentive fee basis points.
    /// @param bps Incentive fee in basis points (1% = 100 bps).
    function setIncentiveFee(uint16 bps) external onlyOwner {
        if (bps < 1 || bps > 10_00) revert Prohibited();
        incentiveFeeBps = bps;
        emit SettingsUpdated();
    }

    // ---------------------------- VIEW FUNCTIONS ------------------------- //

    /// @notice Returns parameters for the next Injection.
    /// @return Array of currently whitelisted token.
    function getWhitelistedTokens() external view returns (address[] memory) {
        return _whitelistedTokens.values();
    }

    /// @notice Returns parameters for the next Injection.
    /// @return amount E280 amount used in the next call.
    /// @return tokenBalance Current token balance of the contract.
    /// @return incentive E280 amount paid out to the caller.
    /// @return nextAvailable Timestamp in seconds when next Injection will be available.
    /// @return nextToken Next token that will be used in the injection.
    function getInjectionParams() external view returns (uint256 amount, uint256 tokenBalance, uint256 incentive, uint256 nextAvailable, IERC20 nextToken) {
        if (_whitelistedTokens.length() == 0) revert InjectorDisabled();
        nextToken = IERC20(_whitelistedTokens.at(nextTokenIndex));
        uint256 e280Balance = IERC20(E280).balanceOf(address(this));
        tokenBalance = nextToken.balanceOf(address(this));
        amount = e280Balance > capPerCall ? capPerCall : e280Balance;
        incentive = (amount * incentiveFeeBps) / BPS_BASE;
        nextAvailable = lastInjection + interval;
    }

    // -------------------------- INTERNAL FUNCTIONS ----------------------- //

    function _processIncentiveFee(uint256 amount) internal returns (uint256) {
        uint256 incentive = (amount * incentiveFeeBps) / BPS_BASE;
        IERC20(E280).safeTransfer(msg.sender, incentive);
        return amount - incentive;
    }

    function _swapFeeToken(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) internal {
        IERC20(tokenIn).safeIncreaseAllowance(UNISWAP_V2_ROUTER, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        IUniswapV2Router02(UNISWAP_V2_ROUTER).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            deadline
        );
    }
}
