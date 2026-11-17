# 工作流运行效果离线记录 (Effect Log)

## Problem Statement

维护者想知道 ARW 工作流在真实使用中效果如何: 一个 issue 从开始到提交用了多久, 每道关卡审了几轮, Reviewer 报了多少问题又有多少最终没有改, 后台 Agent 的任务是否成功, 是否经常要恢复, 安装和发布验证花了多少时间. 这些事实今天都只存在于会话里或散在人工写的文字报告中: 关卡的 `prepare`, `generate`, `verify` 都由 Engine 执行, 却不留下可统计的痕迹; 后台管理进程知道每个任务何时结束, 却只保存当前状态, 不保留历史. 离线统计因此只能从自由文字里猜, 无法区分 "没有发生" 和 "没有记录", 也无法保留完整分母.

## Solution

增加一个默认关闭的离线追加日志 (Effect Log): 用户在全局 `config.json` 里设置一个目录后, Engine 在自己已经亲眼看到的事件上向该目录追加一行 JSON, 事件包括关卡的轮次与结果, 后台 Agent 任务的结束与接续, 安装结束, 发布验证结束. 日志只观察不控制: 没有任何关卡, 授权或 `verify` 读取它; 关闭时没有任何文件写入, 也没有行为变化; 写入失败只告警, 不改变宿主命令的结果. 日志文件是稳定的数据合同, 供本机的统计工具离线读取; 统计口径 (阈值, 项目归并, 指标换算) 属于读取方, 不属于 ARW.

只有 Engine 能亲眼看到的事实进入这个日志. 需要 ARW 之外的数据源的事实 (Strata 审核循环的分诊, 本机 Codex 套餐窗口的采样, 各机器的发布环境) 由各自的本机工具按同一信封格式写入同一目录, ARW 既不写入也不校验这些记录, 读取方忽略自己不认识的类别.

## Implementation Decisions

### Switch and location

全局 `config.json` 增加可选对象 `effectLog`, 只有一个字段 `directory`, 必须是非空的绝对路径文本; 对象缺失时功能关闭. 它与 `backgroundAgent` 等全局字段同样只由用户拥有, 不接受仓库配置或单次命令覆盖, 因为日志属于使用者本人对自己使用情况的记录, 不应由仓库内容决定是否记录或写到哪里. `effectLog` 不是对象, 含 `directory` 之外的字段, 或 `directory` 不是非空绝对路径时, 全局配置的唯一校验权威 (`../agent-repository-workflow-installation/spec.md` 列出的验证器) 把它判为无效配置, 与其他已知字段一致; 不因此增加 `configVersion`. 安装与安装更新不补入该对象, 因为默认关闭是产品行为, 不是缺失的默认结构.

Effect Log 模块在自己所在进程第一次需要记录时读取一次全局配置, 此前不读取, 所以日志模块不使任何命令新增失败路径: 配置文件不存在 (含源码检出下没有 `config.json` 时回退到 `config.install.json`) 时按关闭处理, 不告警; 配置无法读取或 `effectLog` 无效时, 本进程不记录并按写入失败规则告警一行, 宿主命令不受影响. 后台管理进程因此在重启前不感知配置修改 (与 `backgroundAgent` 的容量和保存间隔一致). 本规格不改变任何命令是否读取全局配置的既有规则, 也不改变既有读取全局配置的命令 (如启动 Reviewer) 对无效字段按配置合同关闭式失败的结果: `effectLog` 无效时这些命令照旧因配置错误失败, 这是配置合同而不是日志写入; 只有不读取全局配置的命令 (关卡 `prepare`, `generate`, `verify`, 脚本) 通过日志模块读取时, 读取失败才只告警. 不增加 `configVersion`: 该字段可选且不改变其他字段的含义, 增版本会使所有用户的配置被转换; 较早的 ARW 版本按现有验证器忽略根级未知字段, 回退到旧版本不需要先删除该对象.

### Files and records

日志按月分文件: `<directory>/effects-<YYYY-MM>.jsonl`, 月份取记录时间的 UTC 年月; 目录在第一次写入时创建. 每条记录是一行 UTF-8 JSON 对象, 以一次追加写入完成. 读取方必须跳过无法解析的行 (例如进程在写入中途被终止).

每条记录有这些公共字段: `v` (格式版本, 当前 `1`), `ts` (Unix 秒, 整数), `kind` (类别), `repository` (目录名, 不含路径; 关卡记录取该仓库根目录名, 后台 Agent 记录取该运行记录的工作目录 `cwd` 的目录名, Reviewer 运行的 `cwd` 就是仓库根, 其他运行的 `cwd` 若是子目录则读取方得到子目录名, 接受这一不精确; 安装与发布验证记录省略). 会被同一逻辑事件重复触发的类别另有 `key` (文本), 读取方对同一 `kind` 与 `key` 只保留最早的一条. 记录不含消息正文, 指令文本, 报告内容, 绝对路径, 会话或线程身份, 凭据和用户名: 记录只回答 "发生了什么, 何时, 结果如何", 因为日志目录可能被用户同步或分享, 内容越少越不会泄露.

| 类别 | 何时写入 | 类别字段 | `key` |
| --- | --- | --- | --- |
| `gate-round` | `arw spec-readiness prepare` 或 `arw commit-audit prepare` 成功建出审核轮之后 | `gate` (`spec-readiness` 或 `commit-audit`), `issues` (本轮授权或审核的本地 Canonical ID 数组, Spec Readiness 一个, Commit Audit 为 `authorizingIssueIds`) | 无 |
| `gate-result` (Spec Readiness) | `arw spec-readiness generate` 成功之后 | `gate: "spec-readiness"`, `issues` (一个 ID), `result` (`satisfied`, `gap` 或 `not-applicable`), `findings` (整数, 草稿中以 `- ` 开头的行数; `satisfied` 与 `not-applicable` 为 `0`) | 无 |
| `gate-result` (Commit Audit) | `arw commit-audit verify` 不带 `--non-implementation` 且退出码为 `0` 之后 | `gate: "commit-audit"`, `issues` (最新审核轮 `request.json` 的授权 issue ID), `result: "pass"`, `rounds` (当前会话工作区 `_commit-audit/` 中 `request.json` 的 `authorizingIssueIds` 与最新审核轮相同的审核轮数, 因为会话工作区保留此前提交的审核轮, 不同 issue 的轮不计入), `findings` (对象, 键为 `requirements-reviewer` 与 `code-standards-reviewer`, 值为按这些轮次排列的数组, 元素是该轮该角色 `review.txt` 以 `- ` 开头的行数, 该文件为空或不存在时为 `null`), `dispositions` (对象, 键为 `follow-up`, `not-fixed`, `arbitration`, 值为授权 issue 的 `## Comments` 中对应台账行的总数) | `commit-audit:<request.json 的 tree>` |
| `agent-task` | 后台管理 Module 把任务状态由 `working` 置为 `ended` 时 (任务完成观察, 以及 Reviewer 释放受保护回合), 每次转换一条; 重启恢复置为 `unknown` 的运行, 启动失败, 以及卸载或停止时强制置为 `ended` 而此前不是 `working` 的任务不记录 (见 Reading side) | `runId` (运行身份, 不透明文本), `role`, `provider` (运行绑定的 `modelProvider` ID), `startedAt` 与 `finishedAt` (Unix 秒, `finishedAt` 取该任务的结束时间, `startedAt` 未知时为 `null`), `outcome` (`completed`, `failed`, `stopped`, `unknown`) | 无 |
| `agent-continuation` | 后台管理 Module 受理 Reviewer task continuation 节所述的程序接续 (`continueTask` 新受理一条程序指示消息并沿原线程启动新回合) 时, 每次受理一条; 用已受理的 Main 工作消息恢复暂停的任务 (`continueTask` 带 `messageId`), 容量回收后的原线程恢复和管理进程重启恢复不记录 | `runId`, `role`, `provider` | 无 |
| `install` | `install.mjs` 完成安装流程 (含失败) 时写一次; `--help` 和用法错误不记录; 配置取自本次安装前已存在的全局 `config.json`, 所以只有已开启日志的机器有记录 | `result` (`success` 或 `failure`), `seconds` (从开始解析参数到结束的墙钟秒数, 整数), `version` (被安装的 `package.json` 版本), `platform` (`process.platform`) | 无 |
| `release-validation` | `scripts/release-vm.mjs check` 结束时, 每台机器一条 | `machine` (`release-vm.mjs check <machine> ...` 命令行的机器键参数), `result` (`pass` 当该次 `check` 以退出码 `0` 结束, 否则 `fail`; 参数错误等未开始检查的退出码 `2` 不记录; 配置取自宿主机的全局配置, 没有已安装的 ARW 或未开启时不记录), `seconds` (该次 `check` 的墙钟秒数, 整数), `version` (候选的 `package.json` 版本) | 无 |

`agent-task` 的 `outcome` 只由任务结束时已有的事实决定, 不另做判断: 原生回合状态为 `completed` 时是 `completed`; 原生回合状态为 `failed` 或存在提供方错误时是 `failed`; 管理进程确认运行环境因停止, 卸载或中断而退出时是 `stopped`; 其余是 `unknown`. 一个已结束的任务被 `followup_task` 或 `newThread` 的 `spawn_agent` 取代后再次由 `working` 转为 `ended`, 是新的任务, 写新的 `agent-task`. `agent-continuation` 只在管理进程受理接续时记录 (是否接续仍由 Reviewer 运行层判定). 读取方按 `runId` 汇总: 接续次数是该运行的 `agent-continuation` 条数, 尝试次数是接续次数加一.

`dispositions` 的三个类别来自 `commit` Skill 的处置台账 (每条一行, 格式 `台账: <文件和行或章节> <转入后续 issue|记录不修|冲突裁决> <理由>`, 本规格自带该格式, 不依赖 Skill 文本): 授权 issue 的 `## Comments` 章节内, 去掉行首可选的列表符 `- ` 后以 `台账:` 开头的行算一条台账, 该行中第一个出现的短语决定类别, `转入后续 issue` 记为 `follow-up`, `记录不修` 记为 `not-fixed`, `冲突裁决` 记为 `arbitration`, 都不出现的台账行不计入. 例子: `- 台账: a.mjs:5 记录不修 措辞` 计入 `not-fixed`; `台账: 规范 12 转入后续 issue 0140` 计入 `follow-up`; `- 台账: 冲突裁决 按 spec` 计入 `arbitration`; `记录不修` 单独出现在不以 `台账:` 开头的行, 或 `台账: 见上` 都不计入. 这是对既有台账格式的机械计数, 不判断问题是否有效, 也不改变台账的任何规则.

`findings` 同样是机械计数: 只数报告文本中以 `- ` 开头的行 (行首无缩进), 内容精确为 `No problems.` 时为 `0`. 这与 Reviewer 报告规则一致: 每条问题以 `- ` 开头, 续行缩进. Engine 仍不解释条目内容, 也不判断问题是否有效, 因此既有规定 "Engine 不解析问题条目" 改为 "Engine 不解释问题条目, 只数条数".

### Behavior contract of recording

- 功能关闭时没有任何文件系统写入, 不创建目录, 宿主命令的标准输出, 标准错误和退出码与没有本功能时逐字相同.
- 功能开启时, 记录是宿主命令成功路径上的附带动作: 追加失败 (目录不可创建, 文件不可写, 磁盘已满) 只向标准错误输出一行 `warning: effect log not written: <错误码>` (每个进程最多一行), 不改变宿主命令的标准输出, 退出码和已完成的工作. 记录写入先于宿主命令的最终输出还是之后不作规定.
- 日志从不被 Engine 读取: 没有关卡, 授权, 容量, 恢复或验证判断依赖它, 删除整个目录不影响任何工作流.
- Commit Audit `verify` 对仓库仍然只读; 它追加的日志在仓库之外. 重复运行 `verify` 得到同一 `key`, 读取方去重.

### Reading side and what stays out

读取方 (本机统计工具) 的口径不由 ARW 规定, 这里只给出读取方可以依赖的事实: 一个 issue 的首条 `gate-round` 到 `commit-audit` 的 `gate-result` 之间是它在关卡里的墙钟时间, 不含写 issue 之前的时间, 也不含没有经过任何关卡的 issue (行为保持重构按规则不做 Spec Readiness, 只有提交审核的记录); 没有 `gate-result` 的 `gate-round` 表示该尝试未完成或被放弃, 读取方应保留它们作分母. 管理进程重启后被恢复为任务状态 `unknown` 的运行没有 `agent-task` (其结束时间和结果未被核实, 记录它会把未证实的事实写成事实), 读取方看到有 `agent-continuation` 或更早的记录而没有 `agent-task` 的运行时视为结局未知. Strata 分诊, codex20 套餐窗口与触顶, 各机器的发布环境和 issue 开始的人工标记都不在 ARW 范围内, 由本机工具以同一信封写入, 见 Solution.

### Spec amendments in the long-term specifications

长期规格 `agent-repository-workflow` 增加 `## Effect Log` 一节 (放在 `## Commit Audit` 之后), 是该合同的唯一权威, 内容是本节 Switch and location 到 Behavior contract of recording 的合同, 文字以该节为准; 同时在 Modules 清单加 Effect Log 模块, 在 Dependencies and Data Flow 节加 "日志行" 的权威行并写明依赖方向, 并改四处既有表述使它们与日志一致: Spec Readiness 的 `generate` 一段中 "`generate` 不写 `.scratch` 或基线" 补上 "仓库内"; "Engine 不解析问题条目" 改为 "Engine 不解释问题条目, 只在 Effect Log 中按行首 `- ` 数条数"; Commit Audit 一节中 `verify` 的 "只读" 说明补上 "对仓库只读, 另按 Effect Log 追加记录", 同一段中 "它不解析报告条目" 改为 "它不解释报告条目, 只在 Effect Log 中按行首 `- ` 数条数". `agent-repository-workflow-installation` 只增加两处, 不复述合同: v3 已知字段表加 `effectLog` 父行与 `effectLog.directory` 叶行 (均可选, 无默认值, 安装不补入) 并链接长期规格的 Effect Log 一节, 唯一校验权威一句的已知结构列表加上 `effectLog`. 用户手册 `docs/manuals/agent-cli.md` 与 `agent-cli.zh-CN.md` 各用一段文字说明如何开启, 日志包含和不包含什么.

接受的成本: 日志格式一旦被外部工具读取就成为兼容负担, 所以公共字段带版本 `v`, 新字段只能追加, 不改变既有字段含义; 每个类别写在长期规格里而不是代码里, 因为读取方依赖它.

被否决的方案:

- 由 Skill 要求 Main Agent 在 issue 开始和采纳 Reviewer 意见时调用记录命令: 需要所有使用者的 Agent 都遵守新增步骤, 缺记录时无法区分 "没发生" 和 "忘了记"; 日志只记 Engine 亲眼看到的事实, issue 开始用首条关卡记录近似并写明限制.
- 把日志写进仓库 `.scratch` 或 `.tmp/`: `.scratch` 受跟踪, 会污染提交并与 "提交审核期间 HEAD 不变" 冲突; `.tmp/` 按会话清理, 无法积累历史.
- 默认开启并写到固定的用户目录: 为不需要它的用户写入持久状态, 改变所有使用者的行为; 默认关闭使本变更对未开启的用户没有可观察影响.
- 用环境变量开启: 后台管理进程是共享常驻进程, 继承的是第一个启动它的客户端的环境, 不同入口会得到不同结果; 全局配置对所有入口一致, 与既有设置同源.
- 在 Engine 内按 "项目" 归并 ARW, ARW-v1 和 codex20 克隆: 项目归并是读取方的口径, 记录只带仓库目录名, 读取方可以按自己的规则归并.

## Testing Decisions

只用 mock 与临时目录, 不起真的后台管理进程或真安装, 除下面指明的一处真运行.

- 配置: 在全局配置读取层增加案例, 观察 `effectLog` 的有效值通过, 缺失时关闭, 以及四种无效形式 (不是对象, 多余字段, `directory` 为相对路径, `directory` 为空文本) 各自被配置验证器判为无效, 并在 `record` 的第一次调用时产生恰好一行告警而不写文件, 防止无效配置被静默当作关闭.
- 关闭: 用关闭的配置运行 `spec-readiness prepare`, `generate`, `commit-audit prepare`, `verify`, 用 mock 驱动后台管理的任务结束与续做, 并运行 `install.mjs` 与 `release-vm.mjs check` 的既有测试夹具, 观察没有创建任何文件或目录, 且标准输出与退出码与既有测试的期望一致, 防止功能泄漏到未开启的用户.
- 每个类别: 用临时目录开启, 对 `gate-round`, 两种 `gate-result`, `agent-task`, `agent-continuation`, `install`, `release-validation` 各触发一次事件, 并覆盖结果分支 (`agent-task` 的 `completed`, `failed`, `stopped`, `unknown` 四种 `outcome`, 其中 `unknown` 用无法判定结果的结束触发; `agent-continuation` 一次受理; `install` 的 `success` 与 `failure`; `release-validation` 的 `pass` 与 `fail`), 观察日志里恰好多出一行, 字段集合与上表完全一致 (含 `null`, 数组和对象形状), 且不含绝对路径, 防止格式漂移和泄露. `findings` 与 `dispositions` 各用上面列出的正反例判定, 验收只按所列例子, 不扩大为任意措辞.
- 去重: 对同一暂存树连续运行两次 `commit-audit verify`, 观察两条记录有同一 `key`; 用 mock 驱动后台管理, 观察 `agent-task` 只在 `working` 转 `ended` 时写入, 启动失败, 强制卸载和恢复为 `unknown` 不写; `commit-audit verify` 的 `rounds` 与 `findings` 不计入授权 issue 不同的旧轮.
- 写入失败: 把 `directory` 设为一个已存在的普通文件, 运行 `spec-readiness prepare`, 观察命令成功, 退出码不变, 标准错误恰有一行 `warning: effect log not written: ` 开头的文字, 防止日志故障拖垮工作流.
- 一处真运行: 用真实 Git 仓库和真实 `arw` 命令走一遍 `spec-readiness prepare` 后检查日志出现 `gate-round`, 证明命令入口确实连到了日志模块 (其余用 mock 的案例只能证明模块本身).

## Module Design

### Modules

Effect Log 模块 (`lib/effect-log/`) 拥有日志合同: 读取并校验全局 `effectLog` 配置, 为记录补公共字段, 选择月文件, 完成追加写入并吸收写入失败. 它不拥有任何事件的判定: 关卡轮次与结果由 Spec Readiness 与 Commit Audit 模块给出, 后台任务的结束与恢复由后台管理 Module 给出, 安装与发布验证的结束由各自的脚本给出, 这些调用方在自己已经知道事实的位置调用 Effect Log, 不由 Effect Log 去观察它们. 它不读取日志, 不提供查询, 不决定任何项目归并或阈值.

### Interfaces

Effect Log 对外只有一个操作 `record(kind, fields, {cwd})`: `kind` 取上表类别, `fields` 是该类别的类别字段, `cwd` 是每次调用提供的仓库根或运行工作目录的路径 (模块只取其目录名写入 `repository`, 安装与发布验证调用省略它), 调用方不提供 `v`, `ts`; 返回时记录已追加或已按失败规则吸收, 调用方不处理返回值, 不会因它抛出. 配置未启用时 `record` 立即返回, 不触碰文件系统. 同一进程内写入失败的告警至多一行. 类别字段由调用方保证形状, 模块不再校验 (调用方是仓库内部代码); 唯一的信任边界是全局配置, 在读取时校验一次. 失败: 目录不可创建, 文件不可追加时吸收并告警; 配置无法读取或 `effectLog` 无效时, 模块在第一次记录时按上文吸收并告警, 不在命令启动时失败.

### Seams and Adapters

不新增 Seam: 追加写入直接用 Node 的 `appendFile`, 测试用临时目录 (写入失败用普通文件占位的目录) 观察, `ts` 只断言落在测试前后时间之间. 各调用位置 (关卡, 后台管理, 安装脚本) 直接调用 Effect Log 的 `record`.

### Dependencies and Data Flow

依赖方向: Spec Readiness, Commit Audit, 后台管理 Module, `install.mjs` 和 `scripts/release-vm.mjs` 依赖 Effect Log; Effect Log 只依赖全局配置读取层 (只读) 和 Node 文件系统. 没有反向依赖, Effect Log 不被任何判断读取.

| 事实 | 权威来源 | 责任方 | 提交时点 |
| --- | --- | --- | --- |
| 关闭或开启与目录 | 用户的全局 `config.json` `effectLog.directory` | 用户 | 每个进程首次需要记录时读取一次 |
| 关卡轮次与结果 | 各关卡命令自己建立的轮, 草稿与 `request.json` | Spec Readiness, Commit Audit | 对应命令成功之后 |
| 任务结束 | 后台管理 Module 的任务状态转换 | 后台管理 Module | 状态转换提交到内存之后, 不等保存到 SQLite |
| 程序接续被受理 | 后台管理 Module 对程序接续指示的受理 (请求接续的决定属于 Reviewer 运行层, 只有受理是日志事实) | 后台管理 Module | 受理成功之后 |
| 安装与发布验证结束 | 脚本自己的运行结果 | `install.mjs`, `release-vm.mjs` | 脚本结束时 |
| 日志行 | 追加写入的月文件 | Effect Log | 追加调用返回时 |

数据从事件位置经 `record` 流向月文件, 单向; 记录写入失败不回流到调用方. 后台管理进程在状态转换处调用 `record`, 记录的写入不进入它的批量保存事务, 也不影响其容量和恢复判断: 管理进程崩溃时最近的记录可能丢失, 这是被接受的成本 (日志不是恢复记录).

### Module Design Rationale

日志模块独立于各调用方而不是把追加逻辑分散到每个命令: 公共字段, 月文件选择, 失败吸收和脱敏约束必须只有一份, 否则不同入口的格式会漂移; 它又只提供 `record` 一个操作, 因为判定事件的权利必须留在知道事实的模块, 集中观察会复制关卡与后台管理的状态机. 依赖方向选择 "业务模块依赖日志" 而不是反过来, 因为日志不得影响任何业务判断. 权威来源表里 "日志行" 的权威是追加返回时点, 而不是后台管理进程的批量保存时点: 日志是观察记录, 不需要与恢复状态同事务, 绑定到保存事务会把每个任务的结束拖进同一个失败域. 接受的成本: 管理进程崩溃时最近的记录可能丢失, 并且 `install` 与 `release-validation` 只在已开启日志的机器上有记录 (全新安装由 `configSeed` 创建的配置不含 `effectLog`, 所以首次安装不产生 `install` 记录; 只有已开启日志的已有配置在后续安装中才有).

### ADR Evaluation

不需要新 ADR. 本变更引入新的持久数据 (用户目录下的追加日志) 和一个新的配置字段, 逐项评估: (1) 安全与隐私边界: 日志默认关闭, 开启后只记录第一节列出的字段, 明确不含正文, 路径, 会话身份, 凭据和用户名, 不引入新的信任边界或授权; 写入目录由用户在自己的全局配置里指定, 仓库不能决定. (2) 调用方可见的结果合同: 关闭时没有可观察变化; 开启时宿主命令的输出和退出码不变, 只在写入失败时多一行标准错误告警 (见 Behavior contract of recording). (3) 失败与恢复合同: 日志不参与恢复, 丢失或删除不影响任何工作流, 因而没有新的恢复责任. (4) 持久权威: 日志只是观察记录, 不是任何事实的权威来源 (权威仍是各关卡记录与后台状态, 见上表); 格式带版本且只追加字段, 可以随时停止写入而不留下无法解释的状态, 不是难以逆转的承诺. 与 `docs/adr/0030-use-user-wide-background-agent-management.md` (管理进程拥有任务身份与恢复) 不冲突: 日志不拥有也不改变任务身份或恢复.
