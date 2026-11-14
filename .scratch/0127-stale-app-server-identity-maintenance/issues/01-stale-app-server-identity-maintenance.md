# 残留已退出的共享 App Server 身份且无持有 key 时, 在线维护不再拒绝

Status: completed

## What to build

按 effort spec (`.scratch/0127-stale-app-server-identity-maintenance/spec.md`) 的 Implementation Decisions 实现, 并把同一例外写入长期规格 `docs/specs/agent-repository-workflow-installation/spec.md` 的 Installation transaction and recovery 节 (离线维护一段末句).

背景: 共享 App Server 意外退出后 `background-agent-state/app-server-process` 按规范保留给下一次启动核对; 没有新任务时一直残留, `node install.mjs` 的在线维护 (`prepareMaintenance`, 经 `closeSharedServer` 于 `lib/background-agent/manager.mjs`) 得到 `observeServer()` 为 `ended`, 无条件抛 `Shared App Server exited outside normal closure; retain its identity and provider leases for startup recovery.`, 维护返回 `unknown`, 安装被拒. 管理进程运行期间共享进程意外退出且无 Agent 时同样被拒.

最终状态:
- `closeSharedServer` 仅在 `observeServer()` 为 `ended` 且存在持有或待归还的提供方 key (`activeProviders`, `providersAwaitingRelease`, `providers` 表中 `leaseKey` 非空) 时抛该错误; `ended` 且没有 key 时继续正常关闭流程, 调用 `nativeSessions.close({retainProcessIdentity:true})`: 只清理模型目录, 保留身份文件供下一次启动核对, 清理失败使维护返回 `unknown` 并可重试. 其余分支 (除 `ended` 且无 key 外的全部既有分支) 不变. 维护关闭与空闲计时关闭共用 `closeSharedServer`, 一并生效; 根线程, 子 Agent 和工具退出的核验在其之前, 不变.
- Codex 适配器 `close()` (`lib/background-agent/codex-app-server.mjs`) 对连接已退出的共享进程不再自行抛 `exited outside normal closure`, 走既有清理路径 (等待退出回调的模型目录清理, 错误照常抛出并可重试), 并保留身份文件 (连接在调用时已退出的, 无论 `retainProcessIdentity` 取值). 保留 key 的责任由 `closeSharedServer` 承担.
- 长期规格该句改为 "除下一句外, 原有在线维护的资源归还和退出核验保持不变" 并加上例外句 (见 effort spec).

预计净增: 代码约 -1 行 (manager +1 -1 加注释一行, 适配器 -2); 测试约 +35 行; 文档约 +130 字符.

预期验证: `tests/background-agent/manager.test.mjs` 新增一个 mock 案例 (冷启动已退出和运行中意外退出, 均无 key 时 `prepareMaintenance` 返回 `ready`, 并以 `retainProcessIdentity:true` 关闭; 修复前失败), 既有案例 "the idle timer does not treat an unexpected empty App Server exit as normal key release" 末尾加持有 Strata key 时维护仍返回 `unknown` 且未归还 key; `tests/background-agent/codex-app-server.test.mjs` 把既有案例中对 `close()` 的拒绝断言改为成功 (`close({retainProcessIdentity:true})`), 并新增一个案例: 意外退出后普通 `close()` 成功且身份文件保留, 模型目录清理失败时抛错并可重试, 重试后身份文件仍保留. `pnpm test`, `pnpm typecheck`, `arw text check`, `arw terms check --include .scratch/0127-stale-app-server-identity-maintenance/`, `git diff --check`; 新案例回调耗时不超过 100 毫秒. 不做真进程测试, 不在本机共享安装上验证 (后台 Agent 测量占用中).

## Acceptance criteria

- [x] 管理进程冷启动已确认旧共享进程退出且没有 key 时, `prepareMaintenance({stopBackgroundAgents:true})` 返回 `ready`, 以 `retainProcessIdentity:true` 关闭, 不抛 `exited outside normal closure`.
- [x] 共享进程在运行中意外退出, 没有在跑 Agent 且没有 key 时, 同样返回 `ready`.
- [x] 持有 Strata key 时共享进程已退出, 维护仍返回 `unknown`, key 与 `providers` 行保留, 没有发起归还.
- [x] 共享进程已退出且没有 key 时, 模型目录清理失败使适配器 `close()` 抛错并可重试, 成功后身份文件仍保留.
- [x] 空闲计时关闭与维护关闭只经 `closeSharedServer` 一处判断 (观察: `grep -n "exited outside normal closure" lib/background-agent/manager.mjs` 只有一处).
- [x] 安装规范 Installation transaction and recovery 节写明该例外 (观察: `git diff` 该段含 "除下一句外" 与例外句).
- [x] 没有为测试改动生产代码或加注入接缝 (观察: `git diff HEAD -- lib` 只有 `closeSharedServer` 的条件与适配器 `close()` 删去两行).

## Blocked by

- None - can start immediately

## Validation

```text
code: +1 lines (files: 2)
  lib/background-agent/codex-app-server.mjs 0
  lib/background-agent/manager.mjs +1
documents: +708 characters (files: 1)
  docs/specs/agent-repository-workflow-installation/spec.md +708
tests: +39 lines (files: 2)
  tests/background-agent/codex-app-server.test.mjs +14
  tests/background-agent/manager.test.mjs +25
next ADR number: 0041
```

- 复现与修复前后: manager 案例 "maintenance proceeds when only a stale ended App Server identity remains and no key is held" 修复前 `prepareMaintenance` 返回 `unknown` (`'unknown' !== 'ready'`), 修复后通过 (冷启动, 清理失败后重试, 运行中意外退出三段); 持有 Strata key 的断言 (既有 idle timer 案例末尾) 修复前后都通过. 适配器案例 "closing after an unexpected shared exit keeps the identity, and a failed catalog cleanup is retried" 覆盖清理失败可重试且身份文件保留.
- `TMPDIR=/tmp/ARW/apsstale/t` 下完整 `pnpm test`: 966 项全部通过 (3.1 秒); `pnpm typecheck`, `arw text check`, `arw terms check --include .scratch/0127-stale-app-server-identity-maintenance/`, `git diff --check` 通过; 新案例回调耗时均 20 毫秒以内.
- `git diff HEAD -- lib` 只有 `closeSharedServer` 的拒绝条件与关闭参数, 适配器 `close()` 删去自行抛错并加 `unexpected` 标志与身份保留条件, 没有测试专用接缝或注入参数.
- 没有对 `~/.agent-repository-workflow` 运行安装或停止后台管理进程 (后台 Agent 测量占用中), 本机安装待测量结束后由 Main 安装.
- 自查 (只删减与合并): Strata key 对照断言并入既有案例; 适配器删去自行抛错的两行, 仅新增一个 `unexpected` 标志以排除观察与关闭之间的竞争.

## Comments

- 同一报告的 `recovery-identity-mismatch` 不同源: 它由 `lib/reviewer-runtime/reviewer-runtime.mjs` 在 Reviewer 恢复记录 (run, role, identity, 托管绑定) 与原线程不符时抛出, 不读取共享 App Server 进程状态.
- 体积: 预计代码 -1 行, 实际 +1 行 (适配器 `unexpected` 标志抵消删除, 管理进程多一行注释); 测试预计 +35 行, 实际 +39 行 (管理进程案例加清理失败重试段); 文档预计 +130 字符, 实际 +708 字符 (Spec Readiness 反复要求把理由, 成本和适用范围写进长期规格). 超出已无可再削.
- 历程: 起初按 "不改规范行为" 记 `not-applicable`; 提交审核两轮指出安装规范明写 "原有在线维护的资源归还和退出核验保持不变" 与放行字面冲突, 且删除身份文件违反规范的删除时机, 故改写 effort spec 与规范例句并走 Spec Readiness (12 轮, 最后一轮因 Reviewer 引用已不存在的措辞按质疑规则重核后 `No problems.`).
- 台账: issue `## What to build` 最终状态第一条与 `spec.md` Implementation Decisions 管理进程条目的 "仅在 ... 时抛该错误 / 拒绝" 记录不修: 措辞只写了被本变更改变的 `ended` 加凭据情形, 同一条末句 "其余分支 (除 `ended` 且无 key 外的全部既有分支) 不变" 已明确 `unknown`, `absent` 等分支行为不变, 实现与之一致 (`lib/background-agent/manager.mjs` 的条件只改 `ended` 一项).
- 台账: issue `## Acceptance criteria` 末条的观察 "`git diff HEAD -- lib` 只有 `closeSharedServer` 的条件与适配器 `close()` 删去两行" 记录不修: 该条守护的目标是没有为测试增加注入接缝, 实际生产改动 (`closeSharedServer` 条件与关闭参数, 适配器 `unexpected` 标志与身份保留条件) 都是功能所需, 不是测试专用接缝, 已在 `## Validation` 的自查和 effort spec Interfaces 中写明.
- 台账: `lib/background-agent/codex-app-server.mjs` 的 `unexpected` 标志 (及 `codex-app-server.test.mjs` 对应案例) 冲突裁决: Code Standards 要求删除该标志并视其为窄竞态的额外复杂度; effort spec 的 Interfaces 段经 Spec Readiness 要求 "连接调用时已退出的无论 `retainProcessIdentity` 取值都保留身份文件, 不依赖调用方的观察时点", 理由是长期规格 (安装规范身份文件段) 规定意外退出的身份文件只在下一次启动恢复中删除, 观察与关闭之间退出的窗口会提前删除它; 标志只有一个赋值与一个条件, 不是新的竞态防护机制, 按 effort spec 保留. 预算超出已在上一条体积说明记录.
