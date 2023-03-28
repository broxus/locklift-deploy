import { FactoryType } from "locklift/internal/factory";
import { Address, Contract, Locklift } from "locklift";
import {
  AccountWithSigner,
  AddExistingAccountParams,
  CreateAccountParams,
  CreateAccountParamsWithoutPk,
  DeployContractParams,
  WriteDeployInfo,
} from "./types";
import path from "path";
import fs from "fs-extra";
import { concatMap, defer, from, lastValueFrom, mergeMap, of, tap, toArray } from "rxjs";
import { calculateDependenciesCount, isT } from "./utils";
import { Account } from "locklift/everscale-client";
import { Logger } from "./logger";

export class Deployments<T extends FactoryType = FactoryType> {
  deploymentsStore: Record<string, Contract<any>> = {};
  accountsStore: Record<string, AccountWithSigner> = {};
  // private readonly pathToLogFile: string;
  private readonly pathToNetworkFolder: string;
  private readonly logger = new Logger();
  constructor(
    private readonly locklift: Locklift<T>,
    private readonly deployFolderPath: string,
    private readonly network: string,
    private readonly networkId: number,
  ) {
    fs.ensureDirSync(path.resolve(deployFolderPath));
    this.pathToNetworkFolder = path.join(deployFolderPath, this.network);
    fs.ensureDirSync(this.pathToNetworkFolder);
  }

  private getLogContent = (): Array<WriteDeployInfo> => {
    const files = fs.readdirSync(this.pathToNetworkFolder);
    return files
      .filter((file) => file.endsWith("json"))
      .map((fileName) => {
        try {
          const deployInfo = JSON.parse(
            fs.readFileSync(path.join(this.pathToNetworkFolder, fileName), "utf-8"),
          ) as WriteDeployInfo;
          if (deployInfo.type === "Contract" || deployInfo.type === "Account") {
            return deployInfo;
          }
        } catch {}
      })
      .filter(isT);
  };

  private getAccountOrContractFilePath = (deploymentName: string, type: "Account" | "Contract") =>
    path.join(this.pathToNetworkFolder, `${type}__${deploymentName}.json`);

  private writeDeployInfo = (deployInfo: WriteDeployInfo, enableLogs: boolean) => {
    const fileName = this.getAccountOrContractFilePath(deployInfo.deploymentName, deployInfo.type);
    fs.writeFileSync(fileName, JSON.stringify(deployInfo, null, 4));
    if (enableLogs) {
      this.logger.printLog(deployInfo);
    }
  };

  //region contract
  deploy = ({
    deployConfig,
    deploymentName,
    enableLogs = false,
  }: {
    deployConfig: DeployContractParams<T>;
    deploymentName: string;
    enableLogs?: boolean;
  }) => {
    return this.locklift.factory.deployContract(deployConfig).then(async (res) => {
      this.setContractToStore({ deploymentName: deploymentName, contract: res.contract });

      this.writeDeployInfo(
        {
          type: "Contract",
          deploymentName,
          abi: JSON.parse(res.contract.abi),
          address: res.contract.address.toString(),
          transaction: res.tx,
          codeHash: await res.contract.getFullState().then((res) => res.state?.codeHash),
          contractName: deployConfig.contract as string,
          //   @ts-ignore
          deployContractParams: deployConfig,
        },
        enableLogs,
      );
      return res;
    });
  };

  saveContract = async ({
    deploymentName,
    contract,
    contractName,
  }: {
    deploymentName: string;
    contract: Contract<any>;
    contractName: keyof T;
  }) => {
    this.writeDeployInfo(
      {
        type: "Contract",
        deploymentName,
        address: contract.address.toString(),
        // @ts-ignore

        contractName: contractName,
        abi: JSON.parse(contract.abi),
        codeHash: await contract.getFullState().then((res) => res.state?.codeHash),
      },
      false,
    );
    this.setContractToStore({ contract, deploymentName });
  };
  private setContractToStore = ({ deploymentName, contract }: { contract: Contract<any>; deploymentName: string }) => {
    this.deploymentsStore[deploymentName] = contract;
  };
  getContract = <T>(contractName: string): Contract<T> => {
    debugger;
    const contract = this.deploymentsStore[contractName];
    if (!contract) {
      throw new Error(
        `Contract ${contractName} not fount in deployments store\nList of deployed contracts: \n${Object.keys(
          this.deploymentsStore,
        ).join("\n")}`,
      );
    }
    return contract;
  };
  //endregion

  //region account
  createAccounts = async (
    accounts: Array<
      {
        deploymentName: string;
        accountSettings: CreateAccountParamsWithoutPk<CreateAccountParams>;
      } & { signerId: string }
    >,
    enableLogs = false,
  ): Promise<Array<AccountWithSigner>> => {
    return lastValueFrom(
      from(accounts).pipe(
        concatMap((accountSetup) =>
          defer(async () => {
            const { accountSettings, deploymentName, signerId } = accountSetup;

            const signer = await this.locklift.keystore.getSigner(signerId).then((mayBeSigner) => {
              if (!mayBeSigner) {
                throw new Error(`Signer with signerId ${signerId} not found`);
              }
              return mayBeSigner;
            });

            // @ts-ignore
            const { account } = await this.locklift.factory.accounts.addNewAccount({
              ...accountSettings,
              publicKey: signer.publicKey,
            } as CreateAccountParams);

            this.writeDeployInfo(
              {
                type: "Account",
                address: account.address.toString(),
                deploymentName,
                createAccountParams: { ...accountSettings, publicKey: signer.publicKey },
                publicKey: signer.publicKey,
                signerId,
              },
              enableLogs,
            );
            return {
              account,
              signer,
              deploymentName,
            };
          }),
        ),
        tap(({ account, deploymentName, signer }) => {
          this.setAccountToStore({ accountName: deploymentName, account, signer });
        }),
        toArray(),
      ),
    );
  };

  getAccount = (accountName: string): AccountWithSigner => {
    const accountWithSigner = this.accountsStore[accountName];
    if (!accountWithSigner) {
      throw new Error(`Account ${accountName} not found in deployments store`);
    }
    return accountWithSigner;
  };
  saveAccount = async ({
    deploymentName,
    account,
    signerId,
  }: {
    account: Account;
    signerId: string;
    deploymentName: string;
  }) => {
    const signer = await this.locklift.keystore.getSigner(signerId);
    if (!signer) {
      throw new Error(`Signer not found`);
    }
    this.writeDeployInfo(
      {
        type: "Account",
        address: account.address.toString(),
        signerId,
        deploymentName,
        publicKey: signer.publicKey,
      },
      false,
    );
    this.setAccountToStore({ account, accountName: deploymentName, signer });
  };

  private setAccountToStore = ({ account, accountName, signer }: AccountWithSigner & { accountName: string }) => {
    this.accountsStore[accountName] = { account, signer };
  };
  //endregion

  load = async () => {
    const accountsAndContracts = this.getLogContent();
    const { contracts, accounts } = {
      accounts: accountsAndContracts.filter(({ type }) => type === "Account") as Array<
        Extract<WriteDeployInfo, { type: "Account" }>
      >,
      contracts: accountsAndContracts.filter(({ type }) => type === "Contract") as Array<
        Extract<WriteDeployInfo, { type: "Contract" }>
      >,
    };
    if (accounts.length > 0) {
      await lastValueFrom(
        from(accounts).pipe(
          mergeMap((deployedAccount) =>
            defer(async () => {
              if (!deployedAccount.createAccountParams) {
                return;
              }
              const accountSigner =
                deployedAccount.signerId && (await this.locklift.keystore.getSigner(deployedAccount.signerId));
              if (!accountSigner) {
                throw new Error(`Signer id ${deployedAccount.signerId} not found`);
              }
              if (accountSigner.publicKey !== deployedAccount.publicKey) {
                throw new Error(
                  `Signer ${deployedAccount.signerId} publicKey doesn't match with account ${deployedAccount.deploymentName} publicKey, did you forgot to set seed phrase in locklift.config.ts ?`,
                );
              }

              const account = await this.locklift.factory.accounts.addExistingAccount({
                ...deployedAccount.createAccountParams,
                address: new Address(deployedAccount.address),
              } as AddExistingAccountParams);

              this.setAccountToStore({
                accountName: deployedAccount.deploymentName,
                account,
                signer: accountSigner,
              });
            }),
          ),
        ),
      );
    }

    contracts.forEach(({ deploymentName, contractName, address }) => {
      debugger;
      this.setContractToStore({
        deploymentName: deploymentName,
        contract: this.locklift.factory.getDeployedContract(contractName, new Address(address)),
      });
    });
  };
  fixture = async (fixtureConfig?: { include?: Array<string>; exclude?: Array<string> }) => {
    const { include, exclude } = fixtureConfig || {};
    if (include && exclude) {
      throw new Error("includes and excludes can't be defined together");
    }
    const deployFiles = fs.readdirSync(this.deployFolderPath);

    const deploymentsConfig = deployFiles
      .map((file) => {
        try {
          return require(path.join(this.deployFolderPath, file)) as {
            default: () => Promise<any>;
            tag: string;
            dependencies?: Array<string>;
          };
        } catch {
          return undefined;
        }
      })
      .filter(isT)
      .map((el, idx, arr) => ({ ...el, dependenciesCount: calculateDependenciesCount(arr, el.tag, el.tag) }))
      .sort((prev, next) => prev.dependenciesCount.deep - next.dependenciesCount.deep);

    const includedDependencies = include
      ? deploymentsConfig.filter(({ tag }) => include.some((include) => tag === include))
      : exclude
      ? deploymentsConfig.filter(({ tag }) => !exclude.some((exclude) => exclude === tag))
      : deploymentsConfig;

    const notResolvedDependencies = includedDependencies
      .map((deployment) => ({
        ...deployment,
        canBeInitialized:
          !deployment.dependencies ||
          deployment.dependencies.some((dependency) =>
            includedDependencies.some((included) => dependency === included.tag),
          ),
      }))
      .filter(({ canBeInitialized }) => !canBeInitialized);

    if (notResolvedDependencies.length > 0) {
      throw new Error(
        `${notResolvedDependencies.map(({ tag }) => `Tag ${tag} can't be initialized without required dependencies`)}`,
      );
    }
    if (includedDependencies.length > 0) {
      await lastValueFrom(
        from(includedDependencies).pipe(
          concatMap(({ default: deployFunction, tag }) => {
            if (deployFunction && "name" in deployFunction) {
              return deployFunction();
            }
            return of(undefined);
          }),
        ),
      );
    }
  };
}
