# 修复 Reviewer 运行时被替换的运行不退役, 补齐预检第四项规格, 把无设计决定 issue 的常设确认写进仓库

Status: ready-for-agent

## What to build

本 effort 合并 2026-11-16 公共审核 (`common/review`) 发现的两项和 `ARW/daily` 一项, 三项都不含设计决定.

**(1) `spawn` 的 `held` 分支不走退役流程.** `lib/reviewer-runtime/reviewer-runtime.mjs` 中 `retireIfTerminal` 退役一个终态运行时依次做 `providerPolicy?.close()`, `session.detach()`, `snapshot = null`, `runs.delete`, `retiredRuns.add`, `recoveryPaths.delete`, `onRetired?.(runId)`. `spawn` 带 `newThread` 替换同身份的旧运行 (`held`) 时只做 `detach`, `snapshot = null`, `runs.delete`, `recoveryPaths.delete`, 缺 `providerPolicy?.close()`, `retiredRuns.add` 和 `onRetired`. 后果 (代码确认, 未运行): 宿主 `lib/arw-background-agent-host.mjs` 的 `bindings` 表留着旧 runId 的绑定且不触发 `pruneRuntime`; 之后对旧 runId 的 `interrupt_agent` 得到 `run-not-found` 而不是 `turn-mismatch`.

最终状态: 把 `retireIfTerminal` 的拆除步骤抽成一个局部函数, `retireIfTerminal` 和 `spawn` 的 `held` 分支都调用它, 两条路径的拆除一致. 先写失败测试复现 (替换已结束的运行后, 旧 runId 触发 `onRetired`, 且 `interrupt_agent` 得到 `turn-mismatch`); 测试复现不出任何差异时, 该项记录不修, 不改代码.

**(2) Spec Readiness 预检规格漏写第四项.** `lib/spec-readiness/precheck.mjs` 对 `## Acceptance criteria` 的任务列表项有两种 warning: 没有观察方式, 以及以提交后的事实或其他审核的结果为条件 (含 Commit Audit, 提交号, 推送, "审核/审查 ... 通过/无问题" 等). `docs/specs/agent-repository-workflow/spec.md` 的 `Prepare and independent review` 节只写 "三项机械预检". 最终状态: 该节改为四项并补写这一项, 与代码一致.

**(3) 无设计决定 issue 的常设确认原文不在仓库内.** 这类 issue 记 Spec Readiness `not-applicable`, `exception.reason` 引用的用户常设确认 (2026-11-02, 不含设计决定且不依赖共用 spec 的 issue 不需要治理设计) 原文在本机用户规则里, 要求符合审核每个这类 issue 都报一次 "确认原文不在仓库树内", 作者只能在 `## Comments` 记录不修 (0126, 0130 各一次). 最终状态: 在 `AGENTS.md` 的 `Source Checkout Baseline 例外` 节加一条, 写明该常设确认的内容和日期, 之后 `exception.reason` 引用这一条. 依据: 该节已有 `rule-and-design-changes` 的 User confirmation 例外, 同样把用户确认落成仓库内文字.

预计净增: 代码约 +3 行 (非测试; 抽函数后重复的拆除语句合并, 部分抵消); 测试约 +25 行; 文档约 +400 字符 (规格 +80, `AGENTS.md` +320).

预期验证: `tests/reviewer-runtime/reviewer-runtime.test.mjs` 新增 mock 测试 (不起真进程, 回调不超过 100 毫秒): 对已 `ready` 的 Reviewer 运行用 `newThread: true` 再 `spawn`, 旧 runId 触发一次 `onRetired`, `interrupt_agent` 旧 runId 得到 `turn-mismatch` (修复前得到 `run-not-found`); 现有 `retireIfTerminal` 测试继续通过. `arw text check`, `arw terms check --include .scratch/0131-daily-small-fixes-1116/`, `git diff --check`, 完整 `pnpm test` 通过.

## Acceptance criteria

- [ ] 新测试在修复前失败 (旧 runId 无 `onRetired`, 或 `interrupt_agent` 得到 `run-not-found`), 修复后通过, 现有 Reviewer 运行时测试继续通过; 若测试复现不出差异, 在 `## Comments` 记录该项不修及复现尝试.
- [ ] 规格 `Prepare and independent review` 节写明四项机械预检, 第四项与 `precheck.mjs` 的条件一致 (观察: 对照 `lib/spec-readiness/precheck.mjs` 该循环).
- [ ] `AGENTS.md` 的 `Source Checkout Baseline 例外` 节有一条写明常设确认的内容和日期 (观察: `grep -n 2026-11-02 AGENTS.md`).
- [ ] 公开 Interface 和持久状态没有改动; 测试回调耗时不超过 100 毫秒.

## Blocked by

- None - can start immediately

## Comments

- 来源: `common/review` report-1116 的 A1, A2 (代码确认, 未运行, 见 `~/projects/.tasks/common/review/report-1116.md`); 第 (3) 项来自 `ARW/daily` 的 sesspathloop 待办.
- Spec Readiness 记 `not-applicable` (三项都不含设计决定, 不依赖共用 spec; 常设确认见 (3), 实施前尚未入库时引用 `~/projects/docs/ARW.md` "ARW 自主工作方式" 拆分工作条), 按本机规则单独成 effort, 不写 spec.
- (3) 是 Agent 指令改动, 按 Baseline 例外由 Main Agent 确认, 维护者按整体 diff 复核.
