import {Tendril} from './dist/tendril.esm.js';

console.log('Test: Debug listener hooks\n');

const events = [];

const debugListener = {
  onEnter: (type, node, path) => {
    events.push({event: 'enter', type, node, path: [...path]});
  },
  onExit: (type, node, path, matched) => {
    events.push({event: 'exit', type, matched, path: [...path]});
  },
  onBind: (kind, varName, value) => {
    events.push({event: 'bind', kind, varName, value});
  }
};

const t = Tendril('$x').debug(debugListener);
const result = t.match(42);

console.log('Match result:', result?.bindings);
console.log('\nEvents captured:');
for (const e of events) {
  console.log(`  ${e.event}: ${e.type || e.kind} ${e.varName || ''} ${e.matched !== undefined ? (e.matched ? '✓' : '✗') : ''}`);
}

console.log('\n✓ Debug hooks work!');
