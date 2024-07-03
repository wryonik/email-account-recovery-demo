import { createClient, http, createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { pimlicoBundlerActions } from "permissionless/actions/pimlico";
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless";

export const getBundlerClient = () =>
  createClient({
    transport: http(import.meta.env.NEXT_PUBLIC_BUNDLER_URL!),
    chain: sepolia,
  })
    .extend(bundlerActions(ENTRYPOINT_ADDRESS_V07))
    .extend(pimlicoBundlerActions(ENTRYPOINT_ADDRESS_V07));

export const getPublicClient = () => {
  return createPublicClient({
    transport: http(import.meta.env.NEXT_PUBLIC_RPC_URL!),
    chain: sepolia,
  });
};
