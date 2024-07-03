import { getBundlerClient, getPublicClient } from "./clients";
import AccountInterface from "./abis/Safe7579.json";
import {
  Address,
  Hex,
  encodeFunctionData,
  encodeAbiParameters,
  pad,
  encodePacked,
  slice,
} from "viem";
import {
  UserOperation,
  getAccountNonce,
  getUserOperationHash,
} from "permissionless";
import { ENTRY_POINT_ADDRESS } from "./contracts";
import { EntryPoint } from "permissionless/types";
import { sepolia } from "viem/chains";
import { formatUserOp } from "./formatUserOp";

export const CALL_TYPE = {
  SINGLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
  BATCH: "0x0100000000000000000000000000000000000000000000000000000000000000",
};

export const ENTRY_POINT_ADDRESS: ENTRYPOINT_ADDRESS_V07_TYPE =
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032";


export type Execution = {
  target: Address;
  value: string;
  callData: Hex;
};

export async function createAndSignUserOp({
  callData,
  activeAccount,
  chosenValidator,
}: {
  callData: Hex;
  activeAccount: any;
  chosenValidator: any;
}) {
  const op = await createUnsignedUserOp(
    callData,
    activeAccount,
    chosenValidator
  );
  return await signUserOp(op, activeAccount, chosenValidator);
}

export async function createUnsignedUserOp(
  callData: Hex,
  activeAccount: any,
  chosenValidator: {
    address: Address;
    mockSignature: Hex;
    signMessageAsync: (message: Hex, activeAccount: any) => {};
  }
): Promise<any> {
  const initCode = await getUserOpInitCode(activeAccount);

  const publicClient = getPublicClient();
  const currentNonce = await getAccountNonce(publicClient, {
    sender: activeAccount.address,
    entryPoint: ENTRY_POINT_ADDRESS as EntryPoint,
    key: BigInt(
      pad(chosenValidator.address, {
        dir: "right",
        size: 24,
      }) || 0
    ),
  });

  const partialUserOp: UserOperation<"v0.7"> = {
    sender: activeAccount.address,
    nonce: currentNonce,
    callData: callData,
    factory: initCode == "0x" ? undefined : slice(initCode, 0, 20),
    factoryData: initCode == "0x" ? undefined : slice(initCode, 20),
    maxFeePerGas: BigInt(1),
    maxPriorityFeePerGas: BigInt(1),
    preVerificationGas: BigInt(1000000),
    verificationGasLimit: BigInt(1000000),
    callGasLimit: BigInt(1000000),
    // @dev mock signature used for estimating gas
    signature: chosenValidator.mockSignature,
  };

  const bundlerClient = getBundlerClient();

  const gasPriceResult = await bundlerClient.getUserOperationGasPrice();

  partialUserOp.maxFeePerGas = gasPriceResult.fast.maxFeePerGas;
  partialUserOp.maxPriorityFeePerGas = gasPriceResult.fast.maxPriorityFeePerGas;

  const gasEstimate = await bundlerClient.estimateUserOperationGas({
    userOperation: partialUserOp,
  });

  partialUserOp.preVerificationGas = gasEstimate.preVerificationGas;
  partialUserOp.verificationGasLimit = gasEstimate.verificationGasLimit;

  partialUserOp.callGasLimit = gasEstimate.callGasLimit;

  // reset signature
  partialUserOp.signature = "0x";

  return {
    ...partialUserOp,
  };
}

export async function signUserOp(
  userOp: UserOperation<"v0.7">,
  activeAccount: any,
  chosenValidator: any
): Promise<any> {
  const userOpHash = getUserOperationHash({
    userOperation: userOp,
    chainId: sepolia.id,
    entryPoint: ENTRY_POINT_ADDRESS,
  });
  const signature = await chosenValidator.signMessageAsync(
    userOpHash,
    activeAccount
  );
  userOp.signature = signature;
  return userOp;
}

export async function submitUserOpToBundler(
  userOp: UserOperation<"v0.7">
): Promise<Hex> {
  const bundlerClient = getBundlerClient();
  return await bundlerClient.sendUserOperation({
    userOperation: userOp,
  });
}

export function encodeUserOpCallData({
  executions,
}: {
  executions: Execution[];
}): Hex {
  if (executions.length === 0) {
    throw new Error("No executions");
  } else if (executions.length === 1) {
    const { target, value, callData } = executions[0];
    return encodeFunctionData({
      functionName: "execute",
      abi: AccountInterface.abi,
      args: [
        CALL_TYPE.SINGLE,
        encodePacked(
          ["address", "uint256", "bytes"],
          [target, BigInt(Number(value)), callData]
        ),
      ],
    });
  } else {
    return encodeFunctionData({
      functionName: "execute",
      abi: AccountInterface.abi,
      args: [
        CALL_TYPE.BATCH,
        encodeAbiParameters(
          [
            {
              components: [
                {
                  name: "target",
                  type: "address",
                },
                {
                  name: "value",
                  type: "uint256",
                },
                {
                  name: "callData",
                  type: "bytes",
                },
              ],
              name: "Execution",
              type: "tuple[]",
            },
          ],
          // @ts-ignore
          [executions]
        ),
      ],
    });
  }
}

async function getUserOpInitCode(account: any): Promise<Hex> {
  if ((await isContract(account)) == false) {
    return account.initCode;
  }
  return "0x";
}

async function isContract(account: any): Promise<boolean> {
  const publicClient = getPublicClient();
  const code = await publicClient.getBytecode({ address: account.address });
  return code !== undefined;
}
