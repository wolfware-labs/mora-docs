// Refreshes src/data/roadmap.snapshot.json from GitHub: `pnpm snapshot`.
// The snapshot is what the site shows when GitHub cannot be reached, and what the e2e tests check.
import { writeFile } from 'node:fs/promises';
import { fetchRoadmap } from '../src/lib/roadmap.ts';

const file = new URL('../src/data/roadmap.snapshot.json', import.meta.url);
const roadmap = await fetchRoadmap();
await writeFile(file, `${JSON.stringify(roadmap, null, 2)}\n`);
console.log(`wrote ${roadmap.milestones.length} milestones and ${roadmap.explorations.length} explorations`);
