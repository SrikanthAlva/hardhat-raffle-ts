import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { VERIFICATION_BLOCK_CONFIRMATIONS, developmentChains } from "../helper-hardhat-config"
import { networkConfig } from "../helper-hardhat-config"
import verify from "../utils/verify"

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2")

const deployRaffle: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, network, getNamedAccounts } = hre
    const { deploy, log } = deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0]
    const chainId = network.config.chainId || 31337
    let waitConfirmations
    let entrancefee
    let vrfCoordinatorV2Address, gasLane, subscriptionId, callbackGasLimit, interval

    if (developmentChains.includes(networkConfig[chainId].name!)) {
        waitConfirmations = 1
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId
        //Fund the subscription
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        waitConfirmations = VERIFICATION_BLOCK_CONFIRMATIONS
        vrfCoordinatorV2Address = networkConfig[chainId].vrfCoordinatorV2
        subscriptionId = networkConfig[chainId].subscriptionId
    }

    entrancefee = networkConfig[chainId].raffleEntranceFee
    gasLane = networkConfig[chainId].gasLane
    callbackGasLimit = networkConfig[chainId].callbackGasLimit
    interval = networkConfig[chainId].keepersUpdateInterval

    const args: any[] = [
        entrancefee,
        vrfCoordinatorV2Address,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval,
    ]
    log("----------------------------------------------------")
    const raffle = await deploy("Raffle", {
        contract: "Raffle",
        args: args,
        from: deployer.address,
        log: true,
        waitConfirmations: waitConfirmations,
    })

    if (
        !developmentChains.includes(networkConfig[chainId].name!) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        log("Verifying...")
        await verify(raffle.address, args)
    }
    log("----------------------------------------------------")
}

export default deployRaffle
deployRaffle.tags = ["all", "raffle"]
