# 清理 Strata 重复与死代码并修复已授权缺陷

Status: completed

## What to build

按模块处理 0132 的 A 至 D 清理与 0133 的七项行为缺陷. 每项先检查当前实现, 将适用项实施, 将越过本轮边界或已经消失的项记录在完成记录中. 本 effort 只有本实施 issue, 采用无设计决定的 Spec Readiness 例外.

- 安装模块: 复用配置和清单名称及诊断连接函数, 合并本地来源错误分类, 清理确认不可达的碰撞和配置检查, 重复参数及恒真条件, 从载荷读取启动器, 以局部变量保存路径注册决定. 核对写入边界文字和安装卸载协议重复.
- 公共模块: 核对 Git 树解析, 文件系统类型和路径解析重复, Markdown 行原语, 配置字节编辑器归属, 无调用的 JSON 路径删除函数, 无用 phase 和正则, 常规 Git 文件模式判断及运行时 recommendation 死分支.
- 工作流与检查模块: 核对锁字段校验和唯一排序, 私有导出及平台常量, 文档术语根目录和空白匹配及空策略重复, 配置诊断重复, 父目录推导, 安全规则读取, 术语全局候选表位置.
- 后台与 Application 模块: 核对 publicMessages 和 message 通知的死数据, 无消费者的 stage 和重复诊断类型.
- 文档: 修正规范的上下文豁免, 适用审核数量和规则编号归属, 同步两种语言开发手册的类型检查范围, 命令, 目录说明和重复文字. 根 AGENTS.md 的验证命令使用引用, 预算超出记录补充提交说明落点.
- 提交 Skill: 在 prepare 前增加文本, 术语及空白检查顺序, 同步分发与 Claude Code 投影.
- 行为缺陷: 先写失败测试复现标题围栏解析, check-ignore 错误丢失, 验收章节边界, ruleFiles 范围过滤, JIRA 标题围栏, Git 分支和 HEAD 状态以及 reconcileExited 清除暂停状态. 对未复现的项记录测试和结论.

预计体积: 非测试代码净增 -280 行, 测试净增约 100 行, 文档净增约 -400 字符, 总改动约 800 行, 控制在本轮 1000 行分组预算内. 预期验证: 各行为缺陷先失败后通过的定向测试, 完整 Source Checkout 验证和 Commit Audit, 然后提交. 边界包括混合和缩进围栏, 验收后章节, 被忽略的规则夹具, 超时与错误码, detached 和无提交仓库, 暂停任务退出; 清理以现有测试覆盖正常与错误路径.

## Acceptance criteria

- [x] 逐项核对 0132 A 至 D 的清理, 每项实施或记录证据和跳过原因, 观察: 差异及本 issue 的逐项记录.
- [x] 七项行为缺陷有先失败后通过的测试, 或有复现尝试与不修结论, 观察: 定向测试和逐项记录.
- [x] 清理保持输出, 公开 Interface 和持久状态, 授权行为修复符合测试预期, 观察: 完整测试与类型检查.
- [x] 文档及三份提交 Skill 内容一致, 观察: 分发检查和投影检查.
- [x] 记录预计与实际代码, 测试和文档体积, 超出预算时解释原因, 观察: 完成记录.

## Blocked by

- None - can start immediately

## Validation

- 七项行为修复均先失败后通过: artifacts 标题混合围栏, git-ignore 原始 EIO, precheck 围栏及下一章节, commit-audit 两平台忽略规则夹具, Application 完成 JIRA 围栏, submodule 分支错误与无提交 HEAD, Reviewer 暂停退出. 初次六项一起运行均在预期断言失败, git-ignore 单独失败; 无提交 HEAD 的额外回归也先失败. 新增回调定向实测均小于 100 毫秒.
- 定向受影响测试共 182 项通过. 卸载真实 CLI 夹具补齐新增的现有模块依赖并保持清单排序, 回调实测 83.1 毫秒通过.
- 完整 Source Checkout 验证通过: pnpm test 为 982 项全部通过; pnpm typecheck, 分发生产检查, Claude Code 投影检查, 安装引导脚本检查, 所有受影响 ESM 语法检查, text check, terms check --include .scratch/0138-strata-backlog/ 及 git diff --check 全部退出 0. 文档语言检查已核对: issue 为中文, 两份手册分别为英文和中文, 精确标识符保持原样.
- 预计改动约 800 行, 其中非测试代码净增 -280 行, 测试净增约 100 行, 文档净增约 -400 字符.

```text
code: +3 lines (files: 24)
documents: +378 characters (files: 8)
tests: +120 lines (files: 8)
next ADR number: 0041
```

## Comments

- 本轮 Main 预先裁定: 允许删除 lib/background-agent/** 中无人读取的 publicMessages, NativePublicMessage, message 通知及其他死代码; 若影响仍显示的消息则跳过. 允许 0133 七项行为修复. 排除 lib/arw-common/text-policy.mjs, lib/arw.mjs 和 lib/background-agent/machine.mjs, 其余清理保持行为.
- 本轮 Main 预先裁定: 不增加共享导出或 Interface, 不改变 CLI 文案或作出设计决定; 不符合者开始前跳过. 不进行能力 A/B 或盲裁, reconcileExited 只改变控制状态, 提交 Skill 只改变作者检查顺序.
- 本轮 Main 预先裁定: 审核发现 issue 自相矛盾时可修正文案并经正常命令刷新例外, 在同一 Reviewer 线程复审文案. 依赖提交本身的验收项可在实施提交后用非实施提交记录真实提交号. 线程无法恢复时重开并完整两轴审核. 未复现项只记录. 大候选有问题的部分可记录撤下, 最多三轮.
- Main 按仓库例外确认上述 AGENTS.md, 规范, 手册与提交 Skill 修改内容, 保留已有合同并消除重复和不准确文字.

### Cleanup A

- 配置名称复用 CONFIG_FILE_NAME, 卸载清单复用 INSTALLATION_MANIFEST_FILE; 安装碰撞列表中的清单名因检查已前置而删除. 三个安装文件的相同诊断连接改用已有 diagnosticMessages; loadLocalSource 三步失败分类用局部助手合并, 其余不同的无文件和身份诊断保持原样.
- 安装注册路径决定改用局部 registerPath, existingManifest 非空已蕴含 existing.managed, 删除后者. 保留 assertSafeConfigurationTarget: 它在写入前重新检查链接与非文件, 与早先的读取不是同一时点. 保留 managedFiles 和 overwriteFiles: 前者检查目录链, 后者检查被覆盖文件, 责任不同.
- 跳过从 payload 读取启动器: 现有返回值没有启动器列表, 需要增加 Interface. 跳过 writeBoundary 阶梯合并: stage 无法表达配置和 PATH 部分写入后的现有提示. 跳过安装卸载协议提取: 需要新共享导出.
- workflow-lock 的私有常量和函数去掉 export, 重复平台数组合并, 删除路径唯一后无用的排序后备条件及已被迁移分派保证的版本检查. 保留 assertRecord: 精确字段集选择前读取 kind 和 strategy, 删除会改变非法输入诊断.
- document-terms 合并 ASCII 空白表达式及未提供和非文件策略的同一诊断. 保留 Git 根再次发现: 公开仓库打开边界不能信任调用方的规范化结果. 两条 text-policy 重复按本轮排除范围跳过.
- AGENTS.md 验证命令清单改引用, 没有 issue 的预算超出说明写入提交说明; 分发副本按现有投射同步.

### Cleanup B

- 跳过后台 publicMessages, NativePublicMessage, message 通知删除: 要求符合审核指出长期规范仍要求此 Adapter 合同, 按本轮预授权撤下该部分, 原实现与测试完整保留.
- 跳过 Git 树解析合并: 当前解析器分别允许 blob 与 commit, 错误协议也不同, 复用需要增加参数 Interface. 跳过窄文件系统类型替换: 现有适配器只承诺窄签名, 共享完整类型不兼容; 类型检查已验证, 最终保持原类型.
- createDirectory, write, remove 的路径解析前置合并为私有助手, 保留各操作原有错误文字. 跳过 Markdown 原语和配置字节编辑器模块迁移: 将建立新共享导出及模块边界.
- deleteJsonPath 虽无生产调用, 长期开发规范仍定义其公开合同; 按本轮预授权撤下删除, 原实现和全部测试保留. 删除 RepositoryFilesystem 的无消费 phase 参数, 未引用 PATH_SEGMENT_PATTERN; artifacts 及术语仓库复用 isRegularGitBlobMode.
- 跳过 runtime recommendation 删除: 现有测试断言此返回字段, bootstrap 有消费者, 删除改变 Interface, 且 lib/arw.mjs 已排除. 跳过两份私有 configurationParseDiagnostics 和父目录助手提取: 都需要新共享导出. 跳过 removalPreview 查表: 原建议同时改变未知类别错误及 CLI 文字.
- 跳过 workTreeRuleFiles 安全读取替换: readSafeRepositoryFile 将 ENOENT 包装为通用错误, 破坏已删除规则文件的跳过行为; 完整套件发现后撤回此项, 保留原读取及其现有删除回归测试.
- 术语全局候选编译移到文档循环外, 每个文档保留自身局部候选合并和排序.
- 跳过 Application stage 删除: application-jira-cli.mjs 的失败输出仍读取 stage. 跳过 25 处诊断输出统一: 会改变前缀并需要新共享导出. 七个相同诊断类型改引用 FilesystemDiagnostic.

### Cleanup C and D

- 规范明确 CONTEXT-MAP 列出的根 CONTEXT.md 同样豁免, 去掉适用审核的错误固定数量. 跳过 ARW-DOC-006 和 ARW-TEST-008 归属: 现有规范未定义, 无法在不作设计决定的情况下编造或废弃编号.
- 两份开发手册同步类型检查排除范围, pnpm test 已含投影检查, score 必要参数, release-vm 的归档及夹具来源, .claude 和 .codex 目录, 术语数量文字及依赖层次引用. 删去重复的手册边界声明; 保留后续章节的具体导航链接, 它们指向各节实际使用的权威资料.
- 提交 Skill 自查顺序已在源, distribution 和生成的 .claude 三份同步; 仅作者检查顺序变化, 无 Reviewer 能力变化, 按本轮授权不做能力 A/B 或盲裁.

### Behavior fixes

- firstHeading 复用 Markdown 围栏状态机, 识别字符, 长度和缩进; check-ignore 保留原始 EIO 或超时诊断, 删除吞错替换.
- precheck 使用去围栏的 issue subject, 验收区间止于下一二级标题; 规则夹具在 Codex 和 Claude Code 的冻结 ruleFiles 中都按 ignore 范围过滤.
- readJiraKey 仅识别围栏外 H1; Git symbolic-ref 的 1 表示 detached, 其他错误保留失败分类, rev-parse --quiet 的 1 表示无提交并给出专用诊断.
- reconcileExited 通过 finishTask 清除 paused 和 resumeMessageId. 已有恢复测试发现不能凭恢复时刻伪造 finishedAt, 因此保留 observedExitTime 条件; 两项恢复回归及新增退出案例均通过.

### Budget

- 实际非测试代码净增 3 行, 比 -280 行预算多 283 行; 文档净增 378 字符, 比 -400 字符预算多 778 字符; 测试净增 120 行, 比约 100 行多 20 行. 已保留的清理均直接合并既有重复; 更多删除会越过行为或 Interface 边界. 三份提交检查文字及双语手册补充占文档增量, 必要缺陷覆盖和卸载夹具依赖占测试增量, 因此不再削减. 按增加加删除计算, 交付代码改动 283 行, 测试 120 行, 文档 60 行, issue 与就绪记录 122 行, 合计 585 行, 在 1000 行分组内; 对比预计总约 800 行. 清理保留了仍有消费者或需增加 Interface 的项目, 因此实际删除量少于原预计. 本轮未实施额外台账条目, 未修改排除的三个文件及原 0132, 0133 effort.

### Commit Audit round 2

- Code Standards 五项报告逐项独立核对: 默认 git diff --check 不覆盖暂存差异属实, 在作者自查保留工作树检查并增加 --cached 检查, Main 按仓库例外确认三份文字修改. ruleFiles 过滤过宽属实, 新增根规则及固定 Reviewer 指令被忽略的反例先失败, 改为始终保留根和固定指令, 嵌套 AGENTS.md 仅按实际受审路径选择. 尾随空格属实, 同时清理本 issue 的记录行尾.
- 台账: lib/repository-workflow/workflow-lock.mjs 的 normalizeLegacyLock 路径排序后 canonicalObjectId 比较 记录不修 唯一路径使后备条件无效, 问题成立; 本次下一次 prepare 已是第 3 轮, 按 fix-rounds 规则不再为重复清理开修复轮, 保留该局部清理余项.
- 台账: lib/arw-common/artifacts.mjs 的 firstHeading 中 if (!fenced) 条件 记录不修 continue 后条件恒真, 问题成立; 第 3 轮起仅修行为缺陷, 保留该局部冗余条件.

- 复审修复验证: 两平台规则反例先失败, 修复后单回调 60.1 毫秒通过; 完整 pnpm test 再次 982 项全部通过, typecheck, 分发, 投影, 引导脚本, 语法, text, terms 及两种 git diff --check 均通过.

- 要求符合审核两项均经独立核对成立: 开发规范的 JSON values and configuration conversion 节明确要求 deleteJsonPath; 总规范 Native Session Adapter 合同仍定义公开消息快照及通知. 按本轮 Main 对大候选问题部分的预授权, 撤下 JSON 删除和后台公开消息清理, 恢复原实现与测试, 无规范或设计变更. 两项作为已筛选跳过记录, 不留未确认实施要求.
- 本轮独立回归抽查: 已删除工作树规则文件仍由原读取逻辑跳过; firstHeading 围栏字符及长度交叉案例保留; 暂停退出修复保留未知退出时刻的恢复测试. 上述位置与两份报告逐项核对后, 才准备下一轮.

- 最终预算变化还包括撤下两个仍受规范约束的删除部分, 因而保留其原代码和测试.

- 撤下部分后的完整验证仍为 982 项测试全部通过; 类型, 分发, 投影, 引导脚本和受影响语法检查通过.

### Commit Audit round 3

- 两个原 Reviewer 线程均正常结束为 ready. 要求符合报告为 No problems. Code Standards 仅报告锁排序后备比较; 上轮台账位置因本轮清除尾随空格而被触及, 本轮重新独立确认其无效但不影响可接受输入.
- 台账: lib/repository-workflow/workflow-lock.mjs:320-323 的 normalizeLegacyLock 排序表达式中 canonicalObjectId 后备比较 记录不修 第 3 轮仅修行为缺陷; 此比较只影响随后被 assertUniquePaths 拒绝的输入, 属重复清理, 不再开修复轮. 原 firstHeading 冗余条件的台账未被本轮变化触及, 继续有效.
- 本轮回归抽查: 已恢复 deleteJsonPath 及其原型路径测试, 已恢复 Native Session Adapter 公开消息合同; 冻结规则选择保留根和固定指令并按实际受审路径保留嵌套指令. Reviewer 暂停退出仍保留原有未知 finishedAt 恢复语义. 没有发现使本轮结果失效的漏检.
- 最终检查结果由提交前运行的 commit-audit verify 与 spec-readiness verify --subject-only 取得; 全部实现和验收状态在受审树内固定, 本次收尾只补充记录.
