# 修复 1118 全量重审确认的 spec 文字问题 (7 项)

Status: completed

## What to build

修复 `ARW/fullrev1118` (固定提交 `ee689d0`) 确认的 spec 文字问题, 只改文档, 不含设计决定 (Spec Readiness 记 `not-applicable`); 行号以实施时 main 为准.

- `docs/specs/agent-repository-workflow/spec.md:683` 写根 README "可以提供 Application 工程的完整操作章节", 与 `arw-reader-documentation/spec.md:21-27,55-56` (README 只做路由, 手册 `docs/manuals/application-jira.md` 已存在) 冲突. 改为 "根 README.md 是项目入口, 读者文档的分工见 ../arw-reader-documentation/spec.md, 不复制长期规格的合同与理由".
- `agent-repository-workflow-installation/spec.md:567` 引用 `ARW-ENGINE-001` 到 `-016`, 全仓库只出现这一处, 是悬空引用. 删去该句.
- `agent-repository-workflow-development/spec.md:542` "每个实际规则对象另外运行公共静态断言辅助程序" 与 :231, :257 "不建公共断言辅助程序" 矛盾, lib 与 tests 中无此辅助程序. 删去该句.
- `agent-repository-workflow-application-jira/spec.md` "Application validation and completion" 首句 "每个包含 Application Source Issue 的 effort 必须声明验证 issue", 但完成条件与 `application-completion.mjs:30-33` 对所有关联 JIRA 的 effort 要求恰好一个声明. 首句改为 "每个关联 JIRA 的 effort".
- Strata 租约与 key 规则在 `agent-repository-workflow/spec.md` 约 L306, L350, L368 与 `strata.md` 重复. 保留 Capacity and recovery 一处完整规则, 其余只引用 (约 -1500 字符).
- S2-2 `agent-repository-workflow/spec.md` 的 `workflow update` 摘要规则 (约 :576) 没写 `migratedRuleDocuments`: 新分发不再包含旧锁文件记录的某个 `baseline-major` 规则文档, 而该文档去掉受管区域后仍有仓库自有内容时, `workflow update` 把这些内容追加到 `AGENTS.md` 的仓库自有区域并删除原文件, 更新后输出一空行, 一行 `Repository-owned content of these removed rule documents was moved into the repository-owned region of AGENTS.md; review it there:` 和每个原路径一行 `- <path>`. 行为来自 effort 0001 issue 13 的验收项, 代码与测试已有, 在角色种子提示之前补这条行为与提示的说明. 只改 spec, 约 +350 字符.
- S3-2 `agent-repository-workflow-installation/spec.md` (约 :193, :348) 只写了维护端口范围, 没写控制端口 30000-49999 及其取舍, :348 的 "(其端口规则不变)" 指向不明. 在维护端口那句之后补控制端口范围, 与 Linux 临时段 (32768-49999), Windows 动态段 (49152-49999) 的重叠, 启动时绑定失败为明确失败, 保留的理由 (改它会使新安装器无法经控制端口停止旧管理进程) 和接受的代价 (Linux 偶发启动失败重试即可, Windows 保留块盖住时重启前无法启动); :348 改为 "(30000-49999, 端口规则不变)". 选项 A: 只改 spec, 不改端口代码. 约 +300 字符.

预计净增: 文档约 -150 字符 (Strata 重复 约 -500, 其余删句 约 -300, S2-2 约 +350, S3-2 约 +300).

## Acceptance criteria

- [x] 七处文字按上述修改后, 全仓库 `git grep` 不再有悬空 `ARW-ENGINE-` 引用, 且同一事实只在一处完整陈述.
- [x] 英文与中文用户文档不受影响; `node arw.mjs text check` 与 `node arw.mjs terms check --include .scratch/0139-fullrev1118-spec-text/` 通过.

## Blocked by

- None - can start immediately

## Validation

- `git grep -n "ARW-ENGINE-" -- docs lib tests` 无结果 (原有悬空区间和 `agent-repository-workflow/spec.md` 的所有权句一并删去).
- `node arw.mjs text check`, `node arw.mjs terms check --include .scratch/0139-fullrev1118-spec-text/`, `git diff --check` 通过.
- Strata 重复规则: 保留 `agent-repository-workflow/spec.md` Capacity and recovery 节 (`Strata 驱动只从 ...` 段) 的完整规则, 提供方持久化一节只留指向它的引用.

实测净增:

```
code: 0 lines (files: 0)
documents: +247 characters (files: 4)
tests: 0 lines (files: 0)
```

## Comments

- 来源任务: 总层 `ARW/fullrev1118`. 低级 spec 文字问题 (重复, 措辞, 错别字) 只记台账.
- Spec Readiness 记 `not-applicable`: 依据 `AGENTS.md` Source Checkout Baseline 例外中用户常设确认 (2026-11-02), 只改文字, 不含设计决定.

- 体积: 预计 -150 字符 (What to build), 实测 +247 (Validation), 超出约 397 字符. 按实际 diff 分项 (字符, 约数):

| 项 | 预计 | 实测 | 超出 |
|---|---|---|---|
| Strata 重复 | -500 | -335 | +165 |
| S2-2 | +350 | +393 | +43 |
| S3-2 | +300 | +340 | +40 |
| 其余四处删句 (悬空 ENGINE 区间与所有权句, 断言辅助, README 一句改写, 验证 issue 首句) | -300 | -153 | +147 |
| 合计 | -150 | +247 | +397 |

Strata 的重复实际只有 `providers` 持久化一节中的三句可删, 其余是指向或 Capacity and recovery 节本身; 其余四处都是单句替换或删除, 估计偏大. 能删的重复已删, 没有可再删的部分.
