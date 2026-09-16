import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface ApprovalRequest {
  agent: string;
  transactionHash: string;
  expiresAt: string;
  approvers: string[];
  requiredApprovals: number;
  /** Reviewed policy, transaction and simulation; never include signing secrets. */
  context: unknown;
}

export interface PendingApproval extends ApprovalRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'succeeded' | 'failed';
  votes: Record<string, 'approve' | 'reject'>;
}

/** Trusted-local SQLite workflow. Actor names are not remote authentication. */
export class ApprovalStore {
  private readonly db: Database.Database;

  constructor(path = ':memory:', private readonly now: () => number = Date.now) {
    this.db = new Database(path);
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY, record TEXT NOT NULL
    )`);
  }

  close(): void { this.db.close(); }

  create(request: ApprovalRequest): PendingApproval {
    if (!request.agent.trim() || !/^[a-f0-9]{64}$/i.test(request.transactionHash)) {
      throw new Error('Agent and transaction hash are required');
    }
    if (!Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= this.now()) {
      throw new Error('Approval expiry must be in the future');
    }
    const members = request.approvers;
    if (members.some(a => !a.trim()) || new Set(members).size !== members.length ||
        !Number.isSafeInteger(request.requiredApprovals) || request.requiredApprovals < 1 ||
        request.requiredApprovals > members.length) {
      throw new Error('Invalid approver membership or quorum');
    }
    const record: PendingApproval = {
      ...structuredClone(request), id: randomUUID(), status: 'pending', votes: {},
    };
    this.db.prepare('INSERT INTO approvals (id, record) VALUES (?, ?)')
      .run(record.id, JSON.stringify(record));
    return structuredClone(record);
  }

  get(id: string): PendingApproval {
    const row = this.db.prepare('SELECT record FROM approvals WHERE id = ?').get(id) as
      { record: string } | undefined;
    if (!row) throw new Error('Approval not found');
    return JSON.parse(row.record) as PendingApproval;
  }

  vote(id: string, actor: string, decision: 'approve' | 'reject'): PendingApproval {
    return this.db.transaction(() => {
      const record = this.get(id);
      this.assertFresh(record);
      if (record.status !== 'pending') throw new Error('Approval is not pending');
      if (!record.approvers.includes(actor)) throw new Error('Unknown approver');
      if (Object.hasOwn(record.votes, actor)) throw new Error('Approver already voted');
      if (decision !== 'approve' && decision !== 'reject') throw new Error('Invalid decision');
      Object.defineProperty(record.votes, actor, { value: decision, enumerable: true });
      // A rejection vetoes the request in v1; a new request requires fresh review.
      if (decision === 'reject') record.status = 'rejected';
      else if (Object.values(record.votes).filter(v => v === 'approve').length >= record.requiredApprovals) {
        record.status = 'approved';
      }
      this.save(record);
      return record;
    }).immediate();
  }

  /** Atomically consume approval for the exact reviewed transaction, before signing. */
  claim(id: string, transactionHash: string): PendingApproval {
    return this.db.transaction(() => {
      const record = this.get(id);
      this.assertFresh(record);
      if (record.transactionHash !== transactionHash) throw new Error('Transaction hash mismatch');
      if (record.status !== 'approved') throw new Error('Approval is not executable');
      record.status = 'executing';
      this.save(record);
      return record;
    }).immediate();
  }

  finish(id: string, success: boolean): PendingApproval {
    return this.db.transaction(() => {
      const record = this.get(id);
      if (record.status !== 'executing') throw new Error('Approval is not executing');
      record.status = success ? 'succeeded' : 'failed';
      this.save(record);
      return record;
    }).immediate();
  }

  private assertFresh(record: PendingApproval): void {
    if (Date.parse(record.expiresAt) <= this.now()) throw new Error('Approval expired');
  }

  private save(record: PendingApproval): void {
    this.db.prepare('UPDATE approvals SET record = ? WHERE id = ?').run(JSON.stringify(record), record.id);
  }
}
