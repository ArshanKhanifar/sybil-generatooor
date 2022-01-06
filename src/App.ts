import { config } from "dotenv";
import { OrcaPoolConfig } from "@orca-so/sdk";
import { swapOnOrca } from "./Orca";
import {
  getAmount,
  getDecimals,
  getSwapCall,
  swapOnSushi,
  swapsMultical,
} from "./Sushi";
import {
  BRIDGE_COIN,
  ETH_COINS,
  orcaPoolLookup,
  pickTwoRandomCoins,
  SOLANA_COINS,
} from "./addresses";
import { bridgeFromEth, bridgeToEth } from "./Bridging";
import { getSignerForEth } from "./ethereum";
import { getOwner } from "./Solana";

const setup = () => {
  config();
  const { PROVIDER_GOERLI } = process.env;
  if (!PROVIDER_GOERLI) {
    throw new Error("No provider");
  }
};

enum Direction {
  SOL_SOL = "SOL_SOL",
  SOL_ETH = "SOL_ETH",
  ETH_SOL = "ETH_SOL",
  ETH_ETH = "ETH_ETH",
}

const getDirection = (startAsset: string, endAsset: string): Direction => {
  return SOLANA_COINS[startAsset]
    ? SOLANA_COINS[endAsset]
      ? Direction.SOL_SOL
      : Direction.SOL_ETH
    : ETH_COINS[endAsset]
    ? Direction.ETH_ETH
    : Direction.ETH_SOL;
};

const generateSybilAction = async () => {
  const [startAsset, endAsset] = pickTwoRandomCoins();
  const direction = getDirection(startAsset, endAsset);
  const startAmount = Math.random() * 10;
  if (direction === Direction.SOL_SOL) {
    return await swapOnOrca(
      startAsset,
      startAmount,
      endAsset,
      OrcaPoolConfig.ETH_SOL
    );
  }
  if (direction === Direction.ETH_ETH) {
    return await swapOnSushi(
      startAsset,
      await getAmount(startAsset, startAmount),
      endAsset
    );
  }
  if (direction === Direction.SOL_ETH) {
    const solAmount = await swapOnOrca(
      startAsset,
      startAmount,
      "SOL",
      orcaPoolLookup(startAsset, "SOL")
    );
    const bridgeAmount = await swapOnOrca(
      "SOL",
      solAmount,
      BRIDGE_COIN,
      orcaPoolLookup("SOL", BRIDGE_COIN)
    );
    await bridgeToEth(
      SOLANA_COINS[BRIDGE_COIN],
      bridgeAmount,
      await getSignerForEth().getAddress()
    );
    await swapOnSushi(
      BRIDGE_COIN,
      await getAmount(BRIDGE_COIN, bridgeAmount),
      endAsset
    );
  }
  const bridgeAmount = await swapOnSushi(
    startAsset,
    await getAmount(startAsset, startAmount),
    BRIDGE_COIN
  );
  await bridgeFromEth(
    ETH_COINS[BRIDGE_COIN],
    bridgeAmount,
    getOwner().publicKey.toBase58()
  );
  const solAmount = await swapOnOrca(
    BRIDGE_COIN,
    bridgeAmount
      .div("1" + "0".repeat((await getDecimals(BRIDGE_COIN)) - 9))
      .toNumber() / 1e9,
    "SOL",
    orcaPoolLookup("SOL", BRIDGE_COIN)
  );
  await swapOnOrca("SOL", solAmount, endAsset, orcaPoolLookup("SOL", endAsset));
};

const generateSushiSybilActions = async (
  startAsset: string,
  endAsset: string,
  numActions: number
) => {
  const makeAction = async () =>
    getSwapCall(
      startAsset,
      await getAmount(startAsset, Math.random() * 100),
      endAsset
    );

  const calls = await Promise.all(
    Array(numActions)
      .fill(0)
      .map(() => makeAction())
  );

  return swapsMultical(calls);
};

const main = async () => {
  setup();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
