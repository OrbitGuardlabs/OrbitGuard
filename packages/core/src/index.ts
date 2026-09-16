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