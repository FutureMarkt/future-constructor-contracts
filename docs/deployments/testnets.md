# Advanced token stack on testnets

Deployment log for `TokenDeployer`, `PermitDeployer`, `VotesDeployer`, `VestingDeployer`, and `AdvancedTokenFactory`, wired with `setFactory`. This is a deployment record. It is not a third-party review.

The deployed bytecode of the factory and the four deployers is commit `5fb7fed88e31618955b341ccf70639079759946d` (`5fb7fed`, "Price permit, votes, and vesting like mint"). The deploy scripts check that every Solidity file under `contracts/` still matches that commit before a broadcast, except `contracts/mocks/FixedPriceAggregator.sol`, which exists only for Amoy.

Deployer and fee recipient: `0x8A8D159DdF5FcE044192Ddd720D2EF4a4459Eb05`.

`sequencerUptimeFeed` is `address(0)` on every network below. [Chainlink's sequencer page](https://docs.chain.link/data-feeds/l2-sequencer-feeds) lists mainnets only and says new networks are not being added. The factory treats `address(0)` as "no sequencer check".

Ethereum Sepolia uses the Ethereum fee schedule. The other networks use the other-networks schedule. Both are the numbers in `contracts/advanced/README.md`. Cap and Ownable2Step have no fee. After `setFactory`, storage fees matched the schedule, and `currentFee` for the base, each of the seven flags, all seven flags together, and `currentVestingFee` matched the quote. On Sepolia, BSC testnet, Arbitrum Sepolia, and Base Sepolia that quote is the live Chainlink round. On Amoy it is the fixed POL/USD answer in `FixedPriceAggregator`.

Every deployed contract, including the Amoy mock, is verified on Sourcify with a full match (`exact_match` on runtime and creation bytecode). Etherscan was not used. Sourcify's chain list includes all five testnets (11155111, 97, 421614, 84532, 80002), so none was skipped for lack of support. Links are in the Sourcify section below and in `deployments/*.json`.

BSC testnet, Arbitrum Sepolia, and Base Sepolia share CREATE addresses because the deployer nonce started at 0 on each of those chains. Sepolia addresses differ because that account had already sent transactions. Amoy addresses differ because `FixedPriceAggregator` was created at nonce 0 on that chain.

## Ethereum Sepolia (chain id 11155111)

Deployed. Balance before broadcast: 0.019999174749446654 ETH. Balance after: 0.019999173 ETH. Block 12217856.

| Contract | Address |
| --- | --- |
| AdvancedTokenFactory | [`0x513c798F755A0201ECfB7E2a686D552F661F4420`](https://sepolia.etherscan.io/address/0x513c798F755A0201ECfB7E2a686D552F661F4420) |
| TokenDeployer | [`0x644cf7f123287d6EE260dc459178596cd2dD2621`](https://sepolia.etherscan.io/address/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| PermitDeployer | [`0x372cD839b943bb72e314B10744f138b526df9044`](https://sepolia.etherscan.io/address/0x372cD839b943bb72e314B10744f138b526df9044) |
| VotesDeployer | [`0x58b77312FA3Df4c84776a1943CfD4ec752D4d508`](https://sepolia.etherscan.io/address/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| VestingDeployer | [`0xa75332F2e91755AeBFBE0d955563fCF3a352b384`](https://sepolia.etherscan.io/address/0xa75332F2e91755AeBFBE0d955563fCF3a352b384) |

Price feed: ETH/USD `0x694AA1769357215DE4FAC081bf1f309aDC325306` (8 decimals, heartbeat 3600s, description `ETH / USD`). Age at read-back: 300 seconds. Docs: [ethereum-sepolia price feeds](https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum-sepolia). List: [feeds-ethereum-testnet-sepolia.json](https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia.json). A hidden "L2 Sequencer Uptime Status Feed" row in that list (`0x37Ae2933eE42D808b4D86458777a3EFc4E8e2976`) has no code on Sepolia and is not used.

Native quote at that round: base $6 = 0.003544062422550271 ETH, one $2 flag on top of base = 0.004725416563400361 ETH, transfer-fee flag ($26) = 0.015357603831051175 ETH, all seven flags ($38) = 0.022445728676151717 ETH, vesting $2 = 0.001181354140850090 ETH.

Frontend env: `NEXT_PUBLIC_ADVANCED_FACTORY_SEPOLIA`.

## BNB Smart Chain testnet (chain id 97)

Deployed. Balance before broadcast: 0.3 tBNB. Balance after: 0.28585299 tBNB. Block 145017252.

| Contract | Address |
| --- | --- |
| AdvancedTokenFactory | [`0x58b77312FA3Df4c84776a1943CfD4ec752D4d508`](https://testnet.bscscan.com/address/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| TokenDeployer | [`0x2370A5fd4afa4f2424bb1C1c90393a167D488d35`](https://testnet.bscscan.com/address/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |
| PermitDeployer | [`0xB5DF6da2f4BFdd9b7141659807f742B50a132264`](https://testnet.bscscan.com/address/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| VotesDeployer | [`0x644cf7f123287d6EE260dc459178596cd2dD2621`](https://testnet.bscscan.com/address/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| VestingDeployer | [`0x372cD839b943bb72e314B10744f138b526df9044`](https://testnet.bscscan.com/address/0x372cD839b943bb72e314B10744f138b526df9044) |

Price feed: BNB/USD `0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526` (heartbeat 3600s, description `BNB / USD`). Age at read-back: 1310 seconds. Docs: [bnb-testnet price feeds](https://docs.chain.link/data-feeds/price-feeds/addresses?network=bnb-testnet). List: [feeds-bsc-testnet.json](https://reference-data-directory.vercel.app/feeds-bsc-testnet.json). No sequencer feed is published for this testnet.

Native quote: base $3 = 0.005437601068735245 tBNB, one $1 flag on top of base = 0.007250134758313660 tBNB, transfer-fee flag ($13) = 0.023562937964519395 tBNB, all seven flags ($19) = 0.034438140101989885 tBNB, vesting $1 = 0.001812533689578415 tBNB.

Frontend env: `NEXT_PUBLIC_ADVANCED_FACTORY_BSC_TESTNET`.

## Arbitrum Sepolia (chain id 421614)

Deployed. Balance before broadcast: 0.015 ETH. Balance after: 0.01471690 ETH. Block 332933609.

| Contract | Address |
| --- | --- |
| AdvancedTokenFactory | [`0x58b77312FA3Df4c84776a1943CfD4ec752D4d508`](https://sepolia.arbiscan.io/address/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| TokenDeployer | [`0x2370A5fd4afa4f2424bb1C1c90393a167D488d35`](https://sepolia.arbiscan.io/address/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |
| PermitDeployer | [`0xB5DF6da2f4BFdd9b7141659807f742B50a132264`](https://sepolia.arbiscan.io/address/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| VotesDeployer | [`0x644cf7f123287d6EE260dc459178596cd2dD2621`](https://sepolia.arbiscan.io/address/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| VestingDeployer | [`0x372cD839b943bb72e314B10744f138b526df9044`](https://sepolia.arbiscan.io/address/0x372cD839b943bb72e314B10744f138b526df9044) |

Price feed: ETH/USD `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165` (heartbeat 120s, description `ETH / USD`). Age at read-back: 59 seconds. Docs: [arbitrum-sepolia price feeds](https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum-sepolia). List: [feeds-ethereum-testnet-sepolia-arbitrum-1.json](https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia-arbitrum-1.json). The sequencer page lists Arbitrum Mainnet (`0xFdB631F5EE196F0ed6FAa767959853A9F217697D`) and does not list Arbitrum Sepolia.

Native quote: base $3 = 0.001771857147788633 ETH, one $1 flag on top of base = 0.002362476197051510 ETH, transfer-fee flag ($13) = 0.007678047640417409 ETH, all seven flags ($19) = 0.011221761935994675 ETH, vesting $1 = 0.000590619049262877 ETH.

Frontend env: `NEXT_PUBLIC_ADVANCED_FACTORY_ARBITRUM_SEPOLIA`.

## Base Sepolia (chain id 84532)

Deployed. Balance before broadcast: 0.015 ETH. Balance after: 0.01491324 ETH. Block 63956364.

| Contract | Address |
| --- | --- |
| AdvancedTokenFactory | [`0x58b77312FA3Df4c84776a1943CfD4ec752D4d508`](https://sepolia.basescan.org/address/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| TokenDeployer | [`0x2370A5fd4afa4f2424bb1C1c90393a167D488d35`](https://sepolia.basescan.org/address/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |
| PermitDeployer | [`0xB5DF6da2f4BFdd9b7141659807f742B50a132264`](https://sepolia.basescan.org/address/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| VotesDeployer | [`0x644cf7f123287d6EE260dc459178596cd2dD2621`](https://sepolia.basescan.org/address/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| VestingDeployer | [`0x372cD839b943bb72e314B10744f138b526df9044`](https://sepolia.basescan.org/address/0x372cD839b943bb72e314B10744f138b526df9044) |

Price feed: ETH/USD `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` (heartbeat 1200s, description `ETH / USD`). Age at read-back: 717 seconds. Docs: [base-sepolia price feeds](https://docs.chain.link/data-feeds/price-feeds/addresses?network=base-sepolia). List: [feeds-ethereum-testnet-sepolia-base-1.json](https://reference-data-directory.vercel.app/feeds-ethereum-testnet-sepolia-base-1.json). The sequencer page lists BASE Mainnet (`0xBCF85224fc0756B9Fa45aA7892530B47e10b6433`) and does not list Base Sepolia.

Native quote: base $3 = 0.001773731043249475 ETH, one $1 flag on top of base = 0.002364974724332633 ETH, transfer-fee flag ($13) = 0.007686167854081059 ETH, all seven flags ($19) = 0.011233629940580010 ETH, vesting $1 = 0.000591243681083158 ETH.

Frontend env: `NEXT_PUBLIC_ADVANCED_FACTORY_BASE_SEPOLIA`.

## Polygon Amoy (chain id 80002)

Deployed by `scripts/deploy-amoy-mock-feed.ts`. That script reads the chain id and exits unless it is 80002. It also exits on known mainnet ids. The mock is not referenced by any mainnet network or mainnet script. The shared testnet script still skips Amoy, so it cannot broadcast the mock.

Chainlink's Amoy list ([feeds-polygon-testnet-amoy.json](https://reference-data-directory.vercel.app/feeds-polygon-testnet-amoy.json), linked from [the Amoy price-feed page](https://docs.chain.link/data-feeds/price-feeds/addresses?network=polygon-amoy)) has no POL/USD and no MATIC/USD. It does have ETH/USD at `0xF0d50568e3A7e8259E16663972b11910F89BD8e7`. That feed prices ether, so using it would charge POL as if it were ETH. The POL/USD address cited by Polygon's oracle docs, `0x001382149eBa3441043c1c66972b4772963f5D43`, has bytecode, but `description()`, `decimals()`, and `latestRoundData()` revert and the EIP-1967 implementation slot is empty. The factory therefore uses `FixedPriceAggregator` (`contracts/mocks/FixedPriceAggregator.sol`): 8 decimals, `description` "POL / USD", and `latestRoundData` / `getRoundData` return `updatedAt = block.timestamp` so the factory's one-hour freshness check stays current.

The frozen answer is the CoinGecko POL/USD price at deploy time. Source: [simple price](https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd&include_last_updated_at=true), id `polygon-ecosystem-token`. CoinGecko `last_updated_at` is 2026-11-26T17:23:44.000Z. Fetched at 2026-11-26T17:24:48.072Z. Price 0.07677 USD, constructor answer `7677000` (8 decimals). Cross-check at the same fetch: Kraken POLUSD last 0.076850000 ([Ticker](https://api.kraken.com/0/public/Ticker?pair=POLUSD)). The on-chain `latestRoundData` answer is `7677000`.

The Amoy RPC minimum tip is 25 gwei. A 30 gwei `maxFeePerGas` with a 30 gwei base fee leaves a zero tip and is rejected before the mempool, so no transaction was sent at that cap. Included transactions use `maxPriorityFeePerGas` 25 gwei and `maxFeePerGas` equal to the base fee plus 25 gwei. The recorded cap is 55.914077459 gwei (`55914077459` wei). Balance before broadcast: 1.0 POL. Balance after: 0.201404765919250056 POL. Recorded at 2026-11-26T17:27:41.099Z.

One `setFactory` on the token deployer reverted out of gas (gas limit below the live estimate). The successful `setFactory` transactions are the ones in `deployments/polygon-amoy.json`. All four deployers now point at the factory.

| Contract | Address |
| --- | --- |
| AdvancedTokenFactory | [`0xa75332F2e91755AeBFBE0d955563fCF3a352b384`](https://amoy.polygonscan.com/address/0xa75332F2e91755AeBFBE0d955563fCF3a352b384) |
| TokenDeployer | [`0xB5DF6da2f4BFdd9b7141659807f742B50a132264`](https://amoy.polygonscan.com/address/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| PermitDeployer | [`0x644cf7f123287d6EE260dc459178596cd2dD2621`](https://amoy.polygonscan.com/address/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| VotesDeployer | [`0x372cD839b943bb72e314B10744f138b526df9044`](https://amoy.polygonscan.com/address/0x372cD839b943bb72e314B10744f138b526df9044) |
| VestingDeployer | [`0x58b77312FA3Df4c84776a1943CfD4ec752D4d508`](https://amoy.polygonscan.com/address/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| FixedPriceAggregator | [`0x2370A5fd4afa4f2424bb1C1c90393a167D488d35`](https://amoy.polygonscan.com/address/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |

Native quote at 0.07677 USD: base $3 = 39.077764751856193825 POL, one $1 flag on top of base = 52.103686335808258434 POL, transfer-fee flag ($13) = 169.336980591376839911 POL, all seven flags ($19) = 247.492510095089227562 POL, vesting $1 = 13.025921583952064608 POL. Storage USD fees are the other-networks schedule ($3 / $1 / $1 / $1 / $1 / $10 / $1 / $1 / $1). Every read-back matched.

Frontend env, still for the app to set: `NEXT_PUBLIC_ADVANCED_FACTORY_AMOY`.

## Verified on Sourcify

Sourcify full match for every deployed contract. `exact_match` is Sourcify's full match. No contract is a partial match. Etherscan was not used.

| Network | Contract | Repo |
| --- | --- | --- |
| Ethereum Sepolia | TokenDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/11155111/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| Ethereum Sepolia | PermitDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/11155111/0x372cD839b943bb72e314B10744f138b526df9044) |
| Ethereum Sepolia | VotesDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/11155111/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| Ethereum Sepolia | VestingDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/11155111/0xa75332F2e91755AeBFBE0d955563fCF3a352b384) |
| Ethereum Sepolia | AdvancedTokenFactory | [full match](https://repo.sourcify.dev/contracts/full_match/11155111/0x513c798F755A0201ECfB7E2a686D552F661F4420) |
| BSC testnet | TokenDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/97/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |
| BSC testnet | PermitDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/97/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| BSC testnet | VotesDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/97/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| BSC testnet | VestingDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/97/0x372cD839b943bb72e314B10744f138b526df9044) |
| BSC testnet | AdvancedTokenFactory | [full match](https://repo.sourcify.dev/contracts/full_match/97/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| Arbitrum Sepolia | TokenDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/421614/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |
| Arbitrum Sepolia | PermitDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/421614/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| Arbitrum Sepolia | VotesDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/421614/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| Arbitrum Sepolia | VestingDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/421614/0x372cD839b943bb72e314B10744f138b526df9044) |
| Arbitrum Sepolia | AdvancedTokenFactory | [full match](https://repo.sourcify.dev/contracts/full_match/421614/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| Base Sepolia | TokenDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/84532/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |
| Base Sepolia | PermitDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/84532/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| Base Sepolia | VotesDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/84532/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| Base Sepolia | VestingDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/84532/0x372cD839b943bb72e314B10744f138b526df9044) |
| Base Sepolia | AdvancedTokenFactory | [full match](https://repo.sourcify.dev/contracts/full_match/84532/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| Polygon Amoy | TokenDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/80002/0xB5DF6da2f4BFdd9b7141659807f742B50a132264) |
| Polygon Amoy | PermitDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/80002/0x644cf7f123287d6EE260dc459178596cd2dD2621) |
| Polygon Amoy | VotesDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/80002/0x372cD839b943bb72e314B10744f138b526df9044) |
| Polygon Amoy | VestingDeployer | [full match](https://repo.sourcify.dev/contracts/full_match/80002/0x58b77312FA3Df4c84776a1943CfD4ec752D4d508) |
| Polygon Amoy | AdvancedTokenFactory | [full match](https://repo.sourcify.dev/contracts/full_match/80002/0xa75332F2e91755AeBFBE0d955563fCF3a352b384) |
| Polygon Amoy | FixedPriceAggregator | [full match](https://repo.sourcify.dev/contracts/full_match/80002/0x2370A5fd4afa4f2424bb1C1c90393a167D488d35) |

API lookup for the same rows: `https://sourcify.dev/server/v2/contract/<chainId>/<address>`.

## How to redeploy

`scripts/deploy-advanced-testnets.ts` refuses every chain id except the five testnets. It skips Amoy. It also refuses a second broadcast when `deployments/<network>.json` already exists. `scripts/deploy-amoy-mock-feed.ts` refuses every chain id except 80002 and refuses to run once `deployments/polygon-amoy.json` exists.

```
npx hardhat run scripts/deploy-advanced-testnets.ts --network hardhatMainnet
ADVANCED_DEPLOY_BROADCAST=sepolia,bsc-testnet,arbitrum-sepolia,base-sepolia npx hardhat run scripts/deploy-advanced-testnets.ts --network hardhatMainnet
npx hardhat run scripts/deploy-amoy-mock-feed.ts --network hardhatMainnet
npx hardhat run scripts/verify-sourcify-testnets.ts --network sepoliaVerify
```

The signer is `TESTNET_DEPLOYER_KEY`. The scripts never print it. Sourcify verification uses the Hardhat verify plugin with `provider: "sourcify"` and the keyless networks `sepoliaVerify`, `bscTestnet`, `arbitrumSepoliaVerify`, `baseSepolia`, and `polygonAmoy`.
