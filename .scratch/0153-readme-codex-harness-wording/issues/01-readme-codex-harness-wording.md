# 手册与回退提示对 Codex harness 得分的措辞改准确

Status: completed

## What to build

README 中英文和 Claude 回退提示 (`lib/arw-background-agent-host.mjs` 的 `CLAUDE_FALLBACK_NOTICE`) 写 "同一个模型在 Codex 中的得分不低于在 Claude Code 中的得分" (英文 "equal or higher"). 数据中 24 格有 3 格是 Claude Code 略高, 只是差异不显著, 所以 "不低于" 字面不准确. 三处改成 "没有一项得分明显低于" 的意思 (英文 "never scored clearly lower"), 其余句子 (Spec Readiness 上明显更高) 不变. 手册和提示不提 benchmark.

交付范围: `README.md`, `README.zh-CN.md`, `lib/arw-background-agent-host.mjs` 的一个字符串. 体积预算: 非测试代码净增不超过 5 字符 (一个字符串内换词), 文档净增不超过 60 字符.

预期验证: `node arw.mjs text check`, `node scripts/check-workflow-distribution.mjs`, `pnpm test` 中涉及回退提示的宿主测试通过.

## Acceptance criteria

- [x] `README.md` 与 `README.zh-CN.md` 不再写 "equal or higher" / "不低于", 改为 "never scored clearly lower" / "没有一项得分明显低于" 的意思, 且仍说明 Spec Readiness 上明显更高; 两份内容一致, 不含 `benchmark`.
- [x] `CLAUDE_FALLBACK_NOTICE` 同步为同样意思, 现有测试仍通过.

## Blocked by

- None - can start immediately

## Validation

- 验收 1 与 2: `git diff --cached` 只含三处换词: `README.md` ("never scored clearly lower"), `README.zh-CN.md` ("没有一项得分明显低于"), `CLAUDE_FALLBACK_NOTICE` ("never scored clearly lower ... and clearly higher in Spec Readiness review"); `grep -rn "equal or higher\|不低于"` 在 README 与 `lib/` 中无命中; 两份 README 不含 `benchmark`.
- `pnpm typecheck` 通过; `pnpm test` 1038 个全部通过 (含宿主回退提示测试); `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node --check lib/arw-background-agent-host.mjs`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0153-readme-codex-harness-wording/`, `git diff --check` 均通过.

实测净增:

```
code: 0 lines (files: 1)
documents: +16 characters (files: 2)
tests: 0 lines (files: 0)
```

## Comments

- 范围 (本机工作方式): 不含设计决定, 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`. 同一句在 `CLAUDE_FALLBACK_NOTICE` 里也有, 一并改, 避免提示与手册不一致.
- 审核后修订: 英文句的 `never` 可能被读成也管后半句, 改为两个独立句子 ("... than with Claude Code. In Spec Readiness review they scored clearly higher."), 手册英文与 `CLAUDE_FALLBACK_NOTICE` 同步; 提示中重复的 "as the harness" 已删, 提示字符串相对基线净增 3 字符, 在 5 字符预算内.
