# 核实 Reviewer 替换退役问题并补齐预检规格和常设确认

Status: completed

## What to build

本轮合并 Issue W 的三项已确认范围. 先以 mock 测试将 Reviewer 运行推进到 `ready`, 再用 `newThread: true` 替换同身份运行, 观察旧 runId 的 `onRetired` 恰好触发一次且 `interrupt_agent` 返回 `turn-mismatch`. 测试复现差异时, 将完整拆除步骤抽成局部函数, 供 `retireIfTerminal` 和 `held` 分支共用; 测试复现不出差异时, 保持生产实现并在记录中说明尝试.

将 `docs/specs/agent-repository-workflow/spec.md` 的 `Prepare and independent review` 节补为四项机械预检, 第四项描述以提交后的事实或其他审核结果为条件的验收项, 与 `lib/spec-readiness/precheck.mjs` 一致. 在 `AGENTS.md` 的 `Source Checkout Baseline 例外` 节记录用户 2026-11-02 的常设确认: 不含设计决定且不依赖共用 spec 的 issue 无需治理设计, Spec Readiness 记为 `not-applicable`. 本 issue 的例外理由引用该条.

预计净增预算: 非测试代码 +3 行, 测试 +25 行, 交付文档 +400 字符, issue 记录约 +2500 字符. 预期验证: mock 定向测试及现有 Reviewer 运行时测试, 新测试回调低于 100 毫秒, 完整 Source Checkout 验证和 Commit Audit, 然后提交. 边界情况包括已正常退役的旧运行, 不存在的 runId 和替换运行的新身份; 生产实现调整仅由复现结果触发.

## Acceptance criteria

- [x] mock 测试观察 `ready` 运行替换后旧 runId 退役回调一次和 `turn-mismatch`; 若复现差异则修复后通过, 若未复现则在 `## Comments` 记录尝试与生产实现保持的结果.
- [x] 规格写明四项机械预检, 第四项与 `precheck.mjs` 的验收项循环一致 (观察: 对照代码与规格).
- [x] `AGENTS.md` 包含常设确认的日期和内容, 本 issue 的 `exception.reason` 引用该条 (观察: 文本与例外记录).
- [x] 现有 Reviewer 运行时测试通过, 新增 mock 测试回调低于 100 毫秒, 公开 Interface 和持久状态保持原状 (观察: 测试结果与差异).

## Blocked by

- None - can start immediately

## Validation

- `pnpm typecheck` 通过; `pnpm test` 通过, 970 项, 0 失败, 总耗时 3283.302743 毫秒.
- `node --test --test-isolation=none --test-reporter=spec tests/reviewer-runtime/reviewer-runtime.test.mjs` 通过, 35 项, 0 失败. 临时复现测试及耗时见 Comments; 测试和生产文件最终均无差异, 无适用的 JavaScript 语法检查文件.
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check` 通过.
- `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0135-reviewer-retirement-prechecks/`, `git diff --check` 通过. issue 语言检查为中文 80.6%, 英文为精确字段, 命令和路径; 文档 UTF-8 无 BOM, LF 与路径标题已核对.
- 对照 `precheck.mjs` 验收循环确认第四项描述一致; 核对 `AGENTS.md` 新条及本 issue 的例外 JSON 引用, `node arw.mjs spec-readiness verify --issue issue:0135:01` 通过, 结果为 `not-applicable`.

```text
code: 0 lines (files: 0)
documents: +241 characters (files: 2)
  AGENTS.md +157
  docs/specs/agent-repository-workflow/spec.md +84
tests: 0 lines (files: 0)
next ADR number: 0041
```

## Comments

- 来源为授权读取的 effort 0131 和 `.tmp/triage.md` 的 Issue W. 本轮只实施 0135, 保留 0131 原状.
- Main 确认本轮两处文档改动内容, 依据 Source Checkout Baseline 例外及本轮用户明确授权. 三项均无新设计决定, 不依赖共用 spec 的设计决定, 单 issue effort 使用例外流程.
- 本轮 Main 预授权裁定: 可修改指定 Reviewer 运行时和测试, 规格指定章节与 AGENTS.md; 控制面拆除不涉及工具, 权限, 沙盒, 上下文或默认模型设置, 不运行能力 A/B 或 judge. 本条常设确认仅落盘已有确认, 不新增 Reviewer 检查项.
- 本轮 Main 预授权裁定: 审核发现 issue 自身矛盾时可改写并按正常命令刷新例外, 原 Reviewer 下一轮仅审措辞; 若验收依赖提交则先提交已审核实现, 再以非实施提交补记实际提交号; 线程无法恢复时新建线程对完整候选做两轴审核并记录; 第 1 项未复现时仅交付第 2, 3 项及记录.
- 第 1 项未复现, 记录不修: 在未改生产代码的版本新增临时 mock 测试, 依次执行 spawn, inspect, 写报告, finish, inspect 确认 ready, 清空报告, newThread 替换, 断言回调恰好一次及旧 runId 中断为 turn-mismatch, 未知 runId 为 run-not-found. `node --test --test-isolation=none --test-reporter=spec --test-name-pattern='replacing a ready run' tests/reviewer-runtime/reviewer-runtime.test.mjs` 通过, 回调 12.587322 毫秒. 代码核对确认 inspect 在返回 ready 前调用 retireIfTerminal, 因而旧运行已正常退役. 撤去临时测试, 保留原有退役测试覆盖; 生产代码和持久状态均未改动. 本轮交付第 2, 3 项及本记录.
- 台账: `lib/spec-readiness/precheck.mjs` 的验收项扫描范围 记录不修 既有实现从验收标题扫描到文件末尾; 本轮仅补录第四项警告, 未引入或影响该范围. 修复会改变 CLI 警告输出, 未获本轮例外授权, 按用户要求跳过并记入 `.tmp/triage.md`, 不新增本轮实施 issue.
- 审核处置: 首轮实际运行使用第 2 次 prepare 的候选. Code Standards 两条问题均由恢复验收, Validation 和 Comments 的正确章节边界解决; 验收清单只保留一份. 要求符合的一条扫描范围问题按上条来源分流. 第 1 次 prepare 仅用于补录体积摘要, 未运行 Reviewer.
- 台账: `docs/specs/agent-repository-workflow/spec.md` 的 Prepare and independent review 第四项中 "该节中" 记录不修 第 3 轮起按措辞类处置; 本轮补录既有预检警告的意图范围, 第三项原已使用相同范围表述, 未授权改变 CLI 扫描边界, 代码差异为零. 未把该既有边界缺口当成已修复.
- 第 3 次 prepare 的原线程复审完成, Code Standards 和要求符合报告均为 `No problems.`. Main 抽查 `retireIfTerminal` 与 inspect 的退役调用顺序, 以及预检循环与规格第四项, 保留既有 CLI 行为. 最终仅补充 Validation 和 Comments 记录, 完整验证结果有效复用.
- 体积核对: 预计代码 +3 行, 测试 +25 行, 交付文档 +400 字符, issue 记录 +2500 字符. 实际代码 0 行, 测试 0 行, 交付文档 +241 字符 (新增 3 行, 删除 1 行), issue 文本 +4111 字符 (新增 52 行), 超预算 1611 字符. 超出来自未复现证据, 用户要求的预授权裁定和审核处置记录; 已合并重复叙述, 保留可核查记录.
