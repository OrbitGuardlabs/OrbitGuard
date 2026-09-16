/**
 * OrbitGuard Core Package
 * 
 * Policy engine for autonomous agents on Stellar/Soroban.
 * Provides contract/function allowlisting, spend limits,
 * approval workflows, and policy evaluation.
 * 
 * @package OrbitGuard SDK
 */

export {
  // Types
  type ContractId,
  type FunctionName,
  type LimitPeriod,
  type QuorumType,
  type ApprovalConfig,
  type PolicyLimits,
  type Policy,
  type ProposedTransaction,
  type PolicyCheckResult,
  type PolicyCheck,
  type YamlPolicy,
  
  // Policy Builder
  PolicyBuilder,
  createPolicy,
  
  // YAML support
  parseYamlPolicy,
  policyToYaml,
  
  // Evaluation
  evaluatePolicy,
  
  // Public API
  orbit,
} from './policy';

export {
  ApprovalStore,
  type ApprovalRequest,
  type PendingApproval,
} from './approvals';

export { runApprovalCli } from './approval-cli';

export {
  // Simulation
  buildInvocationTx,
  simulateTransaction,
  simulateInvoke,
  parseSimulationResponse,
  describeStateChange,
  explain,
  explainOneLine,
  DEFAULT_RPC_URL,
  DEFAULT_NETWORK_PASSPHRASE,
  TESTNET_NATIVE_SAC,
  // Simulation types
  type SimulationOptions,
  type InvokeInput,
  type SimulationResult,
  type StateChangeSummary,
} from './simulation';