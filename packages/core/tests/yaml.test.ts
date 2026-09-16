/**
 * Unit tests for YAML policy parsing.
 */

import { describe, it, expect } from 'vitest';
import { orbit, type Policy } from '../src/index';

describe('YAML Policy Parsing', () => {
  const validYamlPolicy = `
agent: test-agent
contracts:
  - contract-a
  - contract-b
functions:
  contract-a:
    - func1
    - func2
  contract-b:
    - func3
limits:
  perTransaction: 10000
  daily: 50000
approvals:
  above: 5000
  quorum: 2-of-3
expiry: 2099-12-31T23:59:59Z
`;

  it('should parse a valid YAML policy', () => {
    const policy = orbit.parseYaml(validYamlPolicy);
    
    expect(policy.agent).toBe('test-agent');
    expect(policy.contracts).toEqual(['contract-a', 'contract-b']);
    expect(policy.functions['contract-a']).toEqual(['func1', 'func2']);
    expect(policy.functions['contract-b']).toEqual(['func3']);
    expect(policy.limits.perTransaction).toBe(10000);
    expect(policy.limits.daily).toBe(50000);
    expect(policy.approvals.above).toBe(5000);
    expect(policy.approvals.quorum).toBe('2-of-3');
    expect(policy.expiry).toBe('2099-12-31T23:59:59.000Z');
  });

  it('should throw error for YAML missing agent', () => {
    const yaml = `
contracts:
  - contract-a
expiry: 2099-12-31T23:59:59Z
`;
    expect(() => orbit.parseYaml(yaml)).toThrow('missing required field: agent');
  });

  it('should throw error for YAML missing contracts', () => {
    const yaml = `
agent: test-agent
expiry: 2099-12-31T23:59:59Z
`;
    expect(() => orbit.parseYaml(yaml)).toThrow('missing required field: contracts');
  });

  it('should throw error for YAML missing expiry', () => {
    const yaml = `
agent: test-agent
contracts:
  - contract-a
`;
    expect(() => orbit.parseYaml(yaml)).toThrow('missing required field: expiry');
  });

  it('should convert policy back to YAML', () => {
    const policy = orbit.policy({
      agent: 'yaml-test',
      contracts: ['c1', 'c2'],
      functions: {
        'c1': ['f1'],
      },
      limits: {
        perTransaction: 5000,
      },
      approvals: {
        above: 1000,
        quorum: 'single',
      },
      expiry: '2027-06-01T00:00:00Z',
    });
    
    const yaml = orbit.toYaml(policy);
    
    // Should contain key fields
    expect(yaml).toContain('yaml-test');
    expect(yaml).toContain('c1');
    expect(yaml).toContain('c2');
    expect(yaml).toContain('5000');
    expect(yaml).toContain('2027-06-01T00:00:00Z');
  });

  it('should round-trip policy through YAML', () => {
    const original = orbit.policy({
      agent: 'roundtrip-test',
      contracts: ['contract-x', 'contract-y'],
      functions: {
        'contract-x': ['funcA', 'funcB'],
        'contract-y': ['funcC'],
      },
      limits: {
        perTransaction: 20000,
        daily: 100000,
      },
      approvals: {
        above: 10000,
        quorum: '2-of-3',
        totalApprovers: 3,
        requiredApprovals: 2,
      },
      expiry: '2028-12-31T23:59:59Z',
    });
    
    const yaml = orbit.toYaml(original);
    const parsed = orbit.parseYaml(yaml);
    
    // Check all fields match
    expect(parsed.agent).toBe(original.agent);
    expect(parsed.contracts).toEqual(original.contracts);
    expect(parsed.functions).toEqual(original.functions);
    expect(parsed.limits).toEqual(original.limits);
    expect(parsed.approvals.above).toBe(original.approvals.above);
    expect(parsed.approvals.quorum).toBe(original.approvals.quorum);
    // expiry is normalized to ISO-8601 UTC on parse, so compare in that form
    expect(parsed.expiry).toBe(new Date(original.expiry).toISOString());
  });
});