# Locklift-deploy


<p align="center">
  <a href="https://github.com/venom-blockchain/developer-program">
    <img src="https://raw.githubusercontent.com/venom-blockchain/developer-program/main/vf-dev-program.png" alt="Logo" width="366.8" height="146.4">
  </a>
</p>

<p align="center">
    <p align="center">
        <a href="/LICENSE">
            <img alt="GitHub" src="https://img.shields.io/badge/license-Apache--2.0-orange" />
        </a>
        <a href="https://www.npmjs.com/package/locklift-deploy">
            <img alt="npm" src="https://img.shields.io/npm/v/locklift-deploy">
        </a>
    </p>
</p>


[Locklift](https://github.com/broxus/locklift) plugin for deployments management and better testing.

- [Installation](#installation)
- [Quickstart](#quickstart)
- [Configuration](#configuration)
  - [Extra locklift.config networks' options](#extra-lockliftconfig-networks-options)
    - [deploy](#deploy)
- [How to Deploy Contracts](#how-to-deploy-accounts)
  - [The deploy `command`](#the-deploy-command)
  - [Deploy scripts](#deploy-scripts)
  - [Deploying contracts](#deploying-contracts)
  - [Deploying accounts](#deploying-accounts)
  - [Saving external contracts to deployments](#saving-external-contracts-to-deployments)

- [Testing Deployed Contracts](#testing-deployed-contracts)
- [Tags and Dependencies](#tags-and-dependencies)

### Installation

```bash
npm i locklift-deploy
```

And add the following statement to your `locklift.config.ts`:

```typescript
import "locklift-deploy";
import { Deployments } from "locklift-deploy";

declare module "locklift" {
    //@ts-ignore
    export interface Locklift {
        deployments: Deployments<FactorySource>;
    }
}
```

### Quickstart

Before going into the details, let's look at the very basic functionality of **locklift-deploy.**

**locklift-deploy** allows you to write [`deploy scripts`](#deploy-scripts) in the `deploy` folder. Each of these files that look as follows will be executed in turn when you execute the following task: `locklift -n <networkName> deploy`

```typescript
// deploy/00-deploy-sample.ts
export default async () => {
	const signer = await locklift.keystore.getSigner('0');
    await locklift.deployments.deploy({
            deployConfig: {
                contract: "Sample",
                publicKey: signer.publicKey,
                initParams: { _nonce: locklift.utils.getRandomNonce() },
                constructorParams: { _state: 123 },
                value: locklift.utils.toNano(2)
            },
            deploymentName: "Sample1",// user-defined custom name
        },
        true // enable logs
    );
};

export const tag = "sample1";
```

Furthermore you can also ensure these scripts are executed in test too by calling `await deployments.fixture({include: ['sample1']})` in your test.

This is a huge benefit for testing since you are not required to replicate the deployment procedure in your tests. The tag feature (as seen in the script above) and [dependencies](#tags-and-dependencies) will also make your life easier when writing complex deployment procedures.

You can even group deploy scripts in different sub folder and ensure they are executed in their logical order.

Furthermore locklift-deploy can also support a multi-chain settings with multiple deploy folder specific to each network.

### Configuration

#### Extra locklift.config networks' options

##### deploy

The deploy field override the deploy option and let you define a set of sub-folders containing the deploy scripts to be executed for exact network.

You can thus have one network that will be executing mainnet deployment and other networks deployments, etc.

You could also have a folder that deploy contracts that are live on mainnet but that you need to replicate for your test or local network.

```bash
{
  networks: {
    local: {
      deploy: [ 'common/', 'deploy-local/']
    },
    test: {
      deploy: ['common/', 'deploy-test/']
    },
    main: {
      deploy: [ 'deploy-main/' ]
    }
  }
}
```

In this case, the project structure might look like this:

```
///
deploy
  ├── deploy-local
  │    └── local-migration-1.ts
  │    └── local-migration-2.ts
  ├── common 
  │    └── common-migration.ts
  ├── deploy-test
  │    └── test-migration.ts
  └── deploy-main
       └── main-migration.ts
```

### How to Deploy Contracts

#### The `deploy` command

`locklift --network <networkName> deploy [options and flags]`

This is a new task that the `locklift-deploy` adds. As the name suggests it deploys contracts. To be exact it will look for files in the folder `deploy` or whatever was configured in `networks.<networkName>.deploy`, see [config](#deploy).

It will scan for files in alphabetical order and execute them in turn.

##### Options

`--tags <tags>`: only execute deploy scripts with the given tags (separated by whitespaces) and their dependencies (see more info [here](#tags-and-dependecies) about tags and dependencies)

#### Deploy scripts

The deploy scripts need to be of the following type :

```typescript
export default async () => {
    // out deployment code
};
export const tag = "sample1";
// optional
export const dependencies = ["sample2", "sample3", "sample4"];
```

The tags is a list of string that when the *deploy* command is executed with, the script will be executed. In other word if the deploy command is executed with a tag that does not belong to that script, that script will not be executed unless it is a dependency of a script that does get executed.

The dependencies is a list of tag that will be executed if that script is executed. So if the script is executed, every script whose tag match any of the dependencies will be executed first.

These set of fields allow more flexibility to organize the scripts. You are not limited to alphabetical order and you can even organise deploy script in sub folders.

#### Deploying and retrieving contracts

Contracts could be easily deployed and saved for further usage via `locklift.deployments.deploy` function:

```typescript
// deploy/00-deploy-sample.ts
...
	const signer = await locklift.keystore.getSigner('0');
    await locklift.deployments.deploy({
            // We use same config for regular locklift factory deployments
            deployConfig: {
                contract: "Sample",
                publicKey: signer.publicKey,
                initParams: { _nonce: locklift.utils.getRandomNonce() },
                constructorParams: { _state: 123 },
                value: locklift.utils.toNano(2)
            },
            deploymentName: "Sample1",// user-defined custom name
        },
        true // enable logs
    );
...
```

All deploy artifacts are saved to disk now, so that you can get instance of deployed contract via `deployments.getContract<ContractAbi>(deploymentName)` in any other script:

```typescript
// 01-use-sample.ts
...
const sample = locklift.deployments.getContract<SampleAbi>("Sample1");
...
```

#### Deploying and retrieving accounts

Accounts could be easily deployed and saved for further usage via `locklift.deployments.deployAccounts` function:

```typescript
// deploy/02-deploy-account.ts
...
// multiple accounts could be deployed at once
await locklift.deployments.createAccounts([
      {
         deploymentName: "Deployer", // user-defined custom account name
         signerId: "0", // locklift.keystore.getSigner("0") <- id for getting access to the signer
         accountSettings: {
            type: WalletTypes.EverWallet,
            value: locklift.utils.toNano(2),
         },
      },
   ],
   true // enableLogs
);
...
```

All deploy artifacts are saved to disk now, so that you can get instance of deployed account via `deployments.getAccount(deploymentName)` in any other script:

```typescript
// 03-use-account.ts
...
const deployer = locklift.deployments.getAccount("Deployer");
...
```

#### Saving external contracts to deployments

Sometimes we want to use contract that was deployed outside of our scripts or was deployed by internal message, for example through some kind of "factory" contract. In such a case we can use low-level method for manual saving deployment artifact:

```typescript
// save arbitrary contract
locklift.deployments.saveContract({
    deploymentName: "FarmingPool_WEVER-USDT",
    contractName: "FarmingPool",
    address: SOME_ADDRESS
});

// save account
locklift.deployments.saveAccount({})
```

### Testing Deployed Contracts

You can continue using the usual test command:

```
locklift test
```

Tests can use the `locklift.deployments.fixture(config?: { include?: Array<string>; exclude?: Array<string> })` function to run the deployment. You can also choose what tags you want/don't want to execute if you want.

Here is an example of a test:

```typescript
describe('Token', () => {
  it('testing 1 2 3', async function () {
    // execute only 'token-deploy' tag
    await locklift.deployments.fixture({include: ['token-deploy']});
    const token = await locklift.deployments.getContract<TokenAbi>('Token'); // Token is available because the fixture was executed
    console.log(token.address);
  });
    
  it('testing 4 5 6', async function () {
    // execute all tags except 'token-deploy'
    await locklift.deployments.fixture({exclude: ['token-deploy']});
    ...
  });
});
```

### Tags and Dependencies

It is possible to execute only specific parts of the deployments with `locklift deploy --tags <tags>`

Tags represent what the deploy script acts on. In general it will be a single string value, the name of the contract it deploys or modifies.

Then if another deploy script has such tag as a dependency, then when this latter deploy script has a specific tag and that tag is requested, the dependency will be executed first.

Here is an example of two deploy scripts :

```typescript
export default async () => {
   await locklift.deployments.deployAccounts([
          {
             deploymentName: "Deployer",
             signerId: "0",
             accountSettings: {
                type: WalletTypes.EverWallet,
                value: toNano(10),
             },
          },
       ],
       true // enableLogs
   );
};

export const tag = "create-account";
```

```typescript
export default async () => {
    const deployer = locklift.deployments.getAccount("Deployer");
    await locklift.deployments.deploy({
            deployConfig: {
                contract: "Sample",
                publicKey: deployer.signer.publicKey,
                initParams: { _nonce: locklift.utils.getRandomNonce() },
                constructorParams: { _state: 123 },
                value: locklift.utils.toNano(2)
            },
            deploymentName: "Sample1",// user-defined custom name
        },
        true // enable logs
    );
};

export const tag = "sample1";
// this ensure the 'create-account' script above is executed first, so `deployments.getAccount('Deployer')` succeeds
export const dependencies = ["create-account"]; 
```

As you can see the second one depends on the first. This is because the second script depends on a tag that the first script registers as using.
