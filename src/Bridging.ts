import {
  CHAIN_ID_ETH,
  CHAIN_ID_ETHEREUM_ROPSTEN,
  CHAIN_ID_SOLANA,
  ChainId,
  getEmitterAddressEth,
  getEmitterAddressSolana,
  hexToUint8Array,
  nativeToHexString,
  parseSequenceFromLogEth,
  parseSequenceFromLogSolana,
  postVaaSolana,
  redeemOnEth,
  redeemOnSolana,
  transferFromEth,
  transferFromSolana,
} from "@certusone/wormhole-sdk";
import { getConnection, getOwner } from "./Solana";
import { BigNumber } from "ethers";
import { getAddress, parseUnits } from "ethers/lib/utils";
import getSignedVAAWithRetry from "@certusone/wormhole-sdk/lib/cjs/rpc/getSignedVAAWithRetry";
import { getSignerForEth } from "./ethereum";
import { getDecimals } from "./Sushi";

const SOL_BRIDGE_ADDRESS = "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";
const SOL_TOKEN_BRIDGE_ADDRESS = "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";

export const ETH_TOKEN_BRIDGE_ADDRESS = getAddress(
  "0xa6CDAddA6e4B6704705b065E01E52e2486c0FBf6"
);

export const WORMHOLE_RPC_HOSTS = [
  "https://wormhole-v2-testnet-api.certus.one",
];

export const ETH_BRIDGE_ADDRESS = getAddress(
  "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550"
);

export const getBridgeAddressForChain = (chainId: ChainId) =>
  chainId === CHAIN_ID_SOLANA ? SOL_BRIDGE_ADDRESS : ETH_BRIDGE_ADDRESS;

export const getTokenBridgeAddressForChain = (chainId: ChainId) =>
  chainId === CHAIN_ID_SOLANA
    ? SOL_TOKEN_BRIDGE_ADDRESS
    : ETH_TOKEN_BRIDGE_ADDRESS;

async function nativeAddressToEmitterAddress(
  chainId: ChainId,
  address: string
): Promise<string> {
  if (chainId === CHAIN_ID_SOLANA) {
    return await getEmitterAddressSolana(address);
  } else {
    return getEmitterAddressEth(address); //Not a mistake, this one is synchronous.
  }
}

export async function getSignedVAABySequence(
  chainId: ChainId,
  sequence: string
): Promise<Uint8Array> {
  //Note, if handed a sequence which doesn't exist or was skipped for consensus this will retry until the timeout.
  const contractAddress = getTokenBridgeAddressForChain(chainId);
  const emitterAddress = await nativeAddressToEmitterAddress(
    chainId,
    contractAddress
  );

  console.log("about to do signed vaa with retry");

  const { vaaBytes } = await getSignedVAAWithRetry(
    WORMHOLE_RPC_HOSTS,
    chainId,
    emitterAddress,
    sequence
  );

  return vaaBytes;
}

export const bridgeToEth = async (
  token1Address: string,
  token1Amount: number,
  toAddress: string
) => {
  const transaction = await transferFromSolana(
    getConnection(),
    SOL_BRIDGE_ADDRESS,
    SOL_TOKEN_BRIDGE_ADDRESS,
    getOwner().publicKey.toBase58(), // apparently this is the fee paying address
    getOwner().publicKey.toBase58(),
    token1Address,
    BigNumber.from(token1Amount).toBigInt(),
    hexToUint8Array(nativeToHexString(toAddress, CHAIN_ID_ETHEREUM_ROPSTEN)!),
    CHAIN_ID_ETHEREUM_ROPSTEN
  );

  const connection = getConnection();
  const owner = getOwner();
  transaction.partialSign(owner);
  const txId = await connection.sendRawTransaction(transaction.serialize());
  console.log("Solana transaction:", txId);
  const info: any = await connection.confirmTransaction(txId);

  if (!info) {
    throw new Error("An error occurred while fetching the transaction info");
  }

  const sequence = parseSequenceFromLogSolana(info);

  const signedVaa = await getSignedVAABySequence(CHAIN_ID_SOLANA, sequence);

  await redeemOnEth(
    getTokenBridgeAddressForChain(CHAIN_ID_ETH),
    getSignerForEth(),
    signedVaa
  );
};

export async function transferEvm(
  amount: string,
  recipientAddress: string,
  assetAddress: string,
  decimals: number
): Promise<string> {
  const amountParsed = parseUnits(amount, decimals);
  const signer = getSignerForEth();
  const hexString = nativeToHexString(recipientAddress, CHAIN_ID_SOLANA);
  if (!hexString) {
    throw new Error("Invalid recipient");
  }
  const vaaCompatibleAddress = hexToUint8Array(hexString);
  const receipt = await transferFromEth(
    getTokenBridgeAddressForChain(CHAIN_ID_SOLANA),
    signer,
    assetAddress as string,
    amountParsed,
    CHAIN_ID_SOLANA,
    vaaCompatibleAddress
  );

  return parseSequenceFromLogEth(
    receipt,
    getBridgeAddressForChain(CHAIN_ID_ETH)
  );
}

export const bridgeFromEth = async (
  token1Address: string,
  token1Amount: BigNumber,
  toAddress: string
) => {
  const sequence = await transferEvm(
    token1Amount.toString(),
    toAddress,
    token1Address,
    await getDecimals(token1Address)
  );

  const signedVAA = await getSignedVAABySequence(CHAIN_ID_ETH, sequence);

  return await redeemSolana(signedVAA);
};

export async function redeemSolana(signedVAA: Uint8Array) {
  const connection = getConnection();
  const keypair = getOwner();
  const payerAddress = keypair.publicKey.toString();
  await postVaaSolana(
    connection,
    async (transaction) => {
      transaction.partialSign(keypair);
      return transaction;
    },
    SOL_BRIDGE_ADDRESS,
    payerAddress,
    Buffer.from(signedVAA)
  );
  await redeemOnSolana(
    connection,
    SOL_BRIDGE_ADDRESS,
    SOL_TOKEN_BRIDGE_ADDRESS,
    payerAddress,
    signedVAA
  );
}
