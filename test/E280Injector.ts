import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import {
    applyBPS,
    applySlippage,
    applyTax,
    calculateOptimalLiquidityForV2AfterSwap,
    getDeadline,
    getPair,
    getQuoteV2,
    makeSnapshot,
    passDays,
    revertSnaphsot,
} from "../config/utils";
import { deployFixture, doubleInjectorFixture, singleInjectorFixture } from "../config/fixtures";

describe("E280 LP Injector", function () {
    describe("Deployment", function () {
        it("Should set the right addresses", async function () {
            const { injector, owner } = await loadFixture(deployFixture);
            expect(await injector.owner()).to.eq(owner);
        });
    });
    describe("INJECTION", function () {
        it("Should revert on 0 tokens whitelisted", async function () {
            const { injector, user } = await loadFixture(deployFixture);
            await expect(injector.connect(user).inject(0, 0, 0, await getDeadline())).to.be.revertedWithCustomError(injector, "InjectorDisabled");
        });
        it("Should revert on not whitelisted", async function () {
            const { injector, user2 } = await loadFixture(deployFixture);
            await expect(injector.connect(user2).inject(0, 0, 0, await getDeadline())).to.be.revertedWithCustomError(injector, "Unauthorized");
        });
        it("Should revert on 0 balance", async function () {
            const { injector, user, owner, h420 } = await loadFixture(deployFixture);
            await injector.connect(owner).addToken(h420);
            await expect(injector.connect(user).inject(0, 0, 0, await getDeadline())).to.be.revertedWithCustomError(injector, "InsufficientBalance");
        });
        it("Should Inject", async function () {
            const { e280, injector, user, h420, incentiveFeeBps } = await loadFixture(singleInjectorFixture);

            const [_callAmount, tokenBalance, incentive, _nextAvailable, nextToken] = await injector.getInjectionParams();
            expect(_callAmount).to.gt(0);
            expect(nextToken).to.eq(h420);
            expect(incentive).to.eq(applyBPS(_callAmount, incentiveFeeBps));
            const callAmount = _callAmount - incentive;
            const pair = await getPair(e280.target, h420.target);

            const amountIn = callAmount / 2n;
            const amountOut = await getQuoteV2(e280.target, h420.target, amountIn);
            const minAmount = applySlippage(amountOut);

            const { amountDesiredTarget, amountDesiredBase } = await calculateOptimalLiquidityForV2AfterSwap(
                callAmount - amountIn,
                amountOut + tokenBalance,
                h420.target.toString(),
                amountIn,
                amountOut
            );

            const minAmountAddE280 = applySlippage(amountDesiredBase);
            const minAmountAddToken = applySlippage(amountDesiredTarget);

            let snaphot = await makeSnapshot();
            await expect(injector.connect(user).inject(minAmount, minAmountAddE280, minAmountAddToken, await getDeadline())).to.changeTokenBalances(
                e280,
                [injector, user, pair],
                [-(amountIn + incentive + amountDesiredBase), incentive, amountIn + amountDesiredBase]
            );
            snaphot = await revertSnaphsot(snaphot);
            await expect(injector.connect(user).inject(minAmount, minAmountAddE280, minAmountAddToken, await getDeadline())).to.changeTokenBalances(
                h420,
                [injector, user, pair],
                [amountOut - amountDesiredTarget, 0, amountDesiredTarget - amountOut]
            );

            await expect(
                injector.connect(user).inject(minAmount, amountDesiredBase, amountDesiredTarget, await getDeadline())
            ).to.be.revertedWithCustomError(injector, "Cooldown");
            expect(await injector.nextTokenIndex()).to.eq(0);
        });
        it("Should Inject Taxed token", async function () {
            const { e280, injector, user, s88, incentiveFeeBps } = await loadFixture(doubleInjectorFixture);

            await injector.connect(user).inject(0, 0, 0, await getDeadline());

            const [_callAmount, tokenBalance, incentive, nextAvailable, nextToken] = await injector.getInjectionParams();
            expect(_callAmount).to.gt(0);
            expect(nextToken).to.eq(s88);
            expect(incentive).to.eq(applyBPS(_callAmount, incentiveFeeBps));
            const callAmount = _callAmount - incentive;
            const pair = await getPair(e280.target, s88.target);
            await time.increaseTo(nextAvailable);

            const amountIn = callAmount / 2n;
            const amountOut = await getQuoteV2(e280.target, s88.target, amountIn);
            const amountOutAfterTax = applyTax(amountOut);
            const minAmount = applySlippage(amountOutAfterTax);

            const { amountDesiredTarget, amountDesiredBase } = await calculateOptimalLiquidityForV2AfterSwap(
                callAmount - amountIn,
                amountOutAfterTax + tokenBalance,
                s88.target.toString(),
                amountIn,
                amountOut
            );

            const minAmountAddE280 = applySlippage(amountDesiredBase);
            const minAmountAddToken = applySlippage(amountDesiredTarget);

            let snaphot = await makeSnapshot();
            await expect(injector.connect(user).inject(minAmount, minAmountAddE280, minAmountAddToken, await getDeadline())).to.changeTokenBalances(
                e280,
                [injector, user, pair],
                [-(amountIn + incentive + amountDesiredBase), incentive, amountIn + amountDesiredBase]
            );
            snaphot = await revertSnaphsot(snaphot);
            await expect(injector.connect(user).inject(minAmount, minAmountAddE280, minAmountAddToken, await getDeadline())).to.changeTokenBalances(
                s88,
                [injector, user, pair],
                [amountOutAfterTax - amountDesiredTarget, 0, applyTax(amountDesiredTarget) - amountOut]
            );

            await expect(
                injector.connect(user).inject(minAmount, amountDesiredBase, amountDesiredTarget, await getDeadline())
            ).to.be.revertedWithCustomError(injector, "Cooldown");
            expect(await injector.nextTokenIndex()).to.eq(0);
        });
    });
    describe("List interactions", function () {
        it("Should catch duplicate / missing token", async function () {
            const { injector, owner, h420, s88 } = await loadFixture(singleInjectorFixture);
            const tokens = await injector.getWhitelistedTokens();
            await expect(injector.connect(owner).addToken(h420)).to.be.revertedWithCustomError(injector, "DuplicateToken");
            await expect(injector.connect(owner).removeToken(s88)).to.be.revertedWithCustomError(injector, "TokenNotWhitelisted");
            expect(await injector.getWhitelistedTokens()).to.eql(tokens);
        });
        it("Should add new token", async function () {
            const { injector, user, owner, b88, h420 } = await loadFixture(doubleInjectorFixture);
            await injector.connect(user).inject(0, 0, 0, await getDeadline());
            expect(await injector.nextTokenIndex()).to.eq(1);
            await injector.connect(owner).addToken(b88);
            expect(await injector.nextTokenIndex()).to.eq(1);
            await passDays(1);
            await injector.connect(user).inject(0, 0, 0, await getDeadline());
            expect(await injector.nextTokenIndex()).to.eq(2);
            await injector.connect(owner).removeToken(h420);
            const [, , , , nextToken] = await injector.getInjectionParams();
            expect(await injector.nextTokenIndex()).to.eq(0);
            expect(nextToken).to.eq(b88);
        });
        it("Should reset to 0 if over the end", async function () {
            const { injector, user, owner, h420 } = await loadFixture(doubleInjectorFixture);
            await injector.connect(user).inject(0, 0, 0, await getDeadline());
            expect(await injector.nextTokenIndex()).to.eq(1);
            await injector.connect(owner).removeToken(h420);
            expect(await injector.nextTokenIndex()).to.eq(0);
        });
    });
});
