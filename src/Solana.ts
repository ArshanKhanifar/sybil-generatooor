import { Connection, Keypair } from "@solana/web3.js";
import { base58 } from "ethers/lib/utils";

export const SOL_NETWROK = {
  DEVNET: "https://api.devnet.solana.com",
};

export const getBalance = async () =>
  getConnection().getBalance(getOwner().publicKey);

export const getConnection = () =>
  new Connection(SOL_NETWROK.DEVNET, "singleGossip");

export const getOwner = () => {
  const privateKey: string = process.env.SOL_PRIVATE_KEY!;
  const secret = base58.decode(privateKey);
  return Keypair.fromSecretKey(secret);
};
