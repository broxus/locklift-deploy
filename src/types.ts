import { Locklift, Signer, WalletTypes } from "locklift";
import { FactoryType } from "locklift/internal/factory";
import { Account } from "locklift/everscale-client";

export type CreateAccountParams = Parameters<Locklift<any>["factory"]["accounts"]["addNewAccount"]>[0];
export type CreateAccountParamsWithoutPk<T extends CreateAccountParams> = T extends Extract<
  T,
  { type: WalletTypes.EverWallet | WalletTypes.WalletV3 | WalletTypes.HighLoadWalletV2 }
>
  ? Omit<T, "publicKey">
  : T extends Extract<T, { type: WalletTypes.MsigAccount }>
  ? Omit<T, "publicKey">
  : never;
export type DeployContractParams<T extends FactoryType = FactoryType> = Parameters<
  Locklift<T>["factory"]["deployContract"]
>[0];
export type AddExistingAccountParams = Parameters<Locklift<any>["factory"]["accounts"]["addExistingAccount"]>[0];
export type LogStruct<T extends FactoryType> = {
  accounts: Record<string, CreateAccountParams & { signerId: string; address: string }>;
  contracts: Record<string, { deployContractParams: DeployContractParams<T>; address: string }>;
};
export type AccountWithSigner = { account: Account; signer: Signer };
