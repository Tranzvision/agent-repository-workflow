# 修正能力运行结果的符号链接写入与两处规则文字

Status: completed

## What to build

Reviewer 能力运行独占创建 `agent.json`, `score.json`, `candidates.json` 和 `run.json`. 遇到同名普通文件或符号链接时返回 `instance-write` 失败, 并保留已有文件及链接指向的内容. 通过 `runInstance` 的返回结果和文件内容验证冲突, 并保留正常运行写出四份结果的验证. 先运行定向回归测试确认失败, 再修正写入.

在 `.agents/skills/reviewer-capability/SKILL.md` 的 Finish 节把清理范围限定为本次启动的客户端及本次临时目录. 在 `.agents/skills/commit/implementation-workflow.md` 第 7 步说明低级问题处置适用于 Reviewer 违反 `docs/agents/reviewer.md` 的 Report 节的情形. 同步两份 Claude Code 投影和 `commit` 的分发副本, 并更新中英文变更日志.

体积预算为非测试代码净增 3 行. 预计改动行数 (新增与删除之和) 为代码 2 行, 测试 25 行, issue 和文档 65 行.

预期验证包括定向回归测试与耗时测量, 完整 Source Checkout 验证和 Commit Audit, 然后提交.

## Acceptance criteria

- [x] 正常运行写出四份结果. 遇到同名普通文件或符号链接时返回 `instance-write` 失败, 现有文件和链接指向文件的内容保持原样. 定向回归测试先失败后通过.
- [x] 能力测试的 Finish 节只要求停止本次启动的客户端和删除本次临时目录. 实施提交流程第 7 步明确将低级问题处置关联到 Reviewer 违反 Report 节的情形. 两份 Claude Code 投影和 `commit` 分发副本与源码一致, 中英文变更日志记录结果文件的冲突行为.
- [x] 完整 Source Checkout 验证通过, 并记录新增测试回调耗时.

## Blocked by

- None - can start immediately

## Validation

- 定向回归: `node --test --test-name-pattern='run refuses an existing' tests/reviewer-capability/run.test.mjs` 在修正前两个冲突案例均因意外成功而失败. 修正后 `node --test tests/reviewer-capability/run.test.mjs` 的 9 个案例均通过, 包括正常写出四份结果. 普通文件与符号链接两个回调分别耗时 117.39 和 119.76 毫秒, 按根 `AGENTS.md` 的超时例外保留真实进程测试.
- 全量 (基线 `a8bc07c`): `pnpm test` 通过 1133 个测试, `pnpm typecheck` 通过. 两个改动的 ESM 文件均通过 `node --check`.
- 文档: 核对两处规则语义, 两份 Claude Code 投影, `commit` 分发副本和双语更新日志. `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check` 和 `node scripts/generate-install-arw.mjs --check` 通过.
- `arw text check`, `arw terms check --include .scratch/0177-capability-run-writes/` 和 `git diff --check` 通过.

```text
code: 0 lines (files: 1)
  lib/reviewer-capability-run.mjs 0
documents: +172 characters (files: 7)
  .agents/skills/commit/implementation-workflow.md -4
  .agents/skills/reviewer-capability/SKILL.md -2
  .claude/skills/commit/implementation-workflow.md -4
  .claude/skills/reviewer-capability/SKILL.md -2
  distribution/skills/commit/implementation-workflow.md -4
  docs/CHANGELOG.md +129
  docs/CHANGELOG.zh-CN.md +59
tests: +22 lines (files: 1)
  tests/reviewer-capability/run.test.mjs +22
next ADR number: 0041
```

## Comments

- 来源为 `issue:0175:01` 与本轮分流记录. 本次另建单 issue 的 effort, 适用根 `AGENTS.md` 的单 issue 常设例外. 本轮 Main 明确确认此范围无设计决定, 无共用 spec.
- 本轮 Main 授权修改结果文件的冲突行为, 修改两处规则文字及其现有投影与副本, 增补测试和中英文变更日志. 规则修改内容由本轮请求明确确认. 能力运行的写入修正和两处措辞均不改变 Reviewer 输入或运行策略, 按 `docs/agents/source-checkout-reviewer-testing.md` 免做能力对比与裁决.
- 本轮 Main 裁定: Commit Audit 发现 issue 正文自相矛盾或与实施不一致时, 可更正正文, 重新生成并提升例外记录, 然后由原 Reviewer 线程仅复审更正. 如验收项依赖提交, 可先提交已审实施, 再用非实施提交勾选并记录真实提交号. Reviewer 线程无法恢复时可另开线程对完整候选进行双轴审核并在此记录. 无法复现的发现以本节记录结案.

- 实施前查明 `setupScenario` 拒绝已存在的目标, 并为通常运行创建实例目录. 四个结果文件各有一个写入调用. 两处规则原文分别要求停止共享守护进程和遗漏低级问题处置的适用前提, 本次一并修正. `distribution/config.json` 的 `sourceOnlySkills` 排除 `reviewer-capability`, 此 Skill 有 Claude Code 投影.
- 基线更新至 `a8bc07c`, 修正了历史 issue 的无效状态. 新基线占用 effort 0176, 本 issue 改用 effort 0177 并以原确认时间重新生成例外记录.
- 预计和实测改动行数 (新增与删除之和): 代码 2/2 行, 测试 25/26 行, issue 和文档 65/81 行. 测试增加一行超时说明, issue 记录验证结果, 审计统计和基线更新.
