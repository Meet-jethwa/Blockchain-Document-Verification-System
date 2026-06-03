import { makeChainClient } from './chain.js';
import { config } from './config.js';

async function run() {
  console.log('Using RPC:', config.rpcUrl);
  const chain = makeChainClient({ rpcUrl: config.rpcUrl, privateKey: config.privateKey, contractAddress: config.contractAddress });
  try {
    const start = Date.now();
    const block = await chain.provider.getBlockNumber();
    console.log('getBlockNumber:', block, `(${Date.now()-start}ms)`);
  } catch (e) {
    console.error('getBlockNumber failed:', e);
  }

  try {
    const start = Date.now();
    const code = await chain.provider.getCode(config.contractAddress);
    console.log('getCode length:', String(code).length, `(${Date.now()-start}ms)`);
  } catch (e) {
    console.error('getCode failed:', e);
  }

  const testAddr = process.argv[2] || '0x6c82a6869447a8c792e82201da918155914d095e';
  console.log('Testing getMyDocuments for', testAddr);

  try {
    const start = Date.now();
    const res = await chain.contract.getMyDocuments({ from: testAddr });
    console.log('getMyDocuments WITH from returned length:', (res?.length ?? 'N/A'), `(${Date.now()-start}ms)`);
  } catch (e) {
    console.error('getMyDocuments WITH from failed:', e);
  }

  try {
    const start = Date.now();
    const res2 = await chain.contract.getMyDocuments();
    console.log('getMyDocuments WITHOUT from returned length:', (res2?.length ?? 'N/A'), `(${Date.now()-start}ms)`);
  } catch (e) {
    console.error('getMyDocuments WITHOUT from failed:', e);
  }

  // Also test a direct eth_call using provider.send to check provider behavior
  try {
    const start = Date.now();
    const tx = await chain.provider.send('eth_call', [{ to: config.contractAddress, data: '0x' }, 'latest']);
    console.log('eth_call empty succeeded length', String(tx).length, `(${Date.now()-start}ms)`);
  } catch (e) {
    console.error('eth_call test failed:', e);
  }
}

run().catch((e)=>{ console.error('Diagnose script failed:', e); process.exit(1); });
