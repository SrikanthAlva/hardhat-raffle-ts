import { developmentChains, networkConfig } from "../../helper-hardhat-config"
import { ethers, network, deployments } from "hardhat"
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types"
import { BigNumber } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { assert, expect } from "chai"

const chainId = network.config.chainId || 31337

// describe blocks are normal functions
// beforeEach and it blocks are async functions

developmentChains.includes(networkConfig[chainId].name!)
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
          let raffle: Raffle
          let raffleContract: Raffle
          let raffleEntranceFee: BigNumber
          let player: SignerWithAddress
          let accounts: SignerWithAddress[]

          beforeEach(async () => {
              accounts = await ethers.getSigners()
              player = accounts[0]
              //Not needed in staging as contract is already on chain
              raffleContract = await ethers.getContract("Raffle")
              raffle = await raffleContract.connect(player)
              //Mock is not needed in testnet and mainnet
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", () => {
              it("works with live chainlink keepers and Chainlink VRF, we get random number", async () => {
                  const startTimestamp = await raffle.getLatestTimestamp()

                  //setup the listener before we enter the raffle
                  // just in case blockchain moves really fast
                  // await rafle.enterRaffle({value: raffleEntranceFee})

                  await new Promise<void>(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Winner Picked Event Fired!!!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await accounts[0].getBalance()
                              const endingTimestamp = await raffle.getLatestTimestamp()

                              //   await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(raffleState.toString(), "0")
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              //   assert.equal(
                              //       winnerBalance.toString(),
                              //       winnerStartBalance.add(raffleEntranceFee).toString()
                              //   )
                              expect(endingTimestamp).to.be.greaterThan(startTimestamp)
                              resolve()
                          } catch (err) {
                              reject(err)
                          }
                      })
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      //   const winnerStartBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
