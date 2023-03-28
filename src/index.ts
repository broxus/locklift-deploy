import "./type-extensions";
import { Locklift, LockliftConfig } from "locklift";
import path from "path";
import { addPlugin, ExtenderActionParams } from "locklift/plugins";
import { PLUGIN_NAME } from "./type-extensions";

import { Deployments } from "./deployments";
export * from "./deployments";
export * from "./type-extensions";

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
      throw new Error("Deployments can't be run without network");
    }
    const networkID = await locklift.provider.getProviderState().then((res) => res.networkId);
    return new Deployments(locklift, path.resolve("deploy"), network, networkID);
  },

  commandBuilders: [
    {
      commandCreator: (command) =>
        command
          .name("deploy")
          .option("-t, --tags [value...]", "Tags for deploy")
          .action(async (option: ExtenderActionParams & { tags?: Array<string> }) => {
            if (option.tags && option.tags.length > 0) {
              return option.locklift.deployments.fixture({
                include: option.tags,
              });
            }
            await option.locklift.deployments.fixture();
            process.exit(0);
          }),
    },
  ],
});
