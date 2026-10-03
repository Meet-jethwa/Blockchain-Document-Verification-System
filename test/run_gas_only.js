/**
 * run_gas_only.js — minimal Hardhat runner for benchmark_gas.js only.
 * Usage: npx hardhat run test/run_gas_only.js
 *
 * Runs on a fresh in-process Hardhat node (no prior state).
 * Prints gas numbers and writes results to test/gas_only_results.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGasBenchmark } from './benchmark_gas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const data = await runGasBenchmark();

const out = {
  timestamp:   new Date().toISOString(),
  solcVersion: '0.8.24',
  evmTarget:   'shanghai',
  note:        'Fresh in-process Hardhat node — zero prior state, clean artifact',
  gasResults:  data.gasResults,
};

const outPath = path.join(__dirname, 'gas_only_results.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('\n[✔] Gas-only results written to test/gas_only_results.json');
