import { runMcpServer } from './cli.js';

runMcpServer(process.argv).catch((err) => {
  process.stderr.write(`Fatal MCP error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
