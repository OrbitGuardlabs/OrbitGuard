import { afterEach, describe, expect, it } from 'vitest';
import { ApprovalStore, type ApprovalRequest } from '../src/approvals';

const stores: ApprovalStore[] = [];
const request: ApprovalRequest = {
  agent: 'treasury', transactionHash: 'a'.repeat(64), expiresAt: '2099-01-01T00:00:00Z',
  approvers: ['alice', 'bob', 'carol'], requiredApprovals: 2, context: { amount: 10 },
};
function store(now?: () => number) {
  const s = new ApprovalStore(':memory:', now);
  stores.push(s);
  return s;
}
afterEach(() => stores.splice(0).forEach(s => s.close()));

describe('local approvals', () => {
  it('requires M distinct votes and consumes approval once', () => {
    const s = store();
    const r = s.create(request);
    expect(s.vote(r.id, 'alice', 'approve').status).toBe('pending');
    expect(() => s.claim(r.id, request.transactionHash)).toThrow('not executable');
    expect(() => s.vote(r.id, 'alice', 'approve')).toThrow('already voted');
    expect(s.vote(r.id, 'bob', 'approve').status).toBe('approved');
    expect(() => s.claim(r.id, 'b'.repeat(64))).toThrow('hash mismatch');
    expect(s.claim(r.id, request.transactionHash).status).toBe('executing');
    expect(() => s.claim(r.id, request.transactionHash)).toThrow('not executable');
    expect(s.finish(r.id, true).status).toBe('succeeded');
    expect(() => s.finish(r.id, true)).toThrow('not executing');
  });
  it('supports single approver and failure recording', () => {
    const s = store();
    const r = s.create({ ...request, approvers: ['alice'], requiredApprovals: 1 });
    expect(s.vote(r.id, 'alice', 'approve').status).toBe('approved');
    s.claim(r.id, request.transactionHash);
    expect(s.finish(r.id, false).status).toBe('failed');
  });
  it('rejects outsiders and treats rejection as a veto', () => {
    const s = store();
    const r = s.create(request);
    expect(() => s.vote(r.id, 'outsider', 'approve')).toThrow('Unknown');
    expect(s.vote(r.id, 'alice', 'reject').status).toBe('rejected');
    expect(() => s.vote(r.id, 'bob', 'approve')).toThrow('not pending');
  });
  it('checks expiry on voting and claiming', () => {
    let now = Date.parse('2026-01-01');
    const s = store(() => now);
    const r = s.create({ ...request, expiresAt: '2026-01-02', requiredApprovals: 1 });
    s.vote(r.id, 'alice', 'approve');
    now = Date.parse('2026-01-02');
    expect(() => s.claim(r.id, request.transactionHash)).toThrow('expired');
    expect(() => s.vote(r.id, 'bob', 'approve')).toThrow('expired');
  });
  it('rejects invalid quorum, membership and expiry', () => {
    const s = store();
    for (const requiredApprovals of [0, 4, 1.5, NaN]) {
      expect(() => s.create({ ...request, requiredApprovals })).toThrow('quorum');
    }
    expect(() => s.create({ ...request, approvers: ['alice', 'alice'] })).toThrow('membership');
    expect(() => s.create({ ...request, expiresAt: 'invalid' })).toThrow('expiry');
    expect(() => s.get('missing')).toThrow('not found');
  });
  it('returns isolated snapshots', () => {
    const s = store();
    const r = s.create(request);
    r.status = 'approved';
    r.approvers.push('outsider');
    expect(s.get(r.id).status).toBe('pending');
    expect(s.get(r.id).approvers).not.toContain('outsider');
  });
});
