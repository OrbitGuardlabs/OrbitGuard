/**
 * OrbitGuard Soroban Simulation
 *
 * Dry-runs a proposed contract invocation against live network state via
 * Soroban RPC `simulateTransaction` and produces a structured, plain-language
 * result — before anything is signed.
 */

import {
  Operation,
  TransactionBuilder,
  Account,
  Networks,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk';
import { Server, type Api } from '@stellar/stellar-sdk/rpc';
import type { ContractId, FunctionName } from './policy';

/** Default RPC endpoint: Soroban testnet. */
export const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org';
export const DEFAULT_NETWORK_PASSPHRASE = Networks.TESTNET;

/** The native XLM Stellar Asset Contract on testnet — a well-known public
 *  contract whose address is deterministically derived per network. Used by
 *  examples and tests to prove simulation works end-to-end. */
export const TESTNET_NATIVE_SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

export interface SimulationOptions {
  /** Soroban RPC URL. Defaults to Soroban testnet. */
  rpcUrl?: string;
  /** Network passphrase. Defaults to testnet. */
  networkPassphrase?: string;
  /** Base fee for the envelope, in stroops. Defaults to 100_000. */
  fee?: number;
  /** Injected RPC server (for tests). Overrides rpcUrl. */
  server?: unknown;
}

export interface InvokeInput {
  /** Contract address (C... strkey) to invoke. */
  contractId: ContractId;
  /** Function name to call. */
  method: FunctionName;
  /** Arguments, converted with nativeToScVal. */
  args?: unknown[];
  /** Source account public key (G...). */
  sourcePublicKey: string;
  /** Source account sequence number. */
  sequence: string;
}

export interface StateChangeSummary {
  /** Ledger entry kind: account, trustline, contract-data, ttl, ... */
  entryType: string;
  /** Human-readable identifier of the changed entry. */
  key: string;
  /** created | updated | deleted */
  action: 'created' | 'updated' | 'deleted';
  /** Native (JSON) representation before the call, when available. */
  before?: unknown;
  /** Native (JSON) representation after the call, when available. */
  after?: unknown;
}

export interface SimulationResult {
  success: boolean;
  contract: ContractId;
  function: FunctionName;
  /** Minimum resource fee reported by the simulation, in stroops. */
  fee: number;
  /** Ledger height known to the RPC when it responded. */
  latestLedger: number;
  /** Native (decoded) return value of the invoked function, on success. */
  returnValue?: unknown;
  /** Host error text, on failure. */
  error?: string;
  /** Contract/account state changes extracted from the simulation. */
  stateChanges: StateChangeSummary[];
  /** Number of diagnostic events emitted. */
  events: number;
  /** Wall-clock duration of the RPC call. */
  durationMs: number;
  /** RPC endpoint used. */
  rpcUrl: string;
}

/**
 * Build an unsigned Soroban transaction invoking `method` on `contractId`.
 * The returned transaction is ready for `simulateTransaction` (and, once
 * signed, for submission).
 */
export function buildInvocationTx(
  input: InvokeInput,
  opts: SimulationOptions = {},
): Transaction {
  const fee = String(opts.fee ?? 100_000);
  const networkPassphrase = opts.networkPassphrase ?? DEFAULT_NETWORK_PASSPHRASE;
  const account = new Account(input.sourcePublicKey, input.sequence);
  const args = (input.args ?? []).map((a) => nativeToScVal(a));

  return new TransactionBuilder(account, { fee, networkPassphrase })
    .addOperation(
      Operation.invokeContractFunction({
        contract: input.contractId,
        function: input.method,
        args,
      }),
    )
    .setTimeout(60)
    .build();
}

/**
 * Map a raw simulation response to a structured SimulationResult.
 *
 * Pure function: no network, no SDK server needed — unit tests feed it
 * minimal plain-object responses shaped like the RPC's.
 */
export function parseSimulationResponse(
  sim: {
    error?: string;
    minResourceFee?: string;
    result?: { retval?: xdr.ScVal };
    stateChanges?: Array<{
      key: xdr.LedgerKey;
      before: xdr.LedgerEntry | null;
      after: xdr.LedgerEntry | null;
    }>;
    events?: unknown[];
    latestLedger?: number;
  },
  meta: { contract: ContractId; function: FunctionName; durationMs: number; rpcUrl: string },
): SimulationResult {
  const success = !sim.error;
  const stateChanges = (sim.stateChanges ?? []).map(describeStateChange);

  const result: SimulationResult = {
    success,
    contract: meta.contract,
    function: meta.function,
    fee: Number(sim.minResourceFee ?? 0),
    latestLedger: sim.latestLedger ?? 0,
    stateChanges,
    events: (sim.events ?? []).length,
    durationMs: meta.durationMs,
    rpcUrl: meta.rpcUrl,
  };

  if (success && sim.result?.retval) {
    result.returnValue = safeScValToNative(sim.result.retval);
  }
  if (!success) {
    result.error = sim.error;
  }
  return result;
}

function safeScValToNative(v: xdr.ScVal): unknown {
  try {
    return scValToNative(v);
  } catch {
    try {
      return v.toXDR('base64');
    } catch {
      return '<undecodable>';
    }
  }
}

const LEDGER_ENTRY_TYPE_NAMES: Record<number, string> = {
  0: 'account',
  1: 'trustline',
  2: 'offer',
  3: 'data',
  4: 'claimable-balance',
  5: 'liquidity-pool',
  6: 'contract-data',
  7: 'contract-code',
  10: 'config-setting',
  11: 'ttl',
};

function ledgerEntryTypeName(switchValue: number): string {
  return LEDGER_ENTRY_TYPE_NAMES[switchValue] ?? `unknown(${switchValue})`;
}

/**
 * Summarize one ledger entry change (before/after) in plain, inspectable
 * terms: what kind of entry, how it was identified, created/updated/deleted.
 */
export function describeStateChange(change: {
  key: xdr.LedgerKey;
  before: xdr.LedgerEntry | null;
  after: xdr.LedgerEntry | null;
}): StateChangeSummary {
  let entryType = 'unknown';
  let keyDesc = 'unknown';
  try {
    const k = change.key;
    switch (k.switch().value) {
      case xdr.LedgerEntryType.account().value: {
        entryType = 'account';
        keyDesc = `account ${k.account().accountId().toString().slice(0, 12)}…`;
        break;
      }
      case xdr.LedgerEntryType.trustline().value: {
        entryType = 'trustline';
        keyDesc = `trustline for ${k.trustLine().accountId().toString().slice(0, 12)}…`;
        break;
      }
      case xdr.LedgerEntryType.contractData().value: {
        entryType = 'contract-data';
        const cd = k.contractData();
        keyDesc = `contract-data ${cd.contract().toString().slice(0, 12)}… key=${JSON.stringify(safeScValToNative(cd.key()))}`;
        break;
      }
      case xdr.LedgerEntryType.contractCode().value: {
        entryType = 'contract-code';
        keyDesc = `contract-code ${Buffer.from(k.contractCode().hash()).toString('hex').slice(0, 16)}…`;
        break;
      }
      case xdr.LedgerEntryType.ttl().value: {
        entryType = 'ttl';
        keyDesc = `ttl for key hash ${Buffer.from(k.ttl().keyHash()).toString('hex').slice(0, 16)}…`;
        break;
      }
      default:
        entryType = ledgerEntryTypeName(k.switch().value as number);
        keyDesc = k.toXDR('base64').slice(0, 32);
        break;
    }
  } catch {
    try {
      keyDesc = change.key.toXDR('base64').slice(0, 32);
    } catch {
      keyDesc = '<undecodable key>';
    }
  }

  const action: StateChangeSummary['action'] =
    !change.before && change.after ? 'created'
    : change.before && !change.after ? 'deleted'
    : 'updated';

  const entryData = (e: xdr.LedgerEntry | null): unknown => {
    if (!e) return undefined;
    try {
      const d = e.data();
      switch (d.switch().value) {
        case xdr.LedgerEntryType.account().value:
          return { balance: Number(d.account().balance().toString()), seqNum: Number(d.account().seqNum().toString()) };
        case xdr.LedgerEntryType.trustline().value:
          return { balance: d.trustLine().balance().toString() };
        case xdr.LedgerEntryType.contractData().value: {
          const val = safeScValToNative(d.contractData().val());
          return typeof val === 'bigint' ? Number(val) : val;
        }
        case xdr.LedgerEntryType.ttl().value:
          return { liveUntilLedger: d.ttl().liveUntilLedgerSeq() };
        default:
          return d.toXDR('base64').slice(0, 64);
      }
    } catch {
      return '<unparseable>';
    }
  };

  return {
    entryType,
    key: keyDesc,
    action,
    before: entryData(change.before),
    after: entryData(change.after),
  };
}
/**
 * Run a built transaction through Soroban RPC `simulateTransaction` and
 * return a structured SimulationResult.
 */
export async function simulateTransaction(
  tx: Transaction,
  meta: { contract: ContractId; function: FunctionName },
  opts: SimulationOptions = {},
): Promise<SimulationResult> {
  const rpcUrl = opts.rpcUrl ?? DEFAULT_RPC_URL;
  const server = (opts.server as Server | undefined) ?? new Server(rpcUrl);

  const t0 = Date.now();
  const sim = (await server.simulateTransaction(tx)) as Api.SimulateTransactionResponse & {
    stateChanges?: Array<{ key: xdr.LedgerKey; before: xdr.LedgerEntry | null; after: xdr.LedgerEntry | null }>;
  };
  const durationMs = Date.now() - t0;

  const injectedUrl = (opts.server as { baseURL?: string } | undefined)?.baseURL;
  return parseSimulationResponse(sim as never, {
    contract: meta.contract,
    function: meta.function,
    durationMs,
    rpcUrl: injectedUrl ?? rpcUrl,
  });
}

/**
 * Convenience: build an invocation for a fresh (random) source account and
 * simulate it. Simulation does not submit anything and does not require the
 * source account to hold funds — it is a pure dry-run against ledger state.
 */
export async function simulateInvoke(
  input: Omit<InvokeInput, 'sourcePublicKey' | 'sequence'> & {
    source?: { publicKey: string; sequence?: string };
  },
  opts: SimulationOptions = {},
): Promise<SimulationResult> {
  const source = input.source ?? { publicKey: Keypair.random().publicKey(), sequence: '0' };
  const tx = buildInvocationTx(
    {
      contractId: input.contractId,
      method: input.method,
      args: input.args,
      sourcePublicKey: source.publicKey,
      sequence: source.sequence ?? '0',
    },
    opts,
  );
  return simulateTransaction(tx, { contract: input.contractId, function: input.method }, opts);
}
// ============================================================================
// Plain-language explainer
// ============================================================================

const STROOPS_PER_XLM = 10_000_000;

function formatStroops(stroops: number): string {
  return stroops.toLocaleString('en-US');
}

/**
 * Turn a structured SimulationResult (and, optionally, a policy check) into
 * the plain-language summary OrbitGuard shows a human — the format used in
 * the README's "Live Policy Check" example.
 */
export function explain(
  sim: SimulationResult,
  check?: { allowed: boolean; reason: string; checks: unknown[]; requiresApproval: boolean },
): string[] {
  const lines: string[] = [];

  // 1. Headline: policy decision (if given) else simulation verdict.
  if (check) {
    lines.push(check.allowed ? `✅ Allowed — ${humanizeReason(check.reason)}` : `⛔ Denied — ${humanizeReason(check.reason)}`);
    lines.push(`   ${check.checks.length} check${check.checks.length === 1 ? '' : 's'} passed · ${approvalClause(check.requiresApproval)}`);
  } else if (sim.success) {
    lines.push(`✅ Simulated — ${sim.function}() on ${short(sim.contract)} succeeded`);
  } else {
    lines.push(`⛔ Simulation failed — ${short(sim.contract)}.${sim.function}() did not execute`);
  }

  // 2. What the simulation saw.
  const details: string[] = [`fee ${formatStroops(sim.fee)} stroops`];
  if (sim.fee >= STROOPS_PER_XLM) {
    details.push(`(≥ ${Number((sim.fee / STROOPS_PER_XLM).toFixed(2))} XLM — review resource usage)`);
  }
  details.push(
    sim.stateChanges.length === 0
      ? 'no contract state changes'
      : `${sim.stateChanges.length} state change${sim.stateChanges.length === 1 ? '' : 's'}`,
  );
  if (sim.events > 0) details.push(`${sim.events} event${sim.events === 1 ? '' : 's'}`);
  lines.push(`   Simulated ${sim.function}() on ${short(sim.contract)} · ${details.join(' · ')}`);

  // 3. State changes, one line each — account balances get deltas.
  for (const line of stateChangeLines(sim)) {
    lines.push(line);
  }

  // 4. Return value / failure detail.
  if (sim.success && sim.returnValue !== undefined) {
    lines.push(`   Returns ${JSON.stringify(sim.returnValue)}`);
  }
  if (!sim.success && sim.error) {
    lines.push(`   Host error: ${firstLine(sim.error)}`);
  }

  // 5. Timing.
  lines.push(`   ${sim.durationMs}ms`);

  return lines;
}

function humanizeReason(reason: string): string {
  // The "Transaction denied: " prefix reads worse in a one-line headline.
  return reason.replace(/^Transaction denied: /, '').trim();
}

function approvalClause(requiresApproval: boolean): string {
  return requiresApproval ? 'approval required' : 'no approval required';
}

function short(contractId: string): string {
  return contractId.length > 12 ? `${contractId.slice(0, 8)}…${contractId.slice(-4)}` : contractId;
}

function firstLine(text: string): string {
  return text.split('\n')[0].trim();
}

function stateChangeLines(sim: SimulationResult): string[] {
  return sim.stateChanges.map((c) => {
    const verb = c.action === 'created' ? 'creates' : c.action === 'deleted' ? 'deletes' : 'updates';
    let detail = '';
    if (c.entryType === 'account' && c.before && c.after) {
      const b = (c.before as { balance?: number }).balance ?? 0;
      const a = (c.after as { balance?: number }).balance ?? 0;
      const delta = a - b;
      const sign = delta >= 0 ? '+' : '';
      detail = ` (balance ${sign}${formatStroops(delta)} stroops)`;
    } else if (c.entryType === 'ttl' && c.after) {
      detail = ` (live until ledger ${(c.after as { liveUntilLedger?: number }).liveUntilLedger})`;
    }
    return `   ${verb} ${c.entryType} — ${c.key}${detail}`;
  });
}

/**
 * One-line variant of `explain` for logs and the audit trail.
 */
export function explainOneLine(sim: SimulationResult, check?: { allowed: boolean; reason: string }): string {
  if (check) {
    return `${check.allowed ? 'Allowed' : 'Denied'} — ${check.reason} · fee ${sim.fee} stroops · ${sim.stateChanges.length} state changes`;
  }
  return sim.success
    ? `Simulated OK — ${sim.function}() · fee ${sim.fee} stroops`
    : `Simulation failed — ${firstLine(sim.error ?? 'unknown error')}`;
}