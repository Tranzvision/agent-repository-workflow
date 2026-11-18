# Reviewer 角色说明相对路径与 inspect 根目录误报

Status: completed

## What to build

来源: ARW/capfix, 能力测试 capscope 报告 1118c 与 1118d 的作废原因 A 类与 B 类. 无设计决定, 不写 spec.

1. 内联进 Reviewer 提示的角色说明 (`docs/agents/roles/<role>.md`, `docs/agents/reviewer.md`) 含 `` `../reviewer.md` `` 一类相对路径. 内联后 Reviewer 以自己的工作目录为起点解析, 在能力测试实例中跑出实例目录, 读到 `../state` 里的管理状态文件. `lib/reviewer-runtime/reviewer-round.mjs` 新增 `reviewerInstructions(role, text)`, 把两份文本中反引号包裹的 `./` 与 `../` 路径按其所在文件改写为仓库相对路径 (`docs/agents/reviewer.md`); 真实审核轮 (`prepareReviewerRound`) 与能力测试 (`lib/reviewer-capability-setup.mjs`) 共用它. 能力测试实例已含 `docs/agents/` 下的这些文件, 所以改写后的路径都在实例内. 规则源文件不改.
2. `lib/reviewer-capability/inspection.mjs` 把命令或正文中孤立的 `/` 当作根目录路径 (`git grep -E '... / 1e4'`, 正则 `/"/`, python 写草稿时正文里的 `` `a`/`b` ``). 孤立的 `/` 词只在作为命令参数时才算: 紧跟命令词, 选项或 `bash -lc` 前缀 (`ls /`, `du -sh /`, `find / -name x`, `cd / && ls`); 引号里的模式, 除号和正文分隔不算. 其他路径词的判定不变.

确认 Reviewer 读不到实例外的管理状态: Codex 的 Reviewer 文件系统权限只含 `cwd` (读) 与 `writePaths` (写) (`reviewer-native-policy.mjs`), 能力测试实例的状态目录是实例的兄弟目录, 不在其中; 本 issue 去掉了把 Reviewer 引向它的相对路径来源.

Reviewer 规则改动说明: 本 issue 改变交给 Reviewer 的输入文本 (相对路径改写为仓库相对路径, 能力测试输入中两段文本的分隔由一个换行改为空行), 属 Reviewer 规则改动, 应按 capability A/B 重新验证. 已排 ARW/capretest 专做这件事, 本 issue 不跑能力测试.

预计净增: 非测试代码约 20 行; 测试约 40 行.

预期验证: `pnpm test`; `pnpm typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `git diff --check`.

## Acceptance criteria

- [x] 真实审核轮的 `instructions` 与能力测试 `setupScenario` 返回的 `instructions` 都不含反引号包裹的 `./`, `../` 路径, 且引用的 `reviewer.md` 写为 `docs/agents/reviewer.md` (测试: `reviewer-round.test.mjs`, `reviewer-capability-setup.test.mjs` 三个角色).
- [x] inspect 对 `git grep -E 'cost / 1e4' src`, `git grep -F 'text.replace(/"/' src`, `rg '(^\|/)src' src`, python `-c` 正文含 `` `failureCode`/`operation` `` 与 `a / b`, `grep -c "x / y" src/a.mjs` 不报 `path`; 对 `ls /`, `ls -la /`, `cd / && ls`, `du -sh / | head` 仍报 `/` (测试: `inspection.test.mjs`).

## Validation

- 两个缺陷各有先失败后通过的测试: 改动前三个新测试都失败, 改动后通过.
- `pnpm test` 1036 个全部通过; `pnpm typecheck`, `node scripts/check-workflow-distribution.mjs`, `node scripts/generate-install-arw.mjs --check` 通过.

## Blocked by

- None - can start immediately

## Comments

- 未运行 Spec Readiness 与 Commit Audit: 它们需要经 `arw background-agent` 启动 Reviewer, 而本机真实 HOME 下的后台 agent 守护进程正被 ARW-v1 原型测量使用, 本任务不得在其中启停. 由 Main 决定是否补审.
- 能力 A/B 重新验证由 ARW/capretest 做. 交给 Reviewer 的输入文本已变化, 旧实例不能与新版本混用.
