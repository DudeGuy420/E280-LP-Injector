import routerAbi from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import pairV2Abi from "@uniswap/v2-periphery/build/IUniswapV2Pair.json";
import factoryV2Abi from "@uniswap/v2-periphery/build/IUniswapV2Factory.json";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers, network } from "hardhat";
import { DEBUG, UNISWAP_V2_ROUTER, SLIPPAGE, UNISWAP_V2_FACTORY, E280_ADDRESS } from "./constants";

export async function makeSnapshot() {
    return await network.provider.send("evm_snapshot");
}

export async function revertSnaphsot(snaphot: any) {
    await network.provider.send("evm_revert", [snaphot]);
    return makeSnapshot();
}

export async function getDeadline(seconds: number = 100) {
    const timestamp = await time.latest();
    return timestamp + seconds;
}

export function applyPercentage(amount: bigint, percentage: number | bigint) {
    return (amount * BigInt(percentage)) / 100n;
}

export function applyTax(amount: bigint, tax: number | bigint = 400) {
    return amount - applyBPS(amount, tax);
}

export function applySlippage(amount: bigint) {
    return applyPercentage(amount, 100 - SLIPPAGE);
}

export function applyMaxAmountSlippage(amount: bigint) {
    return applyPercentage(amount, 100 + SLIPPAGE);
}

export function applyBPS(amount: bigint, bps: number | bigint) {
    return (amount * BigInt(bps)) / 10000n;
}

export async function passDays(days: number, delta: number = 0) {
    await time.increase(86400 * days + delta);
}

export async function passHours(hours: number, delta: number = 0) {
    await time.increase(3600 * hours + delta);
}

export async function fundWallet(token: any, userFrom: string, userTo: any) {
    const user = await ethers.getImpersonatedSigner(userFrom);
    await userTo.sendTransaction({ value: ethers.parseEther("0.5"), to: user });
    const balance = await token.balanceOf(user);
    await token.connect(user).transfer(userTo, balance);
    const newBalance = await token.balanceOf(userTo);
    if (newBalance === 0n) throw new Error(`Zero balance for user ...${userFrom.slice(-5)}`);
    return newBalance;
}

export function formatTokenString(value_: string | bigint) {
    const value = typeof value_ === "string" ? ethers.parseEther(value_) : value_;
    if (value === 0n) return "0";
    const lowerLimit = 1n * 10n ** 15n; // 0.001 ETH in Wei
    if (value > 0 && value < lowerLimit) {
        return "<0.001";
    }
    const numberString = ethers.formatEther(value);
    const [whole, decimal] = numberString.split(".");

    let reversedWhole = whole.split("").reverse().join("");
    let spacedWhole = reversedWhole.match(/.{1,3}/g)!.join(",");
    let formattedWhole = spacedWhole.split("").reverse().join("");

    let formattedDecimal = decimal ? (decimal !== "0" ? "." + decimal.slice(0, 3) : "") : "";
    if (formattedDecimal === ".000") formattedDecimal = "";
    return formattedWhole + formattedDecimal;
}

export async function getPair(token0Address: any, token1Address: any) {
    const factoryV2 = new ethers.Contract(UNISWAP_V2_FACTORY, factoryV2Abi.abi, ethers.provider);
    const pairAddress = await factoryV2.getPair(token0Address, token1Address);
    const pair = new ethers.Contract(pairAddress, pairV2Abi.abi, ethers.provider);
    return pair;
}

export async function getQuoteV2(tokenIn: any, tokenOut: any, amountIn: bigint, showValues: boolean = false) {
    const routerV2 = await ethers.getContractAt("IUniswapV2Router02", UNISWAP_V2_ROUTER);
    const [, amountOut] = await routerV2.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    if (showValues) {
        console.log("Amount in: ", ethers.formatEther(amountIn));
        console.log("Estimated amount out:", ethers.formatEther(amountOut));
    }

    return amountOut;
}

export async function calculateOptimalLiquidityForV2AfterSwap(
    baseBalance: bigint,
    targetBalance: bigint,
    targetAddress: string,
    swapIn: bigint,
    swapOut: bigint,
    baseAddress: string = E280_ADDRESS
): Promise<{ amountDesiredTarget: bigint; amountDesiredBase: bigint }> {
    const pair = await getPair(targetAddress, baseAddress);
    const token0 = await pair.token0();
    const isTargetToken0 = token0.toLowerCase() === targetAddress.toLowerCase();
    const [reserve0, reserve1] = await pair.getReserves();

    let reserveTarget: bigint, reserveBase: bigint;
    if (isTargetToken0) {
        reserveTarget = reserve0 - swapOut;
        reserveBase = reserve1 + swapIn;
    } else {
        reserveTarget = reserve1 - swapOut;
        reserveBase = reserve0 + swapIn;
    }

    // This mirrors Uniswap's addLiquidity logic
    const amountBOptimal = (baseBalance * reserveTarget) / reserveBase;

    if (amountBOptimal <= targetBalance) {
        return {
            amountDesiredBase: baseBalance,
            amountDesiredTarget: amountBOptimal,
        };
    } else {
        const amountAOptimal = (targetBalance * reserveBase) / reserveTarget;
        return {
            amountDesiredBase: amountAOptimal,
            amountDesiredTarget: targetBalance,
        };
    }
}
