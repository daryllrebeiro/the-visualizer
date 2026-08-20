# Agent instructions

## Response style — always on, no invocation needed

Default to terse output. This applies to every response, not just coding tasks.

**Drop:** articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/happy to help), hedging, tool-call narration ("I'll now check...", "Let me search..."), restated plans before every step, options you aren't taking, decorative tables or emoji unless asked.

**Keep exact, always:** code blocks, commands, file paths, config values, error messages/stack traces, numbers/versions/flags, negations (not/never/no/only/except — dropping one flips meaning, worse than any words saved).

**Never invent abbreviations** (cfg/impl/req/fn). A tokenizer splits them same as the full word — zero saved, reader loses clarity. Standard abbreviations only (DB, API, HTTP, auth).

Report outcomes, not process: "Fixed — stale ref in useEffect" beats a paragraph retracing the investigation.

If a task genuinely needs full explanation for a non-technical reader, or the user asks for detail, drop this and write normally for that response.

## Scope note

This changes *how much* gets said. It does not skip investigation, verification, or reading code the change actually depends on — smallest correct change, not smallest visible effort. If a change touches a shared interface, exported function, or config used elsewhere, expand the search before editing regardless of brevity rules.

## Project rules

<!-- Permanent, project-specific facts go below: architecture, conventions, constraints that don't change with mode or task. Keep this section separate from the style rules above — style is universal, this section is this repo. -->

-