import AccountFactory from "./abis/AccountFactory.json";
import Launchpad from "./abis/Safe7579Launchpad.json";
import {
  Address,
  Hex,
  encodeFunctionData,
  encodePacked,
  zeroAddress,
} from "viem";
import { getPublicClient } from "./clients";
import {
  // ACCOUNT_FACTORY_ADDRESS,
  safe7579Launchpad,
  safe7579,
  // SAFE_SINGLETON_ADDRESS,
} from "../contracts.base-sepolia.json";
import { Execution, encodeUserOpCallData } from "./userop";

type ModuleInit = {
  module: Address;
  initData: Hex;
};

type RegistryConfig = {
  attesters: Address[];
  threshold: number;
};

type SafeConfig = {
  owners: Address[];
  threshold: number;
};

export const SAFE_SINGLETON_ADDRESS: Address =
  "0xC7a5a28849D7309d7E97Ae398C798A9C82db4138";

// create a new account
// todo: add client side logic instead of rpc calls
export async function createAccount({
  salt,
  validators,
  executors,
  fallbacks,
  hooks,
  safeConfig,
  registryConfig,
  initialExecution,
}: {
  salt: Hex;
  validators: ModuleInit[];
  executors: ModuleInit[];
  fallbacks: ModuleInit[];
  hooks: ModuleInit[];
  safeConfig: SafeConfig;
  registryConfig: RegistryConfig;
  initialExecution: Execution;
}): Promise<{
  address: Address;
  initCode: Hex;
  callData: Hex;
}> {
  const initData = {
    singleton: SAFE_SINGLETON_ADDRESS,
    owners: safeConfig.owners,
    threshold: safeConfig.threshold,
    setupTo: safe7579Launchpad,
    setupData: encodeFunctionData({
      abi: Launchpad.abi,
      functionName: "initSafe7579",
      args: [
        safe7579,
        executors,
        fallbacks,
        hooks,
        registryConfig.attesters,
        registryConfig.threshold,
      ],
    }),
    safe7579: safe7579,
    validators: validators,
    callData: encodeUserOpCallData({
      executions: [initialExecution],
    }),
  };

  const publicClient = getPublicClient();

  const initHash = (await publicClient.readContract({
    address: safe7579Launchpad,
    abi: Launchpad.abi,
    functionName: "hash",
    args: [initData],
  })) as Hex;

  const factoryInitializer = encodeFunctionData({
    abi: Launchpad.abi,
    functionName: "preValidationSetup",
    args: [initHash, zeroAddress, ""],
  });

  let initCode;

  // const initCode = encodePacked(
  //   ["address", "bytes"],
  //   [
  //     ACCOUNT_FACTORY_ADDRESS,
  //     encodeFunctionData({
  //       abi: AccountFactory.abi,
  //       functionName: "createProxyWithNonce",
  //       args: [safe7579Launchpad, factoryInitializer, salt],
  //     }),
  //   ]
  // );

  const callData = encodeFunctionData({
    abi: Launchpad.abi,
    functionName: "setupSafe",
    args: [initData],
  });

  // const safeProxyCreationCode = (await publicClient.readContract({
  //   address: ACCOUNT_FACTORY_ADDRESS,
  //   abi: AccountFactory.abi,
  //   functionName: "proxyCreationCode",
  //   args: [],
  // })) as Hex;

  const address = (await publicClient.readContract({
    address: safe7579Launchpad,
    abi: Launchpad.abi,
    functionName: "predictSafeAddress",
    args: [
      safe7579Launchpad,
      // ACCOUNT_FACTORY_ADDRESS,
      // safeProxyCreationCode,
      salt,
      factoryInitializer,
    ],
  })) as Address;

  return {
    address,
    initCode,
    callData,
  };
}
