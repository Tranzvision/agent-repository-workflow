# 确定 ARW 1.0 首版覆盖的工作流与跨平台组合

Type: grilling
Status: resolved
Blocked by: issue:0099:04

##### Question

两平台对等已定, ARW 1.0 规范覆盖哪些仓库类型和工作流 (规划, 实施, 验证, Reviewer, 批准, 提交, Application/JIRA, 源码仓库维护如发布, 能力测试, 上游同步): 规范是否覆盖全部现有工作流, 首版实施先做哪一部分, 未覆盖的部分在过渡期间怎样与 Engine 驱动的流程共存? 与用户对话的 Main Agent 所在平台, 与 Engine 启动的 worker, Reviewer 和本地或第三方模型所在平台是否必须相同, 还是由 Engine 按角色组合?

## Answer

用户 11-08 对两部分分别答复.

工作流覆盖 (用户原话): "规范覆盖全部现有工作流, 一次做完, 不需要共存. 1.0 不急着上线, 也不会影响现有的发布, 我建议你新开分支来实现, 然后定期拉取 main 分支的新内容, 等完全实现后, 再合并到 main 分支." 因此:

- ARW 1.0 规范覆盖问题中列出的全部现有工作流, 不分首版与后续版本, 也不设计 Engine 驱动流程与现有规则驱动流程的过渡期共存.
- 规范定稿并审查通过后进入实施, 在此之前现有发布不受影响. 实施方式按用户 11-14 的改定 (原话: "我建议 arw 1.0 不要沿用之前的工程, 从新目录开始构建." "arw 1.0 新建独立仓库, 老用户不会升级到 1.0, 只会卸载之前的版本然后安装它."): 1.0 是新建的独立仓库, 从新目录重写, 不继承 ARW 现有代码, 也不定期合入 ARW main 或合并回去; 原定 "单独分支实现, 定期合入 main, 全部实现后合并回 main" 作废. 规范正文与之后的实现都在这个新仓库中 (规范位置见 [确定 ARW 1.0 规范的归属与交付形式](06-decide-spec-home.md)), 仓库名与 GitHub 仓库在实施前经用户同意再定. ARW 现有的规则, spec, ADR 与 Skill 只作历史参考, 确有必要才迁入, 不约束 1.0 (见 13 与 21). 老用户不从 0.x 升级, 而是卸载旧版后全新安装; 已采用仓库与进行中 effort 的处理见 13. 实施不属于本 effort, 见地图 Destination.

平台组合 (用户原话): "你说的平台是 harness 吗? 也就是 codex 和 claude code. 如果是的话, 那么应该是 engine 负责和我对接, engine 把我的话发给哪个 harness, 那是它的工作. 比如用户选择 gpt 模型作为 main agent, 那么接到我的话的, 就应该是 codex. 然后 engine 可以控制多个 harness, 每个 harness 启动自己可用的模型." Main Agent 已向用户确认这里的平台即 harness (Codex 与 Claude Code). 因此:

- 与用户对话的入口由 Engine 提供. 这补上了 [确定 ARW 1.0 的产品边界与 Agent 平台范围](04-decide-product-and-platform-scope.md) 中未定的一点.
- Engine 按用户选择的 Main Agent 模型决定由哪个 harness 接收用户的话 (选 GPT 类模型即 Codex, 选 Claude 即 Claude Code). 各角色 (Main Agent, worker, Reviewer) 所在的 harness 不要求相同, 由 Engine 按角色选择的模型组合; Engine 可以同时控制多个 harness, 每个 harness 只启动它自己能用的模型, 含经兼容端点接入的本地或第三方模型.
- 用户对话入口与 harness 路由的具体形态归入 [定义 Engine 驱动流程的运行合同](07-define-engine-runtime-contract.md); 不设过渡期共存这一点约束 [确定现有 ARW 合同在 1.0 中的继承范围](13-decide-legacy-contracts.md).

## Comments

11-18 (任务 v1-scopeans): 按用户 11-14 "从新目录开始构建" 与 "新建独立仓库" 改写工作流覆盖部分的实施方式: 不再在单独分支实现并合并回 main. 覆盖全部现有工作流, 不设共存与平台组合两部分不变.
