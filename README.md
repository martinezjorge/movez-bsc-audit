# MoveZ BEP20 Contract

### Deployments

| Contract | Address (mainnet) | Notes |
|-|-|-|
| `MOVEZ` | [`TBA`](https://testnet.bscscan.com/token/0x012a68f889918186c7798ec6241c52ca03e415ff) | MOVEZ Token |
### Development

Install dependencies via NPM:

```bash
npm i -D
```

Compile contracts via Hardhat:

```bash
npx hardhat compile
```

### Networks

By default, Hardhat uses the Hardhat Network in-process.

### Testing

To run the tests via Hardhat, run:

```bash
npx hardhat test
```

Generate a code coverage report using `solidity-coverage`:

```bash
npx hardhat coverage
```

Need to update init_hash in UniswapV2Factory to for local Uniswap instance to work.