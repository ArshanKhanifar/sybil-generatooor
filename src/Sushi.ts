import {
  ChainId,
  CurrencyAmount,
  Pair,
  Percent,
  Route,
  Token,
  Trade,
  TradeType,
} from "@sushiswap/sdk";
import { BigNumber, Contract, ethers, Transaction } from "ethers";
import { PairABI } from "./abi/PairABI";
import { getSignerForEth } from "./ethereum";
import { RouterABI } from "./abi/RouterABI";
import { WethABI } from "./abi/WethABI";
import { ERC20ABI } from "./abi/ERC20ABI";
import { MulticallABI } from "./abi/MulticallABI";
import { ETH_COINS } from "./addresses";

type Lookup<T> = { [key: string]: T };

const MULTICALL_ADDRESS = "0xD6a793f41Cfa5759a009621d3a8c201b228ac6d4";
const SUSHI_ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

const getRouter = () =>
  new Contract(SUSHI_ROUTER, RouterABI, getSignerForEth());

export const getDecimals = async (tokenSymbol: string) =>
  getErc20Contract(ETH_COINS[tokenSymbol]).decimals();

const getToken = async (tokenSymbol: string) => {
  const tokenContract = getErc20Contract(ETH_COINS[tokenSymbol]);
  const decimals = await tokenContract.decimals();
  return new Token(ChainId.GÖRLI, tokenContract.address, decimals, tokenSymbol);
};

export const getAmount = async (
  tokenSymbol: string,
  n: number,
  numDigits: number = 6
) => {
  const decimals = await getDecimals(tokenSymbol);
  return BigNumber.from(Math.floor(n * Math.pow(10, numDigits))).mul(
    "1" + "0".repeat(decimals - numDigits)
  );
};

const getErc20Contract = (tokenAddr: string) =>
  new Contract(tokenAddr, ERC20ABI, getSignerForEth());

const hasAllowance = async (
  tokenAddr: string,
  spender: string,
  token1Amount: BigNumber
) => {
  const tokenContract = getErc20Contract(tokenAddr);
  const allowance: BigNumber = await tokenContract.allowance(
    getSignerForEth().getAddress(),
    spender
  );
  return allowance.gte(token1Amount);
};

export const approve = async (tokenAddr: string, spender: string) => {
  const tokenContract = getErc20Contract(tokenAddr);
  const tx = await tokenContract.approve(spender, ethers.constants.MaxUint256);
  _printTx("approve tx", tx);
  await tx.wait();
  console.log("approve successful!");
};

export const getSwapInfo = async (
  token1Symbol: string,
  token1Amount: BigNumber,
  token2Symbol: string
) => {
  const slippage = new Percent(3, 100);
  const token1 = await getToken(token1Symbol);
  const token2 = await getToken(token2Symbol);
  const pairAddress = Pair.getAddress(token1, token2);
  console.log("pairAddress", pairAddress);

  const tokens = [token1, token2];
  const [_token0, _token1] = tokens[0].sortsBefore(tokens[1])
    ? tokens
    : [tokens[1], tokens[0]];

  const pairContract = new Contract(pairAddress, PairABI, getSignerForEth());

  const [reserve0, reserve1] = await pairContract.getReserves();

  const pair = new Pair(
    CurrencyAmount.fromRawAmount(_token0, reserve0.toString()),
    CurrencyAmount.fromRawAmount(_token1, reserve1.toString())
  );

  const route = new Route([pair], token1, token2);

  const trade = new Trade(
    route,
    CurrencyAmount.fromRawAmount(token1, token1Amount.toString()),
    TradeType.EXACT_INPUT
  );

  const minOut = trade.minimumAmountOut(slippage);
  const significantDigits = 6;

  const has = await hasAllowance(token1.address, SUSHI_ROUTER, token1Amount);

  if (!has) {
    await approve(token1.address, SUSHI_ROUTER);
  }

  const minOutAmount = BigNumber.from(
    "1" + "0".repeat(token2.decimals - significantDigits)
  ).mul(
    Math.floor(parseFloat(minOut.toExact()) * Math.pow(10, significantDigits))
  );

  return { route, minOutAmount };
};

export const getSwapCall = async (
  token1Symbol: string,
  token1Amount: BigNumber,
  token2Symbol: string
): Promise<string> => {
  const { route, minOutAmount } = await getSwapInfo(
    token1Symbol,
    token1Amount,
    token2Symbol
  );

  const routerIface = new ethers.utils.Interface(RouterABI);

  return routerIface.encodeFunctionData("swapExactTokensForTokens", [
    token1Amount,
    minOutAmount,
    route.path.map((t) => t.address),
    await getSignerForEth().getAddress(),
    Date.now() + 60 * 60,
  ]);
};

export const swapsMultical = async (callsData: string[]) => {
  const multicall = new Contract(
    MULTICALL_ADDRESS,
    MulticallABI,
    getSignerForEth()
  );
  const tx = await multicall.aggregate(
    callsData.map((callData) => ({ callData, target: SUSHI_ROUTER })),
    {
      gasLimit: 120e3 * callsData.length,
    }
  );

  _printTx("multicall tx", tx);

  await tx.wait();

  console.log("multicall successful!");
};

export const swapMulticall = async (
  token1Symbol: string,
  token1Amount: BigNumber,
  token2Symbol: string
) => {
  const callData = await getSwapCall(token1Symbol, token1Amount, token2Symbol);
  console.log("callData", callData);

  const multicall = new Contract(
    MULTICALL_ADDRESS,
    MulticallABI,
    getSignerForEth()
  );

  const tx = await multicall.aggregate(
    [{ target: SUSHI_ROUTER, callData: callData }],
    {
      gasLimit: 2100000,
    }
  );

  _printTx("multicall tx", tx);

  await tx.wait();

  console.log("multicall successful!");
};

export const swapOnSushi = async (
  token1Symbol: string,
  token1Amount: BigNumber,
  token2Symbol: string
) => {
  const { route, minOutAmount } = await getSwapInfo(
    token1Symbol,
    token1Amount,
    token2Symbol
  );

  const routerContract = getRouter();

  const tx = await routerContract.swapExactTokensForTokens(
    token1Amount,
    minOutAmount,
    route.path.map((t) => t.address),
    getSignerForEth().getAddress(),
    Date.now() + 60 * 60
  );

  _printTx("swap tx", tx);

  await tx.wait();

  console.log("swapping successful!");

  return minOutAmount;
};

const _printTx = (name: string, tx: Transaction) => {
  console.log(`${name} hash: https://goerli.etherscan.io/tx/${tx.hash}`);
};

export const wrapEth = async (amount: BigNumber) => {
  const wethContract = new Contract(
    ETH_COINS["WETH"],
    WethABI,
    getSignerForEth()
  );
  console.log("deposit function", wethContract.deposit);
  const tx = await wethContract.deposit({
    value: amount,
  });
  _printTx("wrap tx", tx);
  await tx.wait();
  console.log("wrapping successful!");
};
