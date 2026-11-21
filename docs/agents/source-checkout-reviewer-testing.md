# Source Checkout Reviewer 能力测试

Reviewer 能力测试在维护者显式调用 `$reviewer-capability` Skill 时进行; 改动 `AGENTS.md` 所列 Reviewer 规则 (其中 Reviewer 运行时指原生工具, 权限, 沙盒, 上下文, 默认模型与设置) 时, 也视同维护者已调用: 用受影响角色的能力场景对比改动前后, 接受或拒绝按 `reviewer-capability` Skill 的 A/B 判定规则. 速度提升很大 (由 Main Agent 判断), 而该规则拒绝或候选均值低于对照时, 交用户决定. Main Agent 判断 Reviewer 运行时改动频繁 (逐次测试跟不上改动) 时可以减轻测试: 只用受影响角色的一个场景, 或把几次改动合并为一次测试 (对比最早一次改动前与最后一次改动后; 合并几次由 Main Agent 判断, 以出现拒绝时仍能二分为限). 只删除重复表述或改为引用, 不改变任何规则含义的改动不做能力测试. 改动的文件没有任何 Reviewer 在审核时读取的 (如只改 Main Agent 侧复审处置的 `commit` Skill 文件), 不做能力 A/B (Reviewer 输入不变, A/B 两组相同).

## Report range

改 Reviewer 报告范围 (报什么级别, 不报什么) 的 issue 在同一 issue 中: 按 `reviewer-capability` Skill 的严重度定义更新受影响场景答案键的 `severity`; 写明 A/B 两格各自的报告范围 (`summary --report-range`); 给出题量表 (每个受影响场景范围内各级问题题数与干净题数); 改动声称不影响的级别在某场景少于 5 道问题题时补题, 或在 issue 写明不补的理由. Reviewer 规则需要级别定义时引用该 Skill 的定义, 不另写一份.

## 待测项

Reviewer 当作审查标准读取的通用指令 (根 `AGENTS.md`, `issue-tracking` 等角色整份读取的文件) 中, 增删或改变 Reviewer 所应用检查项的改动 (放宽也算) 不单独测, 由 Main Agent 判断后登记在下表; 只改措辞, 移动, 精简而不改检查项的不登记. 触发一次 A/B (对照为在当前版本中只还原待测项, 候选为当前版本) 的条件, 先到者为准: 下一次因直接 Reviewer 规则改动做 A/B 时一并测; 表累积到 3 项; 最早一项已登记满 14 天. 接受后清空表. 拒绝, 或候选均值低于对照 (不论是否被接受) 时二分: 在候选中还原一半待测项重测, 逐步缩小到有影响的项, 该项交用户决定.

| 提交 | 文件:行 | 改了哪条检查 | 登记日期 |
|---|---|---|---|

`b42278c` 与 `9e12759` 已于 2026-11-20 由 capretest 的 F4 臂 (luna xhigh, 对照为还原这两项) 测过, 用户决定保留, 表已清空.
