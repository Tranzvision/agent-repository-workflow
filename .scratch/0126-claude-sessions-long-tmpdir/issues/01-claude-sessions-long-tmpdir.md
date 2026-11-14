# claude-sessions 的长工作目录案例随临时目录长度调整, 不再无限循环

Status: completed

## What to build

背景: `tests/background-agent/claude-sessions.test.mjs` 的案例 `a session record in the shortened project directory of a long working directory is resumed` 用固定的 220 个 `w` 作工作目录最后一级. 假 Claude (`tests/fixtures/fake-claude.mjs`) 按完整项目目录名 (工作目录中非字母数字字符换成 `-`) 建 `projects/<名称>` 目录; 真 Claude 把超过 200 个字符的名称缩短为前 200 个字符加哈希, 假 Claude 不缩短. 工作目录总长度加 221 超过文件系统单个路径组件的上限 255 (临时目录路径超过约 34 个字符, 例如 `TMPDIR` 为 `/tmp/ARW` 即触发) 时, 假 Claude 的 `mkdirSync` 抛 `ENAMETOOLONG` 后退出, 案例里 `while (... state !== 'idle')` 永远等不到 `idle`, 测试进程无限循环. 默认 `/tmp` 与 `/tmp/a` 下名称不超过 255 所以通过. 生产代码没有缺陷: 它只按 `projectName.length > 200` 判断是否按会话 ID 查找记录, 真 Claude 从不产生超过 255 的目录名.

最终状态: 该案例在路径不超过 208 个字符的临时目录下都通过 (更长时公式的计数小于 1, 不在支持范围), 并且名称始终处于 "超过 200 个字符, 不超过 255 个字符" 的区间, 仍然覆盖缩短分支. 做法: 工作目录最后一级的长度由临时目录路径长度算出, 使项目目录名长度恒为 210 个字符 (`'w'.repeat(209 - f.directory.length)`), 不再用固定 220. 只改该测试案例, 不改生产代码, 不改假 Claude, 不加注入接缝 (本仓库 Baseline 例外).

预计净增: 代码 0 行; 测试 0 行 (改一行).

预期验证: 修复前后在 `TMPDIR=/tmp/ARW/sesspathloop/t` (同样已知会卡住的长路径) 下只跑 `tests/background-agent/claude-sessions.test.mjs`, 加 `timeout`, 修复前超时, 修复后通过; 默认 `/tmp` 下该文件通过; 修复后在 `TMPDIR` 为较长路径下完整 `pnpm test` 不卡死; `pnpm typecheck`; `arw text check`; `arw terms check --include .scratch/0126-claude-sessions-long-tmpdir/`; 改动案例的回调耗时不超过 100 毫秒.

## Acceptance criteria

- [x] 在 `TMPDIR` 为 `/tmp/ARW/sesspathloop/t` 时, 只跑 `tests/background-agent/claude-sessions.test.mjs` 在 `timeout 60` 内全部通过 (修复前超时).
- [x] 在默认 `/tmp` 下该文件仍然通过, 案例仍然走缩短目录分支 (工作目录对应的项目目录名恰好 210 个字符).
- [x] 生产代码 (`lib/`, `scripts/`, 入口文件) 和 `tests/fixtures/fake-claude.mjs` 没有改动.

## Blocked by

- None - can start immediately

## Validation

```text
code: 0 lines (files: 0)
documents: 0 characters (files: 0)
tests: +1 lines (files: 1)
  tests/background-agent/claude-sessions.test.mjs +1
next ADR number: 0041
```

- 根因 (复现): `TMPDIR=/tmp/ARW/sesspathloop/t` 下只跑 `node --test tests/background-agent/claude-sessions.test.mjs`, 修复前 `timeout 60` 内不结束; `/tmp` 下通过 (29 毫秒). 临时目录路径从 8 个字符 (`/tmp/ARW`, 目录 `mkdtemp` 后共 35 个字符) 起即卡住, `/tmp/a` 下通过, 与 "工作目录总长度加 221 超过 255" 的推算一致; `fs.mkdirSync` 对 255 个字符的目录名成功, 256 个字符报 `ENAMETOOLONG`.
- 修复后: 同一长路径 `TMPDIR` 下该文件 0.6 秒内通过, 案例耗时 30 毫秒; 默认 `/tmp` 下通过 (25 毫秒).
- `TMPDIR=/tmp/ARW/sesspathloop/full` 下完整 `pnpm test`: 964 项全部通过 (3.2 秒), 不再卡死. `pnpm typecheck`, `arw text check`, `arw terms check --include .scratch/0126-claude-sessions-long-tmpdir/`, `git diff --check` 通过.
- `git diff --numstat` 中 `lib/`, `scripts/`, 入口文件和 `tests/fixtures/fake-claude.mjs` 没有改动.
- 自查 (只删减与合并): 只有一行改动, 没有可再删的内容.

## Comments

- Spec Readiness 记 `not-applicable`: 不含设计决定的测试修复, 按 `~/projects/docs/ARW.md` 单独成 effort, 不写 spec.
- 体积: 代码预计 0 行, 实际 0 行; 测试预计 0 行 (改一行), 实际 +1 行 (一行说明注释, 替换原有一行).
- 来源: `0124` 的 Comments 记录了此案例在长 `TMPDIR` 下无限循环, `0125` 的验证环境因此改用默认 `TMPDIR`; 本 issue 修复后两者都可用较长 `TMPDIR` 跑完整套件.
- 台账: `01.spec-readiness.json` 的 `exception.reason` 记录 记录不修 常设确认的原文在本机用户规则 (`~/projects/docs/ARW.md` 的 "ARW 自主工作方式" 拆分工作条, 不在仓库树内): "不含设计决定且不依赖共用 spec 的 issue (清理, 改测试数据, 机械修复等) ... 用户已确认这类 issue 不需要治理设计 (2026-11-02)". 记录里的 "清理类" 是该类的简称 (`0124`, `0125` 的记录同样写法), `confirmedAt` 是该日期; 本 issue 只改一个测试案例的路径长度, 属 "改测试数据, 机械修复" 一类, 不含设计决定. 原文不在树内是设计如此, 不是缺陷.
