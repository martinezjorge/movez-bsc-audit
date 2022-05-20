import { expect } from "chai";
import { Snapshot, tokens, increaseTime, deadline, ether, ZeroAddress} from "./helpers";
import { ethers, upgrades } from "hardhat";
import { MOVEZ, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02, WETH9 } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("MOVEZ", function () {

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
  const oneDay: number = oneHour*24;
  const oneWeek: number = oneDay*7; 
  const oneYear: number = oneDay*365;

  const snapshot: Snapshot = new Snapshot();

  before("Deployment Snapshot", async () => {

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
    movez = await (upgrades.deployProxy(MOVEZ, [feeEcoPct, feeEcoAddress, feeFundPct, feeFundAddress, router.address], {initializer: 'initialize'})) as MOVEZ;
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
      
    // TODO: Create uniswap pair
    // await factory.createPair(movez.address, weth.address);
    let pairAddress: string = await factory.getPair(movez.address, weth.address);
    pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
    
    // TODO: Create whitelist

    let durations = [1200];
    let amountsMax = [tokens("10000")];
    const whitelistAddresses: string[] = [trader1.address, trader2.address]
    
    await movez.createLGEWhitelist(router.address, durations, amountsMax);
    await movez.modifyLGEWhitelist(0, 1200, tokens("10000"), whitelistAddresses, true);

    // await movez.setExcluded([owner.address, router.address], false);

    await movez.connect(owner).approve(router.address, tokens("100000"));
    await weth.connect(owner).approve(router.address, ether("200"));
    await router.connect(owner).addLiquidity(movez.address, weth.address, tokens("100"), ether("20"), 0, 0, owner.address, deadline(oneMinute*30));

    // Just a thought, try to make multiple snapshots
    await snapshot.snapshot();
  });

  afterEach("Revert", async () => {
    await snapshot.revert();
  })

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

  });

  describe("LGE Whitelist", () => {

    it("", async () => {

    });

  });


});
