# 确定 ARW 1.0 规范的归属与交付形式

Type: grilling
Status: resolved
Blocked by: issue:0099:04

##### Question

尚未实施的 ARW 1.0 规范放在哪个仓库或目录作为权威来源 (当前仓库的 `.scratch` 之外), 读者怎样区分拟议的 1.0 行为与当前生效的 ARW 规则? 规范定稿后的审查走 Spec Readiness 还是一次独立审查?

## Answer

用户 11-09 选了 "单独克隆的 `arw-1.0` 分支, 写在将来生效的位置, 合并回 main 时生效" 加独立审查. 用户 11-14 改定 1.0 是新建的独立仓库, 从新目录重写 (见 [确定 ARW 1.0 首版覆盖的工作流与跨平台组合](17-decide-workflow-coverage-and-platform-mix.md) 与 [确定现有 ARW 合同在 1.0 中的继承范围](13-decide-legacy-contracts.md)), `arw-1.0` 分支随之失效. 用户 11-15 (D35, 选 A) 定: 现在就在维护者本机建 1.0 的新仓库, 暂不建远程, 规范正文直接写在其中将来生效的位置; 仓库名与 GitHub 仓库在实施前经用户同意再定.

- 权威来源: 1.0 新仓库中的长期规范与治理文档. 新仓库与 ARW 仓库历史独立, 不从 ARW 的 main 派生, 也不合并回去. 读者区分拟议与现行规则的方式是仓库本身: ARW 仓库里没有 1.0 的文字, 当前 ARW 的 Agent 和 Reviewer 不会读到它; 新仓库里只有 1.0 的文字. Main Agent 11-15 已建好该仓库 (清空原克隆目录后重新初始化, 首个提交只有说明仓库用途的 `AGENTS.md` 与 `CLAUDE.md`).
- 未采用: 先写在原克隆的 `arw-1.0` 分支, 新仓库建好后再搬 (要改一遍路径与结构, 旧仓库历史里也多一份); 放在本 effort 的 `spec.md` 或 `.scratch` (以后实施的 effort 每次读它都要用户授权, 旧 effort 还可能被清理); 放在 ARW main 的新目录并标 "拟议" (11-09 已放弃: 容易被 Agent 和 Reviewer 当成现行规则).
- 审查: Spec Readiness 针对的是授权单个实施 issue 的就绪审核, 不适合整份规范. 规范正文写完后整体走一次独立审查, 审查者的模型与推理强度不低于 Main Agent; 规范篇幅大, 按章分片审查, 最后做一次全局一致性审查. 审查通过即本地图的 Destination 达成.
- 之后: 规范通过后的每个实施 issue 照常走 Spec Readiness 和提交审核.

## Comments

11-18 (任务 v1-scopeans): 按用户 11-14 "arw 1.0 新建独立仓库" 与 11-15 D35 (选 A) 改写 Answer 的权威来源与未采用两条; 原 11-09 的 `arw-1.0` 分支做法失效. 审查与之后两条不变.
