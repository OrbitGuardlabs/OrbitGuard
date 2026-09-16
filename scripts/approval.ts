import { runApprovalCli } from '../packages/core/src/approval-cli';

try {
  console.log(JSON.stringify(runApprovalCli(process.argv.slice(2)), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
