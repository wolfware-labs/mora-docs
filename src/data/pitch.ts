// The short pitch, shared by the landing hero and /llms.txt. Code in `detail` is wrapped in backticks.

export type Point = { title: string; detail: string; dot: string };

export const INTRO = 'Mora is a general-purpose language that compiles to one native executable.';

export const POINTS: Point[] = [
  { title: 'Dependency injection, built in', detail: '`services` blocks, checked when you build', dot: '#C0392B' },
  { title: 'Macros in plain Mora', detail: 'a `macro` is a function that writes code at compile time', dot: '#D9622F' },
  { title: 'Behavior contracts', detail: "`contract` blocks state each member's rules", dot: '#F39C3D' },
  { title: 'Shared libraries', detail: 'one `.wasm` file, imported by any build', dot: '#FFD27A' },
];

/** Splits `detail` into text and code parts: odd indexes are code. */
export const detailParts = (detail: string) => detail.split('`');

export const plain = (detail: string) => detail.replaceAll('`', '');
