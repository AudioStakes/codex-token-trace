# codex-token-trace Context

This context records project-specific language for analyzing Codex session JSONL logs and explaining token usage drivers.

## Language

**Tool usage**:
A single observed tool invocation reconstructed from existing Codex session JSONL events, including its call input, associated output events, and the next unique `token_count` event seen after that invocation.
_Avoid_: tool call impact, command usage

**Session timeline explorer**:
Local server UI that combines a normalized token pressure timeline with per-event Codex session details.
_Avoid_: cross-session correlation report, static HTML export
