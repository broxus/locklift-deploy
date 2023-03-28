import { Deployments } from "./deployments";
import { ConfigState } from "locklift/internal/config";

export const PLUGIN_NAME = "deployments" as const;

type LockliftExtention = {
  [key in typeof PLUGIN_NAME]: Deployments;
};
type LockliftConfigExtension = {
  [key in typeof PLUGIN_NAME]?: {
    deployFolderName?: string;
  };
};

// type extensions for locklift config
declare module "locklift" {
  export interface LockliftConfig extends LockliftConfigExtension {}
  //@ts-ignore
  export interface Locklift extends LockliftExtention {}
  //@ts-ignore
}
type DeployOverride = {
  deploy?: Array<string>;
};
declare module "locklift/internal/config" {
  //@ts-ignore

  export interface NetworkValue<T extends ConfigState.EXTERNAL> extends DeployOverride {}
}
