# Reviewer 能力报告定位与 Commit Audit 裁决选项

## Module Design

### Modules

Reviewer Capability Module 负责把报告里的证据转为可计分定位, 把当前 Gate 的问题用例与专属决定一起交给盲裁, 并检查裁决是否属于该池项.

### Interfaces

`score` 对 Code Standards, Code Spec 和 Commit Audit 的自由格式 finding 从首词, 行内代码与正文读取定位. 正文接受带扩展名的路径及其正整数行号, 区间和同文件逗号列表, 也包括括号和方括号内的定位. 不把时刻与 URL 当作正文定位. 裸文件名仅在能唯一匹配一个冻结源文件且定位均在文件内时补全, 路径分隔符归一为 `/`, 重复定位只记一次. 裸定位提取不改报告或 finding 正文. 既有行内代码补全和规格就绪报告的读取方式沿用原规则. Commit Audit 归属沿用证据关联规则, 因此补回的政策文档定位可以让 finding 归到 Gate 2.

格式罚仍由 `score` 从登记的基线计算, `baseline` 核对归档与登记. 定位提取的修正使 Code Standards 的两份基线报告多出定位, 用同一批冻结报告重新计分, 只更新受影响的 `T`, `sumT`, `pBase` 与置信区间. 归档原件, 修复记录与场景指纹保持原值.

`score` 输出的 Commit Audit 发现候选的 `allowedDecisions` 和 `problemOptions[].decision` 使用 `problem-gate-1-N` 或 `problem-gate-2-N`, 其中 `N` 是当前 Gate 已有的题号. 每个选项仍绑定原期望句. 其他场景的 `problem-N` 和所有场景的关联, 干净用例及支持类决定沿用现有合同. `pool build` 对发现候选拒绝与其 Commit Audit Gate 不符的问题决定, 包括旧的无 Gate 编号, 返回 `blocked`, 不写池, 提示重新运行 `score`. 合成对照使用同样的 Gate 命名. `pool prompt` 使用 Commit Audit 简报指示按池项的 Gate 和当前选项期望句逐条判定. `pool split` 按现有允许值检查拒绝跨 Gate 的编号且不写裁决库, 通过后保存带 Gate 的值. `pool override` 接受该裁决条目允许的带 Gate 值. 旧简报裁决按同一摘要契约过期, 重算和重建池后重裁.

### Seams and Adapters

以 `score` 读取现有 Commit Audit 夹具及测试报告, 观察从括号和方括号恢复的规范化证据, 候选 Gate 与候选的题号和期望句. 以 `pool build`, `pool prompt`, `pool split` 和 `pool override` 使用合成裁决, 观察相同数字的跨 Gate 决定被阻断, 同 Gate 合法值可写入并复用裁决库, 以及旧候选须重新计分.

运行现有格式罚测试复算归档报告的 `r` 与 `T`, 以 `baseline` 核对更新后的登记与原始归档.

### Dependencies and Data Flow

自由格式报告中的定位进入现有的证据关联和计分. 各 Gate 按答案键生成带本 Gate 的决定及期望句, 经盲池交给裁判, 通过已有限制后写回裁决库, 后续计分按同一决定选项给分.

### Module Design Rationale

两关各自从 1 编号且可以收到同一 finding. 把 Gate 纳入决定值使现有允许值校验能发现跨关卡的编号复用. 保留题号和期望句的绑定, 让裁判逐项比较缺陷, 也避免重新排序或改写答案键. 单独在简报强调题号范围仍会让两个 Gate 的同号值通过校验.

### ADR Evaluation

答案键仍拥有题号, 期望句和证据关联. 候选允许值的变更与简报摘要绑定沿用现有裁决库结构, 已存结果保留原出处, 以后重新评分时通过既有机制重裁. 不引入新的持久记录或恢复操作. 长期合同随实现更新到开发规格的 Reviewer capability suite 节, 无需新增 ADR.

格式罚基线修正无需新增 ADR. 冻结的报告样本与场景指纹继续作为固定标尺, 格式罚公式及登记来源沿用. 同一批归档按修正后的计分器重算定位计数和派生值, 让报告与基线采用同一定位口径. 已发布分数按其记录的 ARW 提交及当时的基线解释. 要排除计分器版本差异来对比历史报告时, 用同一 ARW 提交重算各组. 重算条件和版本口径写入开发规格.
