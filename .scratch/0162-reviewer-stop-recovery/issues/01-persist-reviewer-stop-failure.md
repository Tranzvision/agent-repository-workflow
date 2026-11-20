# 保留隔离 Reviewer 的停止失败记录并澄清审核说明

Status: completed

## What to build

隔离 Reviewer 因提供方策略停止时, 将失败的代码和消息作为 JSON 对象保存到恢复记录, 使调用方可以在停止后读取记录. 核对同一运行时内邻近的失败记录写入路径. 本 issue 修复现有恢复记录写入并澄清现有审核流程, 无需单独 spec. 预计非测试代码净增 0 行.

手工审核轮的 `instructions` 与 `handoff` 要求由 `reviewer-launch` 的 Other reviews 节统一说明, `code-review` 引用该规则. 在 Spec Readiness 修正流程中明确改动规则后先检索并同步其全部表述, 再重新准备审核. 同步受影响的分发与 Claude Code 投影.

## Acceptance criteria

- [x] 先用定向回归测试复现保存失败, 修复后确认隔离 Reviewer 停止时写入的恢复记录可读, 包含原始失败代码和消息, 且状态为 `failed`.
- [x] 核对邻近失败记录的写入路径是否将 `Error` 实例交给 JSON 克隆.
- [x] 手工审核轮的指令由一处工作流说明, 另一处引用. Spec Readiness 修正流程明确规则表述的同步时点, 对应副本一致.
- [x] 定向回归测试及源码仓库的完整验证通过.

## Blocked by

- None - can start immediately

## Validation

- `node --test --test-isolation=none --test-name-pattern='a provider stop persists' tests/reviewer-runtime/reviewer-runtime.test.mjs`: 修复前因 `value must be a valid JSON value.` 失败, 修复后通过, 用例耗时 37.46 毫秒.
- `node --test --test-reporter=./tests/helpers/test-reporter.mjs`: 在隔离主目录中运行, 1046 项通过, 0 项失败. `node_modules/.bin/tsc --project tsconfig.json` 通过. `pnpm` 的 Windows 启动脚本缺少 Corepack 模块, 因此直接运行两个入口.
- 核对 Reviewer 运行时的其他 `record.failure` 写入与冷读路径. 组违规与停止错误直接写入普通对象, 后台异常经 `errorResult` 转成普通对象, 冷读接受 JSON 失败对象.
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check` 及两个变更的 `.mjs` 文件的 `node --check` 通过.
- `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0162-reviewer-stop-recovery/` 和 Git 空白检查通过.

```text
code: 0 lines (files: 1)
  lib/reviewer-runtime/reviewer-runtime.mjs 0
documents: +324 characters (files: 7)
  .agents/skills/code-review/SKILL.md +31
  .agents/skills/spec-readiness/respond-to-findings.md +38
  .claude/skills/code-review/SKILL.md +31
  .claude/skills/spec-readiness/respond-to-findings.md +38
  distribution/skills/code-review/SKILL.md +31
  distribution/skills/spec-readiness/respond-to-findings.md +38
  docs/manuals/skills.md +117
tests: +34 lines (files: 1)
  tests/reviewer-runtime/reviewer-runtime.test.mjs +34
next ADR number: 0041
```

## Comments

- Main 确认手工审核说明和 Spec Readiness 修正流程的具体改动, 允许同步分发与 Claude Code 投影. Reviewer 能力免测 (理论分析). 解释集中在启动方与修正方使用的文档, 角色指令和判定范围相同, 运行时修复只发生在隔离任务的停止路径.
- 要求符合审核指出三份 `code-review/SKILL.md` 的引用遗漏 `handoff`. 核对源码, 分发与 Claude Code 投影中的 `code-review/SKILL.md` 和 `reviewer-launch/other-reviews.md`, 统一让 `code-review` 的同一句引用涵盖两个字段.
- 实施标准与要求符合 Reviewer 均在原线程完成增量复审, 两份绑定报告均为 `No problems.`.
