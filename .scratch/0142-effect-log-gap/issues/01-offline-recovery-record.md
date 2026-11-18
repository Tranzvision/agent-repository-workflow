# Effect Log: 安装与卸载的离线恢复补写 agent-task

Status: completed

## What to build

Effect Log 合同 (`docs/specs/agent-repository-workflow/spec.md` 的 `## Effect Log`) 规定任务状态每次由 `working` 转为 `unknown` 或 `ended` 写一条 `agent-task`, 但安装与卸载在没有管理进程时的离线维护恢复 (`lib/background-agent/client.mjs` 的 `acquireBackgroundAgentMaintenance`, 对每个保存的任务调用 `recoverEndedBackgroundAgent`) 把保存为 `working` 的任务改为 `unknown` 而不写记录; 之后管理进程重启时该任务已不是 `working`, 也不再记, 这条转换永久丢失. 0136 实施报告 (已知缺口一) 记录了此缺口, 本 issue 用测试复现后补上.

- `acquireBackgroundAgentMaintenance` 增加可选参数 `recordEffect(kind, fields, cwd)`, 离线恢复时对每个 `taskState` 为 `working` 且恢复后不再是 `working` 的任务 (阈值暂停的任务恢复后仍是 `working`, 不写) 调用一次 `recordEffect('agent-task', ...)`: 字段与管理进程重启恢复的记录一致 (`runId`, `role`, `provider`, `model`, `effort`, `startedAt` 取 `taskStartedAtMs` 的整秒或 `null`, `finishedAt: null`, `outcome: 'unknown'`), `cwd` 取任务的工作目录.
- `lib/installation/installation.mjs` 与 `uninstallation.mjs` 调用它时传入以安装目录为 `programDirectory` 的 `record`.
- 长期规格 Effect Log 的 `agent-task` 行和读取方事实一段补上离线维护恢复.

不属于缺口, 不改: 管理进程 `not-started` 到 `unknown` 的路径 (任务从未进入 `working`, 合同只覆盖离开 `working` 和无原生线程的启动失败); `failStart` 的同 runId 重复记录 (实际调用路径下无法复现).

不含设计决定 (Spec Readiness 记 `not-applicable`): 补上合同已规定的 "离开 `working` 的每条路径都写一条".

预计净增: 代码约 +14 行, 测试约 +40 行, 文档约 +120 字符.

## Acceptance criteria

- [x] 对没有管理进程的运行目录, `acquireBackgroundAgentMaintenance` 把保存为 `working` 的任务恢复为 `unknown` 时调用 `recordEffect` 恰好一次, 字段如上; 已 `ended` 的任务和阈值暂停仍为 `working` 的任务不调用.
- [x] 安装把写入器传给维护, 记录写入以已安装配置指定的日志目录 (测试: 日志含 `agent-task` 再含 `install`).
- [x] 长期规格 Effect Log 的 `agent-task` 行与读取方事实与新行为一致.

## Blocked by

- None - can start immediately

## Validation

- 先红后绿: `tests/background-agent/client.test.mjs` 的离线维护测试在修改前 `recordEffect` 未被调用 (记录为空); 安装接线测试 `tests/installation/installation.test.mjs` 断言日志依次为 `agent-task`, `install`; 卸载的真实 CLI 入口测试补拷 `effect-log.mjs` 与 `git-process.mjs` 两个依赖.
- `pnpm typecheck`, `pnpm test` (1015 个通过), `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0142-effect-log-gap/`, `git diff --check` 全部通过.

实测净增:

```
code: +29 lines (files: 6)
documents: +428 characters (files: 2)
tests: +51 lines (files: 4)
```

## Comments

- 来源任务: 总层 `ARW/0136gap`.
- 体积: 预计代码约 +14 行, 文档约 +120 字符; 实测代码 +29 行, 文档 +428 字符, 超出 15 行与约 310 字符: 第 1 轮审核采纳了三项 (安装进程中记录后须重读配置 `forgetConfiguration`, 记录在 `flush` 之后, 两个调用点共用 `recorderFor` 和 `agentTaskFields`), 卸载程序补入规格三处依赖说明; 提交审核判断能否删减.
- 台账: lib/background-agent/client.mjs:391-396 冲突裁决 Code Standards 建议记录放回 flush 之前, 与要求符合审核第 1 轮 (记录不得推迟状态持久化) 冲突, 按 effort 规格 "以免记录写入延迟状态转换" 保留 flush 之后记录.
- 台账: lib/background-agent/client.mjs:396 记录不修 保存的任务行来自 `isBackgroundAgentSettings` 已要求 `modelProvider` 为非空文本的启动设置, 离线路径读到缺失值不可达, 属理论分叉, 第 3 轮起不为此改.
