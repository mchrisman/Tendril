// tracer.js - VM execution tracer utility

import { OP } from './engine.js';

// Build opcode name lookup
const opNames = {};
for (const [name, value] of Object.entries(OP)) {
  opNames[value] = name;
}

export function createTracer() {
  let stepCount = 0;

  return {
    onStart({ code, pool }) {
      console.log('\n=== Bytecode ===');
      console.log('Pool:', pool);
      console.log('\nInstructions:');
      for (let i = 0; i < code.length; i += 4) {
        const op = code[i];
        const a = code[i + 1];
        const b = code[i + 2];
        const c = code[i + 3];
        const opName = opNames[op] || `OP${op}`;
        console.log(`${i.toString().padStart(4)}: ${opName.padEnd(20)} ${a.toString().padStart(4)} ${b.toString().padStart(4)} ${c.toString().padStart(4)}`);
      }
      console.log('\n=== Execution ===\n');
    },

    onStep({ ip, op, env, arrStack, choiceDepth }) {
      const opName = opNames[op] || `OP${op}`;
      const arrPos = arrStack.length > 0 ?
        `[${arrStack[arrStack.length - 1].idx}/${arrStack[arrStack.length - 1].length}]` :
        '';
      const bindings = JSON.stringify(env);

      console.log(`${(++stepCount).toString().padStart(4)}: ip=${ip.toString().padStart(3)} ${opName.padEnd(20)} ${arrPos.padEnd(8)} choice=${choiceDepth} bindings=${bindings}`);
    }
  };
}
