# Synthetic fixtures

What the redacted corpus does not contain (the `knownAbsent` section of `../oracle.json`), written by hand so
each case stays small enough to read in a review. One directory per case, each a session in the layout of spec
§4.0: `<session-id>.jsonl` next to `<session-id>/`.

| Directory | Case | What `doctor` must do |
|---|---|---|
| `truncated-transcript/` | a record cut off mid-write | count it as unparsable and carry on, never throw |
| `unknown-denial-kind/` | `toolDenialKind` the contract does not know | report the value as unknown, never fold it into `permission-rule` |
| `stopped-by-auto-mode/` | a call auto mode's classifier refused (`automode-blocked`, with `serverClassifierContext` beside it, as 2.1.284 writes it) and one the person turned down (`user-rejected`) | count both; flag only `user-rejected` as unknown, since contract v14 knows the first and nothing of the second's effect is measured |
| `nested-delegation/` | a subagent that delegates again, `spawnDepth: 2` | count the nested `Agent` call and the depth |
| `missing-subagent-transcript/` | `meta.json` with no transcript beside it | report an incomplete pair, not a missing delegation |
| `missing-spilled-result/` | a result referencing a `tool-results/` file that is not there | count the reference as missing |
| `agent-without-delegation/` | an agent started by a skill: its `meta.json` has no `toolUseId`, and the session holds no `Agent` call | report the agent and what it did, and say that no instruction is on record — never drop it |

Every free-text position carries the `AGENTWHY_CANARY` marker, the same one the redactor plants, so a fixture
that reaches the output is caught by the same guardrail.

Identifiers are synthetic but shaped like the real ones, because the scanner's exclusion list keys on those
shapes (lesson L001).
