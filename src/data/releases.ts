// Hand-written text for the roadmap. Counts, titles and issues come from GitHub (src/lib/roadmap.ts).

export type Release = { version: string; id: string; label?: string; milestones: string[]; summary: string };

export const RELEASES: Release[] = [
  { version: "v0.1", id: "v01", label: "MVP", milestones: ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7"], summary: "Native compilation, the memory model, the expressive core, macros, the standard library core, async with an HTTP/1.1 server and JSON, the language server, VS Code extension, formatter, REPL and installers." },
  { version: "v0.2", id: "v02", milestones: ["M8", "M9", "M16"], summary: "WebAssembly libraries, packages from URL and git sources, capability enforcement, semantic diff and semver checks, editions, and tools for coding agents." },
  { version: "v0.3", id: "v03", milestones: ["M14", "M15", "M17"], summary: "Contracts, property tests, unit algebra, compile-time evaluation, the simulated World, test caching, record and replay, hot reload, time zones, typed configuration and retry policies." },
  { version: "v0.4", id: "v04", milestones: ["M10", "M11", "M18"], summary: "Threads and <code>shared</code> classes, worker processes, class inheritance, <code>async?</code>, more macro kinds, arenas, <code>decimal</code>, vector types and devirtualization." },
  { version: "v0.5", id: "v05", milestones: ["M12", "M13"], summary: "The package registry with signed publishing, an LLVM release backend, Component Model export and embedded targets." },
];

/** One line per post-MVP release, for the landing page. */
export const TEASERS: Record<string, string> = {
  "v0.2": "WebAssembly, packages, capabilities, agent tooling",
  "v0.3": "Contracts, simulation and replay, standard library growth",
  "v0.4": "Threads, language growth, optimizer",
  "v0.5": "Registry and signing, backends and targets"
};

/** What each milestone delivers, as HTML. */
export const MILESTONE_NOTES: Record<string, string> = {
  M0: "Repository, CI on Linux, macOS and Windows, workspace crates and layering check, spans and diagnostics, error-code registry, test harnesses, and a runtime skeleton built for every Tier 1 target.",
  M1: "Parse every construct of the language, type-check the subset needed for functions, structs, primitives, strings and control flow, and produce a native executable for Hello, world on every Tier 1 target.",
  M2: "Classes, structs, unique classes, parameter modes, moves, drops, destructors, borrows, views, weak references and closures, with reference counting inserted and optimized, and a test suite that proves the memory rules.",
  M3: "Unions, enums, patterns, options, results, operators, generics, interfaces, statics and local path dependencies, plus effect inference with <code>uses</code> bounds.",
  M4: "Attribute and expression macros written in Mora, run at compile time on a typed model, plus the standard-library macros such as <code>@Json</code>, <code>@Equatable</code> and <code>@Display</code>.",
  M5: "Text, collections, LINQ, console, environment, time, files, JSON, logging, secrets and testing: enough standard library for real programs.",
  M6: "Async functions, the single-threaded executor, TCP, an HTTP/1.1 server with routing and JSON, and compile-time dependency injection: the users REST API runs.",
  M7: "The editor, formatter, REPL, documentation and installers a developer expects, and the first public release.",
  M8: "Wasm targets, the <code>.wasm</code> library format, linking modes and ABI checks, and a stable plugin ABI at an opt-in boundary: native and Wasm plugins loaded from one interface.",
  M9: "URL and git dependency sources, inline imports in scripts, lockfile hashes, <code>mora fetch</code>, and capability grants enforced on wasm and native targets, narrowed per dependency, with sandboxed runs.",
  M10: "<code>shared</code> classes with atomic counts, sendable checks, <code>Thread</code>, <code>Task.Run</code>, <code>Mutex</code>, <code>Atomic</code>, <code>Channel</code>, a multi-threaded executor, and supervised worker processes as a framework option.",
  M11: "Class inheritance, variance, <code>yield return</code>, retroactive implementations, arenas, allocators, user <code>unsafe</code>, <code>decimal</code>, conditionally async higher-order functions (<code>async?</code>), and more macro kinds.",
  M12: "The package registry and registry dependency sources, Sigstore-signed publishing, the transparency log and mirrors.",
  M13: "LLVM release backend, Component Model export, Windows debug information, embedded targets.",
  M14: "<code>contract</code> sections with <code>requires</code>, <code>fails</code>, <code>ensures</code> and <code>invariant</code>, <code>where</code> predicates on newtypes, property tests generated from types and contracts, unit algebra, and compile-time evaluation of effect-free functions.",
  M15: "The simulated World, sound test caching and flaky-test triage from effects, <code>mora run --record</code> and <code>mora replay</code>, and hot reload of function bodies in dev builds.",
  M16: "<code>mora query</code>, <code>mora context</code> and <code>mora mcp</code>, JSON Schema from types and <code>@Tool</code> signatures as MCP tools, semantic diff with compiler-checked semver, and editions with <code>mora migrate</code>.",
  M17: "Time zones and the tz database, typed configuration with <code>@Config</code>, <code>Retry</code> policies, <code>@CancelSafe</code> and <code>Task.Shield</code>.",
  M18: "General reuse when unique, merging identical MIR bodies, <code>Vector128&lt;T&gt;</code>, closed-world devirtualization of <code>any I</code> and function values, and checked <code>@NoAlloc</code> and <code>scoped</code>.",
};
