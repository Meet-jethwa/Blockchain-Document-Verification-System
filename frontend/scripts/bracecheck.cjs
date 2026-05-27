const fs = require('fs');
const path = 'c:/Users/meetj/OneDrive/Desktop/backup/blockchain-doc-verification/frontend/src/App.tsx';
const s = fs.readFileSync(path, 'utf8');
const lines = s.split('\n');
let cum = 0;
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  let prev = cum;
  for (const ch of ln) { if (ch === '{') cum++; if (ch === '}') cum--; }
  if (cum !== prev) console.log(`${i+1}: ${prev} -> ${cum}  ${ln.trim().slice(0,200)}`);
}
console.log('final cum', cum);
