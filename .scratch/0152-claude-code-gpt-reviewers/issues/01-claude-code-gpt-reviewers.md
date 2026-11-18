# Claude Code 上 Reviewer 默认用 GPT, 没装 Codex 时提示

Status: completed

## What to build

设计见 effort 的 `spec.md`. 最终状态: 所有平台的 Reviewer 设置按配置解析, 默认 `gpt-6-luna` `xhigh` 经 Codex 运行; 显式 `anthropic` 的角色照用; 仅 Claude Code 调用方且 `PATH` 上没有 `codex` 时回退到 `haiku` `high`, 并在启动 Reviewer 的成功结果里带 `notice`, 建议安装 Codex.

1. `lib/arw-common/reviewer-configuration.mjs`: `resolveReviewerSettings` 加 `codexAvailable` 与 `onFallback`, 回退条件按 spec.
2. 新文件 `lib/arw-common/executable-path.mjs`: 导出 `executableOnPath`.
3. `lib/arw-background-agent-host.mjs`: Claude Code 调用方的 Reviewer 启动检查 `codex`, 回退时在成功结果的 `result` 加 `notice`, 且不给回退角色传 `programDirectory`, `lib/background-agent/claude-sessions.mjs` 仅在设置带 `programDirectory` 时注入该角色的 `env`.
4. 文档: `README.md` 与 `README.zh-CN.md` 加 "安装 Codex" 一节 (只写结论, 不提 benchmark); `reviewer-launch` Skill (源, `.claude/`, `distribution/` 三份), 长期规范 `docs/specs/agent-repository-workflow-installation/spec.md` 与 `docs/specs/agent-repository-workflow/spec.md`, ADR 0032 同步.
5. 测试: `tests/arw-common/config.test.mjs`, `tests/arw-common/agent-cli.test.mjs`, `tests/background-agent/claude-sessions.test.mjs` 按 spec 的 Testing Decisions.

不做: Reviewer 能力 A/B; `doctor` 命令; 安装时检查 Codex.

预计净增: 非测试代码约 20 行; 文档约 +2500 字符; 测试约 18 行.

预期验证: `pnpm typecheck`, `pnpm test`, `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node arw.mjs text check`; 定向测试 `node --test tests/arw-common/config.test.mjs tests/arw-common/agent-cli.test.mjs tests/background-agent/claude-sessions.test.mjs`, 再跑 `docs/agents/source-checkout-validation.md` 所列的源码仓库验证.

## Acceptance criteria

- [x] Claude Code 平台上配置为 GPT 的 Reviewer 在 `PATH` 有 Codex 时解析为 GPT 设置, 不再换成 `haiku`; 显式 `anthropic` 角色无论有无 Codex 都照用且不触发回退回调; 由 `tests/arw-common/config.test.mjs` 覆盖.
- [x] 无 Codex 的 Claude Code 调用方得到 Claude 默认设置, 且启动结果带 `notice` (宿主代码读 `executableOnPath('codex')` 并把回调写入 `result.notice`); `executableOnPath` `executableOnPath` 由 `tests/arw-common/agent-cli.test.mjs` 覆盖, `notice` 与回退运行由 `tests/background-agent/claude-sessions.test.mjs` 的宿主测试覆盖 (`PATH` 为空时 `spawn_agent` 结果含 `Codex is not installed` 的 `notice`, 后端以 `haiku` 运行且回退运行不带角色 `env`; `PATH` 有 `codex` 文件时结果不带 `notice`).
- [x] README 中英文, `reviewer-launch` Skill 三份副本, 两份长期规范与 ADR 0032 不再写 Claude Code 上默认 `haiku`, 且手册文本不含 `benchmark`; 三份 Skill 副本一致 (`node scripts/project-claude-skills.mjs --check`, `node scripts/check-workflow-distribution.mjs` 通过).
- [x] What to build 预期验证所列每条命令都退出 0.

## Validation

- 验收 1: `tests/arw-common/config.test.mjs` 覆盖有 Codex 时 GPT, 无 Codex 回退并调用回调一次, 显式 `anthropic` 不回退; 验收 2: `tests/arw-common/agent-cli.test.mjs` 的 `executableOnPath` 与 `tests/background-agent/claude-sessions.test.mjs` 的宿主测试 (`PATH` 为空带 `notice`, 回退运行 `haiku` 且无角色 `env`, `PATH` 有 `codex` 无 `notice`); 验收 3: README 中英文, 三份 `reviewer-launch`, 两份长期规范, ADR 0032 已改, `node scripts/project-claude-skills.mjs --check` 与 `node scripts/check-workflow-distribution.mjs` 通过; 验收 4: `pnpm typecheck`, `pnpm test` (1038 通过), 分发与 Skill 检查, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0152-claude-code-gpt-reviewers/`, `git diff --check` 全部通过.

实测净增:

```
code: +20 lines (files: 5)
documents: +2591 characters (files: 8)
tests: +41 lines (files: 3)
```

## Blocked by

- None - can start immediately

## Comments

- 来源: 用户 2026-11-19 08:14, 08:15, 08:16, 08:17, 08:24, 08:26 的原话 (08:24 取代 08:16 的 "必须安装", 改为建议并回退提示; 08:26 手册不提 benchmark). Main Agent 分配 (任务 `ARW/revgpt`).
- 体积: 预计代码约 20 行, 文档约 +2500 字符, 测试约 18 行; 实测代码 +20 行, 文档 +2591 字符, 测试 +41 行, 文档超出约 91 字符 (ADR 0032 需写明对 ADR 0016 "不隐式覆盖用户选择" 的例外与隔离运行不回退, 提交审核要求, 已无可再删的重复), 测试超出约 23 行 (宿主测试要覆盖无 Codex, 有 Codex 与回退不带 `env` 三个分支, 才能让 `PATH` 判定接线可验证, 就绪审核据此要求).
- 过程偏离: 代码与文档改动先于 Spec Readiness 写出 (在 issue 与 spec 之前), 以便确定设计; 未提交, 就绪审核与提交审核照常进行.
- "已证实" 的数据依据 (reviewer-model-benchmark `benchmark-results.json` v1, 同模型换 harness): 见任务报告 `.tasks/ARW/revgpt-report.md`; 措辞限定为 "得分不低于, Spec Readiness 明显更高".
