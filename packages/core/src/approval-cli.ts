import { ApprovalStore } from './approvals';

/** Local administrator interface; OS/database access is the trust boundary. */
export function runApprovalCli(args: string[]): unknown {
  const [command, path, id, actor] = args;
  if (!path || !id || !['show', 'approve', 'reject'].includes(command) ||
      (command !== 'show' && !actor) || args.length !== (command === 'show' ? 3 : 4)) {
    throw new Error('Usage: npm run approval -- show <db> <id> | approve|reject <db> <id> <actor>');
  }
  const store = new ApprovalStore(path);
  try {
    return command === 'show' ? store.get(id) : store.vote(id, actor, command === 'approve' ? 'approve' : 'reject');
  } finally {
    store.close();
  }
}
