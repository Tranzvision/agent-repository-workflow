---
name: reviewer-capability
description: 仅在维护者显式调用时, 在 ARW 源码仓库中测试 Reviewer 角色能否在 Codex 和 Claude 后端发现已知缺陷, 或比较模型的发现率.
disable-model-invocation: true
---

# Reviewer Capability

只在 ARW 源码仓库中由维护者显式调用. 结果不提供审核, 实施, 发布或提交授权. 套件完全由 `scripts/reviewer-capability.mjs` 和 `lib/reviewer-capability/` 实现 (Node, 无第三方依赖); 其合同在 `docs/specs/agent-repository-workflow-development/spec.md` 的 Module Design 节.

## Scenarios

场景在 `tests/fixtures/reviewer-capability/<role>/<scenario>/`, 目录名 `<role>` 就是受测角色. 夹具是只读输入, 保存的是物化后的最终结果:

- `base/` 和 `candidate/`: 场景仓库的基线提交与已暂存候选.
- `handoff.md` (可选): 追加到交接的场景说明.
- `expected.json`: 隐藏答案键 (问题用例与干净用例, 每例带 k 档位和证据位置), 只给评分用, 不进入场景仓库.
- `brief.md` 和 `anchors.json`: 盲裁 brief 与已知裁决的锚点和合成对照.

场景: `requirements-reviewer/code-spec`, `requirements-reviewer/commit-audit`, `code-standards-reviewer/code-standards`, `spec-readiness-reviewer/spec-readiness`. 新增缺陷要同时补答案键和候选中的确定位置; 测量中发现的真实未预设缺陷补进答案键并在 issue 中说明. 新增或修改场景时, Reviewer 可见的名称, 注释和顺序不得暗示缺陷位置, 也不得暗示问题用例与干净用例的分类 (例如文件名或注释里写 `bug`, `missing check`).

每道问题用例有 `severity` (干净用例没有, `merge` 配对两例相同), 供按报告范围计分 (第 8 步). 级别定义:

| 级别 | 定义 |
|---|---|
| `high` | 行为错误, 或会使结果错误或阻断工作的关卡或规则错误 |
| `medium` | 规则, 要求或设计相互矛盾或含糊到 Agent 可能误读, 会多花一轮, 或体积超出预算而可削减 |
| `low` | 措辞, 重复, 命名, 排版, 不改变行为也不致误读的整理 |

当前代码已存在的正确性, 数据丢失, 安全或并发缺陷至少为 `medium`; 只在将来改动一处而漏改另一处时才出错的重复按现状评级. 拿不准时为 `medium`. 评级由一个没有看过任何测量结果 (报告, 分数, 检出率) 的独立 Agent 只凭本定义, 场景文件和每例的 `expectation` 给出, 每例一句理由, 结果原样写入答案键; 不按候选是否报出来挑选重评的用例. 新增用例由作者按同一定义评级. 定义不写进盲裁 `brief.md` (改简报会使已存裁决过期).

## Run

1. 确认本次的角色, 场景, 后端和设置 (`model`, `modelProvider`, `reasoningEffort`, `serviceTier`). 每格先跑一次, 只对结果接近的格增加重复. 改动前后的评分对比 (A/B, 回归) 的 Reviewer 各组一律用 Codex `gpt-6-luna` `xhigh` (改动只能在 Claude 后端体现时除外): 两阶段 A/B 本来就要跑足够多的次数来吸收波动, 且 ARW 用户多数运行 Codex, 比较应当测量 Codex Reviewer. 判定 Reviewer 规则改动的 A/B 按事先固定的两阶段进行: 对照组 (改动前) 与候选组 (改动后) 交替启动, 各先跑 3 次, 两组候选并入同一批盲裁, 用 `summary --compare` 看差值 (候选减对照) 的 95% 区间: 整体低于 0 就拒绝, 候选均值不低于对照就接受, 其余情况两组各加跑到 10 次 (中途不看结果, 不提前停), 再按全部 10 次只判一次: 区间整体低于 0 就拒绝, 否则接受. 每个受测场景分别判定, 任一场景拒绝即拒绝. 结果表写出每阶段的差值与区间, 区间下界就是本次不能排除的降幅, 不把 "未拒绝" 写成 "没有降低". 不看两格各自区间是否重叠. A/B 两组使用同一版场景, 答案键, 简报和评分器并同期运行, 不与旧版本的历史分数比较; 除报告范围改动要求的严重度更新外, 不在同一改动里顺手修场景或答案键. 两格报告范围相同时判定用含范围外扣分的分数, 范围不同 (被测改动就是报告范围) 时用两格范围交集内不扣分的分数 (第 8 步). Reviewer 没遵循已有规则时先查原因, 不靠叠加同义指令代替诊断.
2. 在当前会话临时目录 `.tmp/<platform>/<session>/<run>/` 下为每个实例运行 `run` (实例目录必须是新路径, 恢复记录必须在会话临时目录内, 所以实例不能放在别处; 流程与结果见 `docs/specs/agent-repository-workflow-development/spec.md` 的 `run` 接口条目). `--settings` 是 JSON 对象, 例如 Codex `{"model":"gpt-6-luna","modelProvider":"openai","reasoningEffort":"xhigh","serviceTier":"default"}`, Claude `{"model":"haiku","modelProvider":"anthropic","reasoningEffort":"high","serviceTier":"default"}`:

   ```sh
   node scripts/reviewer-capability.mjs run <scenario-directory> .tmp/<platform>/<session>/<run>/<instance> --settings '<json>'
   ```

   `run` 用已安装的运行时 (`~/.agent-repository-workflow`), 不用检出中的实现; 两者不一致时照常运行, 记录里 `runtime.matchesCheckout` 为假, 需要严格同配置比较时测量期间不升级安装. Codex 沙盒中在沙盒外运行 (与 `reviewer-launch` Skill 对 `arw background-agent` 的说明相同).
3. 看 `run` 的输出 `{status, record}`:
   - `succeeded` 且 `record.validity.valid` 为真: 实例已计分, 目录里有 `score.json`, `candidates.json` (供 `pool build`), `agent.json`, `run.json`; 进入步骤 5. 计分报告是当前角色的自由格式 (`.txt` 或 `.md`, 要点 `- ... path:line`), 基线格式用 `.jsonl`; 没有可评分内容的报告记为模型失败 0 分, 不是故障.
   - `succeeded` 且 `validity.status` 为 `void` (`notes` 写原因: `timeout`, `no-completion`, `inspect-blocked`, `inspect-flags`): 实例作废, 不入盲池, 用新实例路径重跑. 同一格因同一原因 (`no-completion` 除外) 连续作废 2 次就停止并向用户报告 (多半是记录格式变了或 Reviewer 配置有问题); `no-completion` 连续 3 次不记分, 停止并报告维护者. `inspect-flags` 与 `inspect-blocked` 的完整条目或诊断对该实例重跑 `inspect` 查看 (`run` 不保留人工复核的例外). 结果表记录超时数.
   - `blocked` (未安装 ARW, 场景或目标不合法, `repair` 或 `score` 的输入问题) 或 `failed` (`stage` 为 `agent-control` 时后台运行可能仍在进行, 按 `reviewer-launch` Skill 观察或中断): 按诊断排除原因后用新实例路径重跑.
   报告由 `run` 取自 `completion.reportPath`; `--instance` 用实例目录名, 在不同报告间唯一. `baseline <unit>` (评分单元 `code-standards`, `code-spec`, `commit-audit`, `spec-readiness`) 校验该评分单元登记的 pBase 基线及其归档; 场景改动只涉及答案键, Reviewer 可见文件 (`base/`, `candidate/`, `handoff.md`) 不变, 且归档基线报告对改后场景计分仍复现登记的 r 与 T 时, 只把登记中的场景 SHA-256 改为新值; Reviewer 可见文件变化时重测基线 (作废与模型失败的运行重跑, 不计入) 并重新登记. `score` 的输出 `{status, candidates, scores}`: `candidates` 是尚未裁决的候选, `scores` 按现有裁决计分 (未裁决的候选按机械规则暂计), 含 `reportDiagnostics`, `scoreBeforePenalty`, 残差折减后的 `score`, 格式罚, 暂停扣分与 `final`. Commit Audit 的 txt 报告没有 satisfied 行, 只计问题召回.
4. 手工重算用 `run.json` 的 `report` 与 `repair` (本机路径, `export` 不输出): 需要对溢出文件 (Harness 把大输出保存成的文件) 引用的行号计分时, 对 `report` 重跑带 `--spill` 的 `repair` 再 `score`.
5. 盲裁: 把 `candidates` 数组存成 JSON 文件, 同一裁决批次的所有报告并入同一次建池:

   ```sh
   node scripts/reviewer-capability.mjs pool build <scenario-directory> <root> <name> <candidates.json ...> [--decisions <已有裁决库> ...]
   node scripts/reviewer-capability.mjs pool view <root> <name> <scenario-directory>
   node scripts/reviewer-capability.mjs pool prompt <root> <name>
   ```

   候选超过池上限 (150, Spec Readiness 与 Code Standards 为 210) 时自动拆成 `<name>-1`, `<name>-2` ... 多个池, 其余步骤对每个池各做一次; `--decisions` 让已有同简报裁决的候选不再入池. `pool view` 从夹具现场搭出被审状态写入 `<root>/<name>/adj/` (给场景目录), 不必从 Reviewer 工作过的实例目录取; 它还写 `change.diff`, 脱敏的 `REVIEWER-REQUEST.json` 与 `view-binding.json`, `pool prompt` 据此检查 `adj/` 未被改动. `adj/` 是裁判唯一可见的目录, key, 提示和裁决库在 `<root>/<name>/`, 不在 `adj/` 内.
6. 用 `pool prompt` 输出的 `prompt.md` 启动一个裁判 (至少 sonnet high, 不用 haiku), 让它读写 `adj/` (提示中 `<ADJ>` 就是 `adj`, 把 `adj/` 复制进裁判的工作目录). 裁判写出 `adj/decisions-<name>.json` 后:

   ```sh
   node scripts/reviewer-capability.mjs pool split <root> <name> <root>/<name>/adj/decisions-<name>.json [--hard <池项 id> ...]
   ```

   锚点一致率不低于 0.9 且合成对照全对才通过, 通过后裁决写入 `<root>/<name>/decisions.json`; 不通过返回 `blocked` 且不写任何裁决, 整池重裁. 输出含分族与分模型的一致率, 并在 `<root>/<name>/split-<name>.json` 给出 Main 复核清单 (全部 `supported`, 以及有争议的 `unsupported`: 裁判点名最难 (`--hard`), 理由含犹豫措辞, 或证据与别的候选相交). Main Agent 复核清单, 需要改的用 `pool override <root> <name> <stable-id> <decision> <reason> [--by <谁>]` (保留历史). 复核确认为稳定的关联裁决可登记为新锚点: `pool anchor-add <scenario-directory> <candidate.json> <matched|not-matched> --family <openai|anthropic|strata> --model <来源模型> --confirmed-by <谁> [--id <id>]`, 这是唯一写夹具的命令, 随后经 Git 提交.
7. 带上裁决库用 `run.json` 的 `report` 与 `repair` 重新计分: `score <scenario-directory> <report> (--repair <repair> | --no-repair) --agent <instance>/agent.json --instance <实例目录名> --decisions <root>/<name>/decisions.json`, 定稿后把输出写回 `<instance>/score.json` (`export` 只接受定稿的 `score.json`). 简报改动后旧裁决不再套用, 输出的 `staleDecisions` 列出它们, 须重裁. 关联候选被裁为 `not-matched` 后, 对应 finding 成为新的发现候选, `candidates` 非空时对它们再做步骤 5 和 6 (新池名), 并把新旧裁决库都传给 `--decisions`, 重复到 `candidates` 为空, 此时分数为定稿. 想先看分数区间可加 `--provisional lower|upper` (未裁决候选按最低或最高界值暂计, 结果不是定稿), `--enumerate` 只列出候选全集 (不要求 `--agent`, 无分数). 输出的 `templateFindings` 标出同一实例内文字雷同的 finding, 只作提示, 不改分数.
8. 统计: 每格 (一个模型 × 场景 × 设置) 的重复实例按开始先后给出定稿的 `score` 输出:

   ```sh
   node scripts/reviewer-capability.mjs summary [--markdown] --cell <标签> <score.json ...> [--cell <标签> <score.json ...>] [--compare <对照标签> <候选标签>]
       [--report-range <标签>=<级别,...> ...] [--range-penalty <p>]
   ```

   `--report-range` 声明一格的报告范围 (未声明为全部三级): 范围外的问题用例不进分母, 报出的每例按 p 乘 k 乘单元值扣分 (`--range-penalty`, 缺省 0.25). 两格范围相同时 `--compare` 用扣分后的分数 (`comparison.mode` 为 `same-range`); 范围不同时用交集内不扣分的分数 (`range-change`), 结果表另列候选格的 `outOfRangeK` (该格范围外报出的答案键用例 k 之和的均值, 是抽样估计), 只供判断候选是否遵守范围, 不参与接受或拒绝. 两格场景 SHA-256 不同, 或交集内没有问题用例时 `blocked`.

   每格前 5 个实例入主统计 (平均, SD, SE, 95% 区间, 负分数个数, 最小, 中位数), 其余列入 `extraIds` 并提示 (超时作废的实例不算入, 不给 `summary` 或 `--compare`); 未定稿的输入返回 `blocked`. `--compare` 用两格给出的全部实例 (不受前 5 个限制) 计算差值 (候选减对照), Welch SE, 自由度与 95% 区间, 只供第 1 步的 A/B 使用, 调用方只给该步规定的前 3 个或前 10 个实例.
9. 可用 `node scripts/reviewer-capability.mjs export <instance> ...` 取得带出处 (ARW 提交, 夹具树, 已安装运行时版本) 的实例记录. 在活动 issue 中写结果表: 每个模型 × 场景 (× 格式) 的 `score`, 耗时 (`run.json` 的 `time`), 召回, 误报和偷懒迹象 (未检查却声称满足, 批量填写, 错误定位, 格式损坏), 以及作废数与原因 (`inspect` 的标记). 说明样本量和天花板效应.

Strata 提供方先读 `docs/specs/agent-repository-workflow/strata.md`. 直接启动的 `claude -p` 不在本流程内.

## Drift check

发布时由 `release` Skill 的可选步骤调用, 也可由维护者单独调用: 读取 `./drift-check.md`.

## Finish

按 pid 停止本次启动的客户端和守护进程, 删除本次临时目录. 裁决库是套件唯一的持久可变状态, 需要保留时随结果一起归档.
