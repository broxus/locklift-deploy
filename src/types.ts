import { Locklift, Signer, WalletTypes } from "locklift";
import { FactoryType } from "locklift/internal/factory";
import { Account } from "locklift/everscale-client";

export type CreateAccountParams<T extends FactoryType> = Parameters<
  Locklift<T>["factory"]["accounts"]["addNewAccount"]
>[0];
export type _CreateAccountParamsWithoutPk<E extends FactoryType, T extends CreateAccountParams<E>> = T extends Extract<
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
export type CreateAccountParamsWithoutPk<T extends FactoryType> = _CreateAccountParamsWithoutPk<
  T,
  CreateAccountParams<T>
>;
export type AddExistingAccountParams = Parameters<Locklift<any>["factory"]["accounts"]["addExistingAccount"]>[0];
export type SaveAccount<T extends AddExistingAccountParams> = T extends Extract<
  AddExistingAccountParams,
  { type: WalletTypes.HighLoadWalletV2 | WalletTypes.WalletV3 }
>
  ? Omit<T, "publicKey" | "address">
  : T extends Extract<AddExistingAccountParams, { type: WalletTypes.MsigAccount }>
  ? Omit<T, "publicKey" | "address">
  : T extends Extract<AddExistingAccountParams, { type: WalletTypes.EverWallet }>
  ? Omit<T, "address">
  : never;
export type LogStruct<T extends FactoryType> = {
  accounts: Record<string, CreateAccountParams<any> & { signerId: string; address: string }>;
  contracts: Record<string, { deployContractParams: DeployContractParams<T>; address: string }>;
};
export type TagFile = {
  default: () => Promise<any>;
  tag: string;
  dependencies?: Array<string>;
};
export type AccountWithSigner = { account: Account; signer: Signer };
export type WriteDeployInfo = WriteDeployContractInfo | WriteDeployAccountInfo;
export type WriteDeployAccountInfo = {
  type: "Account";
  deploymentName: string;
  address: string;
  publicKey?: string;
  createAccountParams?: CreateAccountParams<FactoryType>;
  saveAccountParams?: SaveAccount<AddExistingAccountParams>;
  signerId?: string;
};
export type WriteDeployContractInfo = {
  type: "Contract";
  deploymentName: string;
  contractName: string;
  address: string;
  abi: any;
  codeHash?: string;
  transaction?: any;
  deployContractParams?: DeployContractParams;
};
