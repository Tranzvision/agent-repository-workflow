# 顶层 exec_command 调用也受无执行条目规则约束

Status: completed

## What to build

`node scripts/reviewer-capability.mjs inspect <instance-directory>` 对 Codex 记录有一条 `blocked` 规则: 有输出的调用用了命令执行工具而记录中没有任何命令执行条目. 现在这条规则只认调用 JS 文本中的 `tools.exec_command`, 顶层 `function_call` (或 `custom_tool_call`) 的调用名为 `exec_command` 时不受约束, 记录缺命令执行条目也会 `succeeded`, 使路径检查对这类实例形同虚设. 让两种写法同样触发该规则: 有输出的调用用了 `tools.exec_command` 或顶层调用名为 `exec_command`, 而记录中没有任何命令执行条目时返回 `blocked`; 中断实例中只有缺输出的调用用了其中任一写法时不因此 `blocked` (与现有规则一致). 合同见 `docs/specs/agent-repository-workflow-development/spec.md` 的 Reviewer capability suite 节 `inspect` 条目与 Validation strategy 节的 `inspect` 测试覆盖, 同步把这两处的 `tools.exec_command` 补为 "`tools.exec_command` 或顶层调用名为 `exec_command`". 其余行为, 结果形状与完成实例的其他规则不变.

交付范围: `lib/reviewer-capability/inspection.mjs`, `tests/reviewer-capability/inspection.test.mjs` 与上述长期规格. 体积预算: 非测试代码净增不超过 2 行.

预期验证: 定向测试用合成记录 (不起 Reviewer 或其他子进程) 覆盖下列情形, 再跑 `docs/agents/source-checkout-validation.md` 所列的源码仓库验证.

## Acceptance criteria

- [x] Codex 完成实例中, 有输出的顶层 `function_call` 名为 `exec_command` 而记录没有任何命令执行条目时, `inspect` 返回 `blocked` (现有 `tools.exec_command` 的 `blocked` 用例不变).
- [x] Codex 中断实例中, 有输出的顶层调用名为 `exec_command` 而记录没有任何命令执行条目时返回 `blocked`; 只有缺输出的这类调用时不 `blocked`.
- [x] 记录中有命令执行条目时, 顶层调用名为 `exec_command` 不影响结果 (现有干净用例不变).

## Blocked by

- None - can start immediately

## Validation

- `node --test tests/reviewer-capability/inspection.test.mjs`: 12 个通过; 新增用例覆盖 AC 1 到 3 (完成实例与中断实例中有输出的顶层 `function_call` 名为 `exec_command` 而无命令执行条目均 `blocked`, 中断实例中只有缺输出的这类调用时 `succeeded`; 完成实例中顶层调用名为 `exec_command` 且有命令执行条目时 `succeeded`). 含新增用例的 "an incomplete record blocks instead of passing" 回调耗时约 150 毫秒, 超过 100 毫秒阈值: 该回调本来就在循环中逐个运行全部 `blocked` 用例 (每例约 12 毫秒), 改前约 137 毫秒; 按 Baseline 例外不为缩短耗时改生产代码, 保留.
- `pnpm typecheck`, `pnpm test` (1037 个通过), `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node --check lib/reviewer-capability/inspection.mjs`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0150-inspect-exec-function-call/`, `git diff --check`: 全部通过.
- 体积 (`commit-audit prepare` 摘要), code 净增 0 行 (改 1 行), 在预算 2 行之内:

```
code: 0 lines (files: 1)
  lib/reviewer-capability/inspection.mjs 0
documents: +229 characters (files: 1)
  docs/specs/agent-repository-workflow-development/spec.md +229
tests: +5 lines (files: 1)
  tests/reviewer-capability/inspection.test.mjs +5
```
## Comments

- 复现 (2026-11-19, 改动前): `node --test tests/reviewer-capability/inspection.test.mjs` 中新增的两个用例 (完成实例与中断实例, 顶层 `function_call` 名为 `exec_command`, 有输出, 无命令执行条目) 得到 `succeeded`, 期望 `blocked`.
- 范围决定 (本机工作方式: 缺口来自 `ARW/inspectint` 提交前审核, 不含设计决定): 只补顶层调用名一种写法, 判定规则本身 (有输出且无条目即 `blocked`) 不变.
