import { getOrca, Network, Orca, OrcaPoolConfig } from "@orca-so/sdk";
import Decimal from "decimal.js";
import { getConnection, getOwner } from "./solana";

const SLIPPAGE = 0.5e-2;

const getOrcaSession = () => getOrca(getConnection(), Network.DEVNET);

export const getAddresses = async (poolAddr: OrcaPoolConfig) => {
  const pool = getOrcaSession().getPool(poolAddr);
  const tokenA = pool.getTokenA();
  const tokenB = pool.getTokenB();
  console.log(tokenA.tag, tokenA.mint.toBase58());
  console.log(tokenB.tag, tokenB.mint.toBase58());
};

export const swapOnOrca = async (
  token1Symbol: string,
  token1Amount: number,
  token2Symbol: string,
  poolAddr: OrcaPoolConfig,
  slippage: number = SLIPPAGE
) => {
  const pool = getOrcaSession().getPool(poolAddr);
  const tokenA = pool.getTokenA();
  const tokenB = pool.getTokenB();
  const token1 = token1Symbol === tokenA.tag ? tokenA : tokenB;
  const token1Decimal = new Decimal(token1Amount);
  const quote = await pool.getQuote(token1, new Decimal(token1Amount));
  const token2Amount = quote.getMinOutputAmount().toNumber() * (1 - slippage); // not to get slippage issues
  const swapPayload = await pool.swap(
    getOwner(),
    token1,
    token1Decimal,
    new Decimal(token2Amount)
  );

  console.log(
    `${token1Amount.toString()} ${token1Symbol} -> ${token2Amount} ${token2Symbol}`
  );

  const swapTxId = await swapPayload.execute();

  console.log(`tx: ${swapTxId}`);

  return token2Amount;
};
