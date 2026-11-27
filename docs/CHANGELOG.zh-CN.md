# 更新日志

[English](CHANGELOG.md) | [简体中文](CHANGELOG.zh-CN.md)

## 未发布

- Reviewer 能力运行在结果路径已有文件或符号链接时报告 `instance-write`, 保留已有数据.
- Reviewer 能力检查会报告 Claude 在实例外的写入与编辑, 包括对自身会话记录目录和系统目录的写入. Jira 子模块操作将形似选项的参数作为数据交给 Git. 后台 Agent 守护进程能识别经符号链接路径启动的入口.
- Reviewer 能力套件: 模型命令留下持有管道的后台进程时, 在命令退出 1 秒后结算, 不再记成超时; `run` 逐个比较已安装文件 (`ulimit -n` 为 1024 时不再 `EMFILE`); `--work` 位于 ARW 检出内时被拒绝; `pool split` 限制极大的证据行区间. 对 Claude 运行的 `followup_task` 不再检查 `CODEX_HOME`; Jira Module 切换分支时读不到 Git 状态不再抛错, 而是回滚.
- 配置编辑会拒绝含重复成员名的 JSON 对象, workflow lock 中的 Code Map root 必须是规范的仓库相对路径 (不带尾部斜杠, 盘符前缀或 NUL). Document Terms 把单独的 CR 算作换行, 并识别缩进至多三个空格的标题.
- 安装器: 用户删除 Windows PATH 值后重装会记录新的归属, 提供方迁移提示只在配置写入后出现, `release-manifest.json` 的 `configSeed` 必须是 `config.install.json`. 卸载器: 按卸载时观察到的值类型恢复 PATH, 只删除了空目录时报告 `partial`, 即使之后删除数据库失败也报告配置已移除, 不要求移除配置时容忍作为链接的 `config.json`.
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
