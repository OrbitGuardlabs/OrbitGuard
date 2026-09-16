/**
 * Unit tests for the OrbitGuard simulation module (offline — no network).
 *
 * The end-to-end testnet check lives at the bottom and only runs when
 * ORBITGUARD_E2E=1 is set, so `npm test` stays hermetic and fast.
 */

import { describe, it, expect } from 'vitest';
import { xdr, Keypair, nativeToScVal } from '@stellar/stellar-sdk';
import {
  parseSimulationResponse,
  describeStateChange,
  buildInvocationTx,
  explain,
  explainOneLine,
  TESTNET_NATIVE_SAC,
  DEFAULT_RPC_URL,
} from '../src';
import type { SimulationResult } from '../src';

const META = {
  contract: TESTNET_NATIVE_SAC,
  function: 'symbol',
  durationMs: 100,
  rpcUrl: DEFAULT_RPC_URL,
};

function ttlEntry(liveUntil: number): xdr.LedgerEntry {
  return new xdr.LedgerEntry({
    lastModifiedLedgerSeq: 100,
    data: xdr.LedgerEntryData.ttl(
      new xdr.TtlEntry({ keyHash: Buffer.alloc(32, 7), liveUntilLedgerSeq: liveUntil }),
    ),
    ext: new xdr.LedgerEntryExt(0),
  });
}

function ttlKey(): xdr.LedgerKey {
  return xdr.LedgerKey.ttl(new xdr.LedgerKeyTtl({ keyHash: Buffer.alloc(32, 7) }));
}

describe('parseSimulationResponse', () => {
  it('should parse a successful simulation with decoded return value and fee', () => {
    const result = parseSimulationResponse(
      {
        minResourceFee: '12323',
        latestLedger: 4712077,
        events: [{}, {}],
        stateChanges: [],
        result: { retval: nativeToScVal('native') },
      },
      META,
    );

    expect(result.success).toBe(true);
    expect(result.fee).toBe(12323);
    expect(result.latestLedger).toBe(4712077);
    expect(result.events).toBe(2);
    expect(result.error).toBeUndefined();
    expect(result.returnValue).toBe('native');
    expect(result.contract).toBe(TESTNET_NATIVE_SAC);
    expect(result.function).toBe('symbol');
  });

  it('should parse a failed simulation and carry the host error', () => {
    const result = parseSimulationResponse(
      {
        error: 'HostError: Error(Storage, MissingValue)\nEvent log: ...',
        latestLedger: 42,
        events: [],
        stateChanges: [],
      },
      META,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('MissingValue');
    expect(result.returnValue).toBeUndefined();
  });

  it('should tolerate a response with no optional fields at all', () => {
    const result = parseSimulationResponse({}, META);
    expect(result.success).toBe(true);
    expect(result.fee).toBe(0);
    expect(result.stateChanges).toEqual([]);
    expect(result.events).toBe(0);
  });
});

describe('describeStateChange', () => {
  it('should classify a created entry', () => {
    const summary = describeStateChange({ key: ttlKey(), before: null, after: ttlEntry(99999) });
    expect(summary.action).toBe('created');
    expect(summary.entryType).toBe('ttl');
    expect((summary.after as { liveUntilLedger: number }).liveUntilLedger).toBe(99999);
  });

  it('should classify an updated entry and read the ttl value', () => {
    const summary = describeStateChange({
      key: ttlKey(),
      before: ttlEntry(11111),
      after: ttlEntry(99999),
    });
    expect(summary.action).toBe('updated');
    expect((summary.before as { liveUntilLedger: number }).liveUntilLedger).toBe(11111);
    expect((summary.after as { liveUntilLedger: number }).liveUntilLedger).toBe(99999);
  });

  it('should classify a deleted entry', () => {
    const summary = describeStateChange({ key: ttlKey(), before: ttlEntry(1), after: null });
    expect(summary.action).toBe('deleted');
  });

  it('should render a contract-data key with contract + key description', () => {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: xdr.ScAddress.scAddressTypeContract(Buffer.alloc(32, 9) as unknown as xdr.Hash),
        key: nativeToScVal('admin'),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );
    const summary = describeStateChange({ key, before: null, after: null });
    expect(summary.entryType).toBe('contract-data');
    expect(summary.key).toContain('contract-data');
    expect(summary.key).toContain('admin');
  });
});

describe('buildInvocationTx', () => {
  it('should build an invoke-host-function transaction with the requested call', () => {
    const kp = Keypair.random();
    const tx = buildInvocationTx({
      contractId: TESTNET_NATIVE_SAC,
      method: 'symbol',
      args: [],
      sourcePublicKey: kp.publicKey(),
      sequence: '42',
    });

    expect(tx.operations).toHaveLength(1);
    expect((tx.operations[0] as { type: string }).type).toBe('invokeHostFunction');
    expect(Number(tx.sequence)).toBe(43); // built on top of the provided sequence
  });

  it('should encode numeric and string args as ScVals', () => {
    const kp = Keypair.random();
    const tx = buildInvocationTx({
      contractId: TESTNET_NATIVE_SAC,
      method: 'transfer',
      args: [kp.publicKey(), 1000],
      sourcePublicKey: kp.publicKey(),
      sequence: '0',
    });
    expect(tx.operations).toHaveLength(1);
  });
});

describe('explain', () => {
  const baseSim: SimulationResult = {
    success: true,
    contract: TESTNET_NATIVE_SAC,
    function: 'symbol',
    fee: 12323,
    latestLedger: 4712077,
    returnValue: 'native',
    stateChanges: [],
    events: 2,
    durationMs: 789,
    rpcUrl: DEFAULT_RPC_URL,
  };

  it('should render the README Live Policy Check style for an allowed check', () => {
    const lines = explain(baseSim, {
      allowed: true,
      reason: 'Transaction is within policy boundary',
      checks: [{}, {}, {}],
      requiresApproval: false,
    });

    expect(lines[0]).toBe('✅ Allowed — Transaction is within policy boundary');
    expect(lines[1]).toBe('   3 checks passed · no approval required');
    expect(lines[2]).toContain('fee 12,323 stroops');
    expect(lines[2]).toContain('no contract state changes');
    expect(lines[3]).toContain('Returns "native"');
    expect(lines[lines.length - 1]).toBe('   789ms');
  });

  it('should mark approval-required actions', () => {
    const lines = explain(baseSim, {
      allowed: true,
      reason: 'Within policy boundary',
      checks: [{}],
      requiresApproval: true,
    });
    expect(lines[1]).toContain('approval required');
    expect(lines[1]).not.toContain('no approval');
  });

  it('should render denials with the policy reason', () => {
    const lines = explain(baseSim, {
      allowed: false,
      reason: 'Transaction denied: Amount 15000 exceeds per-transaction limit of 10000',
      checks: [{}, {}],
      requiresApproval: false,
    });
    expect(lines[0]).toBe('⛔ Denied — Amount 15000 exceeds per-transaction limit of 10000');
    expect(lines[1]).toBe('   2 checks passed · no approval required');
  });

  it('should render simulation failures with the host error', () => {
    const failed: SimulationResult = {
      ...baseSim,
      success: false,
      error: 'HostError: Error(Contract, UnknownFunction)\nEvent log: ...',
    };
    const lines = explain(failed);
    expect(lines[0]).toBe('⛔ Simulation failed — CDLZFC3S…CYSC.symbol() did not execute');
    expect(lines.join('\n')).toContain('HostError: Error(Contract, UnknownFunction)');
  });

  it('should render account balance deltas for account state changes', () => {
    const sim: SimulationResult = {
      ...baseSim,
      stateChanges: [
        {
          entryType: 'account',
          key: 'account GAAAAAAA…',
          action: 'updated',
          before: { balance: 1_000_000_000, seqNum: 5 },
          after: { balance: 999_000_000, seqNum: 6 },
        },
      ],
    };
    const lines = explain(sim);
    expect(lines.join('\n')).toContain('updates account');
    expect(lines.join('\n')).toContain('balance -1,000,000 stroops');
  });

  it('should flag expensive simulations in XLM terms', () => {
    const expensive: SimulationResult = { ...baseSim, fee: 12_000_000 };
    const lines = explain(expensive);
    expect(lines.join('\n')).toContain('≥ 1.2 XLM');
  });
});

describe('explainOneLine', () => {
  it('should produce a single-line audit-friendly summary', () => {
    const sim: SimulationResult = {
      success: true,
      contract: TESTNET_NATIVE_SAC,
      function: 'symbol',
      fee: 12323,
      latestLedger: 1,
      stateChanges: [],
      events: 0,
      durationMs: 10,
      rpcUrl: DEFAULT_RPC_URL,
    };
    const line = explainOneLine(sim, { allowed: true, reason: 'Within policy boundary' });
    expect(line).toContain('Allowed — Within policy boundary');
    expect(line).toContain('fee 12323 stroops');
    expect(line.split('\n')).toHaveLength(1);
  });
});

// ============================================================================
// End-to-end testnet check (opt-in, so default runs stay offline)
// ============================================================================

describe.skipIf(!process.env.ORBITGUARD_E2E)('simulation against Soroban testnet (live)', () => {
  it('should simulate symbol() on the well-known native SAC and decode the return value', async () => {
    const { simulateInvoke } = await import('../src');
    const sim = await simulateInvoke({
      contractId: TESTNET_NATIVE_SAC,
      method: 'symbol',
      args: [],
    });

    expect(sim.success).toBe(true);
    expect(sim.error).toBeUndefined();
    expect(sim.returnValue).toBe('native');
    expect(sim.fee).toBeGreaterThan(0);
    expect(sim.rpcUrl).toBe(DEFAULT_RPC_URL);
  }, 30_000);
});