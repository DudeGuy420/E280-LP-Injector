import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.28",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    viaIR: true,
                },
            },
        ],
    },
    networks: {
        hardhat: {
            forking: {
                url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
                blockNumber: 33847525,
            },
            chainId: 8453,
            initialBaseFeePerGas: 44500,
        },
        localhost_base: {
            url: "http://127.0.0.1:8546", // Custom localhost for BASE fork
        },
        base: {
            url: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [process.env.PRIVATE_KEY!],
            timeout: 999999,
        },
        bsc: {
            url: `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [process.env.PRIVATE_KEY!],
            timeout: 999999,
        },
    },
    etherscan: {
        apiKey: {
            mainnet: process.env.ETHERSCAN_KEY!,
            base: process.env.BASE_ETHERSCAN_KEY!,
            bsc: process.env.BSC_EXPL_KEY!,
        },
    },
    gasReporter: {
        enabled: true,
        // currency: "USD",
        // gasPrice: 20,
        // gasPriceApi: "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice",
        // coinmarketcap: process.env.COINMKTCAP_API,
    },
};

export default config;
