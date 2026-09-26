import { network } from 'hardhat';
import crypto from 'node:crypto';

// Gas Cost & Fiat Estimation Helper (Review #6 Resolution)
export function calculateGasCostScenarios(gasAmount, ethPriceUSD = 3000) {
  const gasPriceTiersGwei = [10, 25, 50, 100]; // Low, Medium, High, Peak Gwei
  const scenarios = {};

  for (const gwei of gasPriceTiersGwei) {
    const costInWei = BigInt(gasAmount) * BigInt(gwei) * BigInt(10 ** 9);
    const costInETH = Number(costInWei) / 10 ** 18;
    const costInUSD = costInETH * ethPriceUSD;

    scenarios[`${gwei}_gwei`] = {
      gwei,
      costETH: parseFloat(costInETH.toFixed(6)),
      costUSD: parseFloat(costInUSD.toFixed(4))
    };
  }

  return scenarios;
}

// Volume scaling cost calculator for enterprise deployment (Review #6)
export function calculateVolumeProjections(singleRegistrationGas, ethPriceUSD = 3000, gasPriceGwei = 25) {
  const volumes = [1, 100, 1000, 10000];
  const projections = [];

  for (const count of volumes) {
    const totalGas = singleRegistrationGas * count;
    const totalEth = (totalGas * gasPriceGwei * 1e9) / 1e18;
    const totalUSD = totalEth * ethPriceUSD;

    projections.push({
      documentCount: count,
      totalGas: totalGas.toLocaleString(),
      ethCost: `${totalEth.toFixed(4)} ETH`,
      usdCost: `$${totalUSD.toFixed(2)} USD`
    });
  }

  return projections;
}

export async function runGasBenchmark() {
  console.log('===============================================================');
  console.log('       BDVS EVM GAS & SCALABILITY COST ANALYSIS (REVIEW #6)     ');
  console.log('===============================================================');

  const { ethers } = await network.connect();
  const [owner, viewer1, viewer2] = await ethers.getSigners();
  console.log(`[+] Test Wallet Address: ${owner.address}`);

  // Deploy DocumentRegistry contract
  const registry = await ethers.deployContract('DocumentRegistry');
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();
  console.log(`[+] DocumentRegistry deployed to: ${contractAddress}\n`);

  const gasResults = [];

  // 1. Initial Document Registration (Cold SSTORE)
  const sampleData = Buffer.from('BDVS Benchmark Sample Document Content ' + Date.now());
  const keccakHash = ethers.keccak256(sampleData);

  const tx1 = await registry.registerDocument(keccakHash, '');
  const receipt1 = await tx1.wait();
  const reg1Gas = Number(receipt1.gasUsed);
  const costScenarios1 = calculateGasCostScenarios(reg1Gas);

  gasResults.push({
    Function: 'registerDocument',
    'Gas Used': reg1Gas,
    'Est USD (@ 25 Gwei, $3k)': `$${costScenarios1['25_gwei'].costUSD}`,
    Notes: 'Cold SSTORE; first document (new struct slot)'
  });

  // 2. Version Management: addDocumentVersion
  const version2Hash = ethers.keccak256(Buffer.from('Version 2 Content ' + Date.now()));
  const txVer = await registry.addDocumentVersion(keccakHash, version2Hash, '');
  const receiptVer = await txVer.wait();
  const verGas = Number(receiptVer.gasUsed);

  gasResults.push({
    Function: 'addDocumentVersion',
    'Gas Used': verGas,
    'Est USD (@ 25 Gwei, $3k)': `$${calculateGasCostScenarios(verGas)['25_gwei'].costUSD}`,
    Notes: 'Version digest appended to existing root mapping'
  });

  // 3. Access Control: grantViewer (Cold mapping write)
  const txGrant = await registry.grantViewer(keccakHash, viewer1.address);
  const receiptGrant = await txGrant.wait();
  const grantGas = Number(receiptGrant.gasUsed);

  gasResults.push({
    Function: 'grantViewer',
    'Gas Used': grantGas,
    'Est USD (@ 25 Gwei, $3k)': `$${calculateGasCostScenarios(grantGas)['25_gwei'].costUSD}`,
    Notes: 'Cold SSTORE in per-hash viewer mapping'
  });

  // 4. Access Control: revokeViewer (Warm mapping reset)
  const txRevoke = await registry.revokeViewer(keccakHash, viewer1.address);
  const receiptRevoke = await txRevoke.wait();
  const revokeGas = Number(receiptRevoke.gasUsed);

  gasResults.push({
    Function: 'revokeViewer',
    'Gas Used': revokeGas,
    'Est USD (@ 25 Gwei, $3k)': `$${calculateGasCostScenarios(revokeGas)['25_gwei'].costUSD}`,
    Notes: 'Warm SSTORE reset (slot already initialised)'
  });

  // 5. Access Control: grantRootViewer
  const txGrantRoot = await registry.grantRootViewer(keccakHash, viewer2.address);
  const receiptGrantRoot = await txGrantRoot.wait();
  const grantRootGas = Number(receiptGrantRoot.gasUsed);

  gasResults.push({
    Function: 'grantRootViewer',
    'Gas Used': grantRootGas,
    'Est USD (@ 25 Gwei, $3k)': `$${calculateGasCostScenarios(grantRootGas)['25_gwei'].costUSD}`,
    Notes: 'Cold SSTORE in root-hash viewer mapping'
  });

  // 6. Access Control: revokeRootViewer
  const txRevokeRoot = await registry.revokeRootViewer(keccakHash, viewer2.address);
  const receiptRevokeRoot = await txRevokeRoot.wait();
  const revokeRootGas = Number(receiptRevokeRoot.gasUsed);

  gasResults.push({
    Function: 'revokeRootViewer',
    'Gas Used': revokeRootGas,
    'Est USD (@ 25 Gwei, $3k)': `$${calculateGasCostScenarios(revokeRootGas)['25_gwei'].costUSD}`,
    Notes: 'Warm SSTORE reset'
  });

  // 7. Revoke Specific Document (using version2Hash)
  const txRevokeDoc = await registry.revokeDocument(version2Hash);
  const receiptRevokeDoc = await txRevokeDoc.wait();
  const revokeDocGas = Number(receiptRevokeDoc.gasUsed);

  gasResults.push({
    Function: 'revokeDocument',
    'Gas Used': revokeDocGas,
    'Est USD (@ 25 Gwei, $3k)': `$${calculateGasCostScenarios(revokeDocGas)['25_gwei'].costUSD}`,
    Notes: 'Status flag update on existing document slot'
  });

  // 8. Revoke Entire Document Root
  const txRevokeRootDoc = await registry.revokeDocumentRoot(keccakHash);
  const receiptRevokeRootDoc = await txRevokeRootDoc.wait();
  const revokeRootDocGas = Number(receiptRevokeRootDoc.gasUsed);

  gasResults.push({
    Function: 'revokeDocumentRoot',
    'Gas Used': revokeRootDocGas,
    'Est USD (@ 25 Gwei, $3k)': `$${calculateGasCostScenarios(revokeRootDocGas)['25_gwei'].costUSD}`,
    Notes: 'Status flag update across root and version slots'
  });

  // 9. Second Document Registration (Warm deployer array / 2nd document)
  const sampleData2 = Buffer.from('BDVS Benchmark Sample Document Content #2 ' + Date.now());
  const keccakHash2 = ethers.keccak256(sampleData2);
  const tx2 = await registry.registerDocument(keccakHash2, '');
  const receipt2 = await tx2.wait();
  const reg2Gas = Number(receipt2.gasUsed);
  const costScenarios2 = calculateGasCostScenarios(reg2Gas);

  gasResults.push({
    Function: 'registerDocument (2nd)',
    'Gas Used': reg2Gas,
    'Est USD (@ 25 Gwei, $3k)': `$${costScenarios2['25_gwei'].costUSD}`,
    Notes: 'Warm deployer array; lower than first registration'
  });

  // 10. Read-only View Calls (0 gas externally)
  gasResults.push({
    Function: 'canViewDocument (view)',
    'Gas Used': 0,
    'Est USD (@ 25 Gwei, $3k)': '$0.0000',
    Notes: 'Read-only SLOAD; no gas when called externally'
  });

  gasResults.push({
    Function: 'verifyDocument (view)',
    'Gas Used': 0,
    'Est USD (@ 25 Gwei, $3k)': '$0.0000',
    Notes: 'Read-only SLOAD; no gas when called externally'
  });

  gasResults.push({
    Function: 'isDocumentRevoked (view)',
    'Gas Used': 0,
    'Est USD (@ 25 Gwei, $3k)': '$0.0000',
    Notes: 'Read-only SLOAD; no gas when called externally'
  });

  console.log('===============================================================');
  console.log('TABLE IV: MEASURED ON-CHAIN GAS CONSUMPTION (HARDHAT LOCAL NODE)');
  console.log('===============================================================');
  console.table(gasResults);

  // Scalability volume projections (Review #6 Resolution)
  const volumeProjections = calculateVolumeProjections(reg1Gas, 3000, 25);
  console.log('\n--- SCALABILITY VOLUME COST PROJECTIONS (At 25 Gwei & $3,000 ETH) ---');
  console.table(volumeProjections);

  // Theoretical On-Chain Hashing Cost Comparison (Addressing Reviewer #3 & #6)
  const theoreticalGasComparison = [
    {
      Algorithm: 'Keccak-256',
      'Off-Chain Storage Gas (BDVS)': reg1Gas,
      'Theoretical On-Chain Gas (1KB payload)': '~30 gas base + 192 gas (SHA3 opcode)',
      'Solidity Native Support': 'Native Opcode (0x20 SHA3)'
    },
    {
      Algorithm: 'SHA-256',
      'Off-Chain Storage Gas (BDVS)': reg1Gas,
      'Theoretical On-Chain Gas (1KB payload)': '~60 gas base + 384 gas (Precompile 0x02)',
      'Solidity Native Support': 'Precompile (0x02)'
    },
    {
      Algorithm: 'SHA-3 (NIST)',
      'Off-Chain Storage Gas (BDVS)': reg1Gas,
      'Theoretical On-Chain Gas (1KB payload)': '~19,200 - 25,600 gas (interpreted Solidity)',
      'Solidity Native Support': 'No opcode/precompile (Pure Bytecode)'
    },
    {
      Algorithm: 'Blake2b',
      'Off-Chain Storage Gas (BDVS)': reg1Gas,
      'Theoretical On-Chain Gas (1KB payload)': '~20,000 - 30,000 gas (interpreted Solidity)',
      'Solidity Native Support': 'No opcode/precompile (Pure Bytecode)'
    }
  ];

  return {
    contractAddress,
    gasResults,
    volumeProjections,
    costScenarios1,
    theoreticalGasComparison
  };
}

if (process.argv[1] && process.argv[1].endsWith('benchmark_gas.js')) {
  runGasBenchmark()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error running gas benchmark:', err);
      process.exit(1);
    });
}
