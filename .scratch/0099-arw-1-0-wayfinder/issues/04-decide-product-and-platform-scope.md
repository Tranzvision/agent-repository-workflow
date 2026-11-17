# 确定 ARW 1.0 的产品边界与 Agent 平台范围

Type: grilling
Status: resolved
Blocked by: issue:0099:01, issue:0099:03

##### Question

改为 Engine 驱动后, ARW 1.0 首版覆盖哪些仓库类型和工作流 (规划, 实施, 验证, Reviewer, 批准, 提交, Application/JIRA, 源码维护), 由 Engine 驱动哪些 Agent 平台: 只驱动 Codex, 还是同时驱动 Claude Code 并保持当前两平台完全对等? 与用户对话的 Main Agent 所在平台与 Engine 启动的 worker 和 Reviewer 所在平台是否必须相同?

## Answer

用户 11-07 的答复: "Engine 用代码里的确定性流程, 加 Jev 类模型做简单判断, 来驱动用户和高智能 Agent" 的理解没有问题; 平台上选两个平台对等, 并且两边都要支持本地或第三方模型. 因此:

- "以 Engine 为基础" 的含义已确认: ARW 1.0 的流程由 Engine 中的确定性流程加 Jev 类模型的简单判断推进, 由它驱动用户和高智能 Agent, 不再由 Codex 或 Claude Code 中的 Main Agent 读规则推进 (D24 之后, 简单判断是正在干活的 Agent 步骤输出 schema 的必填字段, 判断模型可选, 配了只做提示, 见 08).
- Engine 同时驱动 Codex 与 Claude Code, 两平台完全对等, 本地模型与第三方模型在两个平台上都要支持, 不接受 "本地模型只走 Codex" 这类已知差异. 当初候选方案中 "与用户对话的入口由 Engine 自己提供" 不在用户的解释里, 不算已定, 留在地图的 Not yet specified.

可行性依据见 [Claude Code 与 Codex 接入本地和第三方模型的路径](../research/agent-platform-models/report.md) (11-08 核对). 它更正了 [核对 Engine 控制 Agent 会话的平台能力](03-research-engine-session-control.md) 中 "本地模型只能挂在 Codex 后端" 的推论: Anthropic 文档明确不支持把 Claude Code 路由到非 Claude 模型, 但 Claude Code 只要求对端暴露 Anthropic Messages 格式; Ollama, llama.cpp, LM Studio, vLLM 以及多家托管模型厂商都提供该端点, 其中多家给出 Claude Code 配置, 维护者本机的 Strata 部署也已经用 Claude Code 实际跑过. 按进程设置环境变量即可让单个 `claude -p` 进程指向别的端点, 不影响用户自己的会话. Claude Code 一侧的风险写入后续合同: 不受官方支持, 每个版本可能新增请求字段使兼容端点报错, 只设端点不设凭据时订阅登录会随请求发出, thinking, 缓存和服务端工具的行为因端点而异. Codex 一侧仍只支持 Responses 协议的自定义提供方和 `--oss`.

### Operating systems

用户 11-14 (原话): "arw 1.0 先只支持 windows 和 linux 两种平台, 不支持 macos." 因此 1.0 首版支持的操作系统只有 Windows 与 Linux (glibc 与 musl 两类发行版, WSL 算 Linux), 不支持 macOS, 0.x 的 "实验性 macOS" 也不保留. 范围随之收窄:

- 安装与配置 ([确定判断模型与兼容端点的安装与配置](20-decide-installation-and-configuration.md)): 安装位置, 自启, 证书与防火墙步骤只写 Windows 原生, Linux 与 WSL, 不写 macOS 分支.
- 发布: 发布产物只覆盖 Windows 与 Linux (glibc, musl); Engine 用 Rust (07), 产物是各目标的原生可执行文件, 不要求安装 Node.js.
- 验证: 跨操作系统的安装与端到端验证只在 Windows 与 Linux (含一个 musl 发行版) 的虚拟机中进行, 不为 macOS 准备环境或测试.
- 以后要支持 macOS 时另开 issue, 首版设计不为它预留选项.

问题中的另外两部分尚未得到用户答复, 移到 [确定 ARW 1.0 首版覆盖的工作流与跨平台组合](17-decide-workflow-coverage-and-platform-mix.md).

## Comments

11-18 (任务 v1-scopeans): 按用户 11-14 "先只支持 windows 和 linux" 新增 Operating systems 节; 20 中提到 macOS 的一处同改.

11-18 (任务 v1-sync): Operating systems 节的发布一条, "构建目标随 07 选定的 Engine 语言定" 改为 Engine 用 Rust, 产物是各目标的原生可执行文件, 不要求 Node.js. 其余 (语音, 安装与配置) 与 Rust 和 1.0 范围无矛盾, 未改.
