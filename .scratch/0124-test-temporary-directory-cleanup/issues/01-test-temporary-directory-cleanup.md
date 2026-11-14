# 测试在 teardown 里删除自己创建的临时目录

Status: completed

## What to build

背景: ARW 的测试在系统临时目录顶层用 `mkdtemp` 创建 `arw-*` 和 `agent-repository-workflow-*` 目录, 一部分在测试结束或失败时没有删除. 一台开发机上一次清理就删掉 212 个残留目录; 系统临时目录顶层条目超过 1500 时, 依赖它的沙箱会拒绝启动. 最终状态: 跑完 `pnpm test` 后, 无论测试通过或失败, 系统临时目录顶层不多出 `arw-*` 和 `agent-repository-workflow-*` 条目.

范围只在 `tests/`: 让每个创建临时目录的测试在 teardown (含失败路径) 中删除自己建的目录. 在隔离的 `TMPDIR` 下跑通过的 `pnpm test` 不留残留, 残留来自失败和中断的路径: 直接调用 `mkdtemp` 的测试把清理写在创建之后才到达的 `finally` 或 `t.after` 里 (创建与登记清理之间的步骤抛错就泄漏), `tests/installation/bootstrap.test.mjs` 在模块顶层等待打包进程成功之后才登记清理 (打包失败就泄漏). 修法: 直接调用 `mkdtemp` 的测试改用 `tests/helpers/cleanup.mjs` 的 `createTemporaryDirectory` (创建后立即登记 `t.after` 删除), 删去各自重复的 `rm`; 模块顶层的目录不能在等待打包进程期间登记 `after` (此时根测试可能已经结束并提前删除目录, 实测会使 `tar` 找不到文件), 所以打包成功后才登记 `after`, 打包失败时立即删除目录再抛出. 不为测试改生产代码, 也不增加注入接缝 (本仓库 Baseline 例外). 被强制终止的测试进程不会运行任何清理, 不在本 issue 范围内.

检查: 在 `tests/source-layout.test.mjs` 增加一条测试, 扫描 `tests/` 下的 `.mjs` 文件 (不含 `tests/fixtures/`), 除 `tests/helpers/cleanup.mjs` 外不允许出现 `mkdtemp`, 使后来的测试必须经过会清理的 helper. "跑完 `pnpm test` 后顶层不多出条目" 无法在套件内部观察 (套件结束之后的状态, 且并发运行的其他套件会造成误报), 由本 issue 的验证步骤在修复前后各测一次并记入本 issue 的 Validation 章节.

预计净增: 代码 0 行 (生产代码不变); 测试净增很少, 以合并到 `createTemporaryDirectory` 为主.

预期验证: 修复前后在真实系统临时目录下各跑一次 `pnpm test`, 比较 `arw-*` 与 `agent-repository-workflow-*` 顶层条目数; 在隔离 `TMPDIR` 下让打包进程失败 (PATH 中没有 `git`) 再跑一次 `pnpm test`, 修复前留下 `arw-bootstrap-archive-*`, 修复后目录为空; `pnpm typecheck`; `arw text check`; `arw terms check --include .scratch/0124-test-temporary-directory-cleanup/`; 每个改动的测试回调耗时不超过 100 毫秒或不因本改动变慢.

## Acceptance criteria

- [x] 在隔离 `TMPDIR` 下跑完 `pnpm test` 后, 无论测试通过还是失败 (PATH 中没有 `git`), 该目录中都没有测试留下的条目.
- [x] 在真实系统临时目录下跑完 `pnpm test` 后, 顶层的 `arw-*` 与 `agent-repository-workflow-*` 条目数不增加 (Validation 章节记录前后计数).
- [x] `tests/source-layout.test.mjs` 的一条测试禁止 `tests/` 下 (不含 `tests/fixtures/`) 在 `tests/helpers/cleanup.mjs` 之外出现 `mkdtemp`.
- [x] 生产代码 (`lib/`, `scripts/`, 入口文件) 没有改动.

## Blocked by

- None - can start immediately

## Validation


```text
code: 0 lines (files: 0)
documents: 0 characters (files: 0)
tests: -5 lines (files: 9)
  tests/background-agent/client.test.mjs 0
  tests/background-agent/daemon.test.mjs -12
  tests/background-agent/manager-process.test.mjs -2
  tests/background-agent/manager.test.mjs +2
  tests/background-agent/private-state.test.mjs -3
  tests/background-agent/process-identity.test.mjs -5
  tests/installation/bootstrap.test.mjs +7
  tests/reviewer-runtime/reviewer-round.test.mjs -1
  tests/source-layout.test.mjs +9
next ADR number: 0041
```

- 根因: 在隔离 `TMPDIR` (只有这个目录可写的 `/tmp/a`) 下, 修复前通过的 `pnpm test` 不留条目; 让打包进程失败 (`PATH` 只含 `node`, 没有 `git`) 后留下 1 个 `arw-bootstrap-archive-*`. 另外 8 个测试文件的 `mkdtemp` 与清理登记之间隔着可能抛错的步骤.
- 修复后: 隔离 `TMPDIR` 下 `pnpm test` 同样的两种运行 (通过 964 项, 无 `git` 时 159 项失败) 结束后目录都是空的.
- 真实系统临时目录, 修复前后各跑一次 `pnpm test` (964 项全部通过): 顶层总条目 1111 / 1111, `arw-*` 与 `agent-repository-workflow-*` 条目 110 / 110, 没有增加. 这 110 个是 2026-11-14 18 时至 2026-11-15 02 时被中断或失败的运行留下的旧残留, 本 issue 不删除它们.
- `pnpm typecheck`, `arw text check`, `arw terms check --include .scratch/0124-test-temporary-directory-cleanup/`, `git diff --check` 通过. 改动的 6 个测试文件逐例计时, 只有 `two concurrent cold launches ...` 为 402 毫秒 (该案例本身验证 400 毫秒的启动预算, 改动前相同).
- 自查 (只删减与合并): 直接 `mkdtemp` 的 20 余处全部合并到 `createTemporaryDirectory`, 删去各自重复的 `rm` 和空 `try`/`finally`, 没有可再删的内容.

## Comments

- Spec Readiness 记 `not-applicable`: 不含设计决定的测试清理, 按 `~/projects/docs/ARW.md` 单独成 effort, 不写 spec.
- 体积: 生产代码净增 0 行, 与预算一致. 测试净 -5 行 (大部分改动是去掉 `try` 后的缩进).
- 偏离: 要求的 "跑完 `pnpm test` 后顶层不多出条目" 没有写成套件内部的运行时测试 (套件结束后的状态在套件内无法观察, 并发运行的其他套件会造成误报), 改为静态扫描测试加本 issue 的前后计数.
- 范围外的发现: `tests/background-agent/claude-sessions.test.mjs` 的 "shortened project directory" 案例在 `TMPDIR` 路径较长 (如 8 个字符的 `/tmp/ARW`) 时无限循环不结束, 与临时目录路径长度有关, 本 issue 不处理. 被强制终止的测试进程不会运行清理, 也不在范围内.
- 提交审核第 1 轮: 采纳 `tests/source-layout.test.mjs` 复用文件列表函数, 并按标识符匹配 `mkdtemp` (检查用的正则写成不含字面 `mkdtemp` 的形式, 该文件无需豁免). 未跟踪文件不另外枚举: 暂存的新文件已在索引中, 与同文件既有测试的做法一致.
- 提交审核第 1, 2 轮 (质疑): 不采纳 "在 `await` 之前登记 `after`" 的建议. 复现: 把 `tests/installation/bootstrap.test.mjs` 改为在 `await runSuccessfulProcess(...)` 之前调用 `after(...)` 后运行 `pnpm test`, 该文件失败, 报 `tar` 找不到 `arw.tar.gz` (根测试在 TLA 等待期间先结束, 清理钩子提前删掉目录). 所以 What to build 的修法按实际可行的做法写 (打包成功后登记 `after`, 失败时立即删除目录再抛出), 这是同一修复中对 issue subject 的改写, 属 `spec-readiness` Skill 的 Authorization timing 允许的情形; 用户 2026-11-02 的常设确认覆盖这类清理 issue 的范围.
- 台账: tests/installation/bootstrap.test.mjs:73-82 冲突裁决 What to build 原文 "在等待之前先登记 `after`" 与验收条目 1 (任何运行后没有残留) 冲突: 按原文做法 `pnpm test` 中该文件失败 (目录被提前删除, `tar` 找不到归档), 按验收条目 1 的目的保留打包成功后登记 `after` 并在失败时立即删除, 已在同一修复中改写 What to build.
