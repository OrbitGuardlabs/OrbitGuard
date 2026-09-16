/**
 * OrbitGuard Policy Engine
 */

import * as yaml from 'js-yaml';

export type ContractId = string;
export type FunctionName = string;
export type LimitPeriod = 'perTransaction' | 'daily' | 'weekly' | 'monthly';
export type QuorumType = 'none' | 'single' | 'm-of-n' | `${number}-of-${number}`;

export interface ApprovalConfig {
  above: number;
  quorum: QuorumType;
  totalApprovers?: number;
  requiredApprovals?: number;
}

export interface PolicyLimits {
  perTransaction?: number;
  daily?: number;
  weekly?: number;
  monthly?: number;
}

export interface Policy {
  agent: string;
  contracts: ContractId[];
  functions: Record<ContractId, FunctionName[]>;
  limits: PolicyLimits;
  approvals: ApprovalConfig;
  expiry: string;
}

export interface ProposedTransaction {
  contract: ContractId;
  function: FunctionName;
  amount: number;
  label?: string;
  timestamp?: string;
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason: string;
  checks: PolicyCheck[];
  requiresApproval: boolean;
  approvalRequired: ApprovalConfig | null;
}

export type PolicyCheck =
  | { type: 'contract'; status: 'pass'; contract: ContractId }
  | { type: 'contract'; status: 'fail'; contract: ContractId; reason: string }
  | { type: 'function'; status: 'pass'; contract: ContractId; function: FunctionName }
  | { type: 'function'; status: 'fail'; contract: ContractId; function: FunctionName; reason: string }
  | { type: 'limit'; status: 'pass'; period: LimitPeriod; limit: number; amount: number }
  | { type: 'limit'; status: 'fail'; period: LimitPeriod; limit: number; amount: number; reason: string }
  | { type: 'expiry'; status: 'pass'; expiry: string }
  | { type: 'expiry'; status: 'fail'; expiry: string; reason: string };

export interface YamlPolicy {
  agent: string;
  contracts: string[];
  functions: Record<string, string[]>;
  limits: { perTransaction?: number; daily?: number; weekly?: number; monthly?: number };
  approvals: { above: number; quorum: string; totalApprovers?: number; requiredApprovals?: number };
  expiry: string;
}

export class PolicyBuilder {
  private _agent: string = '';
  private _contracts: ContractId[] = [];
  private _functions: Record<ContractId, FunctionName[]> = {};
  private _limits: PolicyLimits = {};
  private _approvals: ApprovalConfig = { above: 0, quorum: 'none' };
  private _expiry: string = '';

  agent(name: string): this { this._agent = name; return this; }
  contracts(...c: ContractId[]): this { this._contracts = c; return this; }
  functions(fnMap: Record<ContractId, FunctionName[]>): this { this._functions = fnMap; return this; }
  limits(limits: PolicyLimits): this { this._limits = limits; return this; }
  approvals(a: ApprovalConfig): this { this._approvals = a; return this; }
  expiry(date: string): this { this._expiry = date; return this; }

  build(): Policy {
    if (!this._agent) throw new Error('Policy agent name is required');
    if (this._contracts.length === 0) throw new Error('At least one contract must be specified');
    if (!this._expiry) throw new Error('Policy expiry date is required');
    return {
      agent: this._agent, contracts: this._contracts, functions: this._functions,
      limits: this._limits, approvals: this._approvals, expiry: this._expiry,
    };
  }
}

export function createPolicy(config: Partial<Policy>): Policy {
  const b = new PolicyBuilder();
  if (config.agent) b.agent(config.agent);
  if (config.contracts?.length) b.contracts(...config.contracts);
  if (config.functions) b.functions(config.functions);
  if (config.limits) b.limits(config.limits);
  if (config.approvals) b.approvals(config.approvals);
  if (config.expiry) b.expiry(config.expiry);
  return b.build();
}

export function parseYamlPolicy(yamlContent: string): Policy {
  const p: YamlPolicy = yaml.load(yamlContent) as YamlPolicy;
  if (!p.agent) throw new Error('YAML policy missing required field: agent');
  if (!p.contracts?.length) throw new Error('YAML policy missing required field: contracts');
  if (!p.expiry) throw new Error('YAML policy missing required field: expiry');
  return {
    agent: p.agent, contracts: p.contracts, functions: p.functions || {},
    limits: { perTransaction: p.limits?.perTransaction, daily: p.limits?.daily, weekly: p.limits?.weekly, monthly: p.limits?.monthly },
    approvals: { above: p.approvals?.above ?? 0, quorum: (p.approvals?.quorum ?? 'none') as QuorumType, totalApprovers: p.approvals?.totalApprovers, requiredApprovals: p.approvals?.requiredApprovals },
    expiry: normalizeExpiry(p.expiry),
  };
}

export function policyToYaml(policy: Policy): string {
  const yp: YamlPolicy = {
    agent: policy.agent, contracts: policy.contracts, functions: policy.functions,
    limits: policy.limits,
    approvals: { above: policy.approvals.above, quorum: policy.approvals.quorum, totalApprovers: policy.approvals.totalApprovers, requiredApprovals: policy.approvals.requiredApprovals },
    expiry: policy.expiry,
  };
  return yaml.dump(yp, { indent: 2 });
}

function parseDate(ds: string): Date {
  const d = new Date(ds);
  if (isNaN(d.getTime())) throw new Error('Invalid date: ' + ds);
  return d;
}

/**
 * js-yaml auto-converts unquoted ISO timestamps to Date objects.
 * Normalize expiry to a canonical ISO-8601 UTC string so Policy.expiry is
 * always a string, regardless of how the policy was defined.
 */
function normalizeExpiry(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) throw new Error('Invalid expiry date: ' + String(value));
  return d.toISOString();
}

export function evaluatePolicy(
  policy: Policy, tx: ProposedTransaction, dailySpend?: number, weeklySpend?: number, monthlySpend?: number,
): PolicyCheckResult {
  const checks: PolicyCheck[] = [];
  const now = new Date();
  const expDate = parseDate(policy.expiry);
  
  if (now > expDate) {
    const msg = `Policy expired on ${policy.expiry}`;
    checks.push({ type: 'expiry', status: 'fail', expiry: policy.expiry, reason: msg });
    return { allowed: false, reason: msg, checks, requiresApproval: false, approvalRequired: null };
  }
  checks.push({ type: 'expiry', status: 'pass', expiry: policy.expiry });
  
  if (!policy.contracts.includes(tx.contract)) {
    const msg = `Transaction denied: Contract '${tx.contract}' is not in the allowed list`;
    checks.push({ type: 'contract', status: 'fail', contract: tx.contract, reason: `Contract '${tx.contract}' is not in the allowed list` });
    return { allowed: false, reason: msg, checks, requiresApproval: false, approvalRequired: null };
  }
  checks.push({ type: 'contract', status: 'pass', contract: tx.contract });
  
  const allowedFns = policy.functions[tx.contract] || [];
  if (!allowedFns.includes(tx.function)) {
    const msg = `Transaction denied: Function '${tx.function}' is not allowed on contract '${tx.contract}'`;
    checks.push({ type: 'function', status: 'fail', contract: tx.contract, function: tx.function, reason: `Function '${tx.function}' is not allowed on contract '${tx.contract}'` });
    return { allowed: false, reason: msg, checks, requiresApproval: false, approvalRequired: null };
  }
  checks.push({ type: 'function', status: 'pass', contract: tx.contract, function: tx.function });
  
  const amt = tx.amount;
  if (policy.limits.perTransaction !== undefined && amt > policy.limits.perTransaction) {
    const msg = `Transaction denied: Amount ${amt} exceeds per-transaction limit of ${policy.limits.perTransaction}`;
    checks.push({ type: 'limit', status: 'fail', period: 'perTransaction', limit: policy.limits.perTransaction, amount: amt, reason: `Amount ${amt} exceeds per-transaction limit of ${policy.limits.perTransaction}` });
    return { allowed: false, reason: msg, checks, requiresApproval: false, approvalRequired: null };
  }
  if (policy.limits.perTransaction !== undefined) {
    checks.push({ type: 'limit', status: 'pass', period: 'perTransaction', limit: policy.limits.perTransaction, amount: amt });
  }
  
  if (policy.limits.daily !== undefined && dailySpend !== undefined) {
    const proj = dailySpend + amt;
    if (proj > policy.limits.daily) {
      const msg = `Transaction denied: Projected daily spend ${proj} exceeds daily limit of ${policy.limits.daily}`;
      checks.push({ type: 'limit', status: 'fail', period: 'daily', limit: policy.limits.daily, amount: proj, reason: `Projected daily spend ${proj} exceeds daily limit of ${policy.limits.daily}` });
      return { allowed: false, reason: msg, checks, requiresApproval: false, approvalRequired: null };
    }
    checks.push({ type: 'limit', status: 'pass', period: 'daily', limit: policy.limits.daily, amount: proj });
  }
  
  if (policy.limits.weekly !== undefined && weeklySpend !== undefined) {
    const proj = weeklySpend + amt;
    if (proj > policy.limits.weekly) {
      const msg = `Transaction denied: Projected weekly spend ${proj} exceeds weekly limit of ${policy.limits.weekly}`;
      checks.push({ type: 'limit', status: 'fail', period: 'weekly', limit: policy.limits.weekly, amount: proj, reason: `Projected weekly spend ${proj} exceeds weekly limit of ${policy.limits.weekly}` });
      return { allowed: false, reason: msg, checks, requiresApproval: false, approvalRequired: null };
    }
    checks.push({ type: 'limit', status: 'pass', period: 'weekly', limit: policy.limits.weekly, amount: proj });
  }
  
  if (policy.limits.monthly !== undefined && monthlySpend !== undefined) {
    const proj = monthlySpend + amt;
    if (proj > policy.limits.monthly) {
      const msg = `Transaction denied: Projected monthly spend ${proj} exceeds monthly limit of ${policy.limits.monthly}`;
      checks.push({ type: 'limit', status: 'fail', period: 'monthly', limit: policy.limits.monthly, amount: proj, reason: `Projected monthly spend ${proj} exceeds monthly limit of ${policy.limits.monthly}` });
      return { allowed: false, reason: msg, checks, requiresApproval: false, approvalRequired: null };
    }
    checks.push({ type: 'limit', status: 'pass', period: 'monthly', limit: policy.limits.monthly, amount: proj });
  }
  
  const needsApproval = policy.approvals.above > 0 && amt > policy.approvals.above;
  return {
    allowed: true, reason: 'Within policy boundary', checks, requiresApproval: needsApproval,
    approvalRequired: needsApproval ? policy.approvals : null,
  };
}

export const orbit = {
  policy: createPolicy,
  evaluate: evaluatePolicy,
  parseYaml: parseYamlPolicy,
  toYaml: policyToYaml,
  builder: () => new PolicyBuilder(),
};
