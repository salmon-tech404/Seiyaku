import { runCli } from './run.js';

runCli(process.argv)
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error('Fatal CLI error:', err instanceof Error ? err.message : String(err));
    process.exit(5);
  });
