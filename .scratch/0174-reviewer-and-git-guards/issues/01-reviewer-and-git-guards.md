# 修正 Reviewer 写路径检查, Git 参数与符号链接入口

Status: completed

## What to build

在 `lib/reviewer-capability/inspection.mjs` 中将 Claude 的 `Write` 与 `Edit` 识别为写入. 报告实例外不存在的写入路径, 并仅对读取豁免 Claude 自己的会话记录及其目录和系统目录.

在 `lib/application-jira/submodule-git-adapter.mjs` 中把 `fetch` 的远程仓库与分支参数, `fastForward` 的合并目标, 以及 `switchBranch` 的本地分支和远程跟踪起点放在 Git 选项终止符之后. 远程跟踪分支的新名称继续作为 `-c` 的值传递.

在 `lib/arw-background-agent-host.mjs` 中解析进程入口路径的符号链接再判断是否执行守护进程入口. 更新英文与中文变更日志.

预计净增约 10 行非测试代码. 预计改动总行数约 150 行, 其中代码 15 行, 测试 95 行, issue 与文档文本 40 行, 按新增与删除之和计, 生成的就绪与提交审核记录单列.

预期验证为逐项先运行失败的回归测试再修复, 运行完整 Source Checkout 验证和 Commit Audit, 然后提交. 测试通过 `inspect` 的报告, 子模块 Git Adapter 的 Git 进程边界和守护进程命令入口观察结果.

## Acceptance criteria

- [x] 检查结果报告 Claude `Write` 和 `Edit` 指向实例外不存在的文件, 报告对自身会话记录及其目录和系统目录的写入, 并仍允许读取这些目录.
- [x] 子模块拉取, 快进和分支切换将形似选项的远程仓库名, 分支名及起点作为数据交给 Git. 覆盖本地分支与远程跟踪分支两条切换路径.
- [x] 通过符号链接运行的守护进程入口与直接运行一样验证私有调用参数.
- [x] 各缺陷有先失败再通过的回归测试. 新增测试回调在 100 毫秒内, 或按本仓库既有例外在测试旁写明超时原因. 两种语言的变更日志均有记录.

## Blocked by

- None - can start immediately

## Validation

- 三个 Claude 路径用例, Git 参数用例和符号链接入口用例均先因预期差异失败, 再于修复后通过. 定向运行的单个测试回调最长 56.2 毫秒.
- `pnpm typecheck` 通过. `pnpm test` 共 1131 项通过, 其中包含真实 Git 子模块集成测试和 Codex 和 Claude Code 后台行为测试.
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check` 和六个变更的 ESM 文件的 `node --check` 均通过. 英文与中文变更分别记录在 `docs/CHANGELOG.md` 和 `docs/CHANGELOG.zh-CN.md`.
- `arw text check`, `arw terms check --include .scratch/0174-reviewer-and-git-guards/` 和 `git diff --check` 均通过.

```text
code: +3 lines (files: 3)
  lib/application-jira/submodule-git-adapter.mjs 0
  lib/arw-background-agent-host.mjs +1
  lib/reviewer-capability/inspection.mjs +2
documents: +427 characters (files: 2)
  docs/CHANGELOG.md +308
  docs/CHANGELOG.zh-CN.md +119
tests: +79 lines (files: 3)
  tests/application-jira/submodule-git-adapter.test.mjs +21
  tests/background-agent/host.test.mjs +13
  tests/reviewer-capability/inspection.test.mjs +45
next ADR number: 0041
```

## Comments

- 来源为 `issue:0172:01` 和 `issue:0173:01`. 本轮经 Main 确认无需治理设计或共用规范, 合并为单实施 issue 并记录就绪例外.
- 本轮 Main 授权上述行为修复, 写入范围为三个指定模块及其测试和英中变更日志. 写路径修复只影响能力结果检查, 本轮无需能力 A/B 或裁决 Reviewer.
- 本轮 Main 裁定允许更正审核发现的 issue 自相矛盾或与实现冲突的文字, 刷新例外记录后用原 Reviewer 线程作增量审核. 若线程无法恢复, 新线程对整个候选运行一轮双轴审核并记录.
- 本轮 Main 裁定若有验收项依赖提交, 先提交已审核实现, 再以非实施提交补记实际提交号并勾选. 未复现项记录于本节并结束处理.
- 实际改动行数为代码 23 行, 测试 79 行, issue 和文档 59 行, 另有生成的就绪记录 13 行. 代码净增 3 行, 低于预计 10 行.
- 提交审核首轮的 Code Standards 和要求符合 Reviewer 均正常结束, 两份报告均无问题. 已抽查实际 Git 子模块的快进回归和 Claude 会话目录的读写边界.
