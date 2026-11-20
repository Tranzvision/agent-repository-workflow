# 恢复报告正文定位并区分 Commit Audit 盲裁题号

Status: completed

## What to build

让计分器读取自由格式 finding 正文中的证据定位, 包括括号与方括号里的无反引号路径. 让 Commit Audit 的盲裁决定明确指出 Gate, 防止同一发现出现在两关时误把上一关的题号用于当前关卡. 改动覆盖现有的计分, 组池, 分池和裁决覆盖操作, 以及受影响的盲裁简报, 合成对照, 长期规范与英文说明. 非测试代码预算为净增 45 行.

## Acceptance criteria

- [x] 使用 `commit-audit` 夹具计分时, finding 正文中的 `(src/dispatch/queue.mjs:32)`, `[.scratch/0001-dispatch-control/spec.md:11]` 与 `[docs/dispatch/dispatch-policy.md:65-66, 68]` 生成相应单行和区间证据, 恢复 Gate 2 归属. 同一定位重复引用只记一次, 唯一同名且行号有效的裸文件名可补全, `12:30` 和 `https://example.test/file.mjs:8` 不计为裸定位. 裸定位提取保留 finding 正文与原报告.
- [x] 计分和盲池给 Gate 1 与 Gate 2 的问题用例分别提供 `problem-gate-1-N` 与 `problem-gate-2-N` 及其对应期望句. 分池拒绝给 Gate 2 提交的 Gate 1 决定, 接受当前 Gate 的合法决定. 合成对照和裁决覆盖接受当前格式. 其他场景沿用 `problem-N`.
- [x] 旧 `commit-audit` 候选文件中的无 Gate 题号在组池时被阻断, 并提示重新计分. 旧简报下的裁决由现有过期规则处理. 新简报让裁判按各池项的 `check` 与 `problemOptions` 逐项判断, 先核对当前 Gate 的期望句再选择题号或判为 `supported`.
- [x] `tests/reviewer-capability/format-penalty.test.mjs` 用当前计分器与同一批冻结报告复现登记的格式罚基线. 因本次修正而变动的定位计数, 派生统计与测试期望一并更新. 归档原件与来源保留, 无需重跑模型.
- [x] `docs/manuals/development.md` 和 `docs/CHANGELOG.md` 说明受影响行为与既有 `commit-audit` 裁决如何重做. 记录需同步的中文文档.

## Blocked by

- None - can start immediately

## Validation

- `tests/reviewer-capability/reviewer-capability.test.mjs` 的两条回归先在旧实现上失败, 后通过. 定向运行正文定位和分池回归分别耗时约 24 和 54 毫秒, 观察了证据去重, 裸文件名补全, Gate 2 归属, finding 与报告原文, 跨 Gate 拒绝且无裁决写入, 旧候选阻断, 正确选项分池, 覆盖和回读计分.
- 重读 4 份归档草稿恢复 Gate 2 发现共 69 条: `control-ca-1` 17 条, `control-ca-4` 19 条, `control-ca-10` 14 条, `f4c-ca-8` 19 条. 旧计分器对四份报告的 Gate 2 发现均为 0.
- `tests/reviewer-capability/format-penalty.test.mjs` 重算归档并复现登记的错误数和定位数. Code Standards 的归档 `haiku-5` 和 `haiku-6` 定位数分别从 21 和 26 增至 57 和 42, `sumT` 为 307, `sumR` 仍为 10, `pBase` 为 0.0325733. `node scripts/reviewer-capability.mjs baseline code-standards` 与 `node scripts/reviewer-capability.mjs baseline commit-audit` 各通过 10 个归档文件的核对.
- 核对英文开发手册和变更日志的定位提取, 基线与裁决重做说明. 中文开发手册 `docs/manuals/development.zh-CN.md` 待 Main 同步, 仓库内没有中文变更日志对应文件.
- `pnpm typecheck`, `pnpm test` (1054 项通过), `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check` 及所有变更的 ESM 文件 `node --check` 均通过.

- `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0164-reviewer-capability-scoring/`, `git diff --cached --check` 与 `git diff --check` 均通过.

~~~text
code: +21 lines (files: 4)
  lib/reviewer-capability/format-penalty.mjs 0
  lib/reviewer-capability/pool.mjs +5
  lib/reviewer-capability/reports.mjs +11
  lib/reviewer-capability/scoring.mjs +5
documents: +1736 characters (files: 3)
  docs/CHANGELOG.md +381
  docs/manuals/development.md +609
  docs/specs/agent-repository-workflow-development/spec.md +746
tests: +76 lines (files: 5)
  tests/fixtures/reviewer-capability/format-baseline/registry.json 0
  tests/fixtures/reviewer-capability/requirements-reviewer/commit-audit/anchors.json 0
  tests/fixtures/reviewer-capability/requirements-reviewer/commit-audit/brief.md +3
  tests/reviewer-capability/format-penalty.test.mjs 0
  tests/reviewer-capability/reviewer-capability.test.mjs +73
next ADR number: 0041
~~~

## Comments

- 维护者在本次任务中授权所需的规范和合同修正, 以及通过账号包装器使用 Spec Readiness 和 Commit Audit 的独立 Reviewer.
- 归档中的公共入口漏导出 executor 在 Gate 1 对应第 1 题, 在 Gate 2 对应第 7 题. 旧裁决对两个关卡都使用了 `problem-1`, 而 Gate 2 的第 1 题讲停车时间. 归档复查共识别 22 条类似错配及 18 条应当补关联的问题. 旧池的数字只在本关卡内有意义, 分池只核对字面决定是否在允许集合中.
- 预期验证包括 Spec Readiness, 在公开计分和分池操作上先失败再通过的定向用例, Source Checkout 全量验证及 Commit Audit. 只使用合成裁决验证计分流程. Reviewer 读取的角色指令和被审场景不受此改动影响, 无需运行能力对比.
- 初次 Spec Readiness 通过. 发现归档计数变化后增量审核指出基线重算的 ADR 判断与历史分数版本口径缺失. 补齐两点后复审为 `No problems.`, 新记录已提升且完整 `spec-readiness verify` 通过.
- Commit Audit 首轮要求符合审核指出英文开发手册的评分版本表述也允许混用提交. 改为用同一 ARW 提交重算各组. 核对 effort spec 和长期开发规格已采用同一提交口径, 变更日志仅说明裁决重做步骤.
- Commit Audit 增量复审正常结束, Code Standards 和要求符合审核均为 `No problems.`. 回归抽查复现了 Commit Audit 的 5 份基线归档计数, 其他场景的 `problem-N` 分池测试通过. 英文手册修订后再次运行 `pnpm test`, 1054 项通过.
