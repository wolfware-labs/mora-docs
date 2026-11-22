import { describe, expect, it } from 'vitest';
import { SIDEBAR, sectionLabels } from '../../src/data/sidebar.mjs';

describe('sectionLabels', () => {
  it('names each docs folder as the sidebar does', () => {
    expect(sectionLabels()).toEqual({
      tour: 'Tour',
      language: 'Language',
      memory: 'Memory and errors',
      concurrency: 'Concurrency',
      macros: 'Macro guide',
      toolchain: 'Toolchain',
      reference: 'Reference',
      errors: 'Error codes',
    });
  });

  it('follows a renamed group', () => {
    const renamed = SIDEBAR.map((g) => (typeof g === 'object' && g.label === 'Tour' ? { ...g, label: 'A tour' } : g));
    expect(sectionLabels(renamed).tour).toBe('A tour');
  });
});
