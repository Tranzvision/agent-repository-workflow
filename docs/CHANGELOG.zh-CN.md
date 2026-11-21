# 更新日志

[English](CHANGELOG.md) | [简体中文](CHANGELOG.zh-CN.md)

## 未发布

- 空的选项值会被拒绝, 读不出的 Spec Readiness `prepare` 输入会报告解析错误, 初始化后的 handoff 会转义清单文本.
- 配置会拒绝非对象的 `background.providers`. issue 解析器会拒绝格式错误的 `None` 阻塞行, 以及 Wayfinder issue 中的 External dependency. Commit Audit 不再把 Application Source Issue 当作实施 issue, 并拒绝编号相同的第二个 effort 目录, 忽略符号链接的规则文件.
- 后台 Agent: 启动失败会立即报告 spawn 错误, `followup_task` 会校验 settings, 批量消息失败时把其中每条消息都标为 unknown, 一个提供方租约归还失败不再阻止其余租约归还, 原生卸载只用一个期限, 已加载线程的发现能找到列在父线程之前的成员, resume 的记录路径变化时会取消订阅已加载的线程.
- 评审能力的 `inspect` 会检查已保存的 Antigravity CLI (`agy`) 无界面运行流中的工具名称, 路径和返回的答案键文本, 包括留有可用证据的中断运行.
- `arw commit-audit prepare` 在已暂存的代码改动使 Gate 1 为空时发出警告, 提示检查已完成 issue 的状态更新是否漏掉. 该警告只是建议性的.
- Spec Readiness 预检会报告超出文件末尾的行号范围, 并跳过围栏代码块中的路径示例.
- 评审能力评分会对照 Spec Readiness 审核对象中的真实行检查证据, 并使用生产环境的 issue 解析器查找审核对象边界. 答案键校验与评分使用相同的用例权重.
- 交互式卸载会把不支持的平台报告为卸载错误.
- Reviewer 能力设置会报告无法读取的 handoff 文件, 并在 Reviewer role 未知时不留下恢复目录.
- Release VM 检查在触碰 VM 之前, 会拒绝缺失的安装压缩包, 或无法读取或无效的检出包身份.
- Reviewer 能力评分会读取自由文本发现中的裸证据定位符, 包括方括号中的引用. Code Standards 格式基线现在包含其归档报告中恢复的定位符. Commit Audit 盲裁池为每个 Gate 使用不同的问题裁决. 要重新评分更早的 Commit Audit 报告, 请重新生成候选和池, 并重新裁决.
- 可以在 ARW 安装中用 `agy` 等命令行模型运行 Reviewer 能力测试集. `reviewer-capability` 命令可以检查配置, 规划调用, 在用量限制后续跑, 并用 SHA-256 校验和打包已完成的结果.
- 独立 Reviewer 只报告高和中严重性的发现. 正确性, 数据丢失, 安全和并发缺陷总是至少为中等严重性. 没有高或中严重性发现的审核, 在报告中返回 `No problems.`.
