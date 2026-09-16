import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApprovalStore } from '../src/approvals';
import { runApprovalCli } from '../src/approval-cli';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(requiredApprovals = 2) {
  const directory = mkdtempSync(join(tmpdir(), 'orbitguard-cli-'));
  directories.push(directory);
  const path = join(directory, 'approvals.sqlite');
  const store = new ApprovalStore(path);
  try {
    const record = store.create({
      agent: 'cli-test', transactionHash: 'a'.repeat(64),
      expiresAt: '2099-01-01T00:00:00Z',
      approvers: ['alice', 'bob'], requiredApprovals,
      context: { amount: 100 },
    });
    return { path, id: record.id };
  } finally {
    store.close();
  }
}

describe('approval CLI with persistent SQLite records', () => {
  it('shows requests and persists distinct quorum votes across invocations', () => {
    const { path, id } = fixture();
    expect(runApprovalCli(['show', path, id])).toMatchObject({ id, status: 'pending' });
    expect(runApprovalCli(['approve', path, id, 'alice'])).toMatchObject({ status: 'pending' });
    expect(() => runApprovalCli(['approve', path, id, 'alice'])).toThrow('already voted');
    expect(runApprovalCli(['approve', path, id, 'bob'])).toMatchObject({ status: 'approved' });
    expect(runApprovalCli(['show', path, id])).toMatchObject({
      status: 'approved', votes: { alice: 'approve', bob: 'approve' },
    });
  });

  it('supports single approval', () => {
    const { path, id } = fixture(1);
    expect(runApprovalCli(['approve', path, id, 'alice'])).toMatchObject({ status: 'approved' });
  });

  it('rejects outsiders and persists rejection as a veto', () => {
    const { path, id } = fixture();
    expect(() => runApprovalCli(['approve', path, id, 'outsider'])).toThrow('Unknown approver');
    expect(runApprovalCli(['reject', path, id, 'bob'])).toMatchObject({ status: 'rejected' });
    expect(() => runApprovalCli(['approve', path, id, 'alice'])).toThrow('not pending');
    expect(runApprovalCli(['show', path, id])).toMatchObject({ status: 'rejected' });
  });

  it('reports missing records', () => {
    const { path } = fixture();
    expect(() => runApprovalCli(['show', path, 'missing'])).toThrow('not found');
  });

  it.each([
    [], ['unknown', 'db', 'id'], ['approve', 'db', 'id'],
    ['show', 'db', 'id', 'extra'], ['reject', 'db', 'id', 'actor', 'extra'],
  ])('rejects invalid arguments: %j', (...args: string[]) => {
    expect(() => runApprovalCli(args)).toThrow('Usage:');
  });
});
