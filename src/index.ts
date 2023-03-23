import "./type-extensions";
import { Contract, Locklift, LockliftConfig, Signer, WalletTypes } from "locklift";
import path from "path";
import fs from "fs";
import { addPlugin, ExtenderActionParams } from "locklift/plugins";
import { PLUGIN_NAME } from "./type-extensions";
import { concatMap, defer, from, lastValueFrom, of, tap, toArray } from "rxjs";
import { Account } from "locklift/everscale-client";
import { FactoryType } from "locklift/internal/factory";

export * from "./type-extensions";

//plugin store that should be initialized  in the initializer
export interface DeploymentsStore {
  empty: Contract<any>;
}
type CreateAccountSettings = Parameters<Locklift<any>["factory"]["accounts"]["addNewAccount"]>[0];
type A<T extends CreateAccountSettings> = T extends Extract<
  T,
  { type: WalletTypes.EverWallet | WalletTypes.WalletV3 | WalletTypes.HighLoadWalletV2 }
>
  ? Omit<T, "publicKey">
  : T extends Extract<T, { type: WalletTypes.MsigAccount }>
  ? Omit<T, "publicKey">
  : never;

export type AccountWithSigner = { account: Account; signer: Signer };
const calculateDependenciesCount = (
  arr: Array<{ tag: string; dependencies?: Array<string> }>,
  tag: string,
  initialTag: string,
): { deps: Array<string>; deep: number } => {
  if (arr.length === 0) {
    return { deep: 0, deps: [] };
  }

  const searchedEl = arr.find((el) => el.tag === tag);
  if (!searchedEl) {
    return { deep: 0, deps: [] };
  }
  if (!searchedEl.dependencies) {
    return { deep: 0, deps: [] };
  }
  return searchedEl.dependencies.reduce(
    (acc, next) => {
      if (initialTag === next) {
        throw new Error(`The tag can't depend on self, tag: ${initialTag}, conflict with ${searchedEl.tag}`);
      }
      const { deps, deep } = calculateDependenciesCount(arr, next, initialTag);
      return {
        deps: [...acc.deps, ...deps],
        deep: acc.deep + deep + 1,
      };
    },
    { deep: 0, deps: (searchedEl.dependencies || []) as Array<string> },
  );
};
export class Deployments<T extends FactoryType = FactoryType> {
  deploymentsStore: Record<string, Contract<any>> = {};
  accountsStore: Record<string, AccountWithSigner> = {};

  constructor(private readonly locklift: Locklift<T>) {}

  fixture = async (fixtureConfig?: { include?: Array<string>; exclude?: Array<string> }) => {
    const { include, exclude } = fixtureConfig || {};
    if (include && exclude) {
      throw new Error("includes and excludes can't be defined together");
    }
    const deployFolders = path.resolve("deploy");
    const deployFiles = fs.readdirSync(deployFolders);

    const deploymentsConfig = deployFiles
      .map((file) => {
        return require(path.join(deployFolders, file)) as {
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
        accountSettings: A<CreateAccountSettings>;
      } & ({ signerId: string } | { signer: Signer })
    >,
  ): Promise<Array<AccountWithSigner>> => {
    return lastValueFrom(
      from(accounts).pipe(
        concatMap((accountSetup) =>
          defer(async () => {
            const { accountSettings, accountName, ...signerConfig } = accountSetup;
            const signer =
              "signerId" in signerConfig
                ? await this.locklift.keystore.getSigner(signerConfig.signerId).then((mayBeSigner) => {
                    if (!mayBeSigner) {
                      throw new Error(`Signer with signerId ${signerConfig.signerId} not found`);
                    }
                    return mayBeSigner;
                  })
                : signerConfig.signer;

            // @ts-ignore
            const { account } = await this.locklift.factory.accounts.addNewAccount({
              ...accountSettings,
              publicKey: signer.publicKey,
            } as CreateAccountSettings);

            return {
              account,
              signer,
              accountName,
            };
          }),
        ),
        tap(({ account, accountName, signer }) => (this.accountsStore[accountName] = { account, signer })),
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

type LockliftConfigOptions = Locklift<any> extends Locklift<infer F> ? F : never;
// add plugin flow
addPlugin({
  // plugin name
  pluginName: PLUGIN_NAME,
  //Initializer function that will be called by locklift
  initializer: async ({
    network,
    locklift,
    config,
  }: {
    locklift: Locklift<any>;
    config: LockliftConfig<LockliftConfigOptions>;
    network?: string;
  }) => {
    // in this case we got custom config parameter `greetingPhrase` that was added in the type expansion file
    return new Deployments(locklift);
  },
  // Custom commands, this is array of functions that accepting `Commander` instance
  // command object already included default params, and pre action hook that append locklift instance (see the second command)
  commandBuilders: [
    //Example of running custom script
    {
      commandCreator: (command) =>
        command
          .name("TEST_COMMAND")
          .requiredOption("-ct, --checktest <checktest>", "To use for testing plugin")
          .action((options: ExtenderActionParams) => {
            require(path.resolve(process.cwd(), options.script || ""))?.default("HI!");
          }),
    },
    {
      commandCreator: (command) =>
        command
          .name("getcode")
          .requiredOption("--contract <contract>", "Contract name") // ------------------┐
          // in this case we are extending `ExtenderActionParams` and add new field `contract` from `requiredOption` method
          //                                             ┌-------------------------------┘
          .action((option: ExtenderActionParams & { contract: string }) => {
            console.log(option.locklift.factory.getContractArtifacts(option.contract).code);
            process.exit(0);
          }),
      //settings for skipping steps e.g. skip step build
      skipSteps: {
        build: true,
      },
    },
    // example of implementation get contract code function
  ],
});
