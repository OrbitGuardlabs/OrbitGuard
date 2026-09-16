/**
 * Unit tests for the OrbitGuard Policy Engine.
 *
 * Covers: allowed calls, disallowed contracts, disallowed functions,
 * over-limit amounts, expired policies, and approval-required thresholds.
 */

import { describe, it, expect } from 'vitest';
import { orbit, type Policy, type ProposedTransaction } from '../src/index';

function createTestPolicy(overrides: Partial<Policy> = {}): Policy {
  return orbit.policy({
    agent: 'test-agent',
    contracts: ['contract-a', 'contract-b'],
    functions: {
      'contract-a': ['func1', 'func2'],
      'contract-b': ['func3'],
    },
    limits: {
      perTransaction: 10000,
      daily: 50000,
    },
    approvals: {
      above: 5000,
      quorum: '2-of-3',
      totalApprovers: 3,
      requiredApprovals: 2,
    },
    expiry: '2099-12-31T23:59:59Z',
    ...overrides,
  });
}

function createTransaction(overrides: Partial<ProposedTransaction> = {}): ProposedTransaction {
  return {
    contract: 'contract-a',
    function: 'func1',
    amount: 1000,
    label: 'test-transaction',
    ...overrides,
  };
}
describe('Policy Engine', () => {
  describe('Policy Creation', () => {
    it('should create a valid policy with all required fields', () => {
      const policy = createTestPolicy();
      expect(policy.agent).toBe('test-agent');
      expect(policy.contracts).toContain('contract-a');
      expect(policy.contracts).toContain('contract-b');
      expect(policy.functions['contract-a']).toContain('func1');
      expect(policy.limits.perTransaction).toBe(10000);
      expect(policy.approvals.above).toBe(5000);
      expect(policy.approvals.quorum).toBe('2-of-3');
      expect(policy.expiry).toBe('2099-12-31T23:59:59Z');
    });

    it('should throw when agent is missing', () => {
      expect(() =>
        orbit.policy({ contracts: ['contract-a'], expiry: '2099-12-31T23:59:59Z' }),
      ).toThrow('Policy agent name is required');
    });

    it('should throw when contracts are missing', () => {
      expect(() =>
        orbit.policy({ agent: 'test-agent', expiry: '2099-12-31T23:59:59Z' }),
      ).toThrow('At least one contract must be specified');
    });

    it('should throw when expiry is missing', () => {
      expect(() =>
        orbit.policy({ agent: 'test-agent', contracts: ['contract-a'] }),
      ).toThrow('Policy expiry date is required');
    });

    it('should support the builder pattern', () => {
      const policy = orbit
        .builder()
        .agent('builder-test')
        .contracts('c1', 'c2')
        .expiry('2099-12-31T23:59:59Z')
        .build();
      expect(policy.agent).toBe('builder-test');
      expect(policy.contracts).toEqual(['c1', 'c2']);
    });
  });

  describe('Policy Evaluation - Allowed Calls', () => {
    it('should allow transactions within the policy boundary', () => {
      const result = orbit.evaluate(createTestPolicy(), createTransaction({ amount: 1000 }));
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Within policy boundary');
      expect(result.requiresApproval).toBe(false);
      expect(result.checks).toHaveLength(4);
    });

    it('should allow but require approval above the threshold', () => {
      const result = orbit.evaluate(createTestPolicy(), createTransaction({ amount: 6000 }));
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalRequired?.quorum).toBe('2-of-3');
      expect(result.approvalRequired?.requiredApprovals).toBe(2);
      expect(result.approvalRequired?.totalApprovers).toBe(3);
    });

    it('should not require approval exactly at the threshold', () => {
      const result = orbit.evaluate(createTestPolicy(), createTransaction({ amount: 5000 }));
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });
  });

  describe('Policy Evaluation - Disallowed Contracts', () => {
    it('should deny transactions to contracts outside the allowlist', () => {
      const result = orbit.evaluate(
        createTestPolicy(),
        createTransaction({ contract: 'unauthorized-contract', amount: 100 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('unauthorized-contract');
      expect(result.checks[1]).toEqual({
        type: 'contract',
        status: 'fail',
        contract: 'unauthorized-contract',
        reason: expect.stringContaining('not in the allowed list'),
      });
    });
  });

  describe('Policy Evaluation - Disallowed Functions', () => {
    it('should deny transactions calling functions outside the allowlist', () => {
      const result = orbit.evaluate(
        createTestPolicy(),
        createTransaction({ function: 'drainTreasury', amount: 100 }),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('drainTreasury');
      expect(result.checks[2]).toEqual({
        type: 'function',
        status: 'fail',
        contract: 'contract-a',
        function: 'drainTreasury',
        reason: expect.stringContaining('not allowed'),
      });
    });

    it('should deny functions on contracts with no function entry', () => {
      const policy = createTestPolicy({ functions: { 'contract-a': ['func1'] } });
      const result = orbit.evaluate(
        policy,
        createTransaction({ contract: 'contract-b', function: 'func3' }),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('func3');
    });
  });

  describe('Policy Evaluation - Over Limit Amounts', () => {
    it('should deny transactions above the per-transaction limit', () => {
      const result = orbit.evaluate(createTestPolicy(), createTransaction({ amount: 15000 }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per-transaction limit');
    });

    it('should allow transactions exactly at the per-transaction limit', () => {
      const result = orbit.evaluate(createTestPolicy(), createTransaction({ amount: 10000 }));
      expect(result.allowed).toBe(true);
    });

    it('should deny when projected daily spend exceeds the daily limit', () => {
      const result = orbit.evaluate(
        createTestPolicy(),
        createTransaction({ amount: 5000 }),
        47000, // already spent today: 47000 + 5000 > 50000 daily limit
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('daily');
    });

    it('should allow when projected daily spend fits the daily limit', () => {
      const result = orbit.evaluate(
        createTestPolicy(),
        createTransaction({ amount: 5000 }),
        40000, // already spent today
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('Policy Evaluation - Expired Policies', () => {
    it('should deny all transactions once the policy is expired', () => {
      const policy = createTestPolicy({ expiry: '2020-01-01T00:00:00Z' });
      const result = orbit.evaluate(policy, createTransaction());
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('expired');
      expect(result.checks[0]).toEqual({
        type: 'expiry',
        status: 'fail',
        expiry: '2020-01-01T00:00:00Z',
        reason: expect.stringContaining('expired'),
      });
    });

    it('should allow transactions while the policy is valid', () => {
      const policy = createTestPolicy({ expiry: '2027-01-01T00:00:00Z' });
      const result = orbit.evaluate(policy, createTransaction());
      expect(result.allowed).toBe(true);
    });

    it('should reject policies with invalid expiry dates', () => {
      const policy = createTestPolicy({ expiry: 'not-a-date' });
      expect(() => orbit.evaluate(policy, createTransaction())).toThrow('Invalid date');
    });
  });

  describe('Policy Evaluation - Approval Quorums', () => {
    it('should carry single-approver config through to the result', () => {
      const policy = createTestPolicy({ approvals: { above: 1000, quorum: 'single' } });
      const result = orbit.evaluate(policy, createTransaction({ amount: 2000 }));
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalRequired?.quorum).toBe('single');
    });

    it('should carry m-of-n quorum config through to the result', () => {
      const policy = createTestPolicy({
        approvals: { above: 1000, quorum: 'm-of-n', totalApprovers: 5, requiredApprovals: 3 },
      });
      const result = orbit.evaluate(policy, createTransaction({ amount: 2000 }));
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalRequired?.totalApprovers).toBe(5);
      expect(result.approvalRequired?.requiredApprovals).toBe(3);
    });

    it('should never require approval when threshold is zero', () => {
      const policy = createTestPolicy({ approvals: { above: 0, quorum: 'none' } });
      const result = orbit.evaluate(policy, createTransaction({ amount: 1_000_000 }));
      expect(result.requiresApproval).toBe(false);
    });
  });
});