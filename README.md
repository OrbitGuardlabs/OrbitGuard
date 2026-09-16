# OrbitGuard

**Open source permission layer for Stellar.**

**Let agents move fast. Keep control.**

OrbitGuard gives autonomous agents a clear, enforceable boundary on Stellar — before they touch your money or your contracts. No custody. No black boxes. Just policy.

[View on GitHub](https://github.com/OrbitGuardlabs/OrbitGuard) · Explore the console

---

## The Missing Layer

**Autonomy needs a guardrail.**

The fastest way to ship agentic finance is to make the safe path the easy path. As agents start holding keys and executing real transactions on Stellar, the question isn't whether they'll move fast — it's whether they'll move inside boundaries you actually chose.

OrbitGuard is the layer that sits between an agent's intent and Stellar's ledger, so "fast" and "safe" stop being a trade-off.

**01 · Declare the boundary**
Scope every agent to the contracts, functions, assets, and limits it actually needs — nothing more.

**02 · Simulate before execution**
See what will happen, why it's allowed, and what approval path it will take, before anything is signed.

**03 · Record every decision**
Every intent, policy check, and transaction becomes part of a verifiable audit trail.

## How It Works

OrbitGuard sits between your agent and the Stellar network. Every action is checked, explained, and recorded — without slowing your agent down.

**01 · Define**
Write policies in TypeScript or YAML — scoping agents to specific contracts, functions, assets, and spend limits.

**02 · Simulate**
Preview the outcome before signing. OrbitGuard runs the proposed transaction against current network state and explains exactly what it will do.

**03 · Execute**
The transaction passes through to Stellar only once the boundary is clear — policy satisfied, simulation reviewed, and approvals (if required) collected.

```
Agent  ──intent──▶  OrbitGuard  ──simulate + check──▶  Explain  ──▶  Approve (if required)  ──▶  Execute  ──▶  Stellar
                          │
                          └──▶  Audit log (every step, every time)
```

## Quick Example

`orbitguard.config.ts`

```typescript
const policy = orbit.policy({
  agent: 'treasury-rebalancer',
  contracts: [
    'soroswap_router',
    'blend_pool_v2',
  ],
  functions: {
    soroswap_router: ['swapExactTokensForTokens'],
    blend_pool_v2: ['deposit', 'withdraw'],
  },
  limits: {
    perTransaction: 10_000,
    daily: 50_000,
  },
  approvals: {
    above: 5_000,
    quorum: '2-of-3',
  },
  expiry: '2026-12-31T23:59:59Z',
});
```

This scopes `treasury-rebalancer` to exactly two contracts and three functions, caps it at $10,000 per transaction and $50,000 per day, requires 2-of-3 multisig approval above $5,000, and expires automatically at the end of 2026. Type-safe by default — `orbitguard/sdk`.

## Features

- **Contract & function allowlisting** — agents can only call the exact contracts and functions a policy grants, nothing implicit.
- **Transaction limits** — per-transaction caps, daily/weekly/monthly spend ceilings, and rate limiting.
- **Approval workflows** — no approval, single approver, or multisig quorum, configurable by transaction value.
- **Pre-execution simulation** — every action is dry-run against live network state before it's ever signed.
- **Plain-language explanations** — know what a transaction does without reading raw XDR.
- **Full audit trail** — every intent, check, simulation, approval, and execution is logged and verifiable.
- **Expiring permissions** — policies and grants can be time-boxed so access doesn't quietly outlive its purpose.
- **TypeScript & YAML policies** — define boundaries in the format that fits your workflow, type-checked by default.
- **Built for Soroban** — native support for Stellar smart contracts, not bolted on.

## Live Policy Check

A sample of what OrbitGuard evaluates in real time, on every agent action:

```
12:42:08  treasury-rebalancer  →  Requesting action

  CONTRACT   soroswap_router
  FUNCTION   swapExactTokensForTokens
  AMOUNT     1,250 USDC

  ✅ Allowed — within policy boundary
     3 checks passed · no approval required
     42ms
```

**Policy enforced** — every transaction. **Fully auditable** — every action logged.

## Getting Started

> Adjust package names, commands, and endpoints below to match the actual implementation as it lands in the repo.

### Prerequisites

- Node.js 18+
- A Stellar/Soroban RPC endpoint (testnet or mainnet)
- An agent keypair for OrbitGuard to govern

### Install

```bash
git clone https://github.com/OrbitGuardlabs/OrbitGuard.git
cd OrbitGuard
npm install
```

### Configure

```bash
cp .env.example .env
# Set your Soroban RPC URL, network passphrase, and storage backend
```

### Run

```bash
npm run start
```

Your agent now routes every proposed Stellar transaction through OrbitGuard's policy engine before it can be signed and submitted.

## Policy Reference

Policies are declarative, version-controllable, and reviewable in a pull request like any other code change.

```yaml
agent: trading-bot-01
description: "Swaps on a single DEX contract with strict limits"

contracts:
  - address: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
    allowed_functions:
      - swap
      - get_price

limits:
  per_transaction_max: 500 XLM
  daily_max: 2000 XLM
  rate_limit: 10 transactions / hour

approvals:
  required_above: 200 XLM
  approvers:
    - role: ops-multisig
      quorum: 2 of 3

expiry: 2026-12-31T23:59:59Z
```

| Field | Description |
|---|---|
| `contracts` | The specific Soroban contract addresses an agent may call. |
| `allowed_functions` | The functions within each allowed contract the agent may invoke. |
| `limits` | Per-transaction and cumulative spend caps, plus rate limiting. |
| `approvals` | Value thresholds and approver/quorum requirements. |
| `expiry` | The point at which the policy — or a specific grant — stops being valid. |

## Simulation

Before anything is signed, OrbitGuard:

1. Runs the proposed transaction through Soroban's simulation environment against current ledger state.
2. Produces a plain-language explanation of the effects — balances changed, fees incurred, contract state mutated.
3. Flags anomalies (unexpected calls, unusually large transfers, simulation failures) before a human or the policy engine has to dig through raw transaction data.

Nothing reaches Stellar on the strength of an agent's self-reported intent alone.

## Approvals

Not every action needs a human — but some should:

- **No approval** — low-risk actions within tight, pre-scoped boundaries.
- **Single approver** — one designated person or service signs off.
- **Multisig quorum** — M-of-N approval, suited to team- or DAO-governed agents.
- **Value-tiered** — approval requirements scale with transaction size.

Approvers see the simulation result and plain-language explanation alongside the raw request, so decisions are made with full context.

## Audit Trail

Every proposed action produces a permanent, exportable record:

- Agent identity and timestamp
- Proposed transaction and parameters
- Policy check result and reasoning
- Simulation output
- Generated explanation
- Approval decision, approver, and timestamp (if applicable)
- Final execution result and transaction hash (if executed)

Designed to be independently verifiable — audit doesn't rely on trusting the agent's account of its own behavior.

## Architecture

```
┌─────────────┐    intent     ┌──────────────────────────────┐
│    Agent    │ ─────────────▶│          OrbitGuard           │
└─────────────┘                │                              │
                                │ 1. Policy check              │
                                │ 2. Simulation                │
                                │ 3. Explanation                │
                                │ 4. Approval (if required)     │
                                │ 5. Execution                 │
                                │ 6. Audit log                 │
                                └──────────────┬───────────────┘
                                               │
                                               ▼
                                     ┌───────────────────┐
                                     │   Stellar Network   │
                                     │  (incl. Soroban)    │
                                     └───────────────────┘
```

- **Policy Engine** — enforces contract, function, limit, and approval rules against every proposal.
- **Simulator** — dry-runs transactions against live Soroban state before commitment.
- **Explainer** — turns simulation output into plain-language summaries.
- **Approval Service** — manages pending approvals, notifications, and quorum logic.
- **Executor** — submits validated, approved transactions to Stellar.
- **Audit Store** — append-only, independently verifiable log of every decision.

## Use Cases

- **Treasury rebalancers** scoped to specific DEX and lending contracts with daily volume caps.
- **Trading agents** restricted to a fixed set of pairs and per-trade limits.
- **DAO-operated agents** executing governance actions within a pre-approved scope.
- **AI copilots** that can simulate and propose Stellar transactions but never execute without review.
- **Delegated third-party agents** given narrowly scoped, time-limited access without broader account control.

## Security

- **Deny by default** — anything outside an explicit policy grant is rejected.
- **No silent execution** — every action is simulated and explained before submission.
- **Policy is the final authority** — an agent cannot expand its own permissions.
- **Immutable logging** — audit records are append-only and tamper-evident.
- **Time-bounded trust** — permissions expire by default rather than persisting indefinitely.

Found a vulnerability? Please report it responsibly rather than opening a public issue — see `SECURITY.md`.

### Local approvals (v1)

The approval CLI operates on the local administrator's SQLite database. OS/database
access is the trust boundary: actor names are not remote authentication, a single
rejection vetoes the request, and `claim` binds a prior approval to an exact
transaction hash immediately before signing.

```bash
npm run approval -- show approvals.sqlite <id>
npm run approval -- approve approvals.sqlite <id> alice
npm run approval -- reject approvals.sqlite <id> bob
```

## Contributing

OrbitGuard is open source, built for teams building with Stellar. Contributions to the policy engine, simulation tooling, explainability, and SDK integrations are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit with clear messages
4. Open a pull request describing the change and why it's needed

For larger changes, open an issue first so the approach can be discussed.

## License

Open source. See `LICENSE` for details.

---
