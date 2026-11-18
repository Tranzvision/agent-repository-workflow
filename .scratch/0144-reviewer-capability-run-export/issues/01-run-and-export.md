# Reviewer 能力验证增加单实例 `run` 与实例记录 `export`

Status: ready-for-agent

## What to build

设计见 effort 的 `spec.md`. 最终状态如下各项都已落地, 外部工程可以按一个 ARW 提交循环调用 `run` 跑实例, 再用 `export` 取得带出处的实例记录.

1. `scripts/reviewer-capability.mjs` 增加 `run <scenario-directory> <new-instance-directory> --settings <json>`: 新增值选项 `settings`, 入口把它解析为 JSON 对象后传入, 不是 JSON 对象时为用法错误 (退出 `2`). 实现放在新的顶层连接文件 `lib/reviewer-capability-run.mjs`, 按 spec 的 Run flow 节依次完成: 出处 (检出指脚本所在的源码仓库根, 与工作目录无关), 现有 `setup`, 以 `process.execPath` 运行已安装的 `<os.homedir()>/<INSTALLATION_DIRECTORY_NAME>/arw.mjs background-agent` 子进程 (`INSTALLATION_DIRECTORY_NAME` 取自 `lib/arw-common/product-identity.mjs`, 不用检出中的 `arw.mjs`) 并在一个 JSONL 会话中 `spawn_agent`, `list_agents` 取 `cursor`, 循环 `wait_agent` (暂停通知按消息编号去重后发一次 `send_message` "继续"; 60 分钟时限从 `spawn_agent` 回执算起, `timeout_ms` 取剩余时间与 `3600000` 的较小值, 剩余不足 10 秒且 `completion` 仍为 `null` 时记作废 `timeout`, 用最近观察到的非空 `result.turnId` 发 `interrupt_agent` (没有则不发, 失败时仍作废并把错误码写入 `notes`); 运行环境退出而 `completion` 为 `null` 记作废 `no-completion`), 保存 `list_agents {runId}` 为 `<instance>/agent.json` (形状 `{status: "succeeded", result}`), 现有 `inspect` (`blocked` 作废 `inspect-blocked`, `flags` 非空作废 `inspect-flags`, `notes` 不写 `match` 与 `text`), 现有 `repair` (输出 `<instance>/report.repaired<原扩展名>`, 不传 spill, 理由与代价见 spec) 与 `score` (`--agent`, `--instance <实例目录名>`, 有修改时 `--repair` 否则 `--no-repair`; 带 `--repair` 返回 `blocked` 时对原报告 `--no-repair` 重试一次, 含 `scores.modelFailure` 才采用, 否则返回第一次的 `blocked`), 写 `score.json`, `candidates.json`, `run.json`. 结果状态, `stage` (新增 `provenance-read`, `agent-control`, `instance-write`, 都为 `failed`) 和各情形已写入的文件按 spec 的 Run flow 节结果表与 Interfaces 节. 不调用 `unload_agent`.
2. `run.json` 按 spec 的 Instance record 节写出表中除 `pauses` 与 `scoring` 外的全部字段: `id`, `scenario`, `arw {commit, treeDirty, fixtureTree}`, `runtime {arwVersion, matchesCheckout}`, `settings`, `startedAt`, `completedAt`, `time`, `tokens`, `validity`, 以及只供本机重新计分的 `report` 与 `repair` (取值规则见 spec 的 Instance record 节). 出处按 spec 的 Provenance 节取得; 已安装运行时与检出不一致时照样运行, 记录中检出的 `arw.commit` 与已安装的 `runtime.arwVersion` 并存, `runtime.matchesCheckout` 为假, 并向 `stderr` 写一条诊断.
3. `scripts/reviewer-capability.mjs` 增加 `export <instance-directory> ...`, 实现为 `lib/reviewer-capability/` 内的只读操作, 按 spec 的 Export 节与 Instance record 节返回 `{status, schemaVersion: 1, instances}`: 每个实例一条记录, 含 ARW 提交, 夹具树 SHA, 已安装运行时版本, 场景, 设置, 用时与 token, `startedAt`/`completedAt`, 作废原因 (`validity`), 以及定稿 `score.json` 映射的 `scoring` 与 `pauses`; 字段名沿用外部 benchmark v1 结果文件 `instances` 的同名字段, 不输出 `report` 与 `repair`. 没有实例, `id` 重复, `run.json` 缺失或不是 JSON, 有效实例的 `score.json` 缺失, 不是 JSON 或未定稿时整体 `blocked`, 不输出任何记录.
4. 开发长期规格 `docs/specs/agent-repository-workflow-development/spec.md` 的 Reviewer Capability Module 段落同步为新边界 (权威内容是 spec 的 Module Design 节, 长期规格不得引用 `.scratch`):
   - Modules 段 (以 "Reviewer Capability Module" 开头, 含 "不拥有多模型 benchmark 的记录与运行层内容" 的一段): 改为拥有单实例的运行与导出, 不拥有成本, 依赖模型配置表的统计, 多实例矩阵和发布; 删去 "不启动 Reviewer... 由 Skill 经 `arw background-agent` 完成" 和 "暂停的采集在 Skill 步骤中完成" 中与 `run` 冲突的部分 (裁判仍由 Skill 启动).
   - Module Design Rationale 中 "多模型 benchmark 的记录与运行层内容不属于能力测试本身" 一句: 改为 spec 的 Module Design Rationale 节第一段的理由 (运行步骤决定分数能否比较, 所以单实例运行在 ARW; 成本, 依赖模型配置表的统计和发布依赖模型清单与价目, 不在 ARW), 并加入 `run` 调用已安装机器入口而不导入检出实现的理由.
   - 入口子命令列表 (`scripts/reviewer-capability.mjs` 是该 Module 的唯一入口一段): 加 `run` 交给 `lib/reviewer-capability-run.mjs`, `export` 交给 `lib/reviewer-capability/` 的同名操作.
   - 入口段中 `failed` 的适用范围与 `stage` 列表: 加入 `provenance-read`, `agent-control`, `instance-write` (外部进程或文件系统失败, 理由见 spec 的 Run flow 节).
   - Interfaces: 加 `run` 与 `export` 两条, 内容取 spec 的 Interfaces 节.
   - Seams 段末句 "启动 Reviewer 与裁判不属于该 Module, 由 Skill 经 `arw background-agent` 完成": 改为 `run` 经子进程调用已安装的机器入口, 测试在该边界放假入口; 启动裁判仍由 Skill 完成.
   - 依赖方向段中 "它不依赖 `lib/reviewer-runtime/`: 启动与角色绑定由 Skill 经 `arw background-agent` 完成": 改为不导入 `lib/reviewer-runtime/` 或 `lib/background-agent/`, 只经子进程调用已安装的机器入口.
   - ADR Evaluation 段: 加一句说明单实例运行与导出不改变授权主体, 信任根或分发边界, 实例目录在调用方会话临时目录内, 导出格式由 `schemaVersion` 标识, 不需要新 ADR.
   - Validation strategy 的 Reviewer Capability Module 确定性测试段: 加 `run` (假已安装入口下的正常完成含一次暂停继续, 运行时与检出不一致照常运行并记录, 没有结论作废, 禁止来源作废, 未安装 `blocked`) 与 `export` (字段映射, 作废实例, 未定稿与重复 `id` 的 `blocked`).
5. `$reviewer-capability` Skill (`.agents/skills/reviewer-capability/SKILL.md`) 按 spec 的 Skill 节修改: `Run` 第 2 到 4 步改为调用 `run` (命令, `--settings` 示例沿用原第 3 步的 Codex 与 Claude 两例, 实例路径要求, 结果与下一步, Codex 沙盒中在沙盒外运行); 删去由 `run` 承担的手工继续, 计时, 中断, 保存 `agent.json` 与 `repair`/`score` 命令说明; 保留模型失败, 运行故障重跑, 连续作废停止与 `--instance` 唯一的调用方规则; 第 7 步定稿后的 `score` 输出写回 `<instance>/score.json` (用 `run.json` 的 `report` 与 `repair` 重新计分); 第 9 步提到可用 `export` 取得实例记录. 该 Skill 不被 Reviewer 读取, 不做能力 A/B. 用 `node scripts/project-claude-skills.mjs` 同步 `.claude/skills/reviewer-capability/SKILL.md`; 该 Skill 是源码专用 Skill, 不在 `distribution/` 中.
6. 测试 (`tests/reviewer-capability/` 下新增 `run.test.mjs` 与在现有文件或新文件中的 `export` 案例) 按 spec 的 Testing Decisions 节: 临时 `HOME` 与 `USERPROFILE` 下的假 `.agent-repository-workflow/arw.mjs` 与 `manifest.json`, 子进程运行 `run`, 观察退出码, 标准输出, 请求日志与实例目录. 不为测试在生产代码中加注入接缝 (根 `AGENTS.md` Repository-owned 例外); 60 分钟超时分支不做自动测试. 场景用现有夹具中任一个小场景.

不做: 多实例矩阵, 运行计划, 成本, 依赖模型配置表的统计, 发布; 盲裁进 `run`; 按引用提交重装运行时; 保留 `inspect` 标记实例的例外; 改变 `setup`, `inspect`, `repair`, `score` 的现有合同.

预计净增: 非测试代码约 250 到 330 行 (`lib/reviewer-capability-run.mjs` 约 190 到 240, `export` 约 50 到 70, 入口约 10 到 20), 文档约 +2500 字符 (开发长期规格约 +1800, Skill 两份副本约各 +350, 因删去的手工步骤抵消大部分新增), 测试约 150 到 220 行 (含假入口).

预期验证: `pnpm test` (新增案例全部通过; 子进程案例单个回调可能超过 100 毫秒, 按根 `AGENTS.md` 例外保留, 不逐例请求批准); `pnpm typecheck`; `node --check lib/reviewer-capability-run.mjs`; `node scripts/project-claude-skills.mjs --check`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `node arw.mjs text check`; `node arw.mjs terms check --include .scratch/0144-reviewer-capability-run-export/`; `git diff --check`. 一次真实端到端: 在沙盒外用 Codex `{"model":"gpt-6-luna","modelProvider":"openai","reasoningEffort":"xhigh","serviceTier":"default"}` 对任一 Spec Readiness 或 Code Standards 场景运行一次 `run`, 再对该实例运行 `export` (先按 Skill 盲裁定稿, 或候选为空时直接定稿), 把两条命令的输出摘要记入 `## Validation`; 它证明真实机器入口的请求与响应形状与假入口一致. 边界情况 (测试见验收项): 暂停通知重复出现时只继续一次; `measurement` 缺失或分量未知时相应字段为 `null` 而不是 0; 实例目录已存在时 `setup` 的 `blocked` 原样返回且不启动 Reviewer.

## Acceptance criteria

- [ ] `node scripts/reviewer-capability.mjs run <scenario> <instance> --settings <json>` 按 spec 的 Run flow 节运行一个实例: 测试中正常完成且有一次暂停通知时, 请求日志对该通知恰有一个 `send_message` "继续", 实例目录含 `agent.json`, `score.json`, `candidates.json`, `run.json`, 返回 `succeeded` 且 `record.validity.valid` 为真; `run` 经已安装的 `<HOME>/.agent-repository-workflow/arw.mjs` 而不是检出的 `arw.mjs` 发请求.
- [ ] 运行环境退出而 `completion` 为 `null` 时记录作废 `no-completion`, `inspect` 产生 `flags` 时记录作废 `inspect-flags`, 两者都返回 `succeeded`, 没有 `score.json`, 前者记录中未知的 `startedAt`, `time.durationSeconds` 与 `tokens` 分量为 `null`; `inspect-flags` 作废实例的 `run.json` 不含本机绝对路径 (`report` 与 `repair` 以外) 与答案键片段; Spec Readiness 场景 `completion` 为 `incomplete` 且 `.txt` 报告有前言和一个不合格式的 `- ` 要点时, 回退计分后返回 `succeeded`, `validity.valid` 为真, `run.json` 的 `report` 为原报告且 `repair` 为 `null`, `score.json` 含 `modelFailure` 且分数为 0; 假入口对 `spawn_agent` 返回 `ok: false` 时返回 `failed` (`stage` 为 `agent-control`) 且没有 `run.json`; 实例目录已存在时返回 `blocked` 且请求日志为空; 未安装时返回 `blocked` 且不创建实例目录; `--settings` 不是 JSON 对象时退出 `2`. 以上由测试覆盖. 剩余不足 10 秒时发 `interrupt_agent` 并作废 `timeout` 的分支在代码中存在, 由审查确认.
- [ ] `run.json` 含 spec 的 Instance record 节所列字段中除 `pauses` 与 `scoring` 外的全部字段, 另有 `report` 与 `repair`: 测试子进程的工作目录不在检出内时, `arw.commit` 仍等于检出 `HEAD`, `arw.fixtureTree` 等于 `git rev-parse HEAD:tests/fixtures/reviewer-capability`, `runtime.arwVersion` 取自已安装 `manifest.json`; 测试中假安装的一个受管文件与检出字节不同时, `runtime.matchesCheckout` 为假, `stderr` 有诊断, 运行照常完成.
- [ ] `node scripts/reviewer-capability.mjs export <instance> ...` 返回 `{status: "succeeded", schemaVersion: 1, instances}`, 有效实例的 `scoring` 与 `pauses` 按 spec 的 Instance record 节映射 (含模型失败时 `scoring.status` 为 `modelFailure`), 作废实例的 `scoring` 为 `null` 且 `pauses.known` 为假, 记录不含 `report` 与 `repair`; 未定稿的 `score.json`, 缺少 `run.json`, 重复 `id` 都返回 `blocked` 且没有 `instances`. 由测试覆盖.
- [ ] 开发长期规格按 What to build 第 4 项更新: Modules 段写明该 Module 拥有单实例的运行与导出, 不拥有成本, 依赖模型配置表的统计和发布; Rationale 段不再写 "多模型 benchmark 的记录与运行层内容不属于能力测试本身"; 入口子命令列表, Interfaces, Seams, 依赖方向, ADR Evaluation 与 Validation strategy 中没有与 `run`/`export` 矛盾的句子 (例如 "启动 Reviewer... 由 Skill 经 `arw background-agent` 完成"); 不引用 `.scratch`.
- [ ] `$reviewer-capability` Skill 的 `Run` 第 2 到 4 步改为调用 `run`, 第 7 步把定稿输出写回 `<instance>/score.json`, 第 9 步提到 `export`; `.agents/skills` 与 `.claude/skills` 两份一致 (`node scripts/project-claude-skills.mjs --check` 通过).
- [ ] What to build 预期验证所列命令全部通过, 真实端到端的 `run` 与 `export` 输出摘要记入 `## Validation`.

## Blocked by

- None - can start immediately

## Comments

- 来源: 维护者已决定 ARW 是 Reviewer benchmark 的唯一来源 (题目, 答案, 跑分与计分代码), 外部工程按 ARW 提交引用它跑分; Main Agent 定 ARW 只承接单实例 `run` 与 `export`, 矩阵, 成本, 跨模型统计和发布不进 ARW. 按根 `AGENTS.md` 的 `rule-and-design-changes` 例外, Main Agent 的确认即为用户确认, 本 issue 对开发长期规格与 Skill 的改动以此为确认依据.
- `export` 字段名的来源是外部 benchmark v1 结果文件格式说明的 `instances` 字段 (外部仓库 tag `reviewer-bench-v1` 中的 `benchmarks/multi-model-v1/export-format.md`), 本 issue 只沿用 ARW 能亲自观察的字段, 其余见 spec 的 Instance record 节.
- 执行: codex
- Spec Readiness: 4 轮 (Claude haiku high), 最后 `No problems.`. 前 3 轮的修改经 Main Agent 与独立 subagent 按 `rule-and-design-changes` Skill 的 Reviewer-proposed changes 节共同决定, 双方一致: 补入机器入口宿主与管理进程的结果字段来源, 新增 `stage` 统一为 `failed`, 检出定义为脚本所在仓库, 作废说明不写 `match`, 超时中断的 `turnId` 来源, `run.json` 字段范围与 `repair` 取值, 不传 spill 的理由, 以及 Spec Readiness 报告格式不合时的模型失败回退.
