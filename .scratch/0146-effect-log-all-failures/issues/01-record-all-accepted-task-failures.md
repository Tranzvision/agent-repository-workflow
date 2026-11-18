# Effect Log: 受理任务的所有失败都写 agent-task

Status: completed

## What to build

设计见 effort 的 `spec.md`. 最终状态: 管理进程受理的任务 (`spawn_agent`, `followup_task`) 的每次失败都写且只写一条 `agent-task`, 包括从未进入 `working` 的 (`outcome: "failed"`); 成功率的分母是受理的任务.

1. 长期规格 `docs/specs/agent-repository-workflow/spec.md` 的 Effect Log: `agent-task` 行触发条件改为 "受理的任务每次失败写一条, 离开 `working` 的每次转换写一条", 失败含启动回合 (`startTurn`) 失败 (已有或尚无原生线程, 含原生事实不完整) 与准备阶段失败, 删去 "运行尚未取得原生线程就因启动失败置为 `ended` 时也写一条" 的例外写法; 从未进入 `working` 的失败 `outcome` 为 `failed`, `startedAt` 为 `null`, `finishedAt` 为失败时刻; "转为 `unknown` 时 `finishedAt` 为 `null`" 与 "转为 `unknown` 的是 `unknown`" 在 `agent-task` 行, `outcome` 一段和读取方事实一段共三处都限定为离开 `working` 的任务; 受理的任务没有启动成功就结束, 不论原因 (含运行在启动前被停止或卸载) 都是失败, 同样记 `failed`, `outcome` 一段写明它先于 `stopped` 等其余判定; 没有受理中的任务时的卸载与停止不记, `acceptTask` 拒绝的 `followup_task` 没有形成任务也不写; `outcome` 一段 "启动失败是 `failed`" 改为 "从未进入 `working` 的失败是 `failed`"; 读取方事实一段 "离开 `working` 的每条路径都写一条 ... 分母完整" 改为受理的任务每次失败和离开 `working` 都写, 成功率分母是受理的任务.
2. `lib/background-agent/manager.mjs`: `dispatchAccepted` 调 `dispatch` 前记下 `wasWorking`, 返回后任务消息 `deliveryStatus` 不是 `delivered`, `wasWorking` 为假时 `recordTask(entry,true)` (为真时只由状态转换记一条 `unknown`); `failAcceptedTask` 仅当任务消息仍是 `accepted` (准备阶段失败, 原生请求从未尝试) 时记, 已有原生线程时 `recordTask(entry,true)` (无线程时仍走 `failStart`), 消息已是 `failed` 或 `unknown` (`dispatchAccepted` 已记过, Reviewer 运行层随后因未送达调 `failAcceptedTask`) 时不再记; `recordTask` 的启动失败 `finishedAt` 取 `clock.now()`. `dispatch`, `startTurn`, `steer` 不改; 受理任务的调用方是管理进程的 `spawn_agent`, `followup_task` 路径与 `lib/reviewer-runtime/reviewer-runtime.mjs` 的 `finishAccepted`. 两条路径对同一任务不重复记录. `spawn_agent` 受理阶段失败 (`acceptStart`) 沿用现状.
3. 测试 (`tests/background-agent/manager.test.mjs`, 假原生会话, 不起真进程): 已有线程的 `followup_task` 启动失败写一条 `failed` 且 `startedAt` 为 `null`, 之后卸载不再多写; 准备阶段失败写且只写一条.

不做: 改 `outcome` 的其他取值, 改记录字段, 读取方统计.

预计净增: 代码约 +3 行, 测试约 +25 行, 文档约 +350 字符.

预期验证 (边界: 不改 `startTurn`/`steer`/接续的行为): `pnpm typecheck`, `pnpm test`, `arw text check`, `arw terms check --include .scratch/0146-effect-log-all-failures/`, `git diff --check`. 边界情况: 原状态为 `working` 时 `dispatch` 失败仍记 `unknown` 而不是 `failed`; 同一任务不因之后由 `unknown` 转 `ended` 再记.

## Acceptance criteria

- [x] 已有原生线程的 `followup_task` 启动回合失败时, 测试观察到恰好一条 `agent-task`, `outcome` 为 `failed`, `startedAt` 为 `null`, `finishedAt` 为数字; 之后 `unload_agent` 不增加记录.
- [x] Reviewer 运行层式调用 (`dispatchAccepted` 未送达后再调 `failAcceptedTask`) 只记一条 `failed`, 测试覆盖.
- [x] `failAcceptedTask` 路径 (准备阶段失败) 对无原生线程和已有原生线程的任务各记且只记一条 `failed`, 测试覆盖.
- [x] 原状态为 `working` 的任务启动失败 (含 `dispatch` 中途 `refreshSnapshot` 先把状态置为 `unknown`) 仍只记 `outcome: "unknown"` 一条, 测试覆盖.
- [x] 长期规格 Effect Log 按 What to build 第 1 项改写, 规则本身写 "受理的任务每次失败写一条", 不再把启动失败写成例外, 三处 `unknown` 限定都已加, 成功率分母写成受理的任务; 观察方式: 阅读该行与读取方事实一段, 对 `尚未取得原生线程就因启动失败置为` 做 grep 无命中.

## Blocked by

- None - can start immediately

## Validation

- 先红后绿: 还原 `manager.mjs` 后 `tests/background-agent/manager.test.mjs` 3 个用例失败, 恢复后通过.
- `pnpm typecheck`, `pnpm test` (1029 个通过), `arw text check`, `arw terms check`, `git diff --check` 通过.

提交审核 `prepare` 摘要块:

```
code: +3 lines (files: 1)
  lib/background-agent/manager.mjs +3
documents: +334 characters (files: 1)
  docs/specs/agent-repository-workflow/spec.md +334
tests: +27 lines (files: 1)
  tests/background-agent/manager.test.mjs +27
```

## Comments

- 来源任务: 总层 `ARW/taskfail-all`, 用户 2026-11-18 的口径 "本来就应该记录所有失败, 而不仅仅是开始运行后的失败". 分析见总层 `ARW/0136fix2` 报告.
- 已知边界 (不另立 issue): `refreshSnapshot` 在 `dispatch` 之外把未工作的任务置 `unknown` 时不记; 无受理中任务的卸载与停止不记.
- 体积: 代码预计约 +3 行, 实测见摘要, 未超. 文档预计约 +350 字符, 实测 334, 未超 (三处 `unknown` 限定各自所在权威段必须写, 已把读取方事实段对触发条件的复述改为引用), 测试预计约 +25 行, 实测见摘要.
- 台账: docs/specs/agent-repository-workflow/spec.md:583 记录不修 读取方事实一段保留 `unknown` 映射的一句, 因为它是读取方对 `unknown` 记录形状的陈述, 删去会让读取方只能回头拼接两处, 且 Spec Readiness 第 2 轮要求三处都限定; 重复在第 3 轮才作此处置.
- 台账: docs/specs/agent-repository-workflow/spec.md:568 记录不修 `agent-task` 行, `outcome` 一段与读取方事实一段各写一次 `unknown` 的限定, 因为三处各自是自己字段或取值的权威陈述, 只在一处限定会使另两处自相矛盾 (Spec Readiness 第 2 轮要求三处都限定); 触发条件只留在 `agent-task` 行.
- 已知未测: 受理任务在启动前被停止而启动失败的竞态由 `failAcceptedTask` 的 `neverTried` 判断覆盖, 测试里 `stop` 与阻塞的 `start` 会互相等待, 无法在不改生产代码的前提下构造, 故只由代码审查确认.
