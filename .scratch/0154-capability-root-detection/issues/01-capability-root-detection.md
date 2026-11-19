# 能力测试根目录检测的漏报与误报, 实例补齐角色引用的文档

Status: completed

## What to build

来源: ARW/capaudit 对提交 7538fcb (issue 0148) 的补审. 无设计决定, 不写 spec.

1. `lib/reviewer-capability/inspection.mjs` 的 `hasRootArgument` 有三处缺陷, 每处有可复现的命令: 结构化记录里单独的 `/` (Claude `Grep` 的 `path: "/"`, Codex 命令的 cwd 为 `/`) 被 `word !== '/'` 过滤而不报根目录; `ls "/"`, `ls . /`, `bash -lc 'ls /'` 漏报 (位置判断只认紧跟命令词, 选项或 `bash -lc` 前缀, 且不去引号); `git grep -F 'read & write / execute' -- src`, `git grep -F 'x; y / z' src` 误报 (引号内的 `;` 与 `&` 被当作分隔). 改为: 调用的某个字段 (Claude `Grep` 的 `pattern` 除外, 它是搜索内容) 或 cwd 恰为 `/` 时报根目录; 拆分时跳过引号内的 `;|&`, 去掉操作数的引号, 命令词是 shell 且带 `-c`/`-lc` 时, 以及含 `$(` 的词, 对其中的脚本递归判断; 位置判断改为命令词之后的任一 `/` 操作数. 其他路径词的判定不变.
2. `docs/agents/roles/spec-readiness-reviewer.md` 引用 `../subagent-findings.md`, 改写为 `docs/agents/subagent-findings.md` 后该文件不在能力测试实例内 (`lib/reviewer-capability-setup.mjs` 的 `INSTRUCTIONS` 不含它), 与 issue 0148 所写 "改写后的路径都在实例内" 不符. 把它加入 `INSTRUCTIONS`, 并在测试中断言内联指令里的每个 `docs/agents/*.md` 路径在实例内都存在.
3. issue 0148 的 `## Validation` 缺 `git diff --check` 与 `node arw.mjs text check` (其预期验证已列出, 提交前也运行过): Commit Audit 不允许候选改动另一个 effort 下的路径, 所以补记写在本 issue 的 `## Validation` 与 `## Comments`, 不改 0148 文件.

交付范围: `lib/reviewer-capability/inspection.mjs`, `lib/reviewer-capability-setup.mjs`, 两个对应测试文件. 体积预算: 非测试代码净增不超过 10 行.

预期验证: `pnpm test`; `pnpm typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `git diff --check`.

## Acceptance criteria

- [x] inspect 对结构化 `/` (Claude `Grep` 的 `path: "/"`, Codex 命令的 cwd 为 `/`; 同一 Grep 的 `pattern: "/"` 不报, Glob 的 `pattern: "/"` 报), `ls . /`, `ls "/"`, `bash -lc 'ls /'` 报 `/`; 对 `git grep -F 'read & write / execute' -- src`, `git grep -F 'x; y / z' src` 不报 (测试: `inspection.test.mjs`); 原有正反例不变.
- [x] 三个角色的内联指令里每个 `docs/agents/*.md` 路径在能力测试实例内存在 (测试: `reviewer-capability-setup.test.mjs`, 去掉 `INSTRUCTIONS` 中新增项时失败).
- [x] 本 issue 的 `## Validation` 记录 `git diff --check` 与 `text check` 的结果, 并在 `## Comments` 说明为何不改 0148 文件.

## Blocked by

- None - can start immediately

## Validation

- 验收 1: `inspection.test.mjs` 的 "a lone slash ..." 用例新增反例 `git grep -F 'read & write / execute' -- src`, `git grep -F 'x; y / z' src`, Claude `Grep` 的 `path: "src"` 加 `pattern: "/"` (不报) 与正例 `ls . /`, `ls "/"` (Codex), Codex cwd 为 `/`, Claude `bash -lc 'ls /'`, `Grep` 的 `path: "/"`, `Glob` 的 `pattern: "/"` (报 `/`); 改动前该用例失败, 改动后通过.
- 验收 2: `reviewer-capability-setup.test.mjs` 的 "inlined role instructions" 用例新增对内联指令中每个 `docs/agents/*.md` 路径的存在断言; 改动前失败 (`docs/agents/subagent-findings.md` 不在实例内), 改动后通过.
- 验收 3: `git diff --check` 与 `node arw.mjs text check` 通过 (本次提交前运行, 结果为退出 `0`); 0148 当时同样运行过, 其 `## Validation` 未写, 见 Comments.
- `pnpm typecheck`, `pnpm test` (1038 个全部通过), `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node --check lib/reviewer-capability/inspection.mjs`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0154-capability-root-detection/`, `git diff --check`: 全部通过.

实测净增 (预算 10 行以内):

```
code: +3 lines (files: 2)
  lib/reviewer-capability-setup.mjs 0
  lib/reviewer-capability/inspection.mjs +3
documents: 0 characters (files: 0)
tests: +7 lines (files: 2)
  tests/reviewer-capability-setup.test.mjs +1
  tests/reviewer-capability/inspection.test.mjs +6
```

## Comments

- 范围 (本机工作方式): 不含设计决定, 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`.
- 0148 的 Validation 补记: 0148 提交前也运行了 `git diff --check` 与 `node arw.mjs text check` 且通过, 当时没写进它的 `## Validation`; 候选不得改其他 effort 的路径, 故在此补记, 0148 文件不改.
- 偏离: `bash -lc` 脚本与含 `$(` 的词用递归判断, 不是在 Codex 命令的 `['/bin/bash', '-lc', 脚本]` 拼接文本上特判 (Codex 把脚本以空格拼回, 其中 `ls /` 直接是命令词后的操作数).
