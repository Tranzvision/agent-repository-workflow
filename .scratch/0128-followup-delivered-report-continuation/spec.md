# 新任务准入不再续做被它取代的旧 Reviewer 任务

## Problem Statement

`followup_task` 和对已有身份发出 `newThread: true` 的 `spawn_agent` 都要求新绑定的报告是空文件. 调用方读完上一个任务的 `<id>:done` 后清空同一报告再发 follow-up 时, 这两个准入检查先刷新原运行; 刷新时 Reviewer 运行层看到 "原回合已结束, 报告为空", 按 Reviewer task continuation 节对未交付任务的规则, 向原线程发 "The bound report is empty" 的续做指示并开新回合. 于是 follow-up 以 `reviewer-busy` 失败, Reviewer 按催促重写报告, 之后的 follow-up 又因报告非空报 `report-binding-invalid`. 规范同时要求 "新任务的报告为空" 和 "空报告触发续做", 两条在这个场景下互相冲突, 调用方无法可靠地发出 follow-up.

## Solution

新任务取代旧任务: `followup_task` 与 `newThread: true` 的 `spawn_agent` 的准入检查不对旧任务发出程序续做; 准入的其余条件 (占用保护与收尾核对, 续做或原生回合仍在进行时的 `reviewer-busy`) 一律不变. 查询和原生通知对仍未交付的任务照常续做, 不变.

## Implementation Decisions

### New task admission

长期规格 `agent-repository-workflow` 的 Reviewer task continuation 节第一段末尾加一句, 文字以该节为准: 所属 Main 对同一审核身份发出的新任务 (`followup_task`, 或对已有运行的身份发出 `newThread: true` 的 `spawn_agent`) 取代旧任务; 这两种准入检查本身不对旧任务发出程序续做 (占用保护, 收尾核对和 `reviewer-busy` 拒绝等其余准入条件不变), 因为它们要求新绑定的报告为空, 旧报告被清空不是旧任务未交付的证据, 被取代的旧回合因此不计提前结束 (新审核任务本来就重置计数); 查询和原生通知对未交付任务的续做不变.

- `lib/reviewer-runtime/reviewer-runtime.mjs` 的 `refresh` 与 `observe` 增加可选参数 `allowContinuation` (默认 `true`); 两处准入检查 (`spawn` 的 `newThread` 分支, `followup`) 传 `false`, 只跳过 `continueTask` 分支. 其余观察 (状态, 终端清理, 完成判定, 违规检查) 不变. 旧任务被新任务取代, 其 `completion` 在新任务受理时清空 (既有行为).
- 占用保护, 终端清理和串行交接不变: 准入检查仍在原运行的串行执行器内进行, 仍先核对收尾状态, 程序续做已受理而尚未结束时 `record.state` 为 `starting` 或 `running`, 照旧以 `reviewer-busy` 拒绝, 所以同一线程不会在交接期间插入新回合. 变化只是: 旧回合已正常结束, 没有续做进行中时, 准入检查自己不再触发续做.
- 提前结束计数, 阈值通知和暂停随旧任务一起结束: 规范规定新审核任务才重置这些事实, 新任务受理后旧任务的计数不再相关; 被跳过的续做分支里的计数 (`noteEarlyExit`) 因此不对被取代的旧任务累计.
- 已 `ready` 且已持久化的运行随即退役, 之后的查询走冷路径, 本来不续做, 所以实际受影响的只有这两个准入检查.

接受的成本: 调用方在旧任务未交付时 (旧回合已结束但报告缺失或为空) 发出新任务, 旧任务不再由程序接续, 被放弃; 这是调用方的明确选择 (新任务按定义取代旧任务, 且其前置条件要求报告为空), 不是静默丢失. 没有发出新任务时, 未交付的任务仍由程序接续, 规范原有合同不变.

被否决的方案:

- 要求调用方等 Reviewer 静止后再清空报告: 运行层没有给调用方可靠的静止信号 (`list_agents` 在续做期间仍报 idle), 且清空报告本来就是准入的前置条件, 调用方无法绕开.
- 取消新任务对空报告的要求: 改变报告绑定与运行层隔离的既有合同 (新任务必须有自己的空报告), 影响面远大于本问题.
- 清空报告后由运行层记住 "已交付" 并持久化: 需要新增持久字段, 而只在准入检查跳过续做即可解决.

## Testing Decisions

只用 mock, 受理边界新增两个案例, 拒绝边界沿用既有案例 (原运行仍在执行时 `followup_task` 与 `newThread` 的 `spawn_agent` 以 `reviewer-busy` 拒绝, 见既有案例 `spawn accepts once before native work, then verifies a bound report and root-only usage` 与 follow-up 忙碌案例). 新增案例: 带 `continueTask` 的假原生会话. 案例一: 审核已 `ready` 后清空报告, `followup_task` 被受理, `continueTask` 调用 0 次且新回合启动. 案例二: 审核已结束但没有经过查询, 清空报告后 `newThread` 的 `spawn_agent` 被受理且 `continueTask` 调用 0 次. 修复前两个案例都以 `reviewer-busy` 失败. 既有案例 `a recoverable bound report read fault receives concrete feedback and resumes the same review` 继续验证未发出 follow-up 时对空报告或缺失报告的续做不变. 不起真进程.

## Module Design

### Modules

共享 Reviewer 运行层 (`lib/reviewer-runtime/reviewer-runtime.mjs`) 继续拥有 Reviewer 任务的接续 (长期规格已把 "公共任务接续" 列为它的责任), 占用保护, 容量和 `followup_task` 的分派仍归后台 Agent 管理 Module; 责任划分不变, 只是运行层自己的接续在它被两个准入操作调用时不再触发: 这两个操作先刷新原运行, 刷新里的接续是本变更要去掉的副作用.

### Interfaces

`followup_task` 与带 `newThread: true` 且身份已有运行的 `spawn_agent` 的调用方可见结果变化: 原回合已正常结束, 没有续做进行中, 旧报告被调用方清空时, 原来被运行层自己触发的续做抢占而以 `reviewer-busy` 拒绝, 现在受理并启动新任务. 原生仍在执行或续做进行中时的 `reviewer-busy` 拒绝及其他准入拒绝不变, 输入, 回执字段和其他错误码不变. 内部函数 `refresh` 与 `observe` 增加可选布尔参数 `allowContinuation` (默认 `true`, 不是公开 Interface).

### Seams and Adapters

不变: 原生会话 Seam (`continueTask` 等) 的 Interface 不变, 生产适配器与确定性测试 Adapter 照旧; 不新增 Seam.

### Dependencies and Data Flow

依赖方向不变. 数据流变化只有一处: 两个准入检查的刷新不再经由 `continueTask` 向原线程发送程序指示, 也就不再因此改变 `record.state`, 回合身份和早退计数; 其余数据 (快照, 报告, 计量, 恢复记录) 的读写不变, 不新增持久字段.

### Module Design Rationale

在运行层的两个准入操作里传参跳过续做 (而不是让后台 Agent 管理 Module 在调用前先判断旧任务是否未交付: 它不拥有报告和最终状态的判断, 要复制一份, 并扩大两个 Module 之间的 Interface), 而不是让运行层持久化 "已交付" 标记或调整报告清空要求, 因为新任务取代旧任务是准入检查本身的语义, 局部参数即可表达且不触及持久格式和调用方合同 (其他方案见上). 接受的成本见 Implementation Decisions: 旧任务未交付时被新任务放弃.

### ADR Evaluation

不需要新 ADR. 本变更改变两项合同, 分别评估: (1) 调用方可见的准入结果: 这一情形下 `reviewer-busy` 改为受理, 并把规则写入长期规格; 它消解规范内 "新任务报告为空" 与 "空报告触发续做" 的冲突, 只有一种可行的无冲突解释 (见被否决的方案), 不存在需要记录选择理由的多个同等架构方案, 也可随时撤销 (去掉两处参数), 不是难以逆转的承诺. (2) 恢复合同: 未交付任务由程序沿原线程续做, 现在对被调用方明确取代的旧任务让位 (接受的成本见上); 没有新增持久字段, 恢复记录格式和恢复流程不变, 其他情形的续做不变, 因而不改变持久状态或信任边界. 两项都不改变权威来源, 与 `docs/adr/0030-use-user-wide-background-agent-management.md` 的选择 (管理进程拥有任务身份与恢复, 运行层只处理审核责任) 一致, 无需新 ADR.
