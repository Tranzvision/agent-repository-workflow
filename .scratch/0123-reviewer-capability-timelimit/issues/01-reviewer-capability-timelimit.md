# Reviewer 能力测试实例时限规则

Status: completed

## What to build

用户 2026-11-15 的原话: "然后 v2 要加入这个裁剪规则." "目前 reviewer 规则的源头应该是 ARW, 所以你只需要改 ARW 中的规则." 并在状态页选 A: "ARW 只写 '每个实例最多 60 分钟, 超时作废重跑, 计分不含超时实例'". 不移植 qwen-strata 的时限公式.

在 `.agents/skills/reviewer-capability/SKILL.md` (及其 `.claude/skills` 投影) 的 Run 流程写入: 每个实例最多 60 分钟; 到点未完成的实例用 `interrupt_agent` 停止并作废, 用新实例路径重跑; `summary` 与 `--compare` 的输入不含超时实例, 重跑实例按其自己的开始时间排, 不违反 "每格只取前 5 个实例" 的样本量规则. 规格 Reviewer capability suite 节的 `summary` 描述补一句对应说明. 只改规则, 不改代码.

预计净增: 文档约 700 字符.

预期验证: `node scripts/project-claude-skills.mjs --check`, `node scripts/check-workflow-distribution.mjs`, `node scripts/generate-install-arw.mjs --check`, `arw text check`.

## Acceptance criteria

- [x] Skill 写明 60 分钟时限, 超时实例的停止方式, 作废和重跑.
- [x] Skill 写明超时实例不进 `summary` 与 `--compare`, 重跑实例按其开始时间排序.
- [x] 规格 `summary` 描述与 Skill 一致; `.claude/skills` 投影同步.

## Blocked by

- None - can start immediately

## Validation

```text
code: 0 lines (files: 0)
documents: +744 characters (files: 3)
  .agents/skills/reviewer-capability/SKILL.md +360
  .claude/skills/reviewer-capability/SKILL.md +360
  docs/specs/agent-repository-workflow-development/spec.md +24
tests: 0 lines (files: 0)
next ADR number: 0041
```

`arw text check`, `check-workflow-distribution.mjs`, `project-claude-skills.mjs --check`, `generate-install-arw.mjs --check` 均通过. 只改规则文本, 无代码与测试变化. 自查 (只删减与合并): 改动仅 Skill 两处新增句与规格一处补句, 无可再删.

## Comments

- Spec Readiness 记 `not-applicable`: 不含设计决定的小改动, 按 `~/projects/docs/ARW.md` 单独成 effort, 用户已选定写法 (状态页选 A).
- 体积: 预计约 700 字符, 实际 +744 字符, 超出约 44 字符, 来自提交审核要求增补的 10 秒下限处理 (`wait_agent` 的 `timeout_ms` 下限使 "不超过剩余时间" 无法精确执行), 无可再删.
- 超时实例是否计入 `inspect` 与第 4 步的连续失败停止计数, 审核指出这是超出本 issue 授权的设计决定, 本 issue 不写豁免, 超时实例随 `completion` 为 `null` 按第 4 步既有计数处理 (超时的运行故障重跑三次后停止报告维护者); 是否另设超时专用的重跑上限交 Main 决定.
