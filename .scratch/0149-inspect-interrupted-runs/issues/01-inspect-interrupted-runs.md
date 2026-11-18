# 补检被中断的 Reviewer 实例

Status: completed

## What to build

让 `node scripts/reviewer-capability.mjs inspect <instance-directory>` 能检查 Reviewer 已停下但没有交付结论的实例 (中断实例: `agent.json` 的 `result.completion` 为 `null`, 来自超时中断或运行环境退出), 使超时实例可以按实际检查结果决定是否进入盲裁池. 合同见 `docs/specs/agent-repository-workflow-development/spec.md` 的 Reviewer capability suite 节 `inspect` 条目: 中断实例的记录缺 `task_complete` 或有没有配对输出的调用时不再整份 `blocked`; 没有输出的调用列入新字段 `unfinished` (`{position, text}`; 缺输出本身不是标记), 全部调用 (含未完成的) 照常做 `path`, `tool`, `answer-key` 检查; 成功结果新增 `interrupted`. 完成实例 (`completion` 不是 `null` 或没有该字段) 的规则与结果不变, 只多出 `interrupted: false` 与空的 `unfinished`. 确认 Reviewer 已停下是调用方的前提, `inspect` 不观察进程. 同步修改该长期规格的模块描述, 依赖段与测试覆盖段.

交付范围: `lib/reviewer-capability/inspection.mjs`, `tests/reviewer-capability/inspection.test.mjs` 与上述长期规格. `run` 只检查完成实例, 行为不变, 不改. 体积预算: 非测试代码净增不超过 15 行.

预期验证: 定向测试用合成记录 (不起 Reviewer, 管理进程或其他子进程) 覆盖下列情形, 再跑 `docs/agents/source-checkout-validation.md` 所列的源码仓库验证.

## Acceptance criteria

- [x] Codex 中断实例的记录缺 `task_complete` 且有一个没有输出的调用时, `inspect` 返回 `succeeded`, `interrupted` 为 `true`, `unfinished` 恰含该调用的行号与输入摘录 (不超过 200 个字符); 记录中已有的越界读取 (命令执行条目中的路径), 不允许的工具和含答案键的输出仍分别得到 `path`, `tool`, `answer-key` 标记, 调用缺输出本身不产生标记 (该调用用的是允许的工具时没有标记).
- [x] Claude 中断实例有一个没有 `tool_result` 的 `tool_use` 时, `inspect` 返回 `succeeded`, 该调用进入 `unfinished` (`text` 为其 `path` 检查所用的字符串输入), 其输入中的越界路径仍得到 `path` 标记.
- [x] Codex 中断实例中, 只有没有输出的调用用了 `tools.exec_command` 而没有命令执行条目时不 `blocked`; 有输出的调用用了 `tools.exec_command` 而没有任何命令执行条目时仍 `blocked`.
- [x] 同样缺 `task_complete` 或有未配对调用的记录, 在 `completion` 不是 `null` 或 `agent.json` 没有 `completion` 字段时仍 `blocked` (现有 `blocked` 用例不变); 完成实例的成功结果含 `interrupted: false` 与 `unfinished: []`.
- [x] 中断实例的其他 `blocked` 条件 (线程身份不符, 记录缺失, 记录行不是 JSON 对象, Claude 子 Agent 记录) 不变.

## Blocked by

- None - can start immediately

## Validation

- `node --test tests/reviewer-capability/inspection.test.mjs`: 12 个通过; 新增的中断实例测试覆盖 AC 1 到 5 (Codex 与 Claude 中断, `unfinished` 的行号, Claude 连接与空字符串, 200 个字符截取, `exec_command` 两种情形 (含整份记录没有命令执行条目时只有未完成调用用了它), `completion` 非空时的 `blocked`, 其他 `blocked` 条件, 含记录行是合法 JSON 但不是对象), 回调耗时约 54 毫秒; 完成实例的 `interrupted: false` 与 `unfinished: []` 由已有 clean 测试断言.
- `pnpm typecheck`, `pnpm test`, `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node --check lib/reviewer-capability/inspection.mjs`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0149-inspect-interrupted-runs/`, `git diff --check`: 全部通过.
- 体积 (`commit-audit prepare` 摘要), code 净增 2 行, 在预算 15 行之内:

```
code: +2 lines (files: 1)
  lib/reviewer-capability/inspection.mjs +2
documents: +2049 characters (files: 1)
  docs/specs/agent-repository-workflow-development/spec.md +2049
tests: +31 lines (files: 1)
  tests/reviewer-capability/inspection.test.mjs +31
```

## Comments

- 复现 (2026-11-19, 改动前): 在临时主目录中运行 `node scripts/reviewer-capability.mjs inspect <instance-directory>`. 合成的超时 Codex 记录有未配对调用时退出 1, 报 `1 tool call(s) have no output in the record.`; 移除未配对调用后仍退出 1, 报 `The Codex record has no task_complete entry.`; 两次标准输出都是 `{"status":"blocked"}`. 给同一份已配对记录补齐 `task_complete` 后退出 0. 一份真实的被中断 Codex 记录以 `turn_aborted` (`reason: "interrupted"`) 事件结束, 同样没有 `task_complete`.
- 合同决定 (Main 指派的 worker 拟定, 依本机工作方式视同确认, 维护者按 issue 复核整体 diff): 中断的判定依据取 `agent.json` 的 `completion` 为 `null`, 不取记录中的 `turn_aborted` (只有 Codex 有, 进程被直接终止时也没有), 也不要求 `agent.json` 显示已停下 (`run` 在发出中断后立即保存 `agent.json`, 那时运行多半仍在工作, 会迫使调用方改写 `agent.json`); 未完成调用列为 `unfinished` 而不是标记, 理由见长期规格.

台账: `docs/specs/agent-repository-workflow-development/spec.md:515` ADR Evaluation 中以 "`inspect` 对中断实例返回检查结果而不是 `blocked`" 开头的一句 冲突裁决 Spec Readiness 第 1 轮 ADR-EVALUATION gap 要求对 `inspect` 结果合同变化给出独立 ADR 结论, 该句复述的 "`run` 作废判定不变, 调用方决定能否进入盲池" 正是 "不改变授权主体或信任根" 这一 ADR 判据的依据, 不是对 336 行理由的重复; 按 effort spec 的 ADR Evaluation 要求保留.
台账: `docs/specs/agent-repository-workflow-development/spec.md:555` "中断实例的检查" 括注中以 "防止" 开头的从句 冲突裁决 Spec Readiness 第 2 轮 MODULE-DESIGN-INTERFACES gap 指出测试决定没有说明观察防止的错误, 这些从句是按该 gap 补的测试边界; 删去会重新打开该 gap, 按 effort spec 的测试决定要求保留.
- 既有缺口 (提交前 hydro-audit 报告, 改动前对完成实例同样存在, 不是本 issue 引入, 未修): 顶层 `function_call` 名为 `exec_command` (而不是 JS 中的 `tools.exec_command`) 的调用不受 "没有命令执行条目则 `blocked`" 规则约束; 是否另建 issue 交 Main 决定.
