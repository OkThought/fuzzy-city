import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { questionsFor } from '../src/ai/jevApiTypes';
import type { DecisionTrace, Job } from '../src/sim/types';
// Frozen real simulation inputs: same state and questions in every GPU variant.
const source = 'benchmarks/2026-09-24T17-25-19-409Z-0c8db54b/100.json';
const traces: DecisionTrace[] = JSON.parse(readFileSync(source, 'utf8')).traces;
const cases = ['evening_intentions', 'friend_selection', 'social_interaction'].flatMap(kind => {
  const group = traces.filter(t => t.kind === kind);
  return [0, Math.floor(group.length / 2), group.length - 1].map(index => {
    const t = group[index];
    const job: Job = {id: t.id, kind: t.kind, state: t.stateSnapshot};
    return {id: t.id, kind, request: {model: 'alibiserikbay/JevK5', state: job.state, questions: questionsFor(job)}};
  });
});
mkdirSync('benchmarks/gpu-path', {recursive: true});
writeFileSync('benchmarks/gpu-path/fixture.json', JSON.stringify({source, cases}, null, 2));
