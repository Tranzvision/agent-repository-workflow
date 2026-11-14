# 在线维护对已退出且无 key 的共享 App Server 不再拒绝

## Problem Statement

共享 App Server 意外退出后, 身份文件 `app-server-process` 按规范保留给下一次启动核对. 此后若没有新任务, 就不会再启动共享进程, 文件一直残留. 这时 `node install.mjs` 的在线维护 (`prepareMaintenance`, 经 `closeSharedServer`) 核对到旧进程已退出, 仍报 `Shared App Server exited outside normal closure` 并拒绝, 安装无法进行, 只能先 spawn 一个 Agent 让共享进程重启. 没有任何 key 需要归还, 旧进程也已确认退出, 这个拒绝没有保护任何事实. 管理进程自己运行期间共享进程意外退出且无 Agent 时同样被拒.

## Solution

在线维护 (及共用同一关闭流程的空闲计时关闭) 在 "旧共享进程身份核对为已退出, 且没有持有或待归还的非空提供方独占凭据" 时放行: 只清理共享模型目录, 保留旧进程身份文件, 仍留给下一次启动核对. 有凭据, 或退出未确认时保持拒绝, 行为不变. 这与安装规范对离线维护已有的条件一致.

## Implementation Decisions

### Online maintenance with a stale ended identity

长期规格 `agent-repository-workflow-installation` 的 Installation transaction and recovery 节在离线维护一段末句之后写明本例外, 文字以该节为准: 管理进程关闭共享 App Server 时 (维护交接或连续空闲期满), 核对到旧共享进程已实际退出, 且数据库没有任何持有或待归还的非空提供方独占凭据时, 不因其意外退出而拒绝, 只清理模型目录并保留身份文件; 有此类凭据或退出未确认时仍拒绝, 根线程, 子 Agent 和工具退出的核验不变. 原句 "原有在线维护的资源归还和退出核验保持不变" 相应加上 "除下一句外".

- 管理进程 `closeSharedServer`: 仅在身份核对为已退出且存在持有或待归还凭据时拒绝 (原来无条件拒绝); 无凭据时调用 `nativeSessions.close({retainProcessIdentity:true})` 完成清理, 清理失败使维护返回 `unknown` 并可重试.
- Codex 适配器 `close()`: 连接已退出时不再自行拒绝, 走既有清理路径 (等待退出回调的模型目录清理, 错误照常抛出并可重试), 并保留身份文件 (细则见 Interfaces). 保留凭据的责任由管理进程 `closeSharedServer` 承担.
- 启动恢复不变: 下一次启动共享进程时仍按身份文件确认旧进程退出, 再核对并处理原 key, 之后才删除文件 (不变).

被否决的方案:

- 维护时删除身份文件: 与 "下一次启动恢复流程确认后才删除" 的既定时机相反, 且使下一次启动少一次核对依据.
- 仅放行离线维护: 管理进程仍在运行的常见情形 (本问题的来源) 仍无法安装.
- 管理进程启动时清理已退出的身份: 不覆盖运行中意外退出, 且同样提前删除文件.

## Testing Decisions

只用 mock: 管理进程案例覆盖冷启动已退出, 运行中意外退出, 无凭据时清理失败使维护返回 `unknown` 且重试成功, 持有 Strata key 时仍拒绝且不归还; 适配器案例覆盖意外退出后普通 `close()` (不带 `retainProcessIdentity`) 清理成功且身份文件保留, 模型目录清理失败可重试且重试后身份文件仍保留; 正常关闭后身份文件被删除, 清理失败时保留由既有案例覆盖. 不起真进程.

## Module Design

### Modules

后台管理进程 (`lib/background-agent/manager.mjs`) 继续拥有共享 App Server 的关闭决定与凭据归还; Codex 适配器 (`lib/background-agent/codex-app-server.mjs`) 继续拥有进程, 身份文件和模型目录的物理清理. 责任划分: 是否可以关闭, 含对凭据的拒绝, 完全由管理进程判断; 适配器 `close()` 不再对已退出连接做任何拒绝判断, 只执行清理. 这是责任归属的唯一变化.

### Interfaces

`nativeSessions.close(input?:{retainProcessIdentity?:boolean})` 的结果合同变化: 共享进程连接已退出时, 原来适配器自行拒绝 (`exited outside normal closure; process identity retained`), 现在走既有清理路径: 等待退出回调的模型目录清理, 清理失败时抛 `App Server exit cleanup failed: shared model catalog` 并可重试, 成功返回 `{environmentState:'exited'}`; 身份文件的删除由适配器按 `close()` 调用时连接是否已退出判定, 不依赖调用方的观察时点: 连接在调用时已退出 (意外退出) 的, 无论 `retainProcessIdentity` 取值, 都保留身份文件, 删除时机仍属下一次启动恢复, 重试清理时同样保留; 连接由本次 `close()` 关闭的正常关闭, 在清理成功后删除身份文件, `retainProcessIdentity` 为真时保留 (与既有行为一致). 没有共享进程连接 (管理进程重启后) 的路径不变. 适配器读取身份文件得到 `alive`, `ended`, `unknown` 或 `absent` (没有身份文件) 之一, 无连接时 `observeServer()` 把 `ended` 报为 `ended`, `absent` 报为 `absent`, 其余 (`alive`, `unknown`) 报为 `unknown`; `close()` 对 `ended` 按 `retainProcessIdentity` 决定是否删除身份文件 (管理进程对已退出的共享进程总传 `true`, 所以不删除), 对 `absent` 无操作, 对 `alive` 或 `unknown` 拒绝且不删除, 因此身份文件只在旧进程已确认退出后才可能被删除. `closeSharedServer` 的其他分支 (除 `ended` 且无凭据外的全部既有分支) 及其错误文本, 凭据与身份文件副作用都不变, 本变更只改变 `ended` 且无凭据时的结果 (拒绝改为放行并清理). 调用方 (管理进程) 在无凭据时才调用 `close()`; 有凭据的拒绝由管理进程在调用前完成, 不再依赖适配器, 错误文本不变 (`exited outside normal closure`).

### Seams and Adapters

既有 `NativeSessions` Seam 不变: 生产适配器与确定性测试 Adapter 仍通过同一 `close`/`observeServer` Interface; 不新增 Seam 或注入点.

### Dependencies and Data Flow

依赖方向不变 (管理进程依赖 `NativeSessions` Interface). 数据流: `observeServer()` 的身份核对结果与管理进程的凭据集合 (`activeProviders`, `providersAwaitingRelease`, `providers` 表) 共同决定是否调用 `close`; 身份文件只被保留, 不被维护删除. 根线程, 子 Agent 和工具的退出核验发生在 `closeSharedServer` 之前, 不变.

### Module Design Rationale

拒绝凭据的责任放在管理进程而不是适配器, 因为凭据集合只有管理进程知道, 适配器单独不能判断 "已退出" 是否安全放行; 这样适配器只剩物理清理, 不再重复一份不完整的判断. 接受的成本是适配器 `close()` 本身不再检查凭据, 绕过 `closeSharedServer` 直接调用它的调用方须自行保证没有凭据; 当前只有 `closeSharedServer` 与启动恢复 (此时没有共享进程连接) 调用它. 放弃的替代方案是在适配器 `close()` 增加凭据参数 (扩大 Interface) 和在管理进程绕过适配器直接放行 (模型目录不被清理, 且清理失败不可重试).

### ADR Evaluation

不需要新 ADR: 该改动保持 `docs/adr/0030-use-user-wide-background-agent-management.md` 的选择 (意外退出保留身份与未确认归还事实, 下一次启动先核对再处理 key), 不改变信任根, 授权边界或持久状态责任, 只收窄一个拒绝条件; 长期规格 `agent-repository-workflow-installation` 的理由与取舍已写入其 Module Design Rationale.
