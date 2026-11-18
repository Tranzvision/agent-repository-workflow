# Reviewer 能力验证答案键严重度与按报告范围计分

Status: completed

## What to build

设计见 effort 的 `spec.md`. 最终状态: 四个能力验证场景的答案键每道问题题都有严重度, `score` 输出每级组成与场景 SHA-256, `summary` 按每格的报告范围重算并按 Compare 节选择比较口径, 格式罚基线按新登记规则重新登记, `code-standards` 有 5 道 `high` 问题题, 规则与开发长期规格同步.

1. 答案键 (`tests/fixtures/reviewer-capability/*/*/expected.json`): 每道问题题加 `severity`, 取值原样采用本 effort `severity-grades.md` 的评级, 干净题不加. `lib/reviewer-capability/scenario.mjs` 的答案键校验: 问题题缺 `severity` 或取值不是 `high`, `medium`, `low`, 干净题有 `severity`, `merge` 配对两题严重度不同时 `blocked`.
2. `code-standards` 补 1 道 `high` 题 (spec 的补题节): 候选 `src/catering/catering-service.mjs` 的 `changeHeadcount` 改为先把新人数写入调用方传入的 `order` 再检查供应商, 行数不变; 答案键唯一 scope 的问题题末尾追加对应题 `code-standards:0:28` (默认 k, `severity` 为 `high`). 该计分单元重测格式罚基线: 5 次有效的 Claude `haiku` `high` `run` (作废与模型失败的运行重跑, 不计入), 报告与修复记录归档到 `tests/fixtures/reviewer-capability/format-baseline/archive/` 的新目录, 更新 `registry.json` (`version` 与 `source` 改写为本次运行; `scoringPatchSha256` 只是旧测量的来源记录, 新登记不写), 基线测试通过后删除被取代的旧归档, 引用旧归档的测试改用新归档, 全部在同一提交中.
3. 计分: `scoreExpectedScopes` 与模型失败路径 (`zeroCapabilityScore`) 输出 `severityUnits` (spec 的计分输出节); `score` 的 `scores` 增加 `scenarioSha256`. 现有字段值不变. `severity` 不进入候选与池的任何字段. `lib/reviewer-capability/scenario.mjs` 的场景 SHA-256 计入场景目录的 `handoff.md` (有时).
4. `summary`: CLI 新增 `--report-range <label>=<levels>` (可多次) 与 `--range-penalty <p>` (缺省 0.25), 按 spec 的按范围重算, Summary 与 Compare 节实现每格重算, 每格 `outOfRangeK`, 比较口径 (`comparison.mode`, `scoringRange`) 与 `blocked` 条件; `--markdown` 写出口径, 范围与 `outOfRangeK`. 重算复用 `scoring.mjs` 导出的 `kScore` 与 `deductScore`.
5. 格式罚基线: `code-spec`, `commit-audit`, `spec-readiness` 三个计分单元只把 `registry.json` 中的场景 SHA-256 改为新值 (现有复现测试证明 r 与 T 不变).
6. 规则: `docs/agents/source-checkout-reviewer-testing.md` 与 `$reviewer-capability` Skill 按 spec 的规则节修改; Skill 用 `node scripts/project-claude-skills.mjs` 同步 `.claude/skills/` 副本. 同时做 spec Further Notes 的两处补正 (Run 第 3 步作废阈值, 待测项登记表的提交号).
7. 开发长期规格 `docs/specs/agent-repository-workflow-development/spec.md` 的 Reviewer Capability Module 段落: 入口子命令说明加 `summary` 的两个选项, `score` 输出字段加 `scenarioSha256` 与 `severityUnits`, 答案键字段与校验加 `severity`, 场景身份含 `handoff.md`, 登记项的 `scoringPatchSha256` 写为可选 (只在沿用旧测量的登记项上有), 理由中 "只有场景变化时才重测" 一句按新登记规则改写. 不引用 `.scratch`.
8. 测试 (`tests/reviewer-capability/`): 按 spec 的 Testing Decisions 节.
9. 开发手册 `docs/manuals/development.md` 与 `docs/manuals/development.zh-CN.md` 的 Reviewer 能力验证命令块: 改为列出入口的全部子命令 (`run`, `export`, `inspect`, `setup`, `repair`, `score`, `baseline`, `summary` 含两个新选项, `pool`), 与 `scripts/reviewer-capability.mjs` 头部用法注释一致 (该注释同样加 `summary` 的新选项); 引导句不再写 "三组命令"; 两种语言内容同步.

不做: 重跑任何 A/B; 改 `run`, `export` 的输出; 改盲裁 `brief.md`.

预计净增: 非测试代码约 60 到 80 行 (`summary` 重算与比较约 40 到 50, 计分约 10 到 15, 答案键校验与入口约 10 到 15); 文档约 +3500 字符 (源码规则, Skill 两份副本, 开发长期规格约 +2500, 开发手册两种语言约 +1000); 测试约 80 行; 答案键数据 110 处严重度与 1 道新题; 基线归档 5 次运行.

预期验证: `pnpm test`; `pnpm typecheck`; `node scripts/project-claude-skills.mjs --check`; `node scripts/check-workflow-distribution.mjs`; `node scripts/generate-install-arw.mjs --check`; `node arw.mjs text check`; `node arw.mjs terms check --include .scratch/0147-reviewer-capability-report-range/`; `git diff --check`; 对四个计分单元运行 `node scripts/reviewer-capability.mjs baseline <unit>` 都返回 `succeeded`.

## Acceptance criteria

- [x] 四个答案键的每道问题题都有 `severity`, 取值与 `severity-grades.md` 一致, `code-standards` 有 5 道 `high` 问题题; 缺 `severity`, 非法取值, 干净题带 `severity`, 配对两题严重度不同时场景读取 `blocked`, 由测试覆盖.
- [x] `score` 的 `scores` 含 `scenarioSha256` 与 `severityUnits`; 三级 `weight` 与 `earned` 之和等于 `kProblemWeight` 与 `kEarnedProblemPoints`; 配对两题按一个单元计入; 同一答案键的两种合法严重度赋值下 `candidates` 及其指纹相同; 模型失败时 `earned` 与 `reportedK` 为 0 而 `weight` 不变; `handoff.md` 的字节变化改变 `scenarioSha256`; 由测试覆盖.
- [x] `summary` 对全部三级重算的 `final` 等于 `score` 的 `final`; 范围排除 `low` 时未报的低级题不影响分数, 报出的低级题按 p 乘 k 乘单元值扣分 (含部分命中), `--range-penalty 0` 时不扣; `outOfRangeK` 等于范围外 `reportedK` 之和的均值; 声明的格标签不存在, 级别非法或为空, 同一格重复声明, p 非法, 范围内没有问题题, 同一格内场景 SHA-256 不同, 旧版输出都 `blocked`; 由测试覆盖.
- [x] `summary --compare`: 两格场景 SHA-256 不同或交集为空时 `blocked`; 范围相同时 `mode` 为 `same-range` 且判定用扣分口径; 范围不同时 `mode` 为 `range-change`, 判定用交集不扣分口径; 由测试覆盖.
- [x] `node scripts/reviewer-capability.mjs baseline <unit>` 对四个计分单元都返回 `succeeded`; 归档基线复现测试全部通过; `code-standards` 的登记来自 5 次新的有效运行, 旧归档已删除.
- [x] 开发手册两种语言的命令块与入口头部用法注释列出相同的子命令与 `summary` 选项.
- [x] `docs/agents/source-checkout-reviewer-testing.md`, Skill 两份副本与开发长期规格按 What to build 第 6, 7 项更新, Skill Run 第 3 步写为 "同一原因 (`no-completion` 除外) 连续作废 2 次", 待测项登记表不再写 "本轮提交".
- [x] What to build 预期验证所列的每条命令 (`pnpm test` 等) 都退出 0.

## Validation

- 测试: `tests/reviewer-capability/reviewer-capability.test.mjs` 新增答案键严重度校验与 `handoff.md` 改变场景 SHA-256, 严重度单元求和 (含模型失败与两种严重度赋值下候选及指纹相同), 按报告范围重算与比较口径 (含各 `blocked` 条件) 三个测试; `format-penalty.test.mjs` 的归档复现循环断言各级 `weight` 之和等于 `kProblemWeight` (覆盖配对单元); `statistics.test.mjs` 的 Markdown 表含范围与 `outOfRangeK`; `tests/reviewer-capability-setup.test.mjs` 断言 `--report-range` 缺 `=` 时退出 2, 级别列表含空项 (`a=high,`) 与空的 `--range-penalty` 在读取文件前 `blocked`; 两格同为 `high` 范围时 `same-range` 的差值含范围外扣分 (0.05625, 不扣分时为 0).
- `code-standards` 补题: 5 次基线运行的 `score` 中, `haiku-3`, `haiku-4`, `haiku-6` 的报告写出了 `changeHeadcount` 原地修改 `order`, 都关联到新题 (`problem-29` 候选); 答案键严重度计数 high 5, medium 6, low 18.
- 格式罚基线重测: Claude `haiku` `high` 5 次有效 `run` (`haiku-1`, `haiku-3` 到 `haiku-6`; `haiku-2` 因 provider 容量用尽在 `agent-control` 阶段失败, 不计入), 归档到 `tests/fixtures/reviewer-capability/format-baseline/archive/code-standards-v5.2/`, 各次 r/T 为 6/52, 0/75, 4/81, 0/21, 0/26, pBase 0.0392157 (旧 0.0803571), bootstrap 90% 区间 [0.030581, 0.0718563]; 旧归档 `code-standards-v5.1` 已删除.
- `node scripts/reviewer-capability.mjs baseline <unit>` 对 `code-standards`, `code-spec`, `commit-audit`, `spec-readiness` 都返回 `succeeded`.
- `pnpm typecheck`, `pnpm test` (1033 个通过), `node scripts/project-claude-skills.mjs --check`, `node scripts/check-workflow-distribution.mjs`, `node scripts/generate-install-arw.mjs --check`, `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0147-reviewer-capability-report-range/`, `git diff --check` 全部通过.

实测净增:

```
code: +72 lines (files: 5)
documents: +5929 characters (files: 6)
tests: +357 lines (files: 30)
```

## Blocked by

- None - can start immediately

## Comments

- 来源: Main Agent 分配本 effort (报告范围计分, 答案键严重度, D1 决定现在补 `code-standards` 高级题, 并入规则整理复核发现 C16 与 F4). 按根 `AGENTS.md` 的 `rule-and-design-changes` 例外, Main Agent 的确认即为用户确认, 本 issue 对规则, Skill 与开发长期规格的改动以此为确认依据.
- 体积: 预计代码约 +60 到 80 行, 文档约 +3500 字符, 测试约 80 行; 实测代码 +72 行, 文档 +5929 字符, 测试 +357 行. 文档超出约 2430 字符: 预计把约 3500 字符全部分给开发长期规格 (+2500) 与开发手册 (+1000), 没有给源码规则与 Skill 两份副本留量, 实测这三份共 +2557 (Skill 严重度表, 评级方法, 两种比较口径与新基线登记规则, 每份副本 +1128), 规格 +1939 与手册 +1433 合计与预计相近. 测试行数中 +88 是测试代码 (与预计相近), 其余是四个答案键的严重度与新题 (+139) 和新旧归档的替换.
- 基线变化: `code-standards` 的 pBase 由 0.0803571 降到 0.0392157, 新值低于旧 bootstrap 90% 区间下限 0.0429185; 5 次中 3 次 r 为 0. 该单元同样的格式错误率 p 现在得到约两倍的格式罚 f (到 p 等于 2 倍 pBase 时封顶), 以后与旧基线下的 `final` 不可直接比较 (场景 SHA-256 已变, `summary --compare` 本就 `blocked`).
- 台账: .agents/skills/reviewer-capability/SKILL.md Run 第 1 步 "两格报告范围相同时判定用含范围外扣分的分数, ..." 一句 冲突裁决 Code Standards 第 1 轮建议删去该句 (与第 8 步重复), 要求符合审核第 2 轮要求保留; effort spec Rules 节 `$reviewer-capability` Skill 条目要求 Run 第 1 步写明两种比较口径, 按 spec 保留该句.
