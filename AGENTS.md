## Code Quality Standards

- Always verify the exact API shape by checking signatures, parameter types, return types, setup patterns and test usage.
- **Never compromise type safety**: No `any`, no non-null assertion operator (`!`), no type assertions (`as Type`)
- **Make illegal states unrepresentable**: Model domain with ADTs/discriminated unions; parse inputs at boundaries into typed structures; if state can't exist, code can't mishandle it
- **Never suppress deterministic feedback**: Do not disable, mute, or bypass Effect diagnostics or linting rules with inline comments, config exceptions, or command flags. Fix the underlying issue instead so validation remains deterministic.

## Architecture and Separation of Concerns

Design orthogonal modules: changing one concern should not require changes to unrelated concerns.

- Give each module one clear responsibility and one small interface. Keep implementation details private to the module that owns them.
- Separate domain policy from mechanisms and adapters. Domain behavior must not depend on CLI parsing, filesystem layout, provider response shapes, benchmark fixtures, or other delivery details.
- Put each fact, rule, and transformation in one owning module. Callers should use that module's interface rather than duplicate its knowledge.
- Keep dependencies directional. Higher-level workflows may compose lower-level modules; lower-level modules must not import callers or encode caller-specific behavior.
- Depend on public package exports. Do not reach into another package's private source files or make callers reproduce its internal conventions.
- Keep public contracts expressed in user-facing domain terms. Do not expose internal paths, document organization, link syntax, memory layers, provider metadata, ranking details, or implementation traces unless they are explicitly part of an approved public contract.
- Treat tests as callers of the interface. Black-box and cross-package tests must assert public behavior only; tests that know implementation details belong in the package that owns that implementation.
- Keep fixtures opaque across seams. A consumer may supply a fixture through a public input, but must not inspect its internal structure to determine expected behavior.
- Avoid pass-through abstractions. Add a seam only when it hides meaningful complexity or when multiple adapters genuinely vary behind the same interface.
- When a change mixes concerns, split it into independently named modules before extending behavior. If two parts must change together, make the ownership relationship explicit and verify that the dependency points in one direction.

Before completing a change, check:

1. Can the implementation change without forcing unrelated callers or tests to change?
2. Does each piece of domain knowledge have exactly one owner?
3. Do cross-package tests know only public inputs and outputs?
4. Have internal implementation details stayed behind their owning interface?

## Reuse and Helper Placement

- Treat DRY as single ownership of knowledge, rules, and transformations—not elimination of superficial repetition. Prefer small duplication over a premature or misplaced abstraction.
- Keep one-off implementation details private and local. Extract only to centralize domain knowledge, hide meaningful complexity, or support proven reuse.
- Keep domain behavior in its owning module. Place only truly domain-agnostic, pure, shared helpers in the owning package's established utility module; do not create catch-all utility folders or violate dependency direction.
- Before adding a helper, find its proper owner and extend that module only when the behavior fits its responsibility.
- Inline trivial one-off expressions. Avoid pass-through wrappers or aliases; extracted names must communicate behavior or domain intent.

<!-- effect:start -->

## Effect Best Practices

**IMPORTANT:** Always consult the Effect v4 source mirror in `.repos/effect/`.

The full source code for the `effect` library is in `.repos/effect/`. Agent instructions live in `.repos/effect/LLMS.md`. Native development patterns live in `.repos/effect/.patterns/`.

For Effect v4, prefer imports from the main `effect` package, eg `effect/CLI` and `effect/Platform`. Avoid legacy standalone packages.

Use this for learning the library instead of browsing `node_modules/`.

Never guess at Effect patterns or APIs. Check the full source code.

<!-- effect:end -->
