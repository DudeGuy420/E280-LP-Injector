import { ethers, run } from "hardhat";
import { LP_INJECTOR_BSC, OWNER } from "./constants";

async function main() {
    // const factory = await ethers.getContractFactory("E280Injector");
    // const contract = await factory.deploy(OWNER);
    // await contract.waitForDeployment();
    // console.log("E280Injector deployed to: ", contract.target);

    await run("verify:verify", {
        address: LP_INJECTOR_BSC,
        constructorArguments: [OWNER],
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
