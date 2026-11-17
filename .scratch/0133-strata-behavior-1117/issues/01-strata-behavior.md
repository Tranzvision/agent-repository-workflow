# 修复 Strata 核实的低严重度行为缺陷 (先复现)

Status: wontfix

## What to build

低严重度行为缺陷合并成一个 effort, 每项先写失败测试复现, 复现不出的项在 `## Comments` 记录不修 (不改代码). 每项的修法单一, 无设计决定, 不写 spec (记 Spec Readiness `not-applicable`); 行号以实施时 main 为准.

- `arch-common`: artifacts.mjs firstHeading (69-87) and issue-documents.mjs findFirstHeading… 修法: firstHeading 改用 markdown-fences.nextFence; 复现: H1 前有缩进  或 ~~~ 块内含 , 标题误判 (估 -15行)
- `arch-common`: git-ignore.mjs:20-21 replaces the diagnostic its own seam produces -- runCheckI… 修法: git-ignore.mjs:21 catch 保留原错误信息/code; 复现: check-ignore 超时, 报错丢失 ETIMEDOUT (估 +3行)
- `arch-gates`: Strong — lib/spec-readiness/precheck.mjs:34-35 re-implements the Acceptance-cr… 修法: precheck.mjs:34 改用 readIssueSubject 的未围栏章节; 复现: 围栏内写 ## Acceptance criteria 被当真章节 (估 ~5行)
- `arch-gates`: Worth exploring — commit-audit.mjs:235 builds ruleFiles from every staged i… 修法: ruleFiles 按 .arwignore/agent-managed 范围过滤; 复现: fixture 下的 src/AGENTS.md 被复制进 rules/ 与 SHA256SUMS (估 +3行)
- `arch-jira`: finding 1 — divergent H1 grammar. readJiraKey at application-completion.mjs… 修法: readJiraKey 用共享 firstHeading/围栏感知; 复现: 围栏内 # 行早于真标题 (估 -10行)
- `arch-jira`: finding 7 — one empty string, three states. observeBranchAndHead at submodu… 修法: observeBranchAndHead 区分 detached/失败/无提交; 复现: 未初始化 Module 报 Git preflight failed (估 +10行)
- (Strata 报告 `lib-reviewer-runtime-1`, 未经 Strata 核实, Main 抽查属实) `reviewer-runtime.mjs` `reconcileExited` (约 280-289) 比 `observe` 的退出分支 (约 353-357) 少调 `finishTask`, 两处退出规则已不一致: 暂停任务经 warm `inspect` 或 `confirmedUnload` 调和后 `providerWork.paused` 留在 manager 行里. 修法: `reconcileExited` 调用 `finishTask`, 先写复现测试 (暂停任务的 Reviewer 经 `reconcileExited` 退出后 `paused` 应被清除). 0131 已被 0135 取代, 0135 未改 `reviewer-runtime.mjs`, 无需等待.

预计净增: 代码约 +20 行, 测试约 +100 行.

## Acceptance criteria

- [ ] 每项都有在修复前失败, 修复后通过的测试, 或在 `## Comments` 记录复现尝试与不修的结论.
- [ ] 公开 Interface 和持久状态没有改动 (artifacts 与 issue 文档解析对合法输入的结果不变); 测试回调不超过 100 毫秒, 不起真进程; `pnpm test` 与 `pnpm typecheck` 通过.

## Blocked by

- None - can start immediately

## Comments

- 来源: `~/projects/.tasks/ARW/daily-report-1117.md`; 逐条结论 `.tasks/ARW/strata-review/triage/2026-11-17.jsonl`.
- 暂不含两项中严重度行为 (Code Map 身份三处规则不一, 两个 `compareText` 排序不同): 要先定哪套规则为准, 是设计决定, 见报告.
- Spec Readiness 记 `not-applicable` (逐项修成与已有规格一致的行为, 不新增规则).
- 2026-11-18: 原 Blocked by 0131 (同改 `reviewer-runtime.mjs`) 已取消: 0131 被 0135 (`182c925`) 取代, 0135 的第 1 项未复现, 未改该文件.
- 2026-11-18: 已被 effort 0140 (issue:0140:01) 取代, 取消单独实施: 其全部内容并入 0140. wontfix 只表示取消单独实施, 不表示放弃原发现.
