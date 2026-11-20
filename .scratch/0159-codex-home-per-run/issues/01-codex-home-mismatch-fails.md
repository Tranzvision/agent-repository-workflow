# 运行指定的 CODEX_HOME 与后台管理进程不一致时明确失败, 不静默用错账号

Status: completed

## What to build

来源: ARW/acctprod (本机 acct100 报告). 无设计决定交用户 (单 effort 单 issue, 见 Comments), 不写 spec 章节之外的 spec. 缺陷: 后台管理进程每个 (用户, HOME) 一个, 它起的 Codex App Server 沿用启动者的环境, 所以某次运行设的 `CODEX_HOME` 不生效, 运行静默记到管理进程所在账号 (复现: 管理进程由无 `CODEX_HOME` 的环境启动, 客户端设 `CODEX_HOME=~/.codex-100` 运行最小 Reviewer, 会话落在 `~/.codex/sessions`).

范围判定: spec `Background Agent control` 规定至多一个共享 App Server, 其模型目录是进程级配置且不能按请求切换, 没有 "每次运行指定账号"; 按运行切账号要么多个 App Server (改规格, 容量, 维护), 要么重启共享 App Server (打断别人的运行), 都属新的产品决定, 不在本 issue. 本 issue 只去掉静默:

1. 客户端 (`runBackgroundAgentMachine`) 在调用上下文 `caller` 里带上自己的 `codexHome` (`codexHomeLocation` 解析, 未设 `CODEX_HOME` 时为 `~/.codex`).
2. 管理进程的 `dispatch` 对 `spawn_agent` 和 `followup_task` 比较 `caller.codexHome` 与自己环境的解析结果 (都经 `realpath`), 不同则以失败响应返回 `Background Agent manager runs Codex with CODEX_HOME <管理进程的>, but this run asks for <本次的>. ...`; 设置的模型提供方为 `anthropic` 的运行不受影响. 旧客户端不带 `codexHome` 时不检查.
3. spec `Background Agent control` 节, `README.md` 与 `README.zh-CN.md` 写明这一限制和另一个账号的做法 (另一个 `HOME` 有自己的管理进程).

体积预算: 非测试代码净增不超过 12 行.

预期验证: `pnpm test` 三次中位数 <= 5 s, 新增用例 <= 100 ms; `pnpm typecheck`; `node scripts/check-workflow-distribution.mjs`; `node scripts/project-claude-skills.mjs --check`; `node scripts/generate-install-arw.mjs --check`; `node arw.mjs text check`; `git diff --check`.

## Acceptance criteria

- [x] 管理进程环境 `CODEX_HOME=A` 时, `caller.codexHome=B` 的 `spawn_agent` 失败并在消息里写出 A 和 B, 不启动原生线程; 指向 A 的符号链接则成功 (测试: `tests/background-agent/host.test.mjs`).
- [x] `runBackgroundAgentMachine` 发出的 `caller` 含 `codexHome` (真实管理进程冒烟: 管理进程环境无 `CODEX_HOME`, 客户端设 `CODEX_HOME=~/.codex-100`, 最小运行报上述失败而不是记到 `~/.codex`).
- [x] spec 与两份 README 含该限制的说明.

## Blocked by

- None - can start immediately

## Validation

- 复现: 临时 HOME 安装当前源码, 管理进程由 `CODEX_HOME=<A>` 的客户端启动, 另一个客户端设 `CODEX_HOME=~/.codex-100` 运行最小 Reviewer: 修前由 acct100 报告证实会话记到管理进程账号; 修后真实管理进程返回 `Background Agent manager runs Codex with CODEX_HOME <A>, but this run asks for /home/pello/.codex-100.`, 未调模型; 另在管理进程环境 `CODEX_HOME` 为空 (回退默认 `.codex`) 的临时 HOME 重做, 失败消息写出 `<临时 HOME>/.codex` 与 `/home/pello/.codex-100` (验收第 2 条).
- 提交审核: 第 1 轮 Code Standards 两条属实已修 (检查移到创建 Reviewer 运行时之前, 变量改名); 第 2 轮要求符合审核要求补记验收指定的无 `CODEX_HOME` 场景, 已补记, Code Standards 无问题.
- 失败测试先行: 去掉比较后 `host.test.mjs` 新用例失败, 恢复后通过 (验收第 1 条).
- `pnpm test` 三次 3.72 s, 3.62 s, 4.01 s (中位数 <= 5 s), 新用例 16 ms; `pnpm typecheck`, `check-workflow-distribution`, `project-claude-skills --check`, `generate-install-arw --check`, `arw text check`, `arw terms check`, `git diff --check` 通过.
- 体积 (预算: 代码 12 行, 实际 11 行):

```
code: +11 lines (files: 2)
documents: +1415 characters (files: 3)
tests: +18 lines (files: 1)
```

## Comments

- 范围 (本机工作方式): 不含需用户决定的设计 (只把静默错误改为明确错误, 不改容量或进程模型), 单 effort 单实施 issue, Spec Readiness 按用户 2026-11-02 常设确认记录 `not-applicable`. 按运行切账号 (每账号一个管理进程, 或空闲时重启 App Server) 是产品决定, 交 Main 排 `decide`.
- 次序: 代码与失败测试先于本 issue 文件写成 (worker 在已授权的 ARW/acctprod 任务内, 先复现后修, 提交前补建 issue 和例外记录).
