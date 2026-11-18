# 提交审核流程提速三项规则

## Problem Statement

2026-11-19 对 12 个 effort 的 35 个真实审核轮的耗时分析 (独立 Opus 复核) 找出三处可以不改审核关卡, 只改 Main Agent 侧做法或提示的提速点.

- 两个并行的 Reviewer 总有一个先结束. 现行 `commit` Skill 的实施提交流程第 4 步写 "两个 Reviewer 正常结束 (`ready`) 后" 才核对报告, 先结束的报告要等到另一个结束才开始处理, 这段等待可以用来核对和修复. 现实可省约 3% 到 6% 的审核耗时, 集中在大改动上. 修复是只读固定 `tree` 的 Reviewer 看不见的暂存区工作, 不影响仍在运行的审核.
- 体积预算的数字循环偶尔造成纯数字的复审轮: issue `## What to build` 的预计净增写了分项, 分项之和与总量不一致时, 要等 Reviewer 发现才改. `prepare` 摘要后的 `warning:` 提示已覆盖 `## Validation` 中摘要标题行数字与实测不符 (规范 Commit Audit 一节的 (a)), 没有覆盖预计净增的分项之和.
- 过大的 issue (0147 约 2100 行) 让一个 Reviewer 一轮要读的内容过多, 单个轮次耗时与行数近似成正比. 现行规则只要求把小 issue 合并 (`docs/agents/agent-writes.md` 的 Issue concurrency 节), 没有上界. 曾考虑让大改动的要求符合审核拆成两个并行 Reviewer, 需要引擎拆分请求, 合并报告, 且套件测不出效果; 在拆 issue 时设上界更便宜.

## Solution

三项合成一个 issue:

1. 实施提交流程的两处文字, 让先结束的 Reviewer 的报告先核对, 先修.
2. `prepare` 的 `warning:` 提示增加一条: `## What to build` 的预计净增行里 "总量 (分项)" 的分项之和不等于总量.
3. Issue concurrency 节给合并后的单个 issue 设约 1000 行的预计改动上界.

## Implementation Decisions

- 先到先修. `commit` Skill 的 `implementation-workflow.md` 第 4 步改为: 某个 Reviewer 先 `ready` 时, 立即核对它的报告并开始修复和暂存, 不等另一个; 另一个还在运行时不 `prepare`. 两个 Reviewer 都结束后才进入下一次 `prepare`, 先修的内容与后到报告冲突时按 `fix-rounds.md` 的冲突裁决处理. 先到报告返回 `incomplete` 沿用现行处理 (本轮结束, 处理原因后重新 `prepare`), 但仍在运行的另一个 Reviewer 须先结束再 `prepare`. 理由: Reviewer 只读固定的 `tree` 对象, 暂存区变化不影响它; `fix-rounds.md` 已写明审核运行期间可以暂存; `Work Dependencies` 允许推进不依赖进行中结果的工作, 修复先到的报告只依赖已完成的那一份. 后到报告对同一处的相反要求由已有的冲突裁决兜底, 不新增规则.
- 先到的报告要能先通知. 同一文件 Run 节第 2 步的 `cat <轮目录>/*.jsonl | arw background-agent --wait` 只在两个都结束后返回. 该步加半句: 想先处理先结束的报告时, 两个 `.jsonl` 各用一个 `arw background-agent --wait` 进程 (`reviewer-launch` Skill 已允许只传一个文件), 各自结束时通知. 长期规范 `docs/specs/agent-repository-workflow/spec.md` 的 Review rounds 一节写 Main Agent "只运行" 一条 `cat <轮目录>/*.jsonl | arw background-agent --wait` 启动全部 Reviewer, 与此冲突, 同步改为: 运行该命令启动全部 Reviewer; 只需重审其中一个, 或想先处理先结束的报告时, 各 `.jsonl` 分别用一个 `--wait` 进程. 该句对所有审核轮通用: Spec Readiness 轮只有一个 `.jsonl`, 行为不变, 先到先修只适用于提交审核的两个并行 Reviewer. 不改 `reviewer-launch`, 不改任何运行时代码.
- 规则文档有三份副本: `.agents/skills/commit/implementation-workflow.md` 是源, `.claude/skills/commit/` 用 `node scripts/project-claude-skills.mjs` 同步, `distribution/skills/commit/` 用 `node scripts/sync-workflow-distribution.mjs` 同步. 只改源, 其余用脚本生成.
- 这项改动只有 Main Agent 读 (`implementation-workflow.md` 不是 Reviewer 审核时读取的文件), 按 `docs/agents/source-checkout-reviewer-testing.md` 首段不做 Reviewer 能力 A/B, 也不登记待测项.
- 分项之和提示 (规范 Commit Audit 一节 `prepare` 摘要警告的 (d)). 识别对象是 `## What to build` 章节中以 `预计净增:` 开头的行. 行内每个 "约 <总量> 行" 或 "约 <总量> 字符" 后紧跟括号 `(<分项>)` 的片段, 在括号内取全部 "约 <数字>" 或 "约 <低> 到 <高>" 作分项 (整体匹配, 高值是 "到" 之后的数字), 总量与分项的数字都可带 `+` 或 `-`, 写单个数字时低等于高. 分项至少两个时才核对: 分项的低值之和与高值之和分别等于总量的低值与高值, 否则每个片段一行 `warning: <路径>: What to build budget items sum to <和> but the stated total is <总量>.` (范围写成 `<低> to <高>`), 同一行按出现顺序, 在 (b) 之后追加, 所以同一 issue 内依次是 (c) (a) (b) (d). 没有 "约" 的数字, 括号外的数字, 括号内只有一个分项, 总量没有 "约" 的写法 (如 "不超过 15 行") 都不识别, 因为猜测它们的含义会产生误报. 只是提示, 不使 `prepare` 失败, 不改变退出码, 标准输出, `request.json`, Reviewer 交接和 `verify`; 没有不符时摘要逐字不变.
- `## Validation` 中摘要数字与实测不符的核对已由 (a) 实现, 本 effort 不改. 以 `约`, 括号和 `预计净增:` 为固定写法, 是因为现有 issue 的预算行已经是这种形状 (如 `文档约 +3500 字符 (源码规则, Skill 两份副本, 开发长期规格约 +2500, 开发手册两种语言约 +1000)`), 无需新增格式要求; 不在规则里另行规定.
- issue 体积上界. `docs/agents/agent-writes.md` 的 Issue concurrency 节在 "小 issue 尽量合并" 之后加一句: 合并后的 issue 预计改动超过约 1000 行时, 按相关性拆成多个 issue, 不为减少审核轮次而合并出更大的 issue. 口径是实施提交候选 `git diff --numstat` 新增与删除行数之和, 含 `.scratch`, `.claude/` 与 `distribution/` 副本 (与 Reviewer 耗时数据同口径; 文档段落不手动换行, 行数对文档偏低, 作为约数可接受), 与效率规则的预算口径无关. 阈值依据: 首轮 Reviewer 耗时对改动行数近似线性 (约 188 秒加每行 0.22 秒), 0147 约 2150 行时约 650 秒, 1000 行约 410 秒; 1000 是起点值, 之后按 Reviewer 用时与行数的关系调整. 拆分的成本是更多提交和各自的固定审核开销, 以及跨 issue 的依赖, 所以只在超过上界时拆. 该节是合并规则的唯一来源, `to-tickets` 的粒度条款已指向它, 不改. 分发副本 `distribution/baseline/docs/agents/agent-writes.md` 与源同步.
- 长期规范 `docs/specs/agent-repository-workflow/spec.md` 的 Commit Audit 一节 `prepare` 摘要警告一段加 (d), 措辞按上条, 其中 "同一 issue 内先 (c) 再 (a) 后 (b)" 改为 "同一 issue 内依次 (c) (a) (b) (d)".
- 代码 (`lib/commit-audit/commit-audit.mjs` 的 `recordWarnings`): 在返回数组末尾追加 (d) 一项, 与现有写法一致地内联, 不新增函数或导出.

## Testing Decisions

`tests/commit-audit/cli.test.mjs` 中已有的 "warns about a recorded net growth ..." 测试用已暂存的临时仓库 (不起 Reviewer 或其他子进程), 在其 issue 文本里加 `预计净增:` 的预算行, 使同一 issue 同时触发 (a), (b) 与 (d), 观察 `prepare` 摘要末尾的警告, 顺序为 (a) (b) (d): 分项之和与总量不符的片段报告一行, 范围写法 (`约 5 到 7 行`) 的低值与高值之和分别核对, 之和相符的片段, 括号内只有一个分项的片段, 总量没有 "约" 的片段都不报. 观察的是警告行的有无与顺序, 防止漏报预算分项不符, 也防止把没有歧义的写法误报. 规则文字改动不需要测试.

## Out of Scope

不改审核关卡, Reviewer 规则, `reviewer-launch` Skill 和 Reviewer 默认设置; 不做 Reviewer 能力 A/B; 不让要求符合审核拆成两个并行 Reviewer; 不核对 `## Comments` 中超出量数字.

## Module Design

Not required: 只在已有的 `recordWarnings` 中增加一条只读提示, Module 责任, Interface (摘要的行格式不变, 只在不符时多出 `warning:` 行), Seam, 依赖方向和权威来源不变.

## ADR Evaluation

无需 ADR: 提示不进入任何关卡. 先到先修只改 Main Agent 处理报告的时点, 修复暂存不影响读固定 `tree` 的 Reviewer, 不新增权威来源, 持久状态或恢复合同; 先到报告 `incomplete` 沿用现行处理, 与后到报告冲突用已有的冲突裁决, 没有新的失败路径. 体积上界是 issue 拆分规则, 不涉及这些.
