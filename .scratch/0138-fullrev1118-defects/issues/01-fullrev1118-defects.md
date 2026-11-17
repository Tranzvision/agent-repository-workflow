# 修复 1118 全量重审确认的 13 项正确性缺陷 (先写失败测试)

Status: completed

## What to build

修复 `ARW/fullrev1118` (固定提交 `ee689d0`) 确认的高, 中严重度正确性缺陷, 每项先写修复前失败的测试, 再修. 都不含设计决定, 不写 spec (Spec Readiness 记 `not-applicable`); 行号以实施时 main 为准, 先 grep 核对, 某项已不存在或不能复现则在 `## Comments` 记录跳过. 复现脚本在总层 `/tmp/ARW/fullrev1118/` (可能已清理), 详细依据见总层 `.tasks/common/review/full-1118-ARW.md` 与同目录批次报告摘要.

- 高 `lib/background-agent/daemon.mjs:36`: 控制连接 socket 没有 `error` 监听, 客户端发完 hello 后 RST 关闭, daemon 抛未捕获 `read ECONNRESET`, 整个 manager 崩溃. 修法: 连接回调首行加 `socket.on('error', () => {})`.
- 高 `lib/arw-common/issue-documents.mjs` `insertAfterHeading` (约 1000-1010) 与 `migrateImplementationText` (约 1034-1043): 合法的 canonical Application Source Issue (`Application source issue:` 紧跟 Status) 经 `migrateIssueDocuments` 后 Status 与关联字段之间被插入空行, 再读取报 "must immediately follow Status". 修法: 已有 canonical 的 Status 与紧随的关联字段不移除重插; 补迁移幂等测试.
- 高 `lib/repository-workflow/workflow.mjs:446-460` `removeManagedRegion` (不能复现, 不修): 原报告称 baseline-major 文档区外有用户文本时 remove 会整份删除. 实施时用区外带用户文本的 baseline-major `AGENTS.md` 试了 `remove`, `update`, `verify` 三个操作, 结果都是 `verifyManagedTargets` (`workflow-lock.mjs` 约 407-416, 要求只有 managed span, 紧随的换行和 repo-owned 区) 在到达 `removeManagedRegion` 前以 `invalid-managed-region` 阻断, 文件未被删除, 所以报告的后果不会出现; 按"无法复现不改代码"规则不改代码, 不加测试.
- 中 `lib/spec-readiness/precheck.mjs:34`: 验收项范围取到文件末尾, `## Comments` 中的 `- [x]` 被误报, 后续章节的反引号使最后一项漏报. 修法: 截到下一个 `^## `.
- 中 `lib/background-agent/strata-work-policy.mjs:113-127`: stop 成功后清空 `stopping`, 之后每次 `refresh()`/`canContinue()` 又调一次 stop (实测 4 次). 修法: 成功后保留已停止标记; 先确认 manager 的 stop 是否幂等以评估影响.
- 中 `lib/arw-common/issue-documents.mjs` (C1-2, C1-3): strict 读取把 `- None garbage`, `- None-of-it` 当作无阻断 (spec 要求准确写 `- None - can start immediately`); 三份同号 issue 时第一份的重复诊断报两次.
- 中 `lib/arw-common/artifacts.mjs:69-87` `firstHeading`: 手写围栏切换不区分字符, 长度, 缩进, 标题取错 (`~~~\n```\n# Inside\n```\n~~~\n# Real` 返回 Inside). 与 1111 的 B1 (`issue-documents.mjs` `isFence`) 同类; 一并改用 `lib/common/markdown-fences.mjs` 的 `nextFence`, 若 B1 已由别处修复则只改此处, 并加嵌套围栏测试.
- 中 `lib/application-jira/application-jira-cli.mjs:94,147,309`: HEAD 中的 spec.md/issue 用默认 `TextDecoder` 解码 (去 BOM), 工作区经 `readText` 保留 BOM, 带 BOM 且未改动的 spec.md 被 `module check-correction` 误判为 soft-lock 变化. 修法: 三处统一 `ignoreBOM: true` (抽成一个 helper).
- 中 `application-jira-cli.mjs:448-455` 与 `application-association.mjs:74-75`: `context.modules[command.moduleName]` 对 `constructor` 等原型属性名命中, 之后抛未捕获 TypeError (`arw application associate issue:constructor:0001:01 ...`). 修法: `Object.hasOwn(context.modules, name)`.
- 中 `lib/repository-workflow/workflow.mjs:1696-1706` `collectInteractiveConditionalChoices`: 对现有 agent 文档回答 no 时整体提前返回, 丢弃之前答 yes 的文件, 不再询问后面的候选, 跳过 orphan Code Map README 提问 (init 成功后 `verify` 报 orphan-code-map-readme). 修法: no 只不加入该文件, `continue`; 删无人读取的 `rejected`.
- 中 `lib/document-terms/document-terms-repository.mjs:156-184`: 工作树 `readEntries` 对全部路径 `Promise.all` 无并发上限, 文件数超过句柄上限时 EMFILE 被吞成 `unreadable` (6000 文件, `ulimit -n 1024` 实测 4997 个误判). 修法: 小并发池或顺序读.
- 中 `lib/application-jira/application-sync.mjs:74-77` (S5-1): `application-module-blocked` 检查在关联 Module issue 有任一非终态阻断项时让整次 sync 返回 `blocked`, 与 spec :461, :463 (非终态推进与回退照常镜像) 冲突, 同一 Module effort 内 01 -> 02 -> 03 依次阻断时 sync 基本不可用. 依据 `.tasks/common/review/fullrev-intent-1118.md` S5-1 (用户可见行为: sync 不再因此被拦; 该检查守护的 "前置未完成不推进" 已由 `implement` Skill Entry 覆盖). 修法: 删除代码中的检查和不再使用的 `isIssueBlocked` 导入 (导出保留); 把 `tests/application-jira/application-sync.test.mjs` 的 `blockedModule` 用例改成 "阻断项未终结时仍照常镜像"; 删去 `application-jira/spec.md` :471 中 "关联 Module issue 仍有非终态本地阻断项 (`application-module-blocked`)," 一句, 以及 `application-workflow/references/synchronization.md` 中 ", 以及任何 Module 阻断项" (源头 `.agents/skills/`, 经 `node scripts/project-claude-skills.mjs` 与分发同步更新 `.claude/` 和 `distribution/` 共 3 份副本).

## Acceptance criteria

- [x] 除高 3 (不能复现, 不修, 见 What to build) 外, 每项都有修复前失败, 修复后通过的测试, 测试回调不起真进程, 单个不超过 100 毫秒; B1 同类项的嵌套围栏用例覆盖 `artifacts.mjs`.
- [x] S5-1: 阻断项未终结的 Module issue 同步照常镜像 (修复前 `blocked`, 修复后 `succeeded` 的测试); `application-module-blocked`, `isIssueBlocked` 导入, spec 与 3 份 `synchronization.md` 中的对应句全部删除, `git grep application-module-blocked -- . ':!.scratch'` 无结果 (本 issue 自身的文字不计).
- [x] 合法输入的既有输出不变, 公开 Interface 和持久状态不改; `pnpm test` 与 `pnpm typecheck` 通过.

## Blocked by

- None - can start immediately

## Validation

- `pnpm typecheck` 通过; `pnpm test` 全部通过.
- `git grep application-module-blocked -- . ':!.scratch'` 无结果 (退出码 1).
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0138-fullrev1118-defects/`, `git diff --check` 均通过.
- 实测净增:

```
code: +21 lines (files: 10)
documents: -104 characters (files: 4)
tests: +187 lines (files: 10)
```

documents 的 -104 是净增: 三份 `synchronization.md` 各删去 17 个字符的 ", 以及任何 Module 阻断项" 并在 "不安全的列表结构" 前补 "以及" (各净 -15), `spec.md` 删去 59 个字符 (净 -59), 合计 -104.

## Comments

- 来源任务: 总层 `ARW/fullrev1118`. 未入本 issue (拿不准或需设计意图): `reviewer-group.mjs` cwd 外 write 规则不报 violation (B1-1), `codex-app-server.mjs` 加载线程单趟遍历 (A1-1), `application-sync.mjs` `application-module-blocked` 范围 (S5-1 已并入本 issue), 控制端口范围 (S3-2) 与 `migratedRuleDocuments` 提示 (S2-2) 归 0139.
- Spec Readiness 记 `not-applicable`: 依据 `AGENTS.md` Source Checkout Baseline 例外中用户常设确认 (2026-11-02), 不含设计决定且不依赖共用 spec.

- 实施记录: 高 3 (`removeManagedRegion`) 无法复现: remove, update, verify 都经 `verifyManagedTargets` 以 `invalid-managed-region` 阻断区外有用户文本的 baseline-major 文档, 按"无法复现不改代码"未改, 也未加测试. C1-2 只收紧 strict 路径 (`- None garbage`, `- None-of-it` 报错), 宽松形式保持原样以免改变合法输入的既有输出. 其余各项均先写失败测试再修.

预计净增: 非测试代码约 +35 行, 测试约 +250 行; 实际代码 +21 行 (低于预计 14 行), 测试 +187 行 (低于预计 63 行).
- 台账: tests/application-jira/cli.test.mjs BOM 测试只覆盖 `application-jira-cli.mjs` 的 spec 路径 记录不修 三处共用 `decodeGitText` 一个 helper, 只有这一处行为 (`ignoreBOM: true`), 已由 check-correction 路径的失败测试证明; 另两处需要为 committed issue 构造带 BOM 的 Git 快照, 为同一 helper 再加两份 fixture 重复覆盖.
- 台账: `lib/arw-common/issue-documents.mjs:457` 与 `:547-552` 两套 `None` 文法 记录不修 `:457` 的宽松正则被迁移与宽松读取路径使用, 把它换成严格正则会让迁移路径 (`:855`) 对 `None garbage` 一类宽松形式由接受改为抛错, 即改变既有迁移输出 (全部测试在替换后仍通过, 说明该行为没有测试固定, 但本 issue 范围限定为 strict 读取); 严格检查只放在 strict 读取路径, 这是 C1-2 的有意收窄.
- 台账: `lib/document-terms/document-terms-repository.mjs:186-191` 分批循环与 `workflow-distribution.mjs` 重复 记录不修 分发那一处在每批之后立刻处理结果并可提前返回, 与"全部读完再汇总"形状不同, 合并要改动分发代码的早退行为; 两处共 5 行, 不抽公共模块.
- 台账: `lib/application-jira/application-association.mjs:74` 的 `Object.hasOwn` 与对应用例 冲突裁决 第 1 轮 requirements-reviewer 按本 issue 点名 `application-association.mjs:74-75` 要求加该守卫, 第 2 轮 code-standards-reviewer 要求撤销; issue 的修法明确列出两处, 保留守卫与用例.
- 台账: `## Validation` 的 documents -104 记录不修 数字取自 `commit-audit prepare` 的实测摘要, Reviewer 把三份 `synchronization.md` 的净增按 -17 计, 漏计同一句中补入的 "以及", 实际净 -15 (见 Validation 的说明).
