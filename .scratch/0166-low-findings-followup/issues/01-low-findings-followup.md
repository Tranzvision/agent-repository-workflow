# 清理证据、预检与运行时中的低级发现

Status: ready-for-agent

## What to build

核对 11-21 分诊第 4-8, 12, 14-16, 18-19, 22-37, 39-43, 47, 50-51, 54, 56, 58-62, 65-72, 77, 80, 82 项和 11-20 分诊第 1, 7-8, 10-25, 27-31, 58 项. 以下为本次修正的具体范围, 括号内未标日期的编号来自 11-21 分诊.

- `lib/application-jira/application-jira-cli.mjs` 共用 issue 清单诊断和已登记路径解析 (4, 6). `lib/arw-common/config.mjs` 与 `lib/common/json.mjs` 共用正安全整数检查并简化配置错误转发 (12, 15). `lib/arw.mjs` 使用已有路径转换与类型明确的计划回调, 复用工作流用法错误集合 (19, 22, 23).
- `lib/background-agent/client.mjs`, `daemon.mjs`, `private-state.mjs` 共用控制凭据读取、nonce 格式、消息长度限制和 ENOENT 路径探测, 保留各端的所有权检查 (25-28). `manager.mjs` 共用已结束 App Server 的提供方租约清理, 管理代理调用其已定义的期限停止方法 (32, 33).
- `lib/commit-audit/commit-audit.mjs` 用已暂存的忽略规则筛选变更路径 (37). `lib/document-terms/document-terms-repository.mjs` 与 `document-terms.mjs` 统一路径清单校验, 直接拒绝含 NUL 的规则文件 (42, 43). `lib/installation/uninstallation.mjs` 按卸载参数错误及卸载结果类型报告退出状态 (50, 51). `lib/repository-workflow/workflow-lock.mjs` 直接调用现有旧版迁移 (54), `workflow.mjs` 在已准备的文件操作类型中要求预检预期 (77).
- `lib/reviewer-capability/scenario.mjs` 和 `scoring.mjs` 使用相同权重检查答案键的层级平衡 (56). `scenario.mjs` 和 `lib/reviewer-capability-setup.mjs` 共用场景 issue 路径及 Spec Readiness 输入路径的选择 (65, 66). `lib/reviewer-capability-run.mjs` 命名中断预留时长 (60). `scripts/reviewer-capability.mjs` 只为 `pool` 读取操作参数 (82).
- `lib/reviewer-runtime/reviewer-group.mjs`, `reviewer-measurement.mjs`, `reviewer-runtime.mjs`, `reviewer-session-record.mjs` 和 `lib/background-agent/codex-app-server.mjs` 清理重复的线程、运行身份、报告、测量及退出状态检查, 共用检查点保存和非负有限数校验. 保留任务接收后的报告绑定复查, 以及恢复记录的真实失败行为 (67-71, 11-20 第 10-11, 15-16, 18-19, 21-22 项).
- `lib/spec-readiness/precheck.mjs` 检查范围的最大行号和空文件, 跳过围栏示例. `lib/common/text-policy.mjs`, `lib/commit-audit/commit-audit.mjs` 和 `lib/reviewer-capability/evidence.mjs` 共用实际行数规则, 拒绝 EOF 之后的证据. Reviewer 场景复用生产 issue 对象提取. 两种就绪记录的提升共用 issue 路径身份检查 (72, 11-20 第 7-8, 27-28, 31 项).

其余编号按当前代码核对, 如涉及设计决定、外部输入契约或无法证明有净收益, 在交接报告记录原因. 保留有效的输入校验、失败处理和持久状态语义. 只更新描述已改行为的英文读者文档与变更日志. 若本批接近千行改动, 先交付已完成且可验证的范围, 其余留待下批.

预计净减 35 行非测试代码.

## Acceptance criteria

- [x] 通过逐项对照实现及调用方核实路由、运行时、文件系统和工具清理, 并在交接报告记录各项处置及原因.
- [x] 通过先失败后通过的定向测试验证行为修正, 并更新描述这些行为的英文读者文档及变更日志.
- [x] 在隔离的用户目录运行源码仓库完整验证, 记录三次完整测试的中位数及受改测试回调耗时. 预检和 Reviewer 运行时改动各有定向验证证据.
- [ ] 观察 `pnpm test:verbose` 三次完整测试的耗时中位数不超过 5 秒, 新增或改动的测试回调不超过 100 毫秒, 或在用例旁记录必要例外.

## Blocked by

- None - can start immediately

## Validation

- `pnpm test:verbose` 在隔离 HOME 重跑三次, 每次均通过 1063 项. Node 测试运行器报 6.143, 6.134, 6.130 秒, 中位数 6.134 秒. 命令墙钟中位数为 6.41 秒. 重启前同环境原始 HEAD 的 1059 项均通过, 三次中位数 6.307 秒. 默认测试命令的候选耗时仍超过 5 秒目标.
- 四个回归测试先按预期失败, 再全数通过. 重跑的三次完整套件中每个新增回调的最大值分别为 1.742, 36.950, 18.954, 5.150 毫秒, 覆盖证据末行、计分权重、带围栏的 issue 对象和预检越界警告.
- `node --test --test-isolation=none --test-reporter=spec tests/reviewer-runtime/*.test.mjs tests/spec-readiness/precheck.test.mjs` 通过 59 项. 后台 Agent 的 Codex、Claude Code、客户端、守护进程和管理器定向测试通过 166 项, 卸载测试通过 27 项. `node scripts/reviewer-capability.mjs baseline` 分别从 10 个归档文件重算 `code-standards`, `commit-audit` 和 `spec-readiness` 基线.
- `pnpm typecheck`, 受改 JavaScript 的 `node --check`, 分发生产检查, Claude Code 投影检查和安装引导脚本检查通过. 受改行为已同步到英文开发手册、Skill 用户手册和变更日志.
- `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0166-low-findings-followup/`, `git diff --cached --check`, `git diff --check` 和 Spec Readiness `verify --subject-only` 通过.

```text
code: -22 lines (files: 28)
  lib/application-jira/application-jira-cli.mjs -5
  lib/arw-common/config.mjs 0
  lib/arw.mjs -1
  lib/background-agent/client.mjs +1
  lib/background-agent/codex-app-server.mjs 0
  lib/background-agent/daemon.mjs -2
  lib/background-agent/manager.mjs -8
  lib/background-agent/private-state.mjs +7
  lib/commit-audit/commit-audit.mjs -2
  lib/common/json.mjs +6
  lib/common/text-policy.mjs +3
  lib/document-terms/document-terms-repository.mjs -11
  lib/document-terms/document-terms.mjs 0
  lib/installation/uninstallation.mjs -3
  lib/repository-workflow/workflow-lock.mjs -6
  lib/repository-workflow/workflow.mjs 0
  lib/reviewer-capability-run.mjs +1
  lib/reviewer-capability-setup.mjs -2
  lib/reviewer-capability/evidence.mjs +1
  lib/reviewer-capability/scenario.mjs -3
  lib/reviewer-capability/scoring.mjs -4
  lib/reviewer-runtime/reviewer-group.mjs -2
  lib/reviewer-runtime/reviewer-measurement.mjs -2
  lib/reviewer-runtime/reviewer-runtime.mjs +3
  lib/reviewer-runtime/reviewer-session-record.mjs -1
  lib/spec-readiness/precheck.mjs +7
  lib/spec-readiness/spec-readiness.mjs 0
  scripts/reviewer-capability.mjs +1
documents: +646 characters (files: 3)
  docs/CHANGELOG.md +352
  docs/manuals/development.md +185
  docs/manuals/skills.md +109
tests: +52 lines (files: 2)
  tests/reviewer-capability/reviewer-capability.test.mjs +37
  tests/spec-readiness/precheck.test.mjs +15
next ADR number: 0041
```

## Comments

- 预计净减 35 行, 实际净减 22 行, 超出净增预算 13 行. 保留了读取授权、真实的适配器失败分支及旧记录的校验边界, 并新增了预检的围栏及范围处理.
- 默认全量测试的三次中位数超过 5 秒, 原始 HEAD 也超过目标. 本次保留 issue 的活动状态, 交付已验证的代码清理.
- 代码标准审核和重启后恢复的要求符合审核均返回 `ready`, 报告均为 `No problems.`. 两者核对的是同一个暂存树.
- 11-21 保留的边界. 5, Application 同步是单仓库事务, 关联会跨仓库补偿. 7, 注入的 `inspectConvergence` 确实可选. 8, 快照同步可直接收到外部记录. 16, 异步存在性探测与可执行文件真实路径解析有不同要求. 24, 三个超时或中止清理分别拥有各自的连接和定时器. 34, SQLite 记录还原及新标识需要保持为安全整数. 40, `beforeReplace` 用例能触发替换竞态. 41, 诊断来源及严重性各有含义. 47, 安装和卸载已共用 `observePathState`, 各调用点保存各自的比较基准. 58, 未发现统计输出有重复行为或复用点. 59, 时钟可能回拨, 等待时间需要上限. 61, 中断失败有可恢复路径, 普通请求失败有终止语义.
- 11-21 留待后续. 14, 细化根目录或阻塞诊断会改变现有公开错误信息. 18, 统一配置分支需要明确空结果类型及检查顺序. 19, 余下结果投影适配不同的可选字段, 统一需要明确工作流返回类型. 29, Claude Code 生命周期重构需验证监听器、回调和恢复顺序. 30, 参数提取需覆盖交错的权限开关和环境配置. 31, 机器响应分派与等待及输出绑定耦合. 35, 暂停含义牵涉各角色的持久恢复. 36, 拆分需确定提示、配置和计时的所有权. 39, 公共配置转换需确定显式 `undefined` 和缺省键的含义. 62, 拆分运行编排需覆盖生命周期与失败顺序. 80, 归档传输需要 Windows 盘符和真实 VM 验证.
- 11-20 保留的边界. 12, 两个入口已经共用安全路径解析. 13, 检查点需要验证旧记录和外部身份. 14, 测量入口允许独立传入两个观测时刻. 17, 适配器配置及线程启动或恢复承担不同责任. 20, 任务接收和保留会异步完成, 发送前仍须复核报告路径绑定. 23, 恢复时策略可以延迟出现. 24, 退出、热暂停、冷暂停和停止有各自的持久原因与预期状态. 25, 清理形状相似, 回退与失败原因各异.
- 11-20 留待后续. 1, 就绪和软锁使用严格标题, 历史清单接受去除空白后的标题, 统一需先决定兼容行为. 29-30, 新文件的同行免查、文档相对路径和跨根歧义分别受当前契约约束. 58, 收紧轮次准备读取需定义旧记录和损坏记录的恢复结果.
- 台账: docs/manuals/development.md:165 冲突裁决 本次 Codex 交付指令明确限于英文行为说明, 指定中文同步交给 Main 在落地后排队. 开发手册的对应中文文件列入交接.
- 台账: docs/manuals/skills.md:92 冲突裁决 本次 Codex 交付指令明确限于英文行为说明, 指定中文同步交给 Main 在落地后排队. Skill 手册的对应中文文件列入交接.
