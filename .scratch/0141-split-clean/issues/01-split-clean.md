# 去掉能力验证对 qwen_strata 的出处与等价性依赖

Status: completed

## What to build

ARW 的 Reviewer 能力验证 (`$reviewer-capability`, 3 个角色, 4 个场景) 只由 ARW 自己维护, 其规格, 注释, 测试名与夹具名不再以 `qwen_strata` 为出处, 也不再声称与它一致. 功能, 计分与评分语义不变; MT19937 的 Python 兼容洗牌是行为, 不改 (改了会使已存裁决库失配). 不含设计决定 (Spec Readiness 记 `not-applicable`).

- 夹具 `tests/fixtures/reviewer-capability/qwen-golden.json` 改名为 `pure-function-golden.json` (内容不变), 两个测试文件与 development spec 的引用同步; 测试名 "pool build matches the pools qwen_strata builds ..." 改为 "reproduces the saved golden pools ...".
- `lib/reviewer-capability/{templates,random,statistics,pool}.mjs` 与 `tests/reviewer-capability/{pool,statistics}.test.mjs` 的注释去掉 qwen_strata 一致性与出处表述.
- `docs/manuals/development.md`, `development.zh-CN.md`, release spec 的 Reviewer 能力测试两处, development spec 的 Reviewer Capability Module 各节 (模块说明, 夹具说明, 评分与池的合同句, 设计理由, 测试说明) 中声称与 qwen_strata 一致或以其为出处的句子改为独立表述; 两份 `reviewer-capability/SKILL.md` 第 9 行去掉 "套件来自 qwen_strata benchmark v2" (`.claude` 副本由投射生成).
- 不动: installation spec 的 `qwen_strata` 提供方条目, `tests/background-agent/` 的提供方测试, `.scratch/` 历史 issue.

预计净增: 代码 0 行 (只改注释, 净 -1 行), 文档约 -600 字符.

## Acceptance criteria

- [x] `grep -rn qwen_strata` 在 ARW 内只剩 installation spec 提供方条目, `tests/background-agent/` 与 `.scratch/` 历史; `qwen-golden` 不再出现在 `lib/`, `tests/`, `docs/`, `.agents/`, `.claude/`.
- [x] 能力验证的 3 角色, 4 场景, 命令输出与计分不变: `pnpm test` 中 reviewer-capability 部分全部通过, golden 值未改动.
- [x] 中英开发手册同步.

## Blocked by

- None - can start immediately

## Validation

- `pnpm typecheck`, `pnpm test`, `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0141-split-clean/`, `git diff --check`.
- 全部通过 (`pnpm test` 1013 个通过).

实测净增:

```
code: -1 lines (files: 4)
documents: -623 characters (files: 6)
tests: 0 lines (files: 4)
```

(tests 行数 0: 夹具 JSON 只改名, 内容不变.)

## Comments

- 来源任务: 总层 `reviewer-bench/split` 的 `ARW/split-clean` (报告 B 节).
- Spec Readiness 记 `not-applicable`: 依据 `AGENTS.md` Source Checkout Baseline 例外中用户常设确认 (2026-11-02), 只改注释, 名称与文字, 不含设计决定.
- 体积: 预计代码 0 行, 文档约 -600 字符; 实测代码 -1 行, 文档 -623 字符, 未超出.
