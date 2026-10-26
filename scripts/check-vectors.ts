import fs from 'node:fs';
import path from 'node:path';
import { generateAll512Vectors, buildScenarios } from './generate-vectors.js';

function check() {
  const vectorsDir = path.resolve('contracts/test/vectors');
  const mandatePath = path.join(vectorsDir, 'mandate-v1.json');
  const scenariosPath = path.join(vectorsDir, 'scenarios.json');

  if (!fs.existsSync(mandatePath) || !fs.existsSync(scenariosPath)) {
    console.error('Vector files do not exist. Run "npm run vectors" first.');
    process.exit(1);
  }

  const existingMandate = JSON.parse(fs.readFileSync(mandatePath, 'utf8'));
  const existingScenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));

  const freshMandate = generateAll512Vectors();
  const scenarios = buildScenarios();
  const freshScenarios = {
    generator: 'scripts/generate-vectors.ts',
    totalScenarios: scenarios.length,
    scenarios,
  };

  const norm = (obj: unknown) => JSON.stringify(obj);

  if (norm(existingMandate) !== norm(freshMandate)) {
    console.error('Mismatch in contracts/test/vectors/mandate-v1.json');
    process.exit(1);
  }

  if (norm(existingScenarios) !== norm(freshScenarios)) {
    console.error('Mismatch in contracts/test/vectors/scenarios.json');
    process.exit(1);
  }

  console.log('Vector check passed: committed vector files match generator output exactly.');
}

check();
