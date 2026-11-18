# 用 headless `claude -p` 运行 Claude Reviewer

ARW 要求在 Codex 和 Claude Code 中都能完整使用 `arw background-agent`. `./0016-use-repository-owned-agent-projection-configs.md` 曾把 Claude Code 的原生 Reviewer 执行定为暂停, `./0030-use-user-wide-background-agent-management.md` 只让用户级管理进程管理一个共享 Codex App Server. 本决定取代 ADR 0016 中 "Claude Code Reviewer 执行暂停" 的决定, 并把 ADR 0030 的管理范围扩展到 Claude 后端; 两份 ADR 的其他决定保持不变.

用户级管理进程按 Reviewer 设置选择后端: `modelProvider` 为 `anthropic` 时使用 Claude 后端, 其他提供方继续使用现有共享 Codex App Server. 两种后端实现同一 `NativeSessions` 接口, `arw background-agent` 的 JSONL 机器接口和 `arw lba` 的输出不变 (回退时 `spawn_agent` 与 `followup_task` 的 Reviewer 成功结果多一个可选 `notice` 字符串, 见 Machine entry 节). 所有平台默认 `gpt-6-luna` 和 `xhigh` 经 Codex 运行; 显式配置 `anthropic` 的 Reviewer 照用. 仅当 Claude Code 中的 Main Agent 调用且 `PATH` 上没有 Codex 时, 未选择 `anthropic` 的 Reviewer 使用 Claude 默认设置 (`modelProvider` 为 `anthropic`, `haiku`, `high`) 并在启动结果中带安装 Codex 的 `notice`.

Claude 后端没有常驻服务, 每个回合运行一个 headless `claude -p` 进程, 首轮用 `--session-id` 建立会话, 后续回合用 `--resume` 续接. 工作目录是审核仓库, `--tools` 只提供读文件, 写文件和 Bash 工具, `--allowedTools` 只放行 `arw background-agent` (供 Reviewer 发送中途通知), 只读 git 命令和编辑获准的报告目录, `--setting-sources ''` 和 `--strict-mcp-config` 不让用户或仓库设置与 MCP 扩大权限. 回合进程的输入方式, 运行中指示, 权限请求和中断由 `./0033-run-each-claude-turn-as-a-stream-json-process.md` 决定.

共享 App Server 生命周期, 模型目录合并和 Strata key 租约仍只属于 Codex 后端, Claude 后端不启动也不观察共享 App Server.

## Rejected alternatives

- 不使用 Claude Code 原生 subagent 运行 Reviewer. 它依附与用户沟通的 Main Agent 会话, 不满足独立根会话与跨调用方管理的要求.

## Consequences

Claude Reviewer 的权限依赖 Claude Code 的工具与权限规则, 是有界工作流保证, 不声称抵抗恶意运行环境. Claude Code 中的 Main Agent 按配置解析 Reviewer 设置, 默认 GPT 经 Codex 运行, 显式 `anthropic` 照用. 只有 `PATH` 上没有 Codex 时才对非 `anthropic` 的角色回退 Claude 默认设置并提示 (用户 2026-11-19: 默认用 GPT, 建议安装 Codex 作 harness, 用户明确改用 Claude 不阻拦). 这取代此前 "只有显式选择 `anthropic` 才改用配置中的模型" 的结论: 当时无法区分默认值与显式 Codex 设置, 现在由 Codex 是否存在决定回退, 与配置来源无关. 这是 ADR 0016 "不隐式覆盖用户选择" 的唯一例外 (只在 `PATH` 上没有 Codex 时, 且带 `notice`, 用户 2026-11-19 的决定); 带显式覆盖的隔离运行不回退, 按覆盖运行 (无 Codex 时 Codex 启动失败并报错), 保持 "隔离实例可以显式覆盖" 的合同.
