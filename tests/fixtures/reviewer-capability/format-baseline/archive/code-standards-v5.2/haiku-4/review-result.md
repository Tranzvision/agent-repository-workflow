- 违反 `src/AGENTS.md` 第 7.2 条: `src/catering/catering-service.mjs:4` 从 `schedules` feature 的 service 模块 `src/schedules/front-desk-service.mjs` 导入 `isFrontDeskOpen`, 并在 `:40` 的 `checkDeliverySlot` 中使用. feature 模块只能导入其他 feature 的 rule 模块. 影响: catering 的交付时段校验绑定了 schedules 的 service 组合 (store 读取加开放判断), schedules 服务的签名或行为变化会直接穿过 catering 传播.
  修复方向: 按第 7.4 条先把 "读取 schedule 与 closure 并判断开放" 的能力移入 `src/platform/` 公共模块, 由 schedules 与 catering 共用; 不要让 catering 复制 `deskState` 的读取逻辑.

- 违反 `src/AGENTS.md` 第 1 条 (禁止 default export): `src/catering/catering-states.mjs:35` 写了 `export default advanceOrder;`, `src/catering/catering-service.mjs:10` 以 default 形式导入.
  影响: 导入方可以任意改名, 且与本仓库的 named export 约定不一致.
  修复方向: 改为 `export const advanceOrder = ...`, 在 `catering-service.mjs:10` 按名称导入 (`advanceOrder` 在 `:100`, `:105`, `:111` 使用).

- 违反 `src/AGENTS.md` 第 4.2 条 (替换已捕获错误时必须保留 `cause`): `src/catering/catering-service.mjs:35` 写成 `new Error(消息, error)`, 把原错误作为 options 的位置传入, 而不是 `{cause: error}`, 因此原错误不会成为 `cause`.
  影响: 调用方无法从 vendor 通知失败中取得原始错误, 与同文件 `:20` 和 `:162` 的写法不一致.
  修复方向: 改为 `new Error(消息, {cause: error})`, 消息保持原文 `vendor of order ${order.id} was not notified`.

- 重复实现 `src/members/suspension.mjs:6` 的 `isSuspended(member, at)`: `src/catering/catering-service.mjs:55` 写成 `if (at < (member.suspension?.expiresAt ?? at))`, 复制了同一判断, 且 `members/suspension.mjs` 是可以导入的 rule 模块 (第 7.2 条允许).
  影响: 停用判断规则出现两份, 将来 `isSuspended` 的规则变化时 catering 会静默偏离.
  修复方向: 导入 `isSuspended` 并写成 `if (isSuspended(member, at)) throw ...`.

- 违反 `src/AGENTS.md` 第 5 条 (导出函数不得修改调用方对象或数组; store 返回的记录按调用方对象处理, 应构造修改后的副本再保存):
  - `src/catering/catering-service.mjs:73-74` `addLine` 对 `order` 做浅拷贝 `{...order}` 后执行 `amended.lines.push(...)`, 而 `lines` 数组与 store 中的原记录共享, 原记录被直接修改.
  - `src/catering/catering-service.mjs:83` `changeHeadcount` 直接执行 `order.headcount = ...`, 之后 `:84` 可能抛错, 此时调用方记录已被改写.
  - `src/catering/catering-service.mjs:94` `postponeOrder` 对 `store.find` 返回的记录执行 `Object.assign(order, ...)`.
  影响: 并发读取或失败路径会看到未保存的中间状态, 且调用方持有的旧对象被静默修改.
  修复方向: 三处都改为构造副本, 例如 `{...order, lines: [...order.lines, prepareLine(line)]}`, `{...order, headcount: prepareHeadcount(headcount)}`, `{...order, deliverAt, postponedAt: at}`, 校验通过后再 `store.save`.

- 违反 `src/AGENTS.md` 第 6.2 条和第 6.3 条, 同时 `cancelOrder` 对同一时刻的读取不一致: `src/catering/catering-service.mjs:111` 在 `advanceOrder(order, 'cancel', now())` 中调用一次 `now()`, 又在 `cancellationFee(order, context)` 中由规则模块 `src/catering/catering-pricing.mjs:35` 调用 `context.now()`. 同一次调用读取了两次时钟, 规则模块还接收了包含 `now` 函数的 `context`.
  影响: 取消时间戳与费用判断可能使用不同的时刻; 规则模块依赖了服务层的 `context` 结构, 违背规则模块只接收 instant 的约定.
  修复方向: `cancelOrder` 中先写 `const at = now();`, 把 `at` 同时传给 `advanceOrder` 和 `cancellationFee`; `cancellationFee` 改为接收 `(order, at)` 参数.

- 违反 `src/AGENTS.md` 第 6.3 条 (服务函数每次调用最多读取一次 `now`): `src/catering/catering-service.mjs:122` 的 `isUpcoming(now)` 在 `:124-126` 的 `upcomingOrders` 过滤器内对每个订单调用一次 `now()`.
  影响: 同一次查询中不同订单可能使用不同时刻判断是否即将到来, 结果依赖列表长度与执行时机.
  修复方向: 在 `upcomingOrders` 开头 `const at = now();` 读取一次, 过滤条件改为 `order.deliverAt >= at`.

- 重复实现已有的时段判断: `src/catering/catering-service.mjs:137-138` 的 `deskDeliveries` 用 `order.deliverAt - CATERING.deliveryLead` 和 `day`, `day + DAY` 手工判断交付窗口是否落在某天内, 而同一变更的 `src/catering/kitchen-manifest.mjs:52` 已使用 `contains(period, deliveryWindow(order))`, `deliveryWindow` 定义在 `src/catering/catering-policy.mjs:22`, `contains` 定义在 `src/platform/periods.mjs:3`.
  影响: 交付窗口的定义出现两份, 修改 `deliveryWindow` 时 `deskDeliveries` 不会同步.
  修复方向: 改为 `contains({startAt: day, endAt: day + DAY}, deliveryWindow(order))`, 并导入 `deliveryWindow` 与 `contains`.

- 导出但没有生产调用方的 Speculative Generality: `src/catering/catering-service.mjs:157` 的 `notifyVendorWithRetry` 及其 `attempts` 选项在本次比较中只被 `tests/catering/vendor-retry.spec.mjs:12,19` 调用; `placeOrder` 使用的 `notifyVendor` (`:31-37`) 没有重试.
  影响: 一个没有调用方的导出函数和选项会增加维护面, 测试只能证明它自身, 不能证明业务路径正确.
  修复方向: 若需求不要求重试, 删除该函数, 选项及对应测试. 若需求要求重试, 把它接入 `notifyVendor` 的生产路径, 并删除未被使用的 `attempts` 选项.

- 通用机制留在业务模块中 (仅当保留 `notifyVendorWithRetry` 时适用): `src/catering/catering-service.mjs:155-166` 的 `pause` 与重试循环不依赖 catering 语义, 只有错误信息文字是业务内容. `src/AGENTS.md` 的公共能力规则 (`docs/agents/writing.md` 的 Common capabilities) 要求不依赖业务语义的通用功能放入 `src/platform/`, 且不以已有多个调用方为前提.
  影响: 其他 feature 若需要相同的重试行为, 只能复制循环或导入 catering 的 service 模块, 后者违反第 7.2 条.
  修复方向: 把 "按次数重试, 保留最后一次错误为 cause" 的机制移入 `src/platform/` 的公共模块, catering 只保留 vendor 错误信息的包装.

- 同一文件混合了多项互不相关的职责, 导致报表或查询的修改会改动订单生命周期模块: `src/catering/catering-service.mjs:45-120` 是下单, 修改, 取消, 确认, 送达的生命周期; `:122-132` 是查询; `:134-153` 是服务台, 供应商和会员账单的报表; `:155-166` 是供应商通知重试. 报表与查询依赖 `feeds`, `desk`, billing 数据, 其变化原因是报表口径, 与订单状态机无关.
  影响: 每次调整报表或查询都需要打开并评审同一个 166 行的文件, 与生命周期代码的评审面重叠, 误改风险随之增加.
  修复方向: 把 `deskDeliveries`, `vendorStatements`, `memberInvoiceCharges`, `vendorManifests`, `listOrders`, `upcomingOrders` 移到单独的 service 模块 (例如 `src/catering/catering-reports-service.mjs`), 生命周期函数保留在 `catering-service.mjs`.

- 违反 `src/AGENTS.md` 第 4.3 条 (store 模块只能为保持写队列可用而捕获错误, 返回给调用方的 promise 必须仍然以原始错误拒绝): `src/catering/catering-store.mjs:33-40` 的 `save` 在 `:39` 执行 `.catch(() => undefined)` 后又在 `:40` 返回 `this.#writes`, 所以任何写入失败 (包括 request key 冲突 `:36`) 都会让调用方的 `save` 解析为 `undefined`.
  影响: `platform/records.mjs` 的 `saveThenNotify` 会把 `undefined` 当作已保存记录交给通知函数, 例如 `placedNotice(undefined, menu)` 或 `canceledNotice(undefined)` 随后抛出 TypeError, 原来的冲突错误被丢失; 同时 `placeOrder` 与 `cancelOrder` 无法得到真实失败结果.
  修复方向: 拆开队列与返回值: `const next = this.#writes.then(...); this.#writes = next.catch(() => undefined); return next;`.

- 违反仓库 `AGENTS.md` 的 Source Checkout JavaScript 样式 (除非外部 Interface 要求, 否则避免 `class`): `src/catering/catering-store.mjs:12` 定义了 `class CateringStore` 且使用私有字段. 同一仓库的既有 store `src/billing/invoice-store.mjs:3` 使用 `createInvoiceStore` 工厂函数返回 `Object.freeze` 的对象, 本变更未说明需要 class 形式的外部 Interface.
  影响: 同类 store 出现两种实现风格, 新 store 偏离既有约定.
  修复方向: 改为与 `createInvoiceStore` 相同的闭包工厂 (保留写队列与 request key 校验), 并导出 `createCateringStore`.

- 通用状态转换机制重复实现: `src/catering/catering-states.mjs:1-33` 的 `RULES` 表, 按 action 与 from 查找规则, 找不到时抛出 `cannot ${action} a ${state} ...`, 并复制对象写入 stamp, 与 `src/billing/invoice-states.mjs:8-13` 的 `advanceInvoice` 和 `src/maintenance/ticket-states.mjs:20-24` 的 `advanceTicket` 机制完全相同.
  影响: 三份相同的转换查找和错误格式逻辑, 修改其中之一 (例如错误信息格式或 stamp 写入方式) 时其他两份不会同步; 该机制与业务无关, 但没有放入公共模块.
  修复方向: 把 "规则查找, 无规则时抛错, 复制并写入 state 与 stamp" 移入 `src/platform/` 公共模块, catering 只保留自己的 `RULES` 表与 `history` 追加; 按第 7.4 条, 不要让 catering 直接导入 billing 或 maintenance 的 states 模块.

- 违反 `src/AGENTS.md` 第 6.1 条 (rule 模块不得读取当前时间): `src/catering/catering-notices.mjs:54` 在 `vendorNotice` 中写入 `sentAt: Date.now()`.
  影响: 通知内容依赖隐式时钟, 无法在测试中固定; 同一下单流程中的其他时间戳来自服务层 `at`, 这里却来自另一个时钟来源.
  修复方向: `vendorNotice(order, menu, sentAt)` 接收 instant 参数; `src/catering/catering-service.mjs:66` 的 `notifyVendor` 调用改为传入 `placeOrder` 中已读取的 `at` (`:51`).

- 同一概念两个名称, 其中一个只是转发: `src/catering/menu.mjs:52` 的 `findMenuItem` 只执行 `requireMenuItem(menu, id)` (`:46-50`), 没有增加策略. `src/catering/catering-notices.mjs:2` 与 `:10` 使用它.
  影响: 同一查找规则有两个名称, 读者需要确认它们是否真的相同; `docs/agents/writing.md` 的规则不得创建只转发调用的公共包装器.
  修复方向: 删除 `findMenuItem`, 统一使用 `requireMenuItem`.

- 只转发 platform 导出的中间模块: `src/catering/catering-time.mjs:1` 只有 `export {DAY, addMinutes} from '../platform/time.mjs';`, 唯一的消费者 `src/catering/catering-policy.mjs:4` 与 `src/catering/catering-service.mjs:11` 只是经它再导入.
  影响: 多一个文件和一层间接引用, 没有隐藏任何复杂性; 第 7.1 条允许 feature 模块直接导入 platform 模块.
  修复方向: 删除 `catering-time.mjs`, 两个消费者直接从 `../platform/time.mjs` 导入.

- 课程知识分散在三处, 新增或修改课程必须同时改三个文件 (Repeated Switches / Shotgun Surgery): `src/catering/menu.mjs:13` 的 `COURSES` 列表, `src/catering/catering-policy.mjs:6-14` 的 `prepMinutes` switch, `src/catering/catering-notices.mjs:7` 的 `SERVING_ORDER`. 其中 `catering-policy.mjs:12` 的 `default: throw` 只能处理 `prepareItem` (`menu.mjs:22`) 已经拒绝的课程, 对已校验数据的重复判断属于第 3 条禁止的内容.
  影响: 课程顺序和备餐时间的规则不在同一处定义, 漏改其中之一会造成通知排序或最早送达时间错误.
  修复方向: 在 `src/catering/menu.mjs` 用一张冻结的课程表同时描述顺序与备餐分钟数, 并导出查询; 删除 `prepMinutes` 的 switch 与 `default` 分支, 以及 `SERVING_ORDER`.

- 违反 `src/AGENTS.md` 第 3 条 (导出的数组和普通对象必须冻结): `src/catering/menu.mjs:11` 的 `export const DIETARY_TAGS = Object.keys(DIETARY_LABELS);` 导出了未冻结的数组.
  影响: 任何导入方都能修改全局的饮食标签列表, 进而改变 `requireDietaryTags` (`:16`) 的校验结果.
  修复方向: 改为 `export const DIETARY_TAGS = Object.freeze(Object.keys(DIETARY_LABELS));`.

- 违反 `src/AGENTS.md` 第 4.1 条 (rule 模块不得捕获错误): `src/catering/menu.mjs:37-41` 的 `loadMenu` 用 `try`/`catch` 包裹 `JSON.parse`.
  影响: 错误处理被放在不允许捕获的层, 且 `src/catering/catering-service.mjs:16-22` 的 `menuFor` 已经用 `{cause: error}` 包裹了 `loadMenu` 的任何错误, 因此这里的捕获没有额外作用.
  修复方向: 删除 `loadMenu` 中的 `try`/`catch`, 让 `JSON.parse` 的错误传到 `menuFor`, 由其保留 cause.

- 违反 `src/AGENTS.md` 第 2 条 (rule 模块不得导入 Node.js 内置模块, 只有 store 与 platform 模块可以): `src/catering/kitchen-manifest.mjs:1` 导入 `node:crypto`, 并在 `:46` 的 `manifestOf` 中用于计算 digest.
  影响: 哈希实现被固定在 rule 模块中, 违反分层约定.
  修复方向: 把 sha256 十六进制摘要移入 `src/platform/` 的公共模块 (例如 `digest.mjs`), `kitchen-manifest.mjs` 从平台模块导入.

- 重复实现已有的供应商路由规则, 且阈值分散: `src/catering/kitchen-manifest.mjs:19-25` 的 `KITCHENS` 与 `kitchenFor` 复制了 `src/catering/vendors.mjs:9-12` 的 `vendorFor` (清真走 crescent, 人数超过阈值走 banquet, 其余走 deli). 两处阈值分别写作 `:21` 的 `>= 31` 与 `vendors.mjs:1` 的 `LARGE_ORDER = 30`.
  影响: 修改供应商路由时需要同步两份规则, 一旦漂移, 厨房清单会把订单分到与 `order.vendorId` 不一致的分组.
  修复方向: `manifestOf` 直接按 `order.vendorId` 分组 (`placeOrder` 在 `src/catering/catering-service.mjs:58` 已用 `vendorFor` 写入该字段, `changeHeadcount` 在 `:84` 保证其不变), 删除 `KITCHENS` 与 `kitchenFor`.

- 导出函数修改调用方数组: `src/catering/kitchen-manifest.mjs:27` 的 `inDeliveryOrder` 对参数执行 `orders.sort(byDelivery)`, 而它被 `:51` 的导出函数 `kitchenManifests` (`:50`) 调用, 调用方传入的数组被原地排序. 该辅助函数只用一次且只包装一个调用.
  影响: 调用方的数组顺序被修改, 违反第 5 条; 函数名也没有说明它会原地排序.
  修复方向: 删除 `inDeliveryOrder`, 在 `:51` 直接写 `orders.filter(...).sort(byDelivery)`, 让 `filter` 产生的新数组被排序.

- 与已有的税额舍入重复: `src/catering/catering-pricing.mjs:9-12` 的 `share` 执行 `Math.round(amount * basisPoints / 1e4)`, 与 `src/billing/totals.mjs:5` 的 `roundedTax` 对非负整数的结果相同. catering 的 `taxable` 始终非负 (`src/catering/catering-pricing.mjs:17`).
  影响: 同一税额舍入规则出现两份, 修改 `roundedTax` 的舍入方式时 catering 报价会偏离账单.
  修复方向: 从 `../billing/totals.mjs` 导入 `roundedTax` (`rule` 模块之间的导入符合第 7.2 条), 删除 `share`, `:18` 改用 `roundedTax(taxable, taxBasisPoints)`.

- 未被调用方使用的选项: `src/catering/catering-statements.mjs:14` 的 `vendorStatement` 带有 `{withCanceled = false}` 选项, `:15` 据此分支, 而唯一调用方 `src/catering/catering-service.mjs:145` 没有传入该选项.
  影响: 一个没有当前要求的分支增加了统计逻辑的阅读成本, 违反 `AGENTS.md` 的 "只为当前验收标准写代码".
  修复方向: 删除 `withCanceled` 选项及 `:15` 中的 `withCanceled && ...` 分支.
