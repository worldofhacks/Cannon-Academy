import { evaluateNumber } from '/Users/quietguy/Documents/Dev/Gauntlet/Math Game/src/engine/questions/expr.ts';
const src = '1' + '+1'.repeat(1023);
const v = evaluateNumber(src, {});
if (v !== 1024) throw new Error(String(v));
console.log('0.5MB_STACK_OK', v);
