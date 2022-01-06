import { ethers, Signer } from "ethers";

export function getSignerForEth(): Signer {
  return new ethers.Wallet(process.env.ETH_PRIVATE_KEY!, getProvider());
}

export const getProvider = () => {
  return ethers.getDefaultProvider(process.env.PROVIDER_GOERLI!);
};
