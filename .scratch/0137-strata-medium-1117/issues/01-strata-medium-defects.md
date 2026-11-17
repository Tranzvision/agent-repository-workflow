# 修复 Strata 核实的三项中严重度缺陷 (先写失败测试)

Status: completed

## What to build

修复 2026-11-17 Strata 审查分诊确认属实的三项中严重度缺陷, 每项先写在修复前失败的测试, 再修. 三项都不含设计决定, 不写 spec (Spec Readiness 记 `not-applicable`); 行号以实施时 main 为准.

- `lib/background-agent/machine.mjs`: `--wait` 循环里的 `runtime.wait` 在保护 try 之外. 它抛错 (client 已关闭, 非本地 abort 的错误, 认证或凭据读取失败) 时, 异常进入机器入口的 fatal, 只写 `background-agent-failed: ...`, 不写被跟随运行的 `<id>:done` 响应, 调用方一直等不到完成. 修法: 抛错时写 `{id: '<id>:done', ok: false, error: {code: 'background-agent-operation-failed', message}}` 并结束该跟随, 同时在 `docs/specs/agent-repository-workflow/spec.md` 的 Machine entry 节把 "等待失败" 明确为包含 `wait_agent` 调用抛出异常 (与同一文件操作分支对抛错的既有处理一致, 不新增行为).
- `lib/arw-common/text-policy.mjs`: Git 字符类内的 `\-` 被改成 `\\-`, 转义的 `-` 丢失 (`[a\-b].md` 保留了 Git 会排除的 `-.md`); `new RegExp` 未保护, `[a-\]]x.md` 抛出 `SyntaxError` 逃出 `runTextPolicy`, 并把原始模式写进错误信息, 而 `document-terms.mjs` 对同一调用返回 `agent-scope-policy-invalid`. 修法: 字符类按 Git 语义保留反斜杠对下一字符的转义 (也用于定位结束的 `]`), `runTextPolicy` 对 `filterAgentManagedPaths` 的失败返回已有的 `invalid-agent-scope-policy` 阻断.
- `lib/arw.mjs`: `escapeText` 只转 `\\ \r \n \0`; `emitDiagnostics` 和 `runLanguageInspectCommand` 把来自磁盘的 path 和 message 写到 stderr, 含 ESC 的文件名可向终端注入转义序列. 修法: 把 `renderWorkflowDiagnostic` 对 remediation 做的全量控制字符转义并入 `escapeText`, 在这两处使用.

来源: `.tasks/ARW/strata-review/fix-1117-draft.md` (总层任务目录). 其余 76 条低严重度发现不在本 issue 内.

预计净增: 非测试代码约 +15 行, 测试约 +90 行, 规格约 +60 字符.

## Acceptance criteria

- [x] 每项都有修复前失败, 修复后通过的测试: `--wait` 下 `runtime.wait` 抛错时写出 `<id>:done` 且 `ok: false`; `[a\-b].md` 与 Git 判定一致 (排除 `-.md`, `a.md`, `b.md`), `[a-\]]x.md` 经 `runTextPolicy` 得到 `invalid-agent-scope-policy` 而不抛出; 含 ESC 的 path 经 `emitDiagnostics` 输出, 含 ESC 的 path 和 message 经 `language inspect` 输出后不含原始控制字符.
- [x] 不含控制字符和反斜杠的合法输入, 既有输出不变 (含控制字符的输入输出随转义改变是本修复的目的; 反斜杠按 `escapeText` 的既有规则加倍), 公开 Interface 和持久状态没有改动; 新测试回调不超过 100 毫秒, 用 mock Git 不起真进程; `pnpm test` 与 `pnpm typecheck` 通过.

## Blocked by

- None - can start immediately

## Comments

- 来源任务: 总层 `ARW/fix1117`; 逐条结论见总层 `.tasks/ARW/strata-review/triage/2026-11-18.jsonl`.
- Spec Readiness 记 `not-applicable`: 依据 `AGENTS.md` Source Checkout Baseline 例外中用户常设确认 (2026-11-02), 不含设计决定且不依赖共用 spec.
- 审核处置 (第 1 轮): 规格 Machine entry 把等待失败限定为失败响应, 与抛出异常的修法冲突, 已在该节补一句 (抛出视同失败响应), 属澄清既有处理, 请 Main 复核这句文档改动. `lib/repository-workflow/workflow.mjs` 另有一份同名 `escapeText`, 本修复不合并也不改它, 记录不修: 不在已核实的发现内, 合并会改变该模块输出, 需另作 effort. `emitDiagnostics` 的 message 为程序自己拼出的文字, 只测 path, message 上的转义不另测.
- 台账: `lib/arw.mjs` 的 `escapeText` (118-124 行) 与 `lib/repository-workflow/workflow.mjs` 的同名副本 (189-193 行) 记录不修 已核实的发现只涉及 `arw.mjs` 的输出; 合并会改变 `workflow.mjs` 的输出, 超出本 issue 范围, 需另作 effort; 保留分叉由 Main Agent 决定 (本 issue 的验收只要求 `arw.mjs` 输出).
- 台账: `lib/document-terms/document-terms.mjs` 757-768 行的 `catch` 与诊断码 `agent-scope-policy-invalid` 记录不修 既有代码且诊断码属另一模块的既有合同, 合并两处映射超出本 issue; 本 issue 新增的 `text-policy.mjs` 守卫只接 `SyntaxError`.
- 体积核对: 预计非测试代码 +15 行, 规格 +60 字符; 实际代码 +17 行, 规格 +62 字符, 超出代码 2 行: 非 SyntaxError 重新抛出 1 行, 为消除 `machine.mjs` 中两处相同的失败映射新增 `operationFailure` 一行, 属有意去重.

## Validation

- 三项各有修复前失败的测试, 修复后通过: `tests/background-agent/machine.test.mjs` 的 `--wait reports a thrown runtime wait ...`, `tests/arw-common/text-policy.test.mjs` 的字符类测试, `tests/arw-common/artifact-cli.test.mjs` 与 `tests/arw-common/document-language-cli.test.mjs` 的控制字符转义测试; 新测试回调均低于 15 毫秒, CLI 测试用 `createRepositoryWithMockGit`, 不起真进程.
- `pnpm typecheck` 通过; `pnpm test` 通过, 974 项, 0 失败.
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0137-strata-medium-1117/`, `node --check` (受影响的 `.mjs`), `git diff --check` 通过; `node arw.mjs spec-readiness verify --issue issue:0137:01` 通过, 结果为 `not-applicable`.

```text
code: +17 lines (files: 3)
  lib/arw-common/text-policy.mjs +9
  lib/arw.mjs +1
  lib/background-agent/machine.mjs +7
documents: +62 characters (files: 1)
  docs/specs/agent-repository-workflow/spec.md +62
tests: +59 lines (files: 4)
  tests/arw-common/artifact-cli.test.mjs +10
  tests/arw-common/document-language-cli.test.mjs +15
  tests/arw-common/text-policy.test.mjs +17
  tests/background-agent/machine.test.mjs +17
next ADR number: 0041
```
