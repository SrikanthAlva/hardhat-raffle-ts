import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { developmentChains, networkConfig } from "../helper-hardhat-config"

const BASE_FEE = ethers.utils.parseEther("0.25") // 0.25 is this the premium in LINK?
const GAS_PRICE_LINK = 1e9 // link per gas, is this the gas lane? // 0.000000001 LINK per gas

const deployMock: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, network } = hre
    const { deploy, log } = deployments
    const accounts = await ethers.getSigners()
    const deployer: SignerWithAddress = accounts[0]
    const chainId = network.config.chainId || 31337
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if (developmentChains.includes(networkConfig[chainId].name!)) {
        log("Local network detected! Deploying mocks...")
        await deploy("VRFCoordinatorV2Mock", {
            log: true,
            args: args,
            from: deployer.address,
        })
        log("Mocks Deployed!")
        log("----------------------------------")

        log("You are deploying to a local network, you'll need a local network running to interact")
        log(
            "Please run `yarn hardhat console --network localhost` to interact with the deployed smart contracts!"
        )
        log("----------------------------------")
    }
}

export default deployMock
deployMock.tags = ["all", "mocks"]
