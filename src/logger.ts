import { WriteDeployInfo } from "./types";
import { WalletTypes } from "locklift";

export class Logger {
  printLog = (info: WriteDeployInfo) => {
    if (info.type === "Contract") {
      console.log(
        `Contract ${info.contractName} deployed, address: ${info.address}, deploymentName: ${info.deploymentName}`,
      );
    }
    if (info.type === "Account") {
      const walletType = info.createAccountParams?.type
        ? WalletTypes[info.createAccountParams.type]
        : "UnrecognizedWallet";

      console.log(
        `Account type ${walletType} deployed, address: ${info.address}, deploymentName: ${info.deploymentName}`,
      );
    }
  };
}
