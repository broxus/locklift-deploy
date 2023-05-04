import "./type-extensions";
import { Locklift, LockliftConfig } from "locklift";
import path from "path";
import { addPlugin, ExtenderActionParams } from "locklift/plugins";
import { PLUGIN_NAME } from "./type-extensions";
import commander from "commander";

import { Deployments } from "./deployments";
import fs from "fs-extra";
import { TagFile } from "./types";
import { getTagsTree } from "./utils";

export * from "./deployments";
export * from "./type-extensions";
const program = new commander.Command("");
type LockliftConfigOptions = Locklift<any> extends Locklift<infer F> ? F : never;
addPlugin({
  pluginName: PLUGIN_NAME,
  initializer: async ({
    network,
    locklift,
    config,
  }: {
    locklift: Locklift<any>;
    config: LockliftConfig<LockliftConfigOptions>;
    network?: string;
  }) => {
    if (!network) {
      return;
      // throw new Error("Deployments can't be run without network");
    }
    const networkID = await locklift.provider.getProviderState().then((res) => res.networkId);
    const pathToDeployFolder = path.resolve("deploy");
    fs.ensureDirSync(pathToDeployFolder);
    const networkDeploy = config.networks[network].deploy?.map((el) => path.join(pathToDeployFolder, el));

    const deploymentsFiles = (networkDeploy ? networkDeploy : [pathToDeployFolder])
      .reduce((acc, next) => {
        return [...acc, ...(getTagsTree(next)?.map((el) => el.path) || [])];
      }, [] as Array<string>)
      .map((pathToFile) => require(pathToFile) as TagFile);

    return new Deployments(locklift, deploymentsFiles, network, networkID);
  },

  commandBuilders: [
    {
      commandCreator: (command) =>
        command
          .name("deploy")
          .option("--disable-build", "Disable automatic contracts build", false)
          .option("-t, --tags [value...]", "Tags for deploy")
          .option("-r, --reset", "Reset deployments store")
          .action(async (option: ExtenderActionParams & { tags?: Array<string>; reset?: boolean }) => {
            if (!option.network) {
              throw new Error("Deployments can't be run without network");
            }
            if (option.reset) {
              option.locklift.deployments.reset();
              process.exit(0);
            }

            await option.locklift.deployments.load();

            if (option.tags && option.tags.length > 0) {
              await option.locklift.deployments.fixture({
                include: option.tags,
              });
            } else {
              await option.locklift.deployments.fixture();
            }
            process.exit(0);
          }),
      skipSteps: { build: process.argv.includes("--disable-build") },
    },
  ],
});
