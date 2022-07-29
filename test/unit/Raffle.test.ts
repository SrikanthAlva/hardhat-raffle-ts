import { developmentChains, networkConfig } from "../../helper-hardhat-config"
import { ethers, network, deployments } from "hardhat"
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types"
import { BigNumber } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { assert, expect } from "chai"

const chainId = network.config.chainId || 31337

//describe blocks are normal functions
// beforeEach and it blocks are async functions

!developmentChains.includes(networkConfig[chainId].name!)
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
          let raffle: Raffle
          let raffleContract: Raffle
          let vrfCoordinatorV2Mock: VRFCoordinatorV2Mock
          let raffleEntranceFee: BigNumber
          let interval: number
          let player: SignerWithAddress
          let accounts: SignerWithAddress[]

          beforeEach(async () => {
              accounts = await ethers.getSigners()
              player = accounts[0]
              await deployments.fixture(["all"])
              raffleContract = await ethers.getContract("Raffle")
              raffle = await raffleContract.connect(player)
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  player.address
              )
              interval = (await raffle.getInterval()).toNumber()
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("constructor", () => {
              it("initailizes raffle correctly", async () => {
                  const raffleState = await raffle.getRaffleState()
                  // const ownerAddress = await raffle.getOwnerAddress()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId].keepersUpdateInterval!)
                  // assert.equal(ownerAddress, player.address)
              })
          })

          describe("enterRaffle", () => {
              it("reverts when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETH"
                  )
              })

              it("records players when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })

                  const playerAddress = await raffle.getPlayer(0)
                  const playersCount = (await raffle.getNumberOfPlayers()).toNumber()
                  assert.equal(playerAddress, player.address)
                  assert.equal(playersCount.toString(), "1")
              })

              it("emits an event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })

              it("doesn't allow entrace when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  // await network.provider.request({method: "evm_mine", params:[]})
                  await network.provider.send("evm_mine", [])
                  // Pretend to be Chainlink Keeper
                  // Blank bytes object can be represented by [] or "0x"
                  await raffle.performUpkeep([])
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
              })
          })

          describe("checkUpkeep", () => {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])
                  // callStatic will simulate the transaction without adding the transaction
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isnt open ", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  // callStatic will simulate the transaction without adding the transaction
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval - 8])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", () => {
              it("can only run if check_Upkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x")
                  assert(txResponse)
              })

              it("reverts when check_Upkeep is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpkeepNotNeeded"
                  )
              })
              it("updates raffleState, emits event and calls vrfcoordinator", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt!.events![1].args!.requestId
                  // console.log(txReceipt!.events!)
                  const raffleState = await raffle.getRaffleState()

                  await expect(txResponse).to.emit(vrfCoordinatorV2Mock, "RandomWordsRequested")
                  assert.equal(raffleState.toString(), "1")
                  expect(requestId).to.be.greaterThan(0)
              })
          })

          describe("fulfillRandomWords", () => {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
              it("can only be called after performUpkeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks winner, resets lottery and sends money to winner", async () => {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1
                  for (let i = startingAccountIndex; i <= additionalEntrants; i++) {
                      const connectedRaffle = await raffleContract.connect(accounts[i])
                      await connectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startTimestamp = await raffle.getLatestTimestamp()
                  let playerPlayers: string[] = accounts
                      .slice(0, additionalEntrants + 1)
                      .map((acnt) => acnt.address)
                  //   console.log("Played Player Address", playerPlayers)

                  // performUpkeep (mock being Chainlink Keeper)
                  // fulfullRandomWords (mock being Chainlink VRF)
                  // we will have to wait for the fulfullRandomWords to be called

                  // Create a listener for WinnerPicked Event to be triggered to
                  // continue checking the state of the contract
                  await new Promise<void>(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const endingTimestamp = await raffle.getLatestTimestamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              const winnerBalance = await accounts[1].getBalance()
                              //---------------------
                              const winnerIndex = playerPlayers.indexOf(recentWinner)
                              //   console.log("Recent Winner Index", winnerIndex)
                              const winnerStartBalances = allStartingBalance[winnerIndex]
                              const winnerEndBalances = await accounts[winnerIndex].getBalance()
                              //   console.log("Winner Start Balance", winnerStartBalances)
                              //   console.log("Winner End Balance", winnerEndBalances)
                              //---------------------
                              assert(numPlayers.toString(), "0")
                              assert(raffleState.toString(), "0")
                              assert(endingTimestamp > startTimestamp)
                              assert.equal(recentWinner.toString(), accounts[1].address)
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrants)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                              //---------------------
                              assert.equal(recentWinner.toString(), accounts[winnerIndex].address)
                              assert.equal(
                                  winnerEndBalances.toString(),
                                  winnerStartBalances
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrants)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                              //---------------------
                              resolve()
                          } catch (err) {
                              console.log("Error", err)
                              reject(err)
                          }
                      })
                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)
                      let allStartingBalance: BigNumber[] = []
                      for (let i = 0; i < additionalEntrants + 1; i++) {
                          let x = await accounts[i].getBalance()
                          allStartingBalance.push(x)
                      }
                      //   console.log("Start Balance of All Accounts", allStartingBalance)
                      const startingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt!.events![1].args!.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
