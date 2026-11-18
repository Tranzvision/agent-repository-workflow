# Claude Code 上 Reviewer 默认用 GPT

## Problem Statement

Claude Code 平台上 `resolveReviewerSettings` 在配置的 `modelProvider` 不是 `anthropic` 时, 把整组设置换成 Claude 默认 (`haiku` `high`), 且不给任何提示. 全局配置写的是 `gpt-6-luna` `xhigh`, 在 Claude Code 里实际跑的却是 `haiku`. 用户 2026-11-19 的决定: ARW 调用的模型 (Reviewer, 后台 agent 等) 默认用 GPT, 不用 Claude, 主会话可以是 Claude Code (08:14); 在 Claude Code 上建议安装 Codex 作为后台 agent 与 subagent 的 harness, 并说明 Claude 的后台 agent 与 subagent 没有经过验证, 无法保证在 ARW 中的效果, 且 Codex 作为 harness 已证实效果更好 (08:24); 用户显式改用 Claude 时不阻拦 (08:17). 手册不提 benchmark 页面 (08:26).

## Solution

- Reviewer 设置在所有平台上按合成配置解析, 默认 `gpt-6-luna` `xhigh` 经 Codex 运行; 显式配置 `anthropic` 的角色照用.
- 仅当 Claude Code 中的 Main Agent 调用, 且管理进程的 `PATH` 上没有 Codex 可执行文件时, `modelProvider` 不是 `anthropic` 的角色回退到 Claude 默认设置, 并在启动 Reviewer 的成功结果里加 `notice` 字符串, 内容是建议安装 Codex, 说明 Claude 的后台 agent 与 subagent 未经验证, 以及 Codex 作为 harness 效果更好.
- 手册 (README 中英文) 写同样的建议, 只写结论, 不提 benchmark.

## Implementation Decisions

- `resolveReviewerSettings` 增加 `codexAvailable` (默认 `true`) 与 `onFallback` 回调; 回退条件为 `platform === 'claude-code'`, `codexAvailable` 为假, 没有隔离运行的显式覆盖 (有覆盖就按覆盖运行, 不回退, 无 Codex 时由 Codex 启动失败报错), 且合成结果的 `modelProvider` 不是 `anthropic`. 回退时调用 `onFallback`. `CLAUDE_REVIEWER_SETTINGS` 保留, 仅用于回退.
- 新文件 `arw-common/executable-path.mjs` 导出 `executableOnPath(name, environment, platform)`: 按 `PATH` 目录查找名为 `name` 的文件 (Windows 为 `name.exe`, 不接受 npm `.cmd` 包装, 与 README 对 Windows 的要求一致).
- 管理进程宿主 (`arw-background-agent-host.mjs`) 对 Reviewer 启动在 Claude Code 调用方时检查 `codex` 是否在 `PATH` 上, 回退时在 `runtime.execute` 的成功结果的 `result` 上加 `notice`. 提示只出现在解析设置的 Reviewer 操作 (`spawn_agent`, `followup_task`) 的成功结果里, 不改其他操作的输出.
- 判定"没装 Codex"只看 `PATH`; Codex 在 `PATH` 上但无法启动时沿用现有的 App Server 启动错误, 不静默回退.
- 回退的角色运行时不带该角色配置的 `env`: 宿主不给回退角色传 `programDirectory`, `claude-sessions.mjs` 仅在设置带 `programDirectory` 时注入该角色的 `env`, 见 Module Design.
- `reviewer-launch` Skill 的 Claude Code 一条改为: 设置按配置解析, 没装 Codex 时回退并带 `notice`, Main Agent 把 `notice` 转告用户. 长期规范 Installation 与 Machine entry 节, ADR 0032 同步.
- 本改动只影响 Claude 侧行为. 按用户 2026-11-19 08:15 和 08:17, Claude 模型能力被信任且不为 Claude 模型做测试, 所以不做 Reviewer 能力 A/B; 它也不改任何 Reviewer 审核时读取的文件.
- 其他模型调用核对: 后台 agent 的普通角色没有默认模型 (沿用原生默认), `DEFAULT_REVIEWER_SETTINGS` 本来就是 GPT; 除上述回退外代码中没有默认用 Claude 的地方.

## Testing Decisions

`tests/arw-common/config.test.mjs` 覆盖: Claude Code 且有 Codex 时按配置解析 (GPT); 无 Codex 时回退到 `haiku` 并调用 `onFallback` 一次; 显式 `anthropic` 角色在无 Codex 时不回退, 不调用 `onFallback`. `tests/arw-common/agent-cli.test.mjs` 覆盖 `executableOnPath` 找到, Windows 只认 `.exe`, `PATH` 缺失. 宿主接线由 `tests/background-agent/claude-sessions.test.mjs` 的宿主测试覆盖: GPT 配置的 Reviewer 在 `PATH` 为空时 `spawn_agent` 结果带 `notice` 且 Claude 后端以 `haiku` 运行, 回退运行不带角色 `env`; `PATH` 有 `codex` 文件时 `spawn_agent` 结果不带 `notice`, 由同一宿主测试覆盖.

## Out of Scope

不做 Reviewer 能力 A/B, 不改 `docs/agents/subagent-allocation.md`, 不新增 `doctor` 命令, 不在安装或 `arw workflow` 命令里检查 Codex.

## Module Design

### Modules

- Reviewer 配置解析 (`lib/arw-common/reviewer-configuration.mjs`): 唯一负责把全局, 仓库配置和覆盖合成 Reviewer 设置, 也唯一负责回退条件. 责任不变, 回退条件改变.
- 可执行文件查找 (新文件 `lib/arw-common/executable-path.mjs`): 只导出 `executableOnPath`, 唯一回答 "某可执行文件是否在 `PATH` 上"; 不读调用方身份 (那是 Platform Adapter 的责任, 与 `platform-environment.mjs` 无关), 也不属于 Agent CLI Launch Module (后者只启动已配置的 Agent CLI).
- 管理进程宿主 (`lib/arw-background-agent-host.mjs`): 唯一调用上述两者, 并把回退结果写成 `notice`.

### Interfaces

- `resolveReviewerSettings({..., codexAvailable = true, onFallback})`: 输入新增两个可选字段, 输出仍是设置对象, 不含回退标记; 回退发生时同步调用 `onFallback()` 一次, 否则不调用; 不抛新错误.
- `executableOnPath(name, environment = process.env, platform = process.platform)`: 返回 `Promise<boolean>`; `PATH` 缺失, 目录不存在或文件不存在都返回 `false`, 不抛错.
- `spawn_agent` 与 `followup_task` 成功结果 (Reviewer 启动或同身份新一轮, 都会重新解析设置): 仅在 Claude Code 调用方回退时多一个字符串 `notice` (长期规范 Machine entry 节记录); 其他结果, 其他操作 (`send_message`, `list_agents` 等), 失败结果不变.

### Seams and Adapters

不新增 Seam. 宿主直接调用 `executableOnPath`, 测试通过设置 `process.env.PATH` 控制.

### Dependencies and Data Flow

宿主 -> `executableOnPath` -> `resolveReviewerSettings` (回调) -> `notice` 局部变量 -> 成功结果. 依赖方向不变 (`arw-common` 不依赖宿主). 回退后的设置是 `CLAUDE_REVIEWER_SETTINGS` 的副本, `modelProvider` 为 `anthropic`; 回退角色是否注入 `env` 由宿主决定: 宿主只对没有回退的 Claude 设置传 `programDirectory`, `claude-sessions.mjs` 仅在设置带 `programDirectory` 时读取该角色配置的 `env` 并注入, 所以回退运行 (含全局 `modelProvider` 为 `anthropic` 而仓库覆盖为其他提供方的角色) 不带 `env`, 显式 `anthropic` 角色 (含仓库覆盖为 `anthropic`) 带全局配置中该角色的 `env`. 回退条件与 `env` 注入都由合成结果驱动, 不再另读原始全局 `modelProvider`.

### Module Design Rationale

回退条件只在配置解析一处; `PATH` 检查单独成一个只有一个导出的小文件, 不放进 Agent CLI Launch Module (责任是启动已配置的 CLI) 或 `platform-environment.mjs` (责任是读调用方身份), 各模块责任不变; 代价是多一个文件. `env` 许可用 "宿主是否传 `programDirectory`" 表示: `programDirectory` 本来就只服务于读取该角色 `env` (`claude-sessions.mjs` 是唯一使用者), 不新增设置字段, 也不改持久化设置的形状; 代价是这一隐式耦合, 由 `claude-sessions.mjs` 和宿主处的注释以及宿主测试 (回退运行不带 `env`) 固定. 备选: 给合成设置加显式 `keepEnv` 标记 (多一个持久字段, 本次不需要), 在宿主内联 PATH 检查 (少一个导出, 但不可单测), 或在 `arw workflow init` 时检查 (用户未选择该范围, 且 init 时刻与运行时刻环境可能不同).

### ADR Evaluation

ADR 0032 原结论 "Claude Code 中的 Main Agent 只有显式选择 `anthropic` 才会改用配置中的模型" 被本决定取代 (用户 2026-11-19), 同一 effort 内改写该 ADR 并记录取代原因; `spawn_agent` 结果新增的可选 `notice` 在长期规范 Machine entry 节记录, ADR 的 "JSONL 机器接口不变" 一句同步注明. 权威来源 (`PATH` 上的 `codex`) 是运行时观察, 不持久化, 没有恢复合同变化.
