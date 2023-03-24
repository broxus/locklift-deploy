import { Deployments } from "./deployments";

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
}
