import { FactoryType } from "locklift/internal/factory";
import { Address, Contract, Locklift } from "locklift";
import {
  AccountWithSigner,
  AddExistingAccountParams,
  CreateAccountParams,
  CreateAccountParamsWithoutPk,
  DeployContractParams,
  LogStruct,
} from "./types";
import path from "path";
import fs from "fs-extra";
import { concatMap, defer, from, lastValueFrom, mergeMap, of, tap, toArray } from "rxjs";
import { calculateDependenciesCount } from "./utils";

export class Deployments<T extends FactoryType = FactoryType> {
  deploymentsStore: Record<string, Contract<any>> = {};
  accountsStore: Record<string, AccountWithSigner> = {};
  private readonly pathToLogFile: string;
  constructor(private readonly locklift: Locklift<T>, private readonly deployFolderPath: string) {
    fs.ensureDirSync(path.resolve(deployFolderPath));
    this.pathToLogFile = path.resolve(deployFolderPath, "log.json");
    if (!fs.existsSync(this.pathToLogFile)) {
      this.createNewLogFile();
    }
  }

  private createNewLogFile = () => {
    fs.ensureDirSync(path.resolve(this.pathToLogFile));
    fs.writeFileSync(
      this.pathToLogFile,
      JSON.stringify({
        contracts: {},
        accounts: {},
      }),
    );
  };
  private getLogContent = (): LogStruct<T> => {
    return JSON.parse(fs.readFileSync(this.pathToLogFile, "utf8")) as LogStruct<T>;
  };
  private writeToLogFile = (
    writeValue:
      | { type: "contract"; deployContract: DeployContractParams<T>; name: string; address: string }
      | { type: "account"; createAccount: CreateAccountParams; signerId: string; name: string; address: string },
  ) => {
    const log = this.getLogContent();
    switch (writeValue.type) {
      case "account":
        log.accounts = {
          ...log.accounts,
          [writeValue.name]: {
            ...writeValue.createAccount,
            address: writeValue.address,
            signerId: writeValue.signerId,
          },
        };
        break;
      case "contract":
        log.contracts = {
          ...log.contracts,
          [writeValue.name]: { deployContractParams: writeValue.deployContract, address: writeValue.address },
        };
        break;
    }
    fs.writeFileSync(this.pathToLogFile, JSON.stringify(log, null, 4));
  };
  public clearLogFile = () => {
    this.createNewLogFile();
  };
  deploy = ({ deployConfig, contractName }: { deployConfig: DeployContractParams<T>; contractName: string }) => {
    return this.locklift.factory.deployContract(deployConfig).then((res) => {
      this.setContract({ contractName, contract: res.contract });
      this.writeToLogFile({
        type: "contract",
        name: contractName,
        deployContract: deployConfig,
        address: res.contract.address.toString(),
      });
      return res;
    });
  };
  loadFromLogFile = async () => {
    const { accounts, contracts } = this.getLogContent();

    if (Object.entries(accounts).length > 0) {
      await lastValueFrom(
        from(Object.entries(accounts)).pipe(
          mergeMap(([accountName, accountParams]) =>
            defer(async () => {
              const accountSigner = await this.locklift.keystore.getSigner(accountParams.signerId);
              if (!accountSigner) {
                throw new Error(`Signer id ${accountParams.signerId} not found`);
              }
              if (accountSigner.publicKey !== accountParams.publicKey) {
                throw new Error(
                  `Signer ${accountParams.signerId} publicKey doesn't match with account ${accountName} publicKey, did you forgot to set seed phrase in locklift.config.ts ?`,
                );
              }
              const account = await this.locklift.factory.accounts.addExistingAccount(
                accountParams as AddExistingAccountParams,
              );

              this.setAccount({
                accountName,
                account: account,
                signer: accountSigner,
              });
            }),
          ),
        ),
      );
    }

    Object.entries(contracts).forEach(([contractName, contractParams]) => {
      this.setContract({
        contractName: contractName,
        contract: this.locklift.factory.getDeployedContract(
          contractParams.deployContractParams.contract as string,
          new Address(contractParams.address),
        ),
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
        return require(path.join(this.deployFolderPath, file)) as {
          default: () => Promise<any>;
          tag: string;
          dependencies?: Array<string>;
        };
      })
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
  };
  setContract = ({ contractName, contract }: { contract: Contract<any>; contractName: string }) => {
    this.deploymentsStore[contractName] = contract;
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

  createAccounts = async (
    accounts: Array<
      {
        accountName: string;
        accountSettings: CreateAccountParamsWithoutPk<CreateAccountParams>;
      } & { signerId: string }
    >,
  ): Promise<Array<AccountWithSigner>> => {
    return lastValueFrom(
      from(accounts).pipe(
        concatMap((accountSetup) =>
          defer(async () => {
            const { accountSettings, accountName, signerId } = accountSetup;
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
            this.writeToLogFile({
              type: "account",
              name: accountName,
              createAccount: { ...accountSettings, publicKey: signer.publicKey },
              address: account.address.toString(),
              signerId,
            });

            return {
              account,
              signer,
              accountName,
            };
          }),
        ),
        tap(({ account, accountName, signer }) => {
          this.accountsStore[accountName] = { account, signer };
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

  /**
   * Low level function that provides possibility to set Accounts directly.
   * In most of the cases you shouldn't use it
   */
  setAccount = ({ account, accountName, signer }: AccountWithSigner & { accountName: string }) => {
    this.accountsStore[accountName] = { account, signer };
  };
}
