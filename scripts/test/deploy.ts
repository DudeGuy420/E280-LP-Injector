import { ethers } from "hardhat";
import { fundWallet } from "../../config/utils";
import {
    B88_ADDRESS,
    E280_ADDRESS,
    E280_HOLDER,
    E280_OWNER,
    H420_ADDRESS,
    S88_ADDRESS,
    WL_REGISTRY_ADDRESS,
    WL_REGISTRY_OWNER,
} from "../../config/constants";

async function main() {
    const [deployer, owner, user] = await ethers.getSigners();

    const e280Admin = await ethers.getImpersonatedSigner(E280_OWNER);
    const wlAdmin = await ethers.getImpersonatedSigner(WL_REGISTRY_OWNER);
    await deployer.sendTransaction({ to: wlAdmin, value: ethers.WeiPerEther });
    await deployer.sendTransaction({ to: e280Admin, value: ethers.WeiPerEther });

    /// Tokens
    const e280 = await ethers.getContractAt("IE280", E280_ADDRESS);
    const h420 = await ethers.getContractAt("IERC20", H420_ADDRESS);
    const s88 = await ethers.getContractAt("IERC20", S88_ADDRESS);
    const b88 = await ethers.getContractAt("IERC20", B88_ADDRESS);
    const wlRegistry = await ethers.getContractAt("IWhitelistRegistry", WL_REGISTRY_ADDRESS);

    const injectorFactory = await ethers.getContractFactory("E280Injector");
    const injector = await injectorFactory.deploy(owner);

    await e280.connect(e280Admin).setWhitelistStatus(injector, true, true);
    await wlRegistry.connect(wlAdmin).setWhitelisted([user], true);

    const userE280Balance = await fundWallet(e280, E280_HOLDER, user);

    await injector.connect(owner).addToken(s88);
    await injector.connect(owner).addToken(h420);
    await e280.connect(user).transfer(injector, userE280Balance);

    // adjust time
    const customTimestamp = Math.floor(new Date().getTime() / 1000);

    await ethers.provider.send("evm_setNextBlockTimestamp", [customTimestamp]);

    console.log("E280Injector DEPLOYED TO: ", injector.target);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
