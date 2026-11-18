# 控制端口移到 32768 以下并保持升级过渡

Status: completed

## What to build

按 effort spec 把后台管理进程的控制端口改为 `30000 + h % 2768` (30000-32767), 并让升级经旧控制端口 (`30000 + h % 20000`) 停止此前版本的管理进程. 用户在 2026-11-18 选定整段移到 32768 以下 (原话: 把控制端口整段移到 32768 以下, 例如 30000 + h % 2768), 要求 spec 写明新范围和公式, 端口被占用时的处理 (只剩 2768 个槽, 且与 Kubernetes NodePort 段重合), 以及升级过渡 (先经旧公式的端口停掉旧管理进程, 再用新端口), 代码与测试覆盖 Windows 和 Linux.

- `lib/background-agent/client.mjs`: `backgroundAgentPort()` 改为新公式; 新增导出 `backgroundAgentLegacyPort()` (旧控制端口计算); `acquireBackgroundAgentMaintenance` 增加 `legacyPort` 参数 (默认值见 spec), 控制端口得到 `ECONNREFUSED` 且旧控制端口不同时, 向旧控制端口发送同一 `__maintenance` 请求, 该请求的任何失败都视为没有旧管理进程.
- 长期规范 `docs/specs/agent-repository-workflow-installation/spec.md`: 后台管理进程一节把控制端口范围, 与动态段的关系, 被占用时的明确失败和不回退, 以及升级过渡写入; 去掉 "保留" 与 "接受的代价" 的旧口径 (控制端口 30000-49999, 改变端口规则需要另一套过渡, 因此保留); 维护互斥一节的 "控制端口 (30000-49999, 端口规则不变)" 改为说明升级时先经旧控制端口停止此前版本的管理进程. 两处都不引用 `.scratch`.
- 测试 (`tests/background-agent/client.test.mjs`): 端口值断言; 旧控制端口的假管理进程返回 `ready` 时维护流程停止它并返回 `acquired`, 分别返回 `busy` 与 `unknown` 时原样返回; 两个端口都无人时返回 `acquired`; 旧控制端口是不鉴权的其他服务且缺席核对非 `absent` 时返回 `unknown`; 控制端口被其他服务占用时返回 `unknown` 且不向旧控制端口发送. 不为测试改生产代码, 不起真实管理进程, 测试不含 `process.platform` 判断 (公式与请求顺序与平台无关, Windows 保留块在客户端侧表现为 `ECONNREFUSED`, 由关闭端口的案例覆盖).

预计净增: 非测试代码约 +10 行, 文档约 +600 字符 (含删去旧口径). 预期验证: `tests/background-agent` 定向运行, 完整套件, Source Checkout 全部验证命令.

边界: 控制端口被其他进程占用时管理进程明确失败 (不改既有行为); 控制端口等于旧控制端口时不重复发送; 指定了 `port` 的调用不回退到真实的旧控制端口.

## Acceptance criteria

- [x] 默认控制端口在 30000-32767, 旧控制端口公式保留为 `30000 + h % 20000`, 两者都有断言.
- [x] `acquireBackgroundAgentMaintenance` 在控制端口无人监听时: 旧控制端口有管理进程且 `ready` 则停止它并返回 `acquired`, `busy` 或 `unknown` 则原样返回; 两个端口都无人时返回 `acquired`; 旧控制端口是其他服务且缺席核对非 `absent` 时返回 `unknown`; 控制端口被其他服务占用时返回 `unknown` 且不连旧控制端口; 以上各有一个测试案例 (`node --test tests/background-agent/client.test.mjs`).
- [x] 新增测试没有 `process.platform` 判断 (`git diff -- tests | grep process.platform` 无新增行), 两个平台运行同一组测试.
- [x] `port` 不是默认控制端口且未传 `legacyPort` 时不向任何旧控制端口发送请求 (上述测试都在不连真实旧管理进程的前提下运行).
- [x] 长期规范写明新范围与公式, 被占用时的明确失败和不回退的理由, 升级过渡 (含新客户端遇到已安装旧管理进程的两种结果), 并且不再含 "接受的代价" 与 "端口规则不变" 的旧口径 (`git grep -n "接受的代价\|端口规则不变" -- docs/specs` 无结果, 新规则由 `git diff` 逐句对照).
- [x] 完整 Source Checkout 验证通过 (`pnpm typecheck`, `pnpm test` 与 `docs/agents/source-checkout-validation.md` 所列其余命令均退出 `0`).

## Blocked by

- None - can start immediately

## Validation

- 端口值与升级各案例: `node --test tests/background-agent/client.test.mjs` 18/18 通过 (新增 6 个, 各自耗时数毫秒, 不起真实管理进程, 无 `process.platform` 判断).
- `pnpm typecheck`, `pnpm test` (1029/1029), `check-workflow-distribution`, `project-claude-skills --check`, `generate-install-arw --check`, `arw text check`, `arw terms check --include .scratch/0145-control-port-below-ephemeral/`, `git diff --check` 通过; `git grep -n "接受的代价\|端口规则不变" -- docs/specs` 无结果.
- 管理进程启动绑定失败的明确失败沿用既有测试 "a manager that exits during startup is reported at once with its standard error".

`git diff -- tests | grep process.platform` 无输出.

实测净增:

```
code: +15 lines (files: 1)
  lib/background-agent/client.mjs +15
documents: +525 characters (files: 1)
  docs/specs/agent-repository-workflow-installation/spec.md +525
tests: +59 lines (files: 1)
  tests/background-agent/client.test.mjs +59
```

## Comments

体积超出: 非测试代码预计 +10 行, 实测 +15 行 (超 5 行): 旧控制端口的计算需要把散列提成共用函数, 回退请求需要一个请求辅助函数和失败吞掉的分支, 无法再削减.

第 1 轮提交审核: 修复 spec 的机器相关句, 简称, 缺少的 User Stories 与 Further Notes, Testing Decisions 的逐项列举, 代码缩进, 长期规范补写新客户端遇到已安装旧版本的两种结果.

台账: .scratch/0145-control-port-below-ephemeral/issues/01-control-port.md `## What to build` 第 2 段起的文件路径 记录不修 受审 subject 措辞, 本 issue 的 `## What to build` 沿用本仓库既有 issue 逐文件列出改动的写法, 不改变范围或验收含义.
台账: .scratch/0145-control-port-below-ephemeral/issues/01-control-port.md `## What to build` 与验收项中的 "旧控制端口" 记录不修 subject 措辞一致性, spec 已统一写 "此前版本的控制端口", 含义相同.
