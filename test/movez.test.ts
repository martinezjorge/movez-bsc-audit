import { expect } from "chai";
import { Snapshot, tokens, increaseTime, deadline, ether, ZeroAddress } from "./helpers";
import { ethers, upgrades } from "hardhat";
import { MOVEZ, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02, WETH9 } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("MOVEZ", () => {

  let movez: MOVEZ;
  let factory: UniswapV2Factory;
  let router: UniswapV2Router02;
  let pair: UniswapV2Pair;
  let weth: WETH9;
  let owner: SignerWithAddress;
  let signers: SignerWithAddress[];
  let traders: SignerWithAddress[];
  let trader1: SignerWithAddress;
  let trader2: SignerWithAddress;
  let trader3: SignerWithAddress;
  let trader4: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let feeFund: SignerWithAddress;

  // Time Constants
  const oneMinute: number = 60;
  const oneHour: number = 60 * oneMinute;
  const oneDay: number = oneHour * 24;
  const oneWeek: number = oneDay * 7;
  const oneYear: number = oneDay * 365;

  let deployed: Snapshot;
  let deployWithTokens: Snapshot;
  let deployWithoutLGE: Snapshot;
  let deployWithLGE: Snapshot;
  let deployWithLGEWithTokens: Snapshot;
  let deployWithoutLGEWithTokens: Snapshot;


  /**
   * Deploy with LGE Whitelist
   * 
   * Deploy Without LGE Whitelist
   * 
   * Deploy With tokens
   * 
   * Deploy without tokens
   */

  before("Deployment Snapshots", async () => {

    signers = await ethers.getSigners();
    owner = signers[0];
    trader1 = signers[1];
    trader2 = signers[2];
    trader3 = signers[3];
    trader4 = signers[4];
    feeFund = signers[5]
    feeRecipient = signers[6];

    traders = [trader1, trader2, trader3, trader4];

    // TODO: Deploy Uniswap
    const Factory = await ethers.getContractFactory('UniswapV2Factory');
    factory = await Factory.deploy(owner.address) as UniswapV2Factory;
    await factory.deployed();

    const WETH = await ethers.getContractFactory('WETH9');
    weth = (await WETH.deploy()) as WETH9;
    await weth.deployed();

    const Router = await ethers.getContractFactory('UniswapV2Router02');
    router = (await Router.deploy(factory.address, weth.address)) as UniswapV2Router02;

    let feeEcoPct: number = 100;
    let feeEcoAddress: string = feeRecipient.address;
    let feeFundPct: number = 100;
    let feeFundAddress: string = feeFund.address;

    const MOVEZ = await ethers.getContractFactory("MOVEZ");
    movez = await (upgrades.deployProxy(MOVEZ, [feeEcoPct, feeEcoAddress, feeFundPct, feeFundAddress, router.address], { initializer: 'initialize' })) as MOVEZ;
    await movez.deployed();

    deployed = new Snapshot();
    await deployed.snapshot();

    // lets mint some tokens to the owner
    await movez.mint(owner.address, tokens("100000"));

    await owner.sendTransaction({
      to: weth.address,
      value: ether("500")
    });

    for (const trader of traders) {
      await trader.sendTransaction({
        to: weth.address,
        value: ether("500")
      });
    }

    // MOVEZ contract createPair during deployment
    let pairAddress: string = await factory.getPair(movez.address, weth.address);
    pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);

    deployWithoutLGE = new Snapshot();
    await deployWithoutLGE.snapshot();

    let durations = [1200];
    let amountsMax = [tokens("10000")];
    const whitelistAddresses: string[] = [trader1.address, trader2.address]

    await movez.createLGEWhitelist(router.address, durations, amountsMax);
    await movez.modifyLGEWhitelist(0, 1200, tokens("10000"), whitelistAddresses, true);

    await movez.connect(owner).approve(router.address, tokens("100000"));
    await weth.connect(owner).approve(router.address, ether("200"));
    await router.connect(owner).addLiquidity(movez.address, weth.address, tokens("100"), ether("20"), 0, 0, owner.address, deadline(oneMinute * 30));

    // Just a thought, try to make multiple snapshots
    deployWithLGE = new Snapshot();
    await deployWithLGE.snapshot();

    for (const trader of traders) {
      await movez.mint(trader.address, tokens("100"));
    }

    deployWithLGEWithTokens = new Snapshot();
    await deployWithLGEWithTokens.snapshot();
    await deployWithoutLGE.revert();

    for (const trader of traders) {
      await movez.mint(trader.address, tokens("100"));
    }

    deployWithoutLGEWithTokens = new Snapshot();
    await deployWithoutLGEWithTokens.snapshot();
  });

  afterEach("Revert", async () => {
    await deployWithLGE.revert();
  });

  describe("Deployment", () => {

    beforeEach("Fresh Deployment", async () => {
      await deployed.revert();
    });

    it("Should be named MOVEZ.me", async function () {
      expect(await movez.name()).equal("MOVEZ.me");
    });

    it("Should have 18 decimals", async function () {
      expect(await movez.decimals()).equal(18);
    });

    it("Should have MOVEZ as the symbol", async function () {
      expect(await movez.symbol()).equal("MOVEZ");
    });

    it("it is owned by deployer after deployment", async () => {
      expect(await movez.owner()).equal(owner.address);
    });

    it("lets the owner change the router address", async () => {
      await movez.setRouter(trader1.address);
      expect(await movez._router()).equal(trader1.address);
    });

    // afterEach("", async () => {

    // });

  });

  describe("Ownership", () => {

    it("", async () => {

    });

  });

  describe("Blacklist", () => {

    beforeEach("", async ()=> {
      // we should give some users tokens at least
      // await deployWithTokens.revert();
    });

    it("lets you blacklist users that are not allowed to trade", async () => {

      await deployWithLGEWithTokens.revert();

      await movez.setExcluded([
        trader1.address,
        trader2.address
      ], true);

      // can't transfer from excluded
      await expect(movez.connect(trader1).transfer(trader2.address, tokens("10")))
        .revertedWith("ERC20: transfer excluded");
      await expect(movez.connect(trader2).transfer(trader3.address, tokens("10")))
        .revertedWith("ERC20: transfer excluded");
      // can't transfer to excluded
      await expect(movez.connect(trader3).transfer(trader1.address, tokens("10")))
        .revertedWith("ERC20: transfer excluded");
      // unexcluded can transfer to unexcluded
      console.log(ethers.utils.formatUnits(await movez.balanceOf(trader3.address), 18));
      await movez.connect(trader3).transfer(trader4.address, tokens("10"));
      // expect(await movez.balanceOf(trader3.address)).equal(tokens("90"));
      // expect(await movez.balanceOf(trader4.address)).equal(tokens("110"));
    });
  });

  describe("LGE Whitelist", () => {

    beforeEach("", async () => {
      // have whitelist created already
      await deployWithLGE.revert();
    });

    // deploy without a whitelist
    it("lets the owner create a whitelist", async () => {

      // await deployWithoutLGE.revert();
      let durations = [1200];
      let amountsMax = [tokens("10000")];
      const whitelistAddresses: string[] = [trader1.address, trader2.address]
  
      await movez.createLGEWhitelist(router.address, durations, amountsMax);
      await movez.modifyLGEWhitelist(0, 1200, tokens("10000"), whitelistAddresses, true);
    });

  });

});
