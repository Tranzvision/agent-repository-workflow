# Effect Log: 启动失败的 agent-task 记录 finishedAt

Status: completed

## What to build

长期规格 `docs/specs/agent-repository-workflow/spec.md` 的 Effect Log `agent-task` 行规定 `finishedAt` 取该任务的结束时间, 只有转为 `unknown` 时为 `null`, 启动失败置为 `ended`. 但 `lib/background-agent/manager.mjs` 的 `recordTask` 对启动失败 (`failStart`, 尚无原生线程) 在 `taskFinishedAtMs` 尚未写入时记录, `finishedAt` 为 `null`. 本 issue 用测试复现后修: 启动失败的记录 `finishedAt` 取已有的 `taskFinishedAtMs`, 没有则取当前时间 (整秒). 规格已是此意, 不改规格.

不含设计决定 (Spec Readiness 记 `not-applicable`): 使实现符合已有规格.

预计净增: 代码约 +1 行, 测试约 +1 行.

## Acceptance criteria

- [x] `tests/background-agent/manager.test.mjs` 的启动失败用例断言记录的 `finishedAt` 是数字, 修改前失败, 修改后通过.
- [x] 转为 `unknown` 的任务记录仍是 `finishedAt: null`.

## Blocked by

- None - can start immediately

## Validation

- 先红后绿: 启动失败用例新增 `finishedAt` 为数字的断言, 修改前报 `'object' !== 'number'`, 修改后通过.
- `pnpm typecheck`, `pnpm test` (1015 个通过), `arw text check`, `arw terms check`, `git diff --check` 通过.

实测净增:

```
code: 0 lines (files: 1)
documents: 0 characters (files: 0)
tests: +1 lines (files: 1)
```

## Comments

- 来源任务: 总层 `ARW/0136fix2`, 报告 `.tasks/ARW/0136fix2-report-1118.md`.
- 体积: 代码改写同一行, 实测净增 0, 未超预算.
