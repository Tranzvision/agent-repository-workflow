# 命令行模型的 Reviewer 能力套件

## Overview

安装 ARW 的用户可以在独立工作目录中调用模型命令, 用 ARW 的四个 Reviewer 场景生成可导入的结果包. 发布包提供同一版本的场景, 计分实现和运行所需的 Reviewer 指令. 导入方根据结果包记录的 ARW 提交和夹具树选择兼容的来源. 盲裁仍使用源码套件.

## Module Design

### Modules

Reviewer Capability 复用已有的 `setup`, `repair` 和 `score` 操作. 命令行运行负责运行矩阵, 模型进程, 续跑记录和结果包. 安装和发布负责交付这些操作所需的资源及其出处. 场景, 答案键和计分语义由现有 Reviewer Capability 合同拥有.

### Interfaces

命令行配置, 退出值, 续跑和归档合同由 `docs/specs/agent-repository-workflow/spec.md` 的 Command-line Reviewer capability 节拥有.

### Seams and Adapters

进程边界为配置的可执行命令, 文件边界为每次运行的独立实例. 假 CLI 通过同一外部进程边界覆盖提示和报告交付.

### Dependencies and Data Flow

入口将实例目录交给现有 `setup` 生成模型输入. 模型写到绑定的报告路径. `repair` 与 `score` 使用同一版本的 ARW 夹具, 然后保存记录. 成功实例最后写完成标记, 以便打断后的 `run` 恢复, 以及 `pack` 忽略半写实例. 发布时由干净源码检出提供 Git 提交和夹具树, 两种出处及 ARW 版本随安装资源传递给运行记录. 安装后的运行和打包不依赖用户目录处于 Git 检出中.

### Module Design Rationale

已有评分入口让原生和命令行模型使用同一个计分实现. 安装资源随同一 ARW 版本交付, 使远端机器使用的输入和结果包中登记的出处可以对应. 打包只保存可用于导入和重算的记录, 使原始调用日志和模型账户环境留在运行机上. 使用各 CLI 自己的权限控制, 使操作者能选择任意支持隔离的模型命令, 避免为每个工具在 ARW 内实现权限适配. 文本扫描用于发现可观察的泄漏. 静默读取无法由扫描发现, 因此结果有效性仍依赖操作者核对实际隔离能力.

### ADR Evaluation

安装载荷新增能力运行和计分资源, 并承担记录其 Git 出处的责任. 运行的持久状态位于调用方选择的结果目录, 完成实例由 `driver.json` 标记恢复, 跨机器交接用带 SHA-256 的结果包. Workflow Distribution 中的源码 Skill 分发决定保持适用. 开发, 发布和安装规范必须同步限定哪些能力操作和资源进入安装载荷. 涉及 `docs/specs/agent-repository-workflow-development/spec.md` 的 Reviewer Capability Module, `docs/specs/agent-repository-workflow-release/spec.md` 的 Reviewer capability tests 节, `docs/specs/agent-repository-workflow-installation/spec.md` 的安装压缩包内容, 以及 `docs/specs/agent-repository-workflow/spec.md` 中命令行运行与普通独立审核的边界.

命令行隔离边界不需要新增 ADR. 操作者在当前用户权限下选择进程和该 CLI 提供的隔离设置, 并承担夹具未被访问的验证责任. ARW 的普通审核授权, 后台进程和两种原生 Reviewer 的权限控制保持现有合同. CLI 结果由操作者用于能力评估, 不进入审核关卡. 主规范明确规定隔离责任和文本扫描的观测限制.

版本化结果包不需要新增 ADR. 它延续能力套件的运行记录并为跨机传输加上准确成员清单与字节摘要. SHA-256 校验传输完整性, 来源认可由导入方已有的 Git 提交和夹具树允许列表决定. 归档不成为签名证明, 不授予审核权限, 不新增服务或跨仓库持久状态.

## Testing Decisions

用安装包载荷和假 CLI 在隔离目录中执行四场景闭环, 检查包成员和摘要, 比较现有评分入口的输出. 用无效配置和重复列表核对拒绝, 用假 CLI 核对参数, 模板文件和环境交付. 用受控调用结果覆盖超限, 超时, 失败和作废, 检查持久停止记录和重新运行时调用次数. 用损坏文件, 不同出处和不同命令版本的结果验证打包前拒绝. 省略目的路径时读回输出路径. 令打包在目标原本不存在和目标已有文件时分别写入失败, 核对前者不留下目的文件, 后者保留已有文件的准确字节. 配置示例的真实模型调用由运行方自行执行.
