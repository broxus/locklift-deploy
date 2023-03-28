import { WriteDeployInfo } from "./types";

export class Logger {
  printLog = (info: WriteDeployInfo) => {
    if (info.type === "Contract") {
      console.log(
        `Contract ${info.contractName} deployed, address: ${info.address}, deploymentName: ${info.deploymentName}`,
      );
    }
    if (info.type === "Account") {
      console.log(
        `Account type ${info.createAccountParams?.type} deployed, address: ${info.address}, deploymentName: ${info.deploymentName}`,
      );
    }
  };
}
