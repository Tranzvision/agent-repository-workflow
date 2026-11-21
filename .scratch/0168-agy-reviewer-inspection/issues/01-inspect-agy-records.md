# Inspect Antigravity CLI Reviewer records

Status: completed

## What to build

Extend Reviewer capability `inspect` to accept an Antigravity CLI (`agy`) headless streaming JSON record through the existing instance and `agent.json` interface. Use the same path, tool and answer-key checks as for Codex and Claude Code. Estimated net production code growth is 115 lines.

## Acceptance criteria

- [x] Assert that `inspect` returns the same inspection payload as for the other supported records, with no flags for a clean tool call inside the bound instance.
- [x] Assert `path`, `tool` and `answer-key` flags for prohibited paths in parameters and command working directories, unapproved tools, and answer-key text returned by tools. Report text supplied to a write tool does not count as an access to paths mentioned in that text.
- [x] Assert `blocked` for missing or mismatched identity, subagent activity, malformed evidence and incomplete completed runs. For an interrupted run, assert flags for tool activity with available parameters and the positions of unfinished calls.
- [x] Write failing tests through `inspect` before implementation, using synthetic records only. Verify the new cases run within 100 milliseconds each and run the Source Checkout checks. Update the English development manual and changelog.

## Blocked by

- None - can start immediately

## Validation

- `node --test --test-isolation=none tests/reviewer-capability/inspection.test.mjs` passed all 17 tests. The first agy test failed with a thread mismatch before production code changed. The four synthetic agy tests passed in 8.16, 4.22, 3.03, and 7.52 ms. They cover paired updates, external file paths and shell working directories, an unapproved tool, answer keys in tool output, written report text, interruption, and unusable evidence. The wildcard regression assertion failed before the prefix fix and passed afterward.
- `node scripts/reviewer-capability.mjs inspect` exited 0 for a synthetic stream with one allowed call and no flags.
- `pnpm typecheck` passed. `pnpm test` passed all 1068 tests with loopback sockets enabled. The sandboxed run could not bind the local JIRA fixture server (`EPERM`).
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, and `node --check` for both changed JavaScript files passed.
- `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0168-agy-reviewer-inspection/`, `git diff --check`, and `git diff --cached --check` passed.
- `docs/manuals/development.md` describes capturing and binding the stream. `docs/CHANGELOG.md` records the new inspection support.

~~~text
code: +87 lines (files: 1)
  lib/reviewer-capability/inspection.mjs +87
documents: +1859 characters (files: 3)
  docs/CHANGELOG.md +182
  docs/manuals/development.md +857
  docs/specs/agent-repository-workflow-development/spec.md +820
tests: +101 lines (files: 1)
  tests/reviewer-capability/inspection.test.mjs +101
next ADR number: 0041
~~~

## Comments

The implementation brief authorizes this single issue and its readiness design under the repository's rule-and-design-changes Baseline exception. The design uses the Antigravity CLI headless stream contract and the Google Antigravity hook tool reference. The benchmark runner's archive and scoring contract is outside this issue.

A synthetic headless stream reproduced the baseline failure through `inspect`. The operation returned `blocked` with `The record does not belong to the thread of agent.json.` The first Spec Readiness report required an explicit agy tool allowlist and an update to the owning development specification. Main confirmed the change to the Reviewer Capability Module sections of `docs/specs/agent-repository-workflow-development/spec.md` under the rule-and-design-changes Baseline exception. The owning specification now defines the agy format and tool allowlist. A real agy sample is pending verification. The acceptance tests use synthetic records based on the official headless format.

The Requirements Reviewer found that agy search paths skipped wildcard-prefix checking. The fix uses the existing prefix rule for structured paths with no literal match. It covers all mapped file and search tools and the shell working directory, while preserving an existing filename containing brackets. A synthetic `grep_search` assertion reproduces the missed flag.

Spec Readiness returned `No problems.` after the contract update. The first Requirements audit attempt could not open its request because the Reviewer shell failed to start. The retry produced the wildcard finding above. The Requirements and Code Standards reviewers both returned `No problems.` after the fix.
