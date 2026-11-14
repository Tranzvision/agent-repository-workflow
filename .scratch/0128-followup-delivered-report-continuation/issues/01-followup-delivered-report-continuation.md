# 对已交付的审核发 followup_task 或 newThread 时, 不再因报告被清空而续做旧任务

Status: completed

## What to build

背景: `followup_task` 和带 `newThread: true` 的 `spawn_agent` 都要求绑定的报告是空文件 (`checkReportBinding` 的 fresh 分支). 调用方读完 `<id>:done` 后清空同一报告再发 follow-up 时, 这两个操作在准入检查里先调用 `refresh(held)`, 它进入 `observe` 的 Reviewer task continuation 分支: 旧回合已正常结束, 报告为空, 判为 "未交付", 于是 `continueTask` 向原线程发 "The bound report is empty ..." 的续做指示并启动新回合. 结果是 `followup_task` 以 `reviewer-busy` 失败 (`lib/reviewer-runtime/reviewer-runtime.mjs` 的 `record.state === 'running'` 检查), reviewer 按催促重写报告, 之后的 follow-up 因报告非空报 `report-binding-invalid`. 即 follow-up 的前置条件 (报告为空) 与运行层对空报告的续做互相冲突. 证据: `ARW/fubusy` 任务文件及其引用的 `splitrev` 缺陷记录 (本机, 不在仓库内).

按 effort spec (`.scratch/0128-followup-delivered-report-continuation/spec.md`) 的 Implementation Decisions 实现, 并把同一规则写入长期规格 `docs/specs/agent-repository-workflow/spec.md` 的 Reviewer task continuation 节第一段末尾.

最终状态: 新任务 (`followup_task`, 或 `spawn_agent` 的 `newThread: true` 且身份已有受管运行) 的准入检查不续做旧任务: 旧任务由新任务取代, 不会因旧报告为空而被程序催促. 做法: `refresh` 和 `observe` 增加可选 `allowContinuation` (默认 `true`), 这两处准入检查传 `false`, 只跳过 `continueTask` 分支, 其余观察 (状态, 清理, 完成判定) 不变; 之后若原线程真的在执行, 仍以 `reviewer-busy` 拒绝. 不改变 `inspect`, 原生通知和其他路径的续做行为, 不改持久格式和公开 Interface. 长期规格该节第一段末尾加一句 (文字见 effort spec), 说明新任务取代旧任务, 准入检查不续做旧任务.

预计净增: 代码 +6 行 (非测试); 测试约 +35 行; 文档约 +230 字符.

预期验证: 新增 mock 测试 (`tests/reviewer-runtime/reviewer-runtime.test.mjs`), 用带 `continueTask` 的假原生会话: 已交付 (`ready`) 的审核清空报告后发 `followup_task`, 以及已结束而未经 `inspect` 的审核清空报告后发 `newThread` 的 `spawn_agent`, 都被受理且 `continueTask` 调用 0 次; 修复前这两处分别以 `reviewer-busy` 失败. `pnpm typecheck`, `pnpm test`, `arw text check`, `arw terms check --include .scratch/0128-followup-delivered-report-continuation/`, `git diff --check`.

## Acceptance criteria

- [x] 已交付的审核清空报告后, `followup_task` 被受理, 运行层没有对旧任务调用 `continueTask`, 新回合启动.
- [x] 已结束审核的报告被清空后, 带 `newThread: true` 的 `spawn_agent` 被受理, 没有对旧任务调用 `continueTask`.
- [x] 长期规格 Reviewer task continuation 节第一段末尾写明新任务取代旧任务, 准入检查不续做旧任务 (观察: `git diff` 该段含 `newThread` 与 `reviewer-busy`).
- [x] 未交付的审核 (报告为空且没有发 follow-up) 经 `inspect` 仍按原行为续做同一任务 (既有测试 `a recoverable bound report read fault receives concrete feedback and resumes the same review` 继续通过).

## Blocked by

- None - can start immediately

## Validation

```text
code: +1 lines (files: 1)
  lib/reviewer-runtime/reviewer-runtime.mjs +1
documents: +245 characters (files: 1)
  docs/specs/agent-repository-workflow/spec.md +245
tests: +30 lines (files: 1)
  tests/reviewer-runtime/reviewer-runtime.test.mjs +30
next ADR number: 0041
```

- 根因: `lib/reviewer-runtime/reviewer-runtime.mjs` 的 `followup` 在准入检查里 `refresh(held)` (约 840 行) 进入 `observe` 的续做分支 (约 411 行起): 旧回合正常结束, 报告被调用方清空, `delivered` 为假且 `report.status === 'succeeded'`, 于是 `continueTask` 发出 "The bound report is empty" 并开新回合 (约 444 行), `record.state` 变 `running`, 随后 `reviewer-busy` (约 847 行). `spawn` 的 `newThread` 分支 (约 753 行) 有同样的 `refresh(held)`.
- 复现 (修复前, 只加测试): 新测试 `a follow-up or new thread over a delivered review is not pre-empted by a continuation for its emptied report` 在 `followup_task` 处以 `reviewer-busy` 失败; 只还原 `spawn` 处的修复时在 `newThread` 处以 `reviewer-busy` 失败.
- 修复后: `node --test tests/reviewer-runtime/reviewer-runtime.test.mjs` 35 项通过, 新案例 4 毫秒. 在 `HOME`, `TMPDIR` 为 `/tmp/ARW/fubusy/` 下的目录时 `pnpm typecheck` 通过, 完整 `pnpm test` 967 项全部通过 (6.5 秒). `arw text check`, `arw terms check --include .scratch/0128-followup-delivered-report-continuation/` 通过.
- `git diff` 长期规格 `docs/specs/agent-repository-workflow/spec.md` Reviewer task continuation 节第一段末尾新增一句, 含 `newThread` 与 `reviewer-busy`.
- 自查 (只删减与合并): 只加一个布尔参数, 没有可再删的内容.

## Comments

- Spec Readiness: 共 4 轮 (haiku), 第 4 轮 `No problems.`, 记录 `satisfied`. 提交审核的要求符合审核指出规范原文没有写明 "新任务取代旧任务", 属于设计层面的规范补充, 因此改为写 effort spec 并走 Spec Readiness (原先记的 `not-applicable` 已废止).
- 体积: 代码预计 +6 行, 实际 +1 行 (只加一个参数, 三处传参行内改动; 预计偏大); 文档预计约 +230 字符, 实际 +245 字符 (不含 effort spec; 超出 15 字符来自 "被取代的旧回合不计提前结束" 子句, 要求符合审核指出长期规格 `spec.md:452` 的提前结束计数与新规则不一致, 该子句是消除这一冲突的最短文字, 不能再删, 冲突裁决采用要求符合审核); 测试预计约 +35 行, 实际 +30 行 (抽出一个共用的续做辅助函数).
- 邻近路径: 已 `ready` 且已持久化的运行随即退役 (`retireIfTerminal`; 临时探针确认 `ready` 后 `holdsRun` 为假), 之后 `inspect` 走冷路径, 不续做, 所以只有 follow-up 与 `newThread` 的准入检查会在清空报告后遇到续做; 它们已修复. 尚未退役 (事实不全等) 的运行清空报告后经 `inspect` 或原生通知仍会续做, 属于 "未交付任务继续催促" 的既有设计, 本 issue 不改.
