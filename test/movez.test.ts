import { expect } from "chai";
import { Snapshot, tokens, increaseTime, deadline, ether, ZeroAddress } from "./helpers";
import { ethers, upgrades } from "hardhat";
import { MOVEZ, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02, WETH9 } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { kill } from "process";
import { moveMessagePortToContext } from "worker_threads";

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

  // Snapshots
  let snapshot: Snapshot;

  const swapTokens = async (amountSold: BigNumber, tokenSold: MOVEZ | WETH9, tokenBought: MOVEZ | WETH9, router: UniswapV2Router02, trader: SignerWithAddress) => {
    await tokenSold.connect(trader).approve(router.address, amountSold);
    await router.connect(trader).swapExactTokensForTokensSupportingFeeOnTransferTokens(amountSold, 0, [tokenSold.address, tokenBought.address], trader.address, deadline(60));
};

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
    
    snapshot = new Snapshot();
    
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

    // Just a thought, try to make multiple snapshots
    
    for (const trader of traders) {
      await movez.mint(trader.address, tokens("100"));
    }

    await snapshot.snapshot();
  });

  afterEach("Revert", async () => {
    await snapshot.revert();
  });

  describe("Deployment", () => {

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

    it("should have a cap for 5 billion tokens", async () => {
      expect(await movez.cap()).equal(tokens("5000000000"));
    });
    
  });
  
  describe("Configuration", async () => {
    
    it("lets the owner change the router address", async () => {
      await movez.setRouter(trader1.address);
      expect(await movez._router()).equal(trader1.address);
    });
  
    it("allows the owner to set fees", async () => {

      let feeEcoPct: number = 100;
      let feeEcoAddress: string = feeRecipient.address;
      let feeFundPct: number = 100;
      let feeFundPath: string[] = [
        movez.address,
        weth.address,
      ];
      let feeFundAddress: string = feeFund.address;
      await movez.setFees(feeEcoPct, feeEcoAddress, feeFundPct, feeFundPath, feeFundAddress);
    });
    
    it("does not let the owner set sum of the fees to be higher than 100%", async () => {
      let feeEcoPct: number = 9901;
      let feeEcoAddress: string = feeRecipient.address;
      let feeFundPct: number = 100;
      let feeFundPath: string[] = [
        movez.address,
        weth.address,
      ];
      let feeFundAddress: string = feeFund.address;
      await expect(movez.setFees(feeEcoPct, feeEcoAddress, feeFundPct, feeFundPath, feeFundAddress))
        .revertedWith("Fees must not total more than 100%");
    });

    it("does not let the owner set the feeEcoAddress to the zero address", async () => {
      let feeEcoPct: number = 9900;
      let feeEcoAddress: string = ZeroAddress;
      let feeFundPct: number = 100;
      let feeFundPath: string[] = [
        movez.address,
        weth.address,
      ];
      let feeFundAddress: string = feeFund.address;
      await expect(movez.setFees(feeEcoPct, feeEcoAddress, feeFundPct, feeFundPath, feeFundAddress))
        .revertedWith("Fee eco address must not be zero address");
    });

    it("does not let the owner set the fee fund address to the zero address", async () => {
      let feeEcoPct: number = 9900;
      let feeEcoAddress: string = feeRecipient.address;
      let feeFundPct: number = 100;
      let feeFundPath: string[] = [
        movez.address,
        weth.address,
      ];
      let feeFundAddress: string = ZeroAddress;
      await expect(movez.setFees(feeEcoPct, feeEcoAddress, feeFundPct, feeFundPath, feeFundAddress))
        .revertedWith("Fee fund address must not be zero address");
    });

    it("does not let the owner set an invalid swap path", async () => {
      let feeEcoPct: number = 9900;
      let feeEcoAddress: string = feeRecipient.address;
      let feeFundPct: number = 100;
      let feeFundPath: string[] = [
        movez.address
      ];
      let feeFundAddress: string = feeFund.address;
      await expect(movez.setFees(feeEcoPct, feeEcoAddress, feeFundPct, feeFundPath, feeFundAddress))
        .revertedWith("Invalid path");
    });
  
    it("does not allow the owner to mint more than the cap amount", async () => {
      await expect(movez.mint(trader1.address, tokens("6000000000")))
        .revertedWith("ERC20Capped: cap exceeded");
    });

    it("maintains a fixed decreased cap if tokens are burned", async () => {
      let cap = await movez.cap();
      await movez.burn(tokens("10000"));
      expect(await movez.cap()).equal(cap.sub(tokens("10000")));
    });

  });

  describe("Ownership", () => {

    it("should allow owner to call transfer ownership", async () => {
      expect(await movez.owner()).equal(owner.address);
      await movez.transferOwnership(trader1.address);
      expect(await movez.owner()).equal(trader1.address);
    });
    
    it("allows the owner to renounce ownership", async () => {
      expect(await movez.owner()).equal(owner.address);
      await movez.connect(owner).renounceOwnership();
      expect(await movez.owner()).equal(ZeroAddress);
    });

  });

  describe("Blacklist", () => {

    beforeEach(async () => {
      await movez.setExcluded([
        trader1.address,
        trader2.address
      ], true);
    });

    it("lets you blacklist users that are not allowed to trade", async () => {

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
      expect(await movez.balanceOf(trader3.address)).equal(tokens("90"));
      expect(await movez.balanceOf(trader4.address)).equal(tokens("110"));
    });

  });

  describe("No Whitelist", () => {

    it("allows the owner to create a whitelist", async () => {
      let durations = [1200];
      let amountsMax = [tokens("10000")];
      await movez.createLGEWhitelist(router.address, durations, amountsMax);
    });

    it("should return whitelist round of 0", async () => {
      const [round] = await movez.getLGEWhitelistRound();
      expect(round).equal(0);
    });
    
  });

  describe("LGE Whitelist", () => {

    beforeEach(async () => {

      let durations = [1200];
      let amountsMax = [tokens("10000")];
      const whitelistAddresses: string[] = [trader1.address, trader2.address, trader3.address]
  
      await movez.createLGEWhitelist(pair.address, durations, amountsMax);
      await movez.modifyLGEWhitelist(0, 1200, tokens("10000"), whitelistAddresses, true);
  
      await movez.connect(owner).approve(router.address, tokens("10000000"));
      await weth.connect(owner).approve(router.address, ether("200"));
      await router.connect(owner).addLiquidity(movez.address, weth.address, tokens("100000"), ether("20"), 0, 0, owner.address, deadline(oneMinute * 30));
    });
    
    it("should return whitelist round of 1", async () => {
      const [round] = await movez.connect(trader1).getLGEWhitelistRound();
      expect(round).equal(1);
    });

    // deploy without a whitelist
    it("lets the owner modify a whitelist round duration", async () => {
      const whitelistAddresses: string[] = [trader1.address, trader2.address]
      await movez.modifyLGEWhitelist(0, 500, tokens("10000"), whitelistAddresses, true);
    });
    
    it("lets the owner modify a whitelist round max amount", async () => {        
      const whitelistAddresses: string[] = [trader1.address, trader2.address]
      await movez.modifyLGEWhitelist(0, 1200, tokens("25000"), whitelistAddresses, true);
    });

    it("allows the owner to add accounts to the whitelist", async () => {
      const [,,,, whitelisted] = await movez.connect(trader4).getLGEWhitelistRound();
      expect(whitelisted).equal(false);
      const whitelistAddresses: string[] = [trader4.address]
      await movez.modifyLGEWhitelist(0, 1200, tokens("10000"), whitelistAddresses, true);
      const [,,,, whitelisted2] = await movez.connect(trader4).getLGEWhitelistRound();
      expect(whitelisted2).equal(true);
    });

    it("allows the owner to remove people from the whitelist", async () => {
      const [,,,, whitelisted] = await movez.connect(trader1).getLGEWhitelistRound();
      expect(whitelisted).equal(true);
      const whitelistAddresses: string[] = [trader1.address]
      await movez.modifyLGEWhitelist(0, 1200, tokens("10000"), whitelistAddresses, false);
      const [,,,, whitelisted2] = await movez.connect(trader1).getLGEWhitelistRound();
      expect(whitelisted2).equal(false);
    });

    it("lets a whitelisted user buy up to the amount max", async () => {
      await swapTokens(tokens("0.001"), weth, movez, router, trader1);
    });

    it("prevents unwhitelisted users from purchasing tokens during whitelist round", async () => {
      await expect(swapTokens(tokens("1"), weth, movez, router, trader4))
        .revertedWith("UniswapV2: TRANSFER_FAILED");
    });

    it("only lets whitelisted users purchase tokens up to the amount max", async () => {
      await expect(swapTokens(tokens("500"), weth, movez, router, trader1))
        .revertedWith("UniswapV2: TRANSFER_FAILED");
    });

    it("allows the whitelisted to relinquish whitelist privileges", async () => {
      await movez.renounceWhitelister();
      expect(await movez._whitelister()).equal(ZeroAddress);
    });

    it("allows the whitelisted to transfer whitelist privileges", async () => {
      await movez.transferWhitelister(trader1.address);
      expect(await movez._whitelister()).equal(trader1.address);
    });

  });

  describe("Selling Tokens", async () => {

    beforeEach(async () => {

      let durations = [1200];
      let amountsMax = [tokens("10000")];
      const whitelistAddresses: string[] = [trader1.address, trader2.address, trader3.address]
  
      await movez.createLGEWhitelist(pair.address, durations, amountsMax);
      await movez.modifyLGEWhitelist(0, 1200, tokens("10000"), whitelistAddresses, true);
  
      await movez.connect(owner).approve(router.address, tokens("10000000"));
      await weth.connect(owner).approve(router.address, ether("200"));
      await router.connect(owner).addLiquidity(movez.address, weth.address, tokens("100000"), ether("20"), 0, 0, owner.address, deadline(oneMinute * 30));
    });

    it("should apply a fee when users sell tokens the pool", async () => {
      await swapTokens(tokens("100"), movez, weth, router, trader1);
    });
    
    it("accumulates fees in contract if router is set to the zero address", async () => {
      await movez.setRouter(ZeroAddress);
      await swapTokens(tokens("100"), movez, weth, router, trader1);
    });
    
    it("lets the owner get funds out of contract if the router is not set", async () => {
      await movez.setRouter(ZeroAddress);
      await swapTokens(tokens("100"), movez, weth, router, trader1);
      let tokenBalance = await movez.balanceOf(movez.address);
      await movez.rescueFunds(movez.address, trader4.address, tokenBalance);
      expect(await movez.balanceOf(movez.address)).equal(0);
    });

    it("allows holders to give an allowance to others", async () => {
      await movez.connect(trader1).approve(trader2.address, tokens("100"));
      expect(await movez.allowance(trader1.address, trader2.address)).equal(tokens("100"));
      await movez.connect(trader1).decreaseAllowance(trader2.address, tokens("10"));
      expect(await movez.allowance(trader1.address, trader2.address)).equal(tokens("90"));
      await movez.connect(trader1).increaseAllowance(trader2.address, tokens("20"));
      expect(await movez.allowance(trader1.address, trader2.address)).equal(tokens("110"));
    });

  });

});
