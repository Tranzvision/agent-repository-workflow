# 初始化交接清单提示忽略 `.tmp/`, 并合并两项小修

Status: ready-for-agent

## What to build

背景: 2026-11-14 与 11-15 的每日检查留下三项小修, 合并为一个 issue 一起实施 (设计取舍见 effort 的 `spec.md`). 最终状态如下三项都已落地.

1. 初始化交接清单提示忽略引擎临时根. `arw workflow init` 成功后返回的 `handoff.checklist` 增加一项 `The repository root .gitignore ignores the engine temporary root .tmp/ (add it when missing)`, 位于 `.arwignore and Agent-managed Scope` 之后 (`lib/repository-workflow/workflow.mjs`). `docs/specs/agent-repository-workflow/spec.md` 的 `Post-init handoff` 节的审核范围列表同步增加一条 "仓库根 `.gitignore` 忽略引擎临时根 `.tmp/` (缺失时加入)". 边界: 仓库根 `.gitignore` 已使 `.tmp/` 被忽略时审核视为满足; 否则补救是把 `.tmp/` 写入仓库根 `.gitignore`, 没有该文件就新建一个只含这一行的文件; `.git/info/exclude` 和用户全局忽略不算, 因为它们不随仓库保存. 不改 `workflow init` 的写入, 不改 `workflow verify`, 不改 `gaps`.
2. `lib/document-terms/document-terms.mjs` 的行为保持清理: `parseContextMap` 的返回值去掉不可达的 `diagnostics.length === 0 ? contexts : []` (唯一调用方在 `map.diagnostics` 非空时已提前返回); `parseContextMap` 中的 `diagnostics.unshift(...)` 改为 `push`, `validateIncludes` 去掉返回前的 `.sort(compareDiagnostic)` (两者的结果都只经 `resultFrom` 统一排序后输出); `parseAvoidNames` 去掉恒真的 `names.length > 0`; `parseLocalTerms` 中两处字段完全相同的 `local-term-entry-invalid` 诊断字面量合并为一个局部构造函数. 命令输出, 诊断集合与顺序, 错误结果和持久状态不变.
3. `commit` Skill 的实施提交流程 (`.agents/skills/commit/implementation-workflow.md` Commit Audit 的 Run 第 1 步) 增加一句: `## Comments` 里写体积时, 预计取 `## What to build` 的预计净增, 实际取最后一次修改后的 `## Validation` 摘要数字, 超出量为二者之差, 之后再改 Validation 数字时同步重写. `distribution/skills/commit/` 与 `.claude/skills/commit/` 的副本由现有脚本同步.

不做: 提交审核前禁止留 "待决定" 项的规则 (只有一例证据); 让 `workflow init` 自己写 `.gitignore`; 清理中无法在不增加代码的前提下合并的 `asciiWhitespace` 与分词正则的字符类.

预计净增: 代码约 -4 行 (第 2 项约 -5 行, 第 1 项 +1 行), 文档约 +400 字符 (第 3 项三份副本约 +300, 第 1 项长期规格约 +60), 测试约 +2 行.

预期验证: 第 1 项的边界 (已被 `.gitignore` 忽略时视为满足, 没有 `.gitignore` 时新建) 是 Main Agent 初始化后审核的判断, 不是 Engine 行为, 不测试; `pnpm test` 中 `tests/document-terms` 与 `tests/repository-workflow/workflow.test.mjs` 通过 (后者增加对新清单项的断言); `pnpm typecheck`; `node scripts/project-claude-skills.mjs --check`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `node arw.mjs text check`; `node arw.mjs terms check --include .scratch/0125-daily-small-fixes/`; `git diff --check`; 新增或改动的测试回调耗时不超过 100 毫秒或不因本改动变慢.

## Acceptance criteria

- [ ] `arw workflow init` 成功后返回的 `handoff.checklist` 含 `The repository root .gitignore ignores the engine temporary root .tmp/ (add it when missing)`, 由 `tests/repository-workflow/workflow.test.mjs` 的初始化测试断言; `gaps` 和 `workflow init` 写入的文件不变.
- [ ] 长期规格 `Post-init handoff` 节的审核范围列表含对应的一条.
- [x] `lib/document-terms/document-terms.mjs` 按第 2 项清理, `tests/document-terms` 全部通过且未改动其断言.
- [ ] `commit` Skill 的 `implementation-workflow.md` 含第 3 项的一句, `.agents/skills`, `distribution/skills`, `.claude/skills` 三处一致 (`node scripts/project-claude-skills.mjs --check` 与 `node scripts/check-workflow-distribution.mjs` 通过).
- [ ] `git diff --numstat` 中 `lib/` 下只有 `lib/repository-workflow/workflow.mjs` 和 `lib/document-terms/document-terms.mjs` 有改动.

## Blocked by

- None - can start immediately

## Validation

(第 1 次提交, 只含第 2 项 `lib/document-terms/document-terms.mjs`; 第 1, 3 项在第 2 次提交, 见终态记录.)

```text
code: -12 lines (files: 1)
  lib/document-terms/document-terms.mjs -12
documents: 0 characters (files: 0)
tests: 0 lines (files: 0)
next ADR number: 0041
```

- `pnpm test`: 964 项全部通过, `pnpm typecheck` 通过; `tests/document-terms` 的断言未改动.

## Comments

- Spec Readiness: 第 1 项修改长期规格并改变 `workflow init` 的用户可见交接输出, 视为含设计决定, 写 effort `spec.md` 并走 Spec Readiness (4 轮, 最后 `No problems.`). 第 2, 3 项不含设计决定, 合并在同一 issue 中.
- 分两次提交: 无关的冗余代码删除 (第 2 项) 按根 `AGENTS.md` 效率原则第 7 条单独提交, 不抵扣第 1, 3 项的净增. 本次提交体积: 代码 -12 行 (预计第 2 项约 -5 行, 多删 7 行来自两处诊断字面量合并各 -6 行和并入既有构造函数 -1 行).
- 台账: lib/document-terms/document-terms.mjs:121 (`invalidTermEntry`) 冲突裁决 What to build 第 2 项写 "合并为一个局部构造函数", 与 Code Standards 要求与既有 `invalidGlobalTermEntry` 合并冲突: 按 effort spec 的目的 (只做不改变可观察结果的删减, 去掉重复构造) 保留并入模块顶层构造函数的做法, 诊断字段与顺序不变, 不改回局部构造函数.
- 台账: 第 1 项与第 3 项的验收标准 转入后续提交 本 issue 分两次提交, 这两项是计划中尚未完成的工作, 在第 2 次提交完成 (本次提交只含第 2 项).
