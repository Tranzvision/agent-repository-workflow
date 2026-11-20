# 增加默认关闭的工作流运行效果离线记录 (Effect Log)

Status: completed

## What to build

用户要求 (维护者对各工程运行效果指标的评估): ARW 工作流的运行效果指标目前算不出, 因为事实没有被留下; 需要一份离线总账, 覆盖 issue 级起止与每道关卡的轮次, Reviewer 发现数与采纳, 后台 Agent 的后端, 尝试, 终态和恢复次数, 发布验证结果与安装耗时, 以及 Codex 套餐窗口与触顶事件. 本 issue 只落实 ARW 仓库能亲眼看到的部分, 其余见 `## Comments`.

按 effort spec (`.scratch/0136-effect-log/spec.md`) 实现, 并把同一合同写入长期规格.

最终状态: 全局 `config.json` 的可选对象 `effectLog: {"directory": "<绝对路径>"}` 开启后, Engine 在下列事件上向 `<directory>/effects-<YYYY-MM>.jsonl` 追加一行 JSON (字段, 键, 去重和计数规则全在 effect spec 的 Files and records): `gate-round` (Spec Readiness 与 Commit Audit 的 `prepare` 成功后), `gate-result` (`spec-readiness generate` 成功后, 含本会话该 issue 各轮按轮目录名的发现条数; 以及不带 `--non-implementation` 的 `commit-audit verify` 成功后, 含同一授权 issue 且同一 `base` 各轮各角色的发现条数和台账三类条数), `gate-verify` (不带 `--subject-only` 的 `spec-readiness verify` 成功后, 近似实施开始), `agent-task` (后台任务状态由 `working` 转为 `ended` 或 `unknown`, 含重启恢复, 以及运行尚无原生线程时的启动失败; 带 `provider`, `model`, `effort`), `agent-continuation` (管理进程新受理一条程序接续指示), `install` (`install.mjs` 完成安装流程), `release-validation` (`scripts/release-vm.mjs check` 每台机器结束). 默认关闭时本功能不写任何文件, 也没有可见变化; 开启后写入失败只在标准错误告警一行, 不改变宿主命令的输出, 退出码和已完成的工作. 日志从不被 Engine 读取, 不含正文, 绝对路径, 会话身份, 凭据和用户名.

做法: 新增 `lib/effect-log/` 一个模块, 对外一个 `record(kind, fields, {cwd, programDirectory})` 写入操作和两个纯计数函数, 负责公共字段 (`v`, `ts`, `repository`; `repository` 取 `cwd` 所属工作树根的目录名, 公共 Git 目录名为 `.git` 的链接工作树改取主工作树的目录名, 其余链接工作树仍取自己的目录名, 规则以 effort spec 的 Files and records 为准), 月文件, 追加写入和失败吸收; 全局配置读取层 (`lib/arw-common/config.mjs`) 校验 `effectLog`, 不增加 `configVersion`; 各调用方在已知事实的位置各加一行调用 (后台管理 Module 在离开 `working` 的状态转换, 启动失败和 `continueTask` 新受理程序指示消息处). 长期规格 `agent-repository-workflow` 增加 `## Effect Log` 一节在 Modules 清单和 Dependencies and Data Flow 节加入 Effect Log 模块并改五处既有表述 (Repository discovery 的根目录内状态一句补 Effect Log 例外, "`generate` 不写 `.scratch` 或基线" 补 "仓库内", "Engine 不解析问题条目" 与 Commit Audit `verify` "它不解析报告条目" 改为只数条数, `verify` "只读" 补 "对仓库只读, 另按 Effect Log 追加记录"), `agent-repository-workflow-installation` 只在 v3 已知字段表加 `effectLog` 父行与 `effectLog.directory` 叶行并把它列入唯一校验权威的已知结构, 加一句消费方与生效范围, 流程图加 Installer 到 Effect Log 的边, 用户手册 `docs/manuals/agent-cli.md` 与 `agent-cli.zh-CN.md` 各加一段 (如何开启, 记什么不记什么).

范围外: 读取方 (维护者本机的统计工具) 的改动, Strata 分诊, codex20 窗口与触顶的采样, 人工 issue 开始标记; 它们由维护者本机的工具按同一信封写入同一目录, 见 `## Comments`.

预计净增: 代码约 +290 行 (非测试, 含 `lib/effect-log/` 约 +100 行, 配置校验约 +25 行, 各调用点与计数辅助约 +165 行); 测试约 +330 行; 文档约 +10500 字符 (长期规格 +8500, 安装规格 +900, 手册两份共 +1100).

预期验证: 新增 mock 与临时目录测试 (`tests/effect-log/`, 以及各既有关卡, 后台管理, 安装脚本测试各补调用点案例): 配置有效, 缺失与五种无效形式 (验证器判无效, 日志模块告警一行); 关闭时不建日志目录且输出与退出码不变; 八类记录各触发一次, 字段集合与 spec 表逐项相同, 无绝对路径; 普通仓库的子目录与链接工作树, 子模块和非 Git 目录中的 `repository`; `findings` 与 `dispositions` 按 spec 的正反例判定; 同一暂存树两次 `commit-audit verify` 得同一 `key`; 目录被设为普通文件时 `spec-readiness prepare` 仍成功, 标准错误恰一行 `warning: effect log not written: `; 一处真运行 (真实 Git 仓库, 真实 `arw spec-readiness prepare`, 日志出现 `gate-round`). `pnpm typecheck`, `pnpm test`, `arw text check`, `arw terms check --include .scratch/0136-effect-log/`, `git diff --check`.

## Acceptance criteria

- [x] 全局配置 `effectLog.directory` 有效时开启, 缺失时关闭; 不是对象, 含多余字段, 缺 `directory`, `directory` 为相对路径或空文本都被配置验证器判为无效, 日志模块第一次记录时只告警一行且不写文件, 不增加 `configVersion` (观察: 配置验证器测试与一次 `record` 调用).
- [x] 关闭时 `spec-readiness prepare`, `generate`, `verify`, `commit-audit prepare`, `verify` 不创建日志目录或任何日志文件, 宿主命令既有的写入, 输出与退出码与既有测试期望一致 (观察: 关闭配置下运行后断言配置的日志目录不存在, 既有断言照旧通过).
- [x] 开启时八类记录各在对应事件后恰好追加一行, 字段集合, `key` 与形状与 effect spec 的 Files and records 表一致, 不含绝对路径, 消息正文, 会话身份和用户名; `repository` 在普通仓库 (公共 Git 目录名为 `.git`) 的子目录和链接工作树中为主工作树目录名, 在子模块中为子模块根目录名, 在非 Git 目录中为该目录名 (观察: 逐类测试断言整行 JSON, 夹具里的路径, 用户名和会话身份在整行文本中不出现; 临时仓库及其链接工作树中的 `record` 调用).
- [x] `findings` 与 `dispositions` 的计数符合 spec 列出的正反例, 报告 `No problems.` 计 `0` (观察: 单元测试用 spec 中的例子).
- [x] 同一暂存树的重复 `commit-audit verify` 记录有同一 `key`, `rounds` 与 `findings` 不含授权 issue 或 `base` 不同的旧轮; 同一会话两次 `spec-readiness generate` 的 `findings` 都含此前有问题的轮且键相同; 后台任务每次由 `working` 转为 `ended` 或 `unknown` (含重启恢复) 写一条 `agent-task` (保存时处于阈值暂停 (`providerWork.paused`) 的任务重启后仍为 `working`, 不写), 转为 `unknown` 的 `outcome` 为 `unknown` 且 `finishedAt` 为 `null`, 尚无原生线程的启动失败写一条 `outcome` 为 `failed`, 已不是 `working` 的任务被强制卸载不再写 (观察: 关卡命令测试与 mock 驱动后台管理的状态转换).
- [x] 日志目录不可写时, 宿主命令输出和退出码不变, 标准错误恰一行 `warning: effect log not written: <错误码>` (观察: 目录设为普通文件的测试).
- [x] 一次真实 `arw spec-readiness prepare` 在开启的临时配置下产生 `gate-round` 记录 (观察: 真运行测试).
- [x] 长期规格, 安装规格和两份手册按 `## What to build` 更新, 五处既有表述与 Effect Log 一致 (观察: `grep -ln "Effect Log" docs/specs/agent-repository-workflow/spec.md docs/specs/agent-repository-workflow-installation/spec.md docs/manuals/agent-cli.md docs/manuals/agent-cli.zh-CN.md` 列出这四个文件, 且 `grep -n "Engine 不解析问题条目\|它不解析报告条目" docs/specs/agent-repository-workflow/spec.md` 无命中).
- [x] `pnpm typecheck`, `pnpm test`, `arw text check` 通过; `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check` 通过.

## Blocked by

- None - can start immediately

## Validation

- 先写失败测试再实现: `tests/effect-log/` (写入格式, 缺失与无效配置, 仓库名五种情形, 同进程重复失败, 惰性 `fields`), `tests/arw-common/config.test.mjs` 的 `effectLog` 案例 (含 `{}` 等五种无效形式), `tests/spec-readiness/cli.test.mjs` 与 `tests/commit-audit/cli.test.mjs` 的关卡记录案例 (其中 `spec-readiness prepare` 一例用真实 Git 仓库和真实命令入口), `tests/background-agent/manager.test.mjs` 的 `agent-task` 与 `agent-continuation` 案例 (含中断记 `stopped`), `tests/installation/installation.test.mjs` 与 `tests/release/release-vm.test.mjs` 各一例.
- `pnpm typecheck` 通过; `pnpm test` 通过, 1005 项, 0 失败; 真实 `arw spec-readiness prepare` 一例在 `tests/spec-readiness/cli.test.mjs`; `arw text check` 通过.
- `node scripts/check-workflow-distribution.mjs`, `node scripts/project-claude-skills.mjs --check`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0136-effect-log/`, `git diff --check` 通过; `node arw.mjs spec-readiness verify --issue issue:0136:01 --subject-only` 通过.

```text
code: +224 lines (files: 11)
  lib/arw-background-agent-host.mjs +2
  lib/arw-common/config.mjs +14
  lib/arw.mjs +10
  lib/background-agent/manager.mjs +26
  lib/commit-audit/commit-audit.mjs +31
  lib/effect-log/effect-log.mjs +71
  lib/effect-log/gate-counts.mjs +22
  lib/installation/installation.mjs +14
  lib/spec-readiness/spec-readiness.mjs +19
  release-manifest.json +2
  scripts/release-vm.mjs +13
documents: +12606 characters (files: 4)
  docs/manuals/agent-cli.md +1045
  docs/manuals/agent-cli.zh-CN.md +437
  docs/specs/agent-repository-workflow-installation/spec.md +448
  docs/specs/agent-repository-workflow/spec.md +10676
tests: +383 lines (files: 8)
  tests/arw-common/config.test.mjs +11
  tests/background-agent/manager.test.mjs +72
  tests/commit-audit/cli.test.mjs +51
  tests/effect-log/effect-log.test.mjs +118
  tests/effect-log/gate-counts.test.mjs +20
  tests/installation/installation.test.mjs +20
  tests/release/release-vm.test.mjs +23
  tests/spec-readiness/cli.test.mjs +68
next ADR number: 0041
```

## Comments

- 来源: 维护者 2026-11-16 起对各工程运行效果指标的评估; 指标与阈值由读取方的统计工具定义, 不是 ARW 合同, 日志合同只在 effect spec 与长期规格中.
- 命名: 用 "Effect Log" (效果记录), 不叫 "台账", 因为 `台账:` 已是提交审核处置记录的既有术语.
- 已知限制: (1) 发生在 ARW 之外的事实 (Codex 套餐窗口与触顶, Strata 分诊) 不在本 issue, 由本机工具按同一信封向同一目录写入. (2) Engine 只能数发现条数与台账处置条数, 提交审核的采纳数由读取方按 "各次提交发现数之和减最后一条的台账条数" 推断, 不是 Engine 亲眼看到的采纳; Spec Readiness 的问题没有台账, 其采纳不可得出, 且跨会话进行的设计审核中较早会话的轮没有条数. (3) issue 级起点取该 issue 的首条 `gate-round`, 不含写 issue 之前的时间, 没有经过关卡的 issue 只有提交审核记录; Spec Readiness 通过后的排队等待用首条 `gate-verify` 分开. (4) 发布验证在客户机内的安装不记录 (客户机没有全局配置), `install` 只记录已开启日志的安装. (5) 读取方需要另行适配 Unix 秒与 UTC 月文件. (6) 不记 token 用量: 长期规格规定 ARW 运行期不持久交付审核成本, 用量分析由外部 benchmark 负责.
- Spec Readiness: 本 issue 新增持久数据, 一个配置字段和一类公开日志合同, 按规则做就绪审核; 记录在 `01.spec-readiness.json` (`satisfied`, 2026-11-18, 第 5 轮 `No problems.`; 前 4 轮共 10 条 gap 均已修正, 第 2 轮起的修正主要涉及 `repository` 取主工作树目录名的规则).
- 2026-11-18 增量复审 (实施期间) 返回 18 条, 经 Main 与独立 agent 判定 14 条成立, 已改 spec 与本 issue: 补仓库边界例外 (第五处既有表述), 关闭时只保证不建日志目录, 中断回合记 `stopped`, `issues` 一律数组, 模块只负责公共字段脱敏并另提供两个纯计数函数, `key` 由调用方给出和崩溃窗口重复 `unknown` 的已知限制, `effectLog: {}` 无效, 常驻进程告警与配置只读一次的测试, `install` 与 `release-validation` 的配置读取点与 `version` 来源, `dispositions` 读暂存树, 安装规格补消费方与依赖边; 文档预算因此加约 1500 字符.
- 体积: 代码 +224 行 (估算 +290), 测试 +383 行 (估算 +330), 文档 +12606 字符 (估算 +10500; 长期规格 Effect Log 一节照搬 effect spec 的合同并加 Interface 与 Reading side, 比预估多约 2000 字符). 另为让已安装命令加载新模块, `release-manifest.json` 的 `runtimeFiles` 登记 `lib/effect-log/` 两个文件 (+2 行, 由 `tests/runtime-entries.test.mjs` 守护).
- 台账: lib/background-agent/manager.mjs:127 记录不修 `failStart` 的布尔参数命名: 无原生线程的启动失败路径本来就只有两种调用, 分开成两个函数不减少分支, 只增加一个导出点; 第二条路径 (`entry.native` 已有而线程未起) 是未能受理任务, 同一运行之后真正启动属另一个任务, 按 spec 每次由 `working` 转出写一条.
- 台账: docs/specs/agent-repository-workflow/spec.md 的 Effect Log 节 记录不修 Reviewer 指出的重复 (findings 计数, 失败处理, `cwd` 求法各写两处): 前两处分属记录表的字段说明与计数规则, 第三处分属公共字段与 Interface, 读取各自的上下文各需完整一句; 已删去读取方的设计与实施分段换算句.
- 台账: lib/effect-log/effect-log.mjs 的 `invalid-config` 不再细分不可读与无效, 不修: 告警码只用于让使用者去看配置, 两种情形的处理动作相同 (检查配置文件), 细分要给 `loadConfig` 增加错误码, 超出本 issue 范围.
- 台账: lib/commit-audit/commit-audit.mjs 空报告判定与轮次列出的残余重复不修: verify 只需要 "是否有任一非空报告", Effect Log 需要每轮的计数, 两处口径本来不同, 共享函数会多一层参数; 单个报告读取已共用 `roundReport`.
- 台账: docs/specs/agent-repository-workflow/spec.md 的 "Effect Log 的依赖方向" 段保留: 上一轮 Reviewer 明确要求补该句 (并补 `scripts/release-vm.mjs` 边), 本轮意见相反, 以长期规格依赖方向须有文字为准; Reading side 一节只保留读取方可依赖的事实, 计算规则句不删, 以免与 Files and records 契约脱节.
- 台账: docs/specs/agent-repository-workflow/spec.md 的 `agent-task` 段保留接续次数与尝试次数的汇总句, 不修: 它是 effort spec 同一合同的原句, 上一轮 requirements Reviewer 指出删去会使长期规格与 effort spec 不一致, 两位 Reviewer 意见相反, 以合同一致为准.
- 体积 (2026-11-20 补记 Status): 本次候选只把 `Status` 改为 `completed` (实施在 ec174fc 提交时漏改), 所以 `prepare` 实测 0, 与上面 Validation 记录的实施数字不符, 属预期.
- 台账: lib/effect-log/effect-log.mjs:33-35 转入后续 issue 第 4 轮提交审核 (Status 补记) 报 `configuredDirectory` 把配置文件不可读也当作不存在而静默关闭日志; 这是 ec174fc 及之后提交已有的行为, 本次候选未触及, 未复现, 由 Main 排后续 issue 核实.
- 台账: lib/background-agent/manager.mjs:109-128,822-825 转入后续 issue 第 4 轮报 `failStart(entry, true)` 先转 `ended` 再 `recordTask(entry, true)` 可能对同一次启动失败写两条 `agent-task`; 既有代码, 本次候选未触及, 未复现, 由 Main 排后续 issue 核实.
