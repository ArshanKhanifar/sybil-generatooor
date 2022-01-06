import { Lookup } from "./util";
import { OrcaPoolConfig } from "@orca-so/sdk";

export const SOLANA_COINS: Lookup<string> = {
  WETH: "Ff5JqsAYUD4vAfQUtfRprT4nXu9e28tTBZTDFMnJNdvd",
  SOL: "So11111111111111111111111111111111111111112",
  ORCA: "orcarKHSqC5CDDsGbho8GKvwExejWHxTqGzXgcewB9L",
};

const genKey = (asset1: string, asset2: string) =>
  JSON.stringify({ [asset1]: true, [asset2]: true });

const orcaPool = {
  [genKey("WETH", "SOL")]: OrcaPoolConfig.ETH_SOL,
  [genKey("ORCA", "SOL")]: OrcaPoolConfig.ORCA_SOL,
};

export const orcaPoolLookup = (asset1: string, asset2: string) =>
  orcaPool[genKey(asset1, asset2)];

export const ETH_COINS: Lookup<string> = {
  DAI: "0xdc31ee1784292379fbb2964b3b9c4124d8f89c60",
  MYST: "0xf74a5ca65e4552cff0f13b116113ccb493c580c5",
  WETH: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
  UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
};

export const BRIDGE_COIN = "WETH";

export const ALL_COINS = [
  ...Object.keys(ETH_COINS),
  ...Object.keys(SOLANA_COINS),
];

export const pickTwoRandomCoins = () => {
  const options = [...ALL_COINS];
  const option1 = options[Math.floor(Math.random() * options.length)];
  options.splice(options.indexOf(option1), 1);
  const option2 = options[Math.floor(Math.random() * options.length)];
  return [option1, option2];
};
