# 初始化交接清单提示忽略引擎临时根, 并顺带合并三项小修

## Problem Statement

本 effort 合并 2026-11-14 与 2026-11-15 每日检查发现的三项小修. 只有第一项含设计取舍, 另两项不含设计决定, 合并是为了省去单独走一次就绪审核和提交审核的固定开销.

**目标仓库没有忽略 `.tmp/`.** Agent 按规则把引擎临时文件 (请求 JSON, Reviewer 报告, 后台 Agent 恢复记录) 写在目标仓库的 `.tmp/<平台>/<会话>/` 下, 但 `arw workflow init` 既不创建也不修改 `.gitignore` 或 `.git/info/exclude`, 初始化后交接清单 (`arw workflow init` 成功后返回的 `handoff.checklist`) 也没有提到它. 已复现的后果: `git add -A` 会把引擎临时文件暂存, 提交审核的 `prepare` 从实时索引取候选, 它们因此进入审核候选和提交; `arw text check` 把未被忽略的 `.tmp/` 文件当作受管理范围, 临时文件含 CRLF 时失败. 在仓库 `.gitignore` 加入 `.tmp/` 后两者都消失, 结果可逆.

## Solution

初始化后交接清单增加一项 "仓库根 `.gitignore` 忽略引擎临时根 `.tmp/`, 缺失时加入", 长期规格的 `Post-init handoff` 节同步一条. 它是 Main Agent 初始化后自查清单的一项, 与清单中其他项同属 Agent 审核, 缺口按该节既有规则汇入同一个仓库工作流补全 issue.

另两项不改任何设计:

- `lib/document-terms/document-terms.mjs` 中不可达分支, 冗余排序和重复的诊断字面量清理, 输出的诊断集合, 顺序和退出结果不变.
- `commit` Skill 的实施提交流程增加一句作者侧写作规则: issue `## Comments` 里的体积说明中, 预计取 `## What to build` 的预计净增, 实际取最后一次修改后的 `## Validation` 数字, 超出量为二者之差.

## Implementation Decisions

### Post-init handoff

清单只增加一项, 文字为 `The repository root .gitignore ignores the engine temporary root .tmp/ (add it when missing)`, 位于 `.arwignore and Agent-managed Scope` 之后. "已忽略" 以仓库根 `.gitignore` 为准: 其规则已使 `.tmp/` 被忽略 (例如 `.tmp` 或 `.tmp/`) 时审核视为满足; 否则补救是把 `.tmp/` 写入仓库根 `.gitignore`, 没有该文件就新建一个只含这一行的文件. 不以 `.git/info/exclude` 或用户全局忽略为准, 因为它们不随仓库保存, 满足它们的机器上审核通过, 而其他克隆仍会暂存引擎临时文件; 代价是已在本地忽略的用户也会被提示一次, 补一行即可. 清单是审核提示, 不是 Engine 检查: `workflow init` 不新增写入, `workflow verify` 不新增诊断, Engine 观察到的缺口列表 (`gaps`) 不变.

被否决的方案:

- `workflow init` 自己写 `.gitignore` 或 `.git/info/exclude`: 要改变目标仓库已有文件的所有权, 或写入不受版本管理的本地状态, 还要决定卸载时如何还原, 这些是单独的设计决定, 本 effort 不做.
- `workflow verify` 对 `.tmp` 未被忽略报诊断: 新增一项 Engine 检查, 违反效率与精简最高原则第 6 条, 清单提示已足以让每个新目标仓库在初始化后审核时处理一次.

### Behavior-preserving cleanup in document terms

只做不改变可观察结果的删减: 删去不可达的条件分支 (`parseContextMap` 在存在诊断时调用方已提前返回, `parseAvoidNames` 的 `split` 至少返回一个元素); 删去结果已由 `resultFrom` 统一排序而冗余的排序和 `unshift` 次序; 把 `parseLocalTerms` 中两处相同的 `local-term-entry-invalid` 诊断字面量合并为一个局部构造函数. 没有可观察差异, 所以不新增测试, 由现有 `tests/document-terms` 覆盖.

### Comments budget numbers

`commit` Skill 的实施提交流程已要求把 `prepare` 的摘要块原样写入 `## Validation` 或 `## Comments`. 本次只补一句: `## Comments` 中的体积说明 (预计取自 `## What to build` 的预计净增, 实际取自 `## Validation` 的摘要, 超出量为二者之差) 在最后一次修改 `## Validation` 数字后同步重写, 因为数字与 Validation 不符曾在多次提交审核中被反复提出. 该规则只约束 Main Agent 的写作, Reviewer 读取的检查项不变.

## Testing Decisions

清单项只在现有的初始化测试中加一条断言 (`handoff.checklist` 含新增文字), 不新增运行进程的测试. 文档字符与规则文字不测试.

## Out of Scope

- 不改 `workflow init` 的写入范围, 不改 `workflow verify`.
- 不处理 1.0 规范中引擎状态根由谁保证被忽略, 该输入另行交给 1.0 工作.
- 不提交审核前禁止留 "待决定" 项的规则: 目前只有一例证据.

## Module Design

Not required: 只给初始化后交接清单增加一个字符串, 删去 `document-terms` 中等价的冗余代码, 并在 `commit` Skill 增加一句文字; 不改变任何 Module 的责任, Interface (清单是字符串数组, 只增加一项), Seam, 依赖方向, 权威来源或数据流.

## ADR Evaluation

权威来源不变: 目标仓库是否忽略 `.tmp/` 仍由仓库自己的 `.gitignore` 决定 (已有的权威, 本 effort 不新增), 清单只提示审核, 补救写入的也是该文件. 不增加持久状态, 不改变恢复合同. 否决的两个方案本身才会改变所有权或增加 Engine 检查, 所以不需要新 ADR.
