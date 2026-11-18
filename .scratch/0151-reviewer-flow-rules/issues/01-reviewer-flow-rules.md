# 提交审核流程提速三项规则

Status: completed

## What to build

设计见 effort 的 `spec.md`. 最终状态: 先结束的 Reviewer 的报告先核对, 先修, 不等另一个; `prepare` 的 `warning:` 提示核对预计净增的分项之和; 合并后的 issue 预计改动有约 1000 行上界.

1. `.agents/skills/commit/implementation-workflow.md`: 第 4 步按 spec 的 "先到先修" 决定改写 (某个 Reviewer 先 `ready` 就先核对并修复暂存, 另一个未结束时不 `prepare`, 两个都结束后再 `prepare`, 与后到报告冲突按 `fix-rounds.md` 的冲突裁决); Run 节第 2 步加半句, 想先处理先结束的报告时两个 `.jsonl` 各用一个 `arw background-agent --wait`. `.claude/skills/commit/` 用 `node scripts/project-claude-skills.mjs` 同步, `distribution/skills/commit/` 用 `node scripts/sync-workflow-distribution.mjs` 同步. 长期规范 Review rounds 一节按 spec 同步改写 "只运行" 一句.
2. `lib/commit-audit/commit-audit.mjs` 的 `recordWarnings`: 按 spec 的 (d) 追加分项之和提示. 规范 `docs/specs/agent-repository-workflow/spec.md` 的 Commit Audit 一节 `prepare` 摘要警告一段加 (d), 顺序改为 "同一 issue 内依次 (c) (a) (b) (d)".
3. `docs/agents/agent-writes.md` 的 Issue concurrency 节在 "小 issue 尽量合并" 之后加体积上界一句 (口径与阈值依据见 spec 的 "issue 体积上界"); `distribution/baseline/docs/agents/agent-writes.md` 用同步脚本生成.
4. 测试: `tests/commit-audit/cli.test.mjs` 按 spec 的 Testing Decisions.

不做: Reviewer 能力 A/B; 改审核关卡, `reviewer-launch` Skill 或运行时代码; 核对 `## Validation` 数字 (已有 (a)) 和 `## Comments` 数字.

预计净增: 非测试代码约 8 到 12 行; 文档约 +1900 字符 (`implementation-workflow.md` 三份副本约 +900, `agent-writes.md` 两份副本约 +300, 长期规范约 +700); 测试约 15 行.

预期验证: 定向测试 `node --test tests/commit-audit/cli.test.mjs`, 再跑 `docs/agents/source-checkout-validation.md` 所列的源码仓库验证.

## Acceptance criteria

- [x] `implementation-workflow.md` 第 4 步写明先结束的 Reviewer 的报告先核对并修复, 另一个未结束时不 `prepare`, 先修与后到报告冲突按冲突裁决处理; Run 节第 2 步写明两个 `.jsonl` 可各用一个 `arw background-agent --wait`; 三份副本一致 (`node scripts/project-claude-skills.mjs --check` 与 `node scripts/check-workflow-distribution.mjs` 通过).
- [x] `prepare` 摘要在 `## What to build` 以 `预计净增:` 开头的行里, 分项之和与总量不符的 "约 <总量> 行 (<分项>)" 或 "约 <总量> 字符 (<分项>)" 片段各一行 `warning:`; 范围写法低值与高值分别核对; 分项之和相符, 括号内只有一个分项, 总量没有 "约" 时不报; 由测试覆盖. 同一 issue 同时有 (a), (b), (d) 时顺序为 (a) (b) (d); 长期规范按 spec 记录 (d) 与顺序, 并改写 Review rounds 的 "只运行" 一句.
- [x] `agent-writes.md` 的 Issue concurrency 节写明合并后的 issue 预计改动超过约 1000 行时按相关性拆开, 两份副本一致.
- [x] What to build 预期验证所列的每条命令 (`pnpm test` 等) 都退出 0.

## Validation

- 验收 1: `implementation-workflow.md` 第 4 步与 Run 节第 2 步已改 (两个 `.jsonl` 各用一个 `arw background-agent --wait` 的写法在 Run 节); `.claude/` 与 `distribution/` 副本由脚本生成, `node scripts/project-claude-skills.mjs --check` 与 `node scripts/check-workflow-distribution.mjs` 通过; 长期规范 Review rounds 的 "只运行" 句已改写.
- 验收 2: `tests/commit-audit/cli.test.mjs` 的既有警告测试增加预算行 (分项和不符, 范围写法, 括号内单个分项, 总量没有 "约" 都在其中), 断言 (a) (b) (d) 的顺序, `node --test tests/commit-audit/cli.test.mjs` 32 个通过; 长期规范已记录 (d) 与顺序.
- 验收 3: 两份 `agent-writes.md` 一致 (`node scripts/check-workflow-distribution.mjs`).
- 验收 4: `pnpm test`, `pnpm typecheck`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0151-reviewer-flow-rules/`, `git diff --check` 全部通过.

实测净增:

```
code: +6 lines (files: 1)
documents: +1220 characters (files: 6)
tests: +3 lines (files: 1)
```

## Blocked by

- None - can start immediately

## Comments

- 来源: Main Agent 分配 (revspeed 独立 Opus 分析候选 2, 4, 5 的合并). 按根 `AGENTS.md` 的 `rule-and-design-changes` 例外, Main Agent 的确认即为用户确认, 本 issue 对规则, Skill 与长期规范的改动以此为确认依据.
- 与分析报告的出入: 候选 4 的 "Validation 数字与实测不符" 一半已由 `prepare` 摘要警告 (a) 实现, 只补预计净增分项之和; 候选 5 原方案不做, 改在 Issue concurrency 节设约 1000 行上界.
- 体积: 预计代码约 8 到 12 行, 文档约 +1900 字符, 测试约 15 行; 实测代码 +6 行, 文档 +1220 字符, 测试 +3 行, 都在预算内 (测试复用既有用例, 文档三份副本每份 +187 字符).
- 台账: lib/commit-audit/commit-audit.mjs (d) 块中总量正则与分项正则各写一次 "约 <数字>" 模式 记录不修 第 3 轮起措辞与重复类问题不再开修复轮, 两个正则各自只在本函数内使用, 无行为缺陷.
- 台账: tests/commit-audit/cli.test.mjs 既有警告测试名缺少连接词 记录不修 第 3 轮起措辞类问题不再开修复轮, 名称仍列出三类断言.
