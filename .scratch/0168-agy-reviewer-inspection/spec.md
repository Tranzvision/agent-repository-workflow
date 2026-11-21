# Antigravity CLI Reviewer record inspection

The Reviewer capability `inspect` operation can examine a stopped single-turn Antigravity CLI run from a saved `--output-format stream-json` stdout stream. The operator or benchmark driver saves the unmodified stream and the instance directory. The stream emits an `init` event with the conversation ID and working directory, `step_update` events with tool calls and outputs, and a final `result` event. The format and tool arguments are documented by [Google Antigravity](https://antigravity.google/docs/cli/headless/#streaming-json) and its [hook tool reference](https://antigravity.google/docs/hooks#supported-tools).

## Module Design

### Modules

The Reviewer Capability Module owns parsing and inspection. The command entry point, installed command runner, archive format, and Codex and Claude Code adapters keep their current contracts.

### Interfaces

The Reviewer capability suite section of `docs/specs/agent-repository-workflow-development/spec.md` defines the agy record binding, acceptable terminal state, tool allowlist and flags under the existing `inspect` interface. The caller can place the prompt file inside the instance or pass the prompt directly so that accessing the prompt requires no read from an external directory.

### Seams and Adapters

The agy reader adapts tool calls, outputs and unfinished calls to the structure used by the existing checks. It takes an explicitly bound file and requires no home-directory discovery or model process. Agy's hook transcript path is distinct from captured stdout and is not required.

### Dependencies and Data Flow

The caller owns the instance, `agent.json` binding, and saved CLI stdout. `inspect` verifies that the record belongs to the bound conversation and working directory, then compares the calls and tool output with instance paths and fixture fingerprints from the same sources used by the existing checker. A missing or unsupported record blocks, and a read failure uses the existing I/O diagnostic. Inspection is read-only. After restoring missing evidence, the caller can rerun inspection on the same instance.

### Module Design Rationale

The headless stream has documented parameters and outputs for the same tool step. Reading it avoids parsing private conversation storage and keeps the inspection rules in one place.

### ADR Evaluation

The explicit binding adds an accepted evidence format under the same caller-owned record contract. It adds no persistent state, recovery mechanism, service access, or cross-module dependency. No ADR changes are required.

## Testing Decisions

Use the `inspect` operation with an isolated instance, fixture keys, and synthetic records. Check clean and flagged results, interruption with a known unfinished call, and blocked results for unusable records. Existing Codex and Claude Code inspection tests cover their unchanged results.
