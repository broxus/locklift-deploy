import { Deployments } from "./index";

//Your plugin name, it should be renamed
export const PLUGIN_NAME = "deployments" as const;

type LockliftExtention = {
  [key in typeof PLUGIN_NAME]: Deployments;
};
type LockliftConfigExtension = {};
// type extensions for locklift config
declare module "locklift" {
  export interface LockliftConfig extends LockliftConfigExtension {}
  //@ts-ignore
  export interface Locklift extends LockliftExtention {}
}
