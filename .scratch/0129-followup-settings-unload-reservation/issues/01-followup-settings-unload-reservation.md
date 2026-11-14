# 对已交付的审核发 followup_task 时, 其他调用方的占用不再使卸载重启失败

Status: completed

## What to build

背景: Reviewer 运行层每次 `followup_task` 都用 `reviewerNativeSettings` 生成新设置, 其中权限配置名带随机 UUID (`permissions.arw-reviewer-<uuid>`), 所以新设置与原设置永远不相等, `lib/background-agent/manager.mjs` 的 `prepareTask` 总要先卸载原生根线程再用新设置恢复, 卸载经 `unloadSafely(entry, true)`. `unloadSafely` 在安全空闲核验 (`safeIdle` 的若干次 await) 前记下 `entry.work`, `unload` 再核对它未变. 但 Reviewer 运行层的每个 `serialize` (调用方的 `inspect`/`wait_agent` 轮询, 原生通知触发的刷新) 都经 `holdManagedWork` 把自己链到 `entry.work` 上. 调用方受理 follow-up 后立即轮询时, 轮询恰好落在核验期间, `entry.work` 变化, `unload` 返回 `false`, `prepareTask` 抛出 `Native root is not safely idle for new task settings.`, Reviewer 以 `reviewer-runtime-failed` 失败并退出. 是否落在窗口内取决于原生请求的耗时, 所以时好时坏 (ARW/v1-splitrun2 试跑 3 次 follow-up 失败 2 次). 证据: `ARW/fuidle` 任务文件及其引用的 splitrun2 state JSON (本机, 不在仓库内).

最终状态: 带 `ignoreCurrentTask` 的卸载 (只有 `prepareTask` 使用) 在 `unload` 因核验期间 `entry.work` 变化而返回 `false` 时, 重新做安全空闲核验并再试, 最多 3 次, 不再直接失败. 理由: 规格 Capacity and recovery 节要求 "核验期间登记的新占用使本次核验不能作为停止依据", 所以不能跳过 `entry.work` 重核, 但 follow-up 自己的任务已持有该根线程, 其他调用方 (轮询的 `inspect`, 原生通知的刷新) 的预留只排在它之后, 重核后的新核验是新鲜的停止依据; 真正的新占用 (排队的工作, 保护) 仍被 `availableForSafeUnload` 拒绝. 容量回收, 维护和 `unload_agent` 不带 `ignoreCurrentTask`, 行为不变 (既有测试 `safe eviction and maintenance cannot unload work reserved during native idle verification` 守护). 不改公开 Interface, 持久状态和规格.

预计净增: 代码 +5 行 (非测试); 测试约 +35 行 (含把既有测试的夹具提为共用函数).

预期验证: 新增 mock 测试 (`tests/background-agent/manager.test.mjs`, 与既有核验期间预留的测试共用夹具): 已结束的运行, 持有一个预留, `acceptTask` 带不同设置, `prepareForTask` 期间 (原生 `idleFacts` 被门挡住) 另一个调用方 `holdManagedWork`, 放行后 `prepareForTask` 成功, 原生根线程卸载并重开一次; 修复前以 `Native root is not safely idle for new task settings.` 失败. `pnpm typecheck`, `pnpm test`, `arw text check`, `arw terms check --include .scratch/0129-followup-settings-unload-reservation/`, `git diff --check`.

## Acceptance criteria

- [x] 新测试在修复前以 `Native root is not safely idle for new task settings.` 失败, 修复后通过, 回调耗时不超过 100 毫秒.
- [x] 既有测试 `safe eviction and maintenance cannot unload work reserved during native idle verification` 继续通过 (容量回收和维护仍拒绝核验期间新增的预留).
- [x] 公开 Interface, 持久状态和 `docs/specs/` 没有改动.

## Blocked by

- None - can start immediately

## Validation

```text
code: +5 lines (files: 1)
  lib/background-agent/manager.mjs +5
documents: 0 characters (files: 0)
tests: +22 lines (files: 1)
  tests/background-agent/manager.test.mjs +22
next ADR number: 0041
```

- 根因 (复现): 新测试 `a task with changed settings unloads the idle root although another caller reserves the run during native idle verification` 在修复前以 `Native root is not safely idle for new task settings.` 失败 (栈指向 `prepareTask`), 与证据里两份失败 Reviewer 状态的 `failure.message` 相同; 修复后通过 (4 毫秒).
- 修复后 `node --test tests/background-agent/manager.test.mjs` 62 项通过 (含既有的 `safe eviction and maintenance cannot unload work reserved during native idle verification`). 在 `HOME`, `TMPDIR` 为 `/tmp/ARW/fuidle/` 下的目录时 `pnpm typecheck` 通过, 完整 `pnpm test` 968 项全部通过 (3.2 秒). `arw text check`, `arw terms check --include .scratch/0129-followup-settings-unload-reservation/`, `git diff --check` 通过.
- 自查 (只删减与合并): 既有测试的夹具提为 `idleRun` 共用, 新测试不复制; 生产代码只把一次卸载包进最多 3 次的重核循环, 没有可再删的内容.

## Comments

- Spec Readiness 记 `not-applicable`: 不含设计决定的缺陷修复 (行为合同已要求 follow-up 被受理, 本修复让实现符合它, 不新增规则), 按 `~/projects/docs/ARW.md` 单独成 effort, 不写 spec.
- 体积: 代码预计 +5 行, 实际 +5 行; 测试预计约 +35 行, 实际 +22 行 (既有测试的夹具提为共用函数, 净增更小).
- 提交审核第 1 轮 (首版修复为 `ignoreCurrentTask` 时跳过 `entry.work` 重核): 要求符合审核指出它违反规格 Capacity and recovery 节 "核验期间登记的新占用使本次核验不能作为停止依据", 成立; 改为重核后再试 (最多 3 次), 不跳过重核, 规格不变. 代码标准审核指出新测试复制既有测试的夹具, 成立; 提为 `idleRun`.
- 提交审核第 2 轮: 要求符合 `No problems.`; 代码标准指出 `idleRun` 返回的 `entry` 无人使用, 成立, 已删; 第 3 轮代码标准 `No problems.` (要求符合输入未受影响, 沿用第 2 轮结果).
