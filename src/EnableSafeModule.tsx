import { Button } from "./components/Button";
import {
  safe7579,
  safeRecoveryModule,
} from "../contracts.base-sepolia.json";
import { abi as safeAbi } from "./abis/Safe.json";
import { abi as safe7579Abi } from "./abis/Safe7579.json";
import { useCallback, useState } from "react";
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  ENTRYPOINT_ADDRESS_V07,
  createSmartAccountClient,
} from "permissionless";
import {
  createPimlicoBundlerClient,
  createPimlicoPaymasterClient,
} from "permissionless/clients/pimlico";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { signerToSafeSmartAccount } from "permissionless/accounts";

const EnableSafeModule = () => {
  const [isEnableModalLoading, setIsEnableModuleLoading] = useState(false);

  console.log(import.meta.env.VITE_PIMLICO_API_KEY)
  const enableSafe7579Module = useCallback(async () => {
    setIsEnableModuleLoading(true);

    const rpcUrl = baseSepolia.rpcUrls.default.http[0];

    // TODO Cache this value in local storage
    // For now, create a new account on every run.
    const signerPrivKey = generatePrivateKey();
    const signer = privateKeyToAccount(signerPrivKey);

    const bundlerUrl = `https://api.pimlico.io/v2/${baseSepolia.id}/rpc?apikey=${import.meta.env.VITE_PIMLICO_API_KEY}`;

    // Wagmi public client
    const publicClient = createPublicClient({
      transport: http(rpcUrl),
    });

    // Paymaster to sponsor UserOps (pay for gas)
    const paymasterClient = createPimlicoPaymasterClient({
      transport: http(bundlerUrl),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    });

    // Bundler (Submit UserOps)
    const bundlerClient = createPimlicoBundlerClient({
      transport: http(bundlerUrl),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    });

    // Wagmi compatible Safe ERC-4337 account
    const safeAccount = await signerToSafeSmartAccount(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      signer: signer,
      saltNonce: 0n,
      safeVersion: "1.4.1",
    });

    // Main object used to interact with Safe & originate UserOps
    const smartAccountClient = createSmartAccountClient({
      account: safeAccount,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      chain: baseSepolia,
      bundlerTransport: http(bundlerUrl),
      middleware: {
        sponsorUserOperation: paymasterClient.sponsorUserOperation,
        gasPrice: async () =>
          (await bundlerClient.getUserOperationGasPrice()).fast,
      },
    });

    console.debug("send batched userops");

    const executorModuleTypeId = 2;
    const oneWeekInSeconds = 60n * 60n * 24n * 7n;
    const installData = encodeAbiParameters(
      [
        { type: "address[]" },
        { type: "uint256[]" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        ["0x39A67aFa3b68589a65F43c24FEaDD24df4Bb74e7"], // guardians TODO get from form
        [1n], // weights
        1n, // threshold
        1n, // delay
        oneWeekInSeconds * 2n, // expiry
      ]
    );

    // This logic is using an embedded Safe account via Pimlico
    // TODO We may be able to use safe 7579 launchpad for all of this
    const userOpHash = await smartAccountClient.sendTransactions({
      transactions: [
        // Enable 7579 module
        {
          to: safeAccount.address,
          value: 0n,
          data: encodeFunctionData({
            abi: safeAbi,
            functionName: "enableModule",
            args: [safe7579],
          }),
        },
        // Set 7579 as fallback
        {
          to: safeAccount.address,
          value: 0n,
          data: encodeFunctionData({
            abi: safeAbi,
            functionName: "setFallbackHandler",
            args: [safe7579],
          }),
        },
        // Initialize adapter
        {
          to: safe7579 as `0x${string}`,
          value: 0n,
          data: encodeFunctionData({
            abi: safe7579Abi,
            functionName: "initializeAccount",
            args: [
              [], // Validators
              [
                {
                  module: safeRecoveryModule,
                  initData: installData,
                },
              ], // Executors
              [], // Fallbacks
              [], // Hooks
              {
                registry: "0x39A67aFa3b68589a65F43c24FEaDD24df4Bb74e7", // TODO Set to deployed registry (if needed)
                attesters: [],
                threshold: 0,
              },
            ],
          }),
        },
        // Install email recovery module
        // TODO This fails with 0x error, may need default executor or validator before this point
        // Can also try switching to launchpad init since this is a brand new
        {
          to: safe7579 as `0x${string}`,
          value: 0n,
          data: encodeFunctionData({
            abi: safe7579Abi,
            functionName: "installModule",
            args: [
              executorModuleTypeId,
              safeRecoveryModule,
              installData, // TODO likely error here
            ],
          }),
        },
      ],
    });

    console.debug("init userOpHash", userOpHash);

    // TODO Make sure module is actually enabling
  }, []);

  // if (isCheckModuleEnabledLoading) {
  //   return <Loader />;
  // }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: '100vh',
        gap: "2rem",
        flexDirection: "column",
      }}
    >
      <Button
        disabled={isEnableModalLoading}
        loading={isEnableModalLoading}
        onClick={enableSafe7579Module}
      >
        Enable Safe ERC-7579 Module
      </Button>

      {/* {isEnableModalLoading ? (
        <>Please check Safe Website to complete transaction</>
      ) : null} */}
    </div>
  );
};

export default EnableSafeModule;

/*
  // This code is the WalletConnect version of the logic in enableSafe7579Module w/o
  // ERC-4337/UserOp until email recovery module install. May be helpful in the future so left here.

  console.debug("1", "Enable 7579 Module");

  await writeContractAsync({
    abi: safeAbi,
    address,
    functionName: "enableModule",
    args: [safe7579]
  });

  console.debug("2", "Set as fallback handler");

  await writeContractAsync({
    abi: safeAbi,
    address,
    functionName: "setFallbackHandler",
    args: [safe7579]
  });

  console.debug("3", "Initiliaze Safe w/ 7579 Adapter");

  await writeContractAsync({
    abi: safe7579Abi,
    address: safe7579 as `0x{string}`,
    functionName: "initializeAccount",
    args: [
      [], // Validators
      [], // Executors TODO We may need to add a default
      [], // Fallbacks
      [], // Hooks
      {
        registry: zeroAddress, // TODO Set to deployed registry (if needed)
        attesters: [],
        threshold: 0,
      },
    ],
  });

  TODO Consider batching all of the above ^ via `safeAppsSDK.txs.send({ txs })` from @safe-global/safe-apps-sdk
  May also be able to use MultiCall3

  At this point, we should be setup for ERC-4337 & ERC-7579

  TODO This step currently reverts as it needs to be run via ERC-4337 Entrypoint (UserOp)
  Since this is likely the only UserOp we need to run, can directly submit to entrypoint
  console.debug("4", "Install email recovery module");

  // TODO Move to env
  const bundlerUrl = `https://api.pimlico.io/v2/${baseSepolia.id}/rpc?apikey=${import.meta.env.VITE_PIMLICO_API_KEY}`;
  const bundler = createBundlerClient({
    chain: baseSepolia,
    transport: http(bundlerUrl),
    entryPoint,
  });

  // console.debug("4.1", "Fetching bundler gas prices")

  const oneWeekInSeconds = 60n * 60n * 24n * 7n;
  // TODO Move to ConfigureSafeModule component so we can use guardian setup
  // TODO Check this is not already installed
  const installData = encodeAbiParameters(
    [
      { type: "address[]" },
      { type: "uint256[]" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
    ],
    [
      [zeroAddress], // guardians TODO get from form
      [1n], // weights
      1n, // threshold
      1n, // delay
      oneWeekInSeconds * 2n, // expiry
    ]
  );

  if (!publicClient) {
    throw new Error("Missing public client");
  }

  const nonce = await getAccountNonce(publicClient, {
    sender: address,
    entryPoint,
  });

  const executorModuleTypeId = 2; // Executor
  const rawUserOp = {
    sender: address,
    nonce,
    signature: "0x",
    callData: encodeFunctionData({
      abi: safe7579Abi,
      functionName: "installModule",
      args: [
        executorModuleTypeId,
        safeRecoveryModule,
        installData
      ]
    }),
    maxPriorityFeePerGas: 113000100n,
    maxFeePerGas: 113000100n,
  };

  console.debug("4.2", "Estimate UserOp gas");

  const userOpGasEstimate = await bundler.estimateUserOperationGas({
    userOperation: rawUserOp
  });

  console.debug("4.3", "Sign UserOp");

  const userOp: UserOperation<"v0.7"> = {
    ...userOpGasEstimate,
    ...rawUserOp,
    signature: "0xTODO, get safe to sign"
  };

  console.debug("4.4", "userOp", userOp);

  console.debug("4.5", "Send UserOp to Entrypoint");

  await writeContractAsync({
    abi: entryPointAbi,
    address: entryPoint as `0x{string}`,
    functionName: "handleOps",
      [userOp],
      zeroAddress, // beneficiary
    ]
  });

  console.debug("Done!");
*/

/*
  Psuedo-code for Safe7579 Launchpad, would be used to initialize a new Safe from scratch
  This would not be usable on an exisiting Safe that has already been deployed, and likely needs some re-work.
  Likely can be used with Pimlico Safe.

  const setupData = encodeFunctionData({
    abi: launchpadAbi,
    functionName: "initSafe7579",
    args: [
      safe7579,
      [], // executors TODO We may need a default
      [], // fallbacks
      [], // hooks
      [], // attester addr
      0, // threshold
    ],
  });

  const initData = {
    singleton: address,
    owners: [signer.address],
    threshold: 1, // Same here
    setupTo: safe7579Launchpad,
    setupData,
    safe7579,
    validators: [],
    callData: "0x",
    // TODO We might be able to use this to setup email recovery module in the same call
    // Solidity example below,
    // callData: abi.encodeCall(
    //     IERC7579Account.execute,
    //     (
    //         ModeLib.encodeSimpleSingle(),
    //         ExecutionLib.encodeSingle({
    //             target: address(target),
    //             value: 0,
    //             callData: abi.encodeCall(MockTarget.set, (1337))
    //         })
    //     )
    // )
  };

  const encodedSetupSafeCall = encodeFunctionData({
    abi: launchpadAbi,
    functionName: "setupSafe",
    args: [initData],
  });
*/
