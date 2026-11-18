# Effect Log 记录受理任务的所有失败

## Problem Statement

长期规格 `docs/specs/agent-repository-workflow/spec.md` 的 Effect Log `agent-task` 行只在任务状态离开 `working` 时写记录, 另把 "尚无原生线程的启动失败" 写成例外. 已有原生线程但回合启动失败 (`startTurn` 失败, 含 `followup_task`), 以及 `spawn_agent` 阶段原生事实不完整的任务从未进入 `working`, 不写记录, 这类失败在成功率里看不到, 成功率的分母因此只含进入过 `working` 的任务. 用户 2026-11-18 的口径: "这不应该叫例外, 本来就应该记录所有失败, 而不仅仅是开始运行后的失败".

## Solution

`agent-task` 的规则本身改为: 管理进程受理的任务 (`spawn_agent` 与 `followup_task`) 的每次失败都写一条记录, 包括从未进入 `working` 的; 离开 `working` 的每次转换仍写一条; 每个任务只一条. 从未进入 `working` 就失败的任务记 `outcome: "failed"` (`startedAt` 为 `null`), 成功率的分母是受理的任务.

## Implementation Decisions

- 任务的范围: 经 `spawn_agent` 或 `followup_task` 受理的任务, 只此两类 (原生会话 Seam 的 `startTurn` 与 `steer`, 以及 Reviewer 运行层的接续不是受理任务, 它们的行为不变). `acceptTask` 拒绝的 `followup_task` 请求没有形成任务, 不写; `spawn_agent` 在受理阶段失败 (`acceptStart`) 沿用现状, 按启动失败写 `failed`.
- 失败的含义: 受理的任务从未进入 `working` 而失败, 即启动回合 (`startTurn`) 失败 (已有或尚无原生线程, 含原生事实不完整), 准备阶段失败 (`failAcceptedTask`), 或尚无原生线程的启动失败. 这类记录 `outcome` 是 `failed`, `startedAt` 为 `null`, `finishedAt` 为失败时刻 (整秒). 规格中 "转为 `unknown` 时 `finishedAt` 为 `null`" 与 "转为 `unknown` 的是 `unknown`" (`agent-task` 行, `outcome` 一段, 读取方事实一段各一处) 只适用于离开 `working` 的任务, 改写时三处都加此限定. 受理的任务没有启动成功就结束, 不论原因 (包括因运行在启动前被停止或卸载而启动不成) 都是失败, 同样记 `failed`, 先于 `stopped` 等其余 `outcome` 判定 (`outcome` 一段写明 "从未进入 `working` 的失败一律是 `failed`, 不再看其他条件"); 没有受理中的任务时的卸载与停止不涉及任何任务, 仍不记录 (与现有 "此前已不是 `working` 的任务在卸载或停止时置为 `ended` 不再记录" 一致).
- 规格总括规则: "受理的任务的每次失败都写一条, 离开 `working` 的每次转换也写一条, 各任务只一条", 删去 "运行尚未取得原生线程就因启动失败置为 `ended` 时也写一条" 的例外写法; 成功率的分母是受理的任务.
- 代码 (`lib/background-agent/manager.mjs`): 两条路径各记一次, 互不重叠. 受理任务的调用方只有两处, 都经 `acceptTask`/`acceptStart` 受理: 管理进程自己的 `spawn_agent`, `followup_task` 路径 (`manager.mjs` 约 1165, 1236 行), 以及 Reviewer 运行层对 Reviewer 角色的同一类任务 (`lib/reviewer-runtime/reviewer-runtime.mjs` 的 `finishAccepted`, 它调 `dispatchAccepted`, 失败时调 `failAcceptedTask`); 两者都不是 `startTurn`/`steer` 的调用方. (1) `dispatchAccepted` 在调 `dispatch` 前记下 `wasWorking`; `dispatch` 返回后任务消息的 `deliveryStatus` 不是 `delivered`, 且 `wasWorking` 为假时调 `recordTask(entry,true)`; `wasWorking` 为真时仍由状态转换记 `unknown`, 不记第二条 (`dispatch` 中途 `refreshSnapshot` 置 `unknown` 同样). `dispatch` 本身不改. (2) `failAcceptedTask` 仅当任务消息此刻仍是 `accepted` (准备阶段失败, 原生请求从未尝试) 时记: 无原生线程走 `failStart`, 已有线程调 `recordTask(entry,true)`; 消息已是 `failed` 或 `unknown` (`dispatchAccepted` 已按 (1) 记过, Reviewer 运行层随后因未送达而调 `failAcceptedTask`) 时不再记. 由此同一任务只经一条路径记录; 任务之后由 `unknown` 转 `ended` 不再记 (`update` 只在离开 `working` 时记). `recordTask` 的启动失败分支 `finishedAt` 取 `clock.now()`, 不取上一个任务遗留的 `taskFinishedAtMs`.

## Testing Decisions

`tests/background-agent/manager.test.mjs`, 用现有假原生会话 (不起真进程): 已有线程的 `followup_task` 启动失败写一条 `failed`, `startedAt` 为 `null`, 之后卸载不再多写; 准备阶段失败写且只写一条; 同一运行上的前一任务正常结束后的记录不受影响.

## Out of Scope

不改 `outcome` 的其他取值, 不改记录字段, 不为 `agent-continuation` 或读取方做任何改动.

## Module Design

Not required: 只改后台管理 Module 内何时写已有的 `agent-task` 记录, Module 责任, Interface (记录字段与取值含义不变), Seam, 依赖方向和权威来源不变.

## ADR Evaluation

无需 ADR: 不改变权威来源, 持久状态或恢复合同; Effect Log 记录只是追加.
