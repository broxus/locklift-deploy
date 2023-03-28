import "./type-extensions";
import { Locklift, LockliftConfig } from "locklift";
import path from "path";
import { addPlugin } from "locklift/plugins";
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
      throw new Error("Deployments can't ve run without network");
    }
    const networkID = await locklift.provider.getProviderState().then((res) => res.networkId);
    return new Deployments(locklift, path.resolve("deployments"), network, networkID);
  },

  commandBuilders: [],
});
