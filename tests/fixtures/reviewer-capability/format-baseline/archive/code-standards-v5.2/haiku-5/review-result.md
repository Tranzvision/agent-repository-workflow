- src/catering/catering-store.mjs:39-40 `save` 在写入链末尾 `.catch(() => undefined)` 之后返回 `this.#writes`, 吞掉了写入失败的错误, 违反 src/AGENTS.md 规则 4.3 (store 只能为保持写入队列可用而捕获, 返回给调用方的结果必须仍然 reject 原始错误).
  影响: 唯一请求键冲突等写入失败时, `save` 解析为 undefined. `placeOrder` 经 `saveThenNotify` 把 undefined 传给 `placedNotice` 而抛出 TypeError, 掩盖真实原因. `addLine` (src/catering/catering-service.mjs:77-78), `changeHeadcount` (:85-86) 和 `postponeOrder` (:96) 在订单未保存时仍返回成功结果.
  修复: 参照 src/platform/append-log.mjs:10-16 的写法: 先 `const write = this.#writes.then(...)`, 再 `this.#writes = write.catch(() => undefined)`, 最后 `return write`.

- src/catering/catering-service.mjs:73-74, 83, 94 `addLine`, `changeHeadcount`, `postponeOrder` 直接修改订单记录 (`amended.lines.push(...)`, `order.headcount = ...`, `Object.assign(order, ...)`), 违反 src/AGENTS.md 规则 5 (导出函数不得修改调用方传入的对象或数组, 由 store 返回的记录同样视为调用方传入). `store.find` 返回的是 src/catering/catering-store.mjs:21-22 中的内部对象, 因此后续 `itemsFor`, `vendorFor` 或 `checkDeliverySlot` 抛错时, store 中的记录已经被改动但未保存. `addLine` 的 `{...order}` 只复制外层对象, `lines` 数组仍与原订单共享.
  修复: 三处都改为构造新对象, 校验通过后再 `store.save`. 例如 `const amended = {...order, lines: [...order.lines, prepareLine(line)]}`, `const changed = {...order, headcount: prepareHeadcount(headcount)}`, `const postponed = {...order, deliverAt, postponedAt: at}`.

- src/catering/kitchen-manifest.mjs:27, 51 `inDeliveryOrder` 对 `kitchenManifests` 收到的 `orders` 原地调用 `sort`, 而 `kitchenManifests` 是导出的规则模块函数, 违反 src/AGENTS.md 规则 5. 当前调用方 `vendorManifests` 传入的是 `store.list` 返回的新数组, 所以运行结果未暴露, 但导出函数的契约已被破坏.
  修复: 删除只用一次的 `inDeliveryOrder` 包装, 在 `.filter(...)` 之后排序 (filter 产生新数组), 或使用 `toSorted(byDelivery)`.

- src/catering/catering-service.mjs:109-111 `cancelOrder` 先调用一次 `now()` 作为 `advanceOrder` 的时间, 又把 `context` 传给 src/catering/catering-pricing.mjs:35 的 `cancellationFee`, 后者调用 `context.now()`. 这同时违反 src/AGENTS.md 规则 6.3 (service 函数每次调用最多调用一次 `now`) 和规则 6.2 (规则模块接收 instant, 不接收 `now` 函数).
  影响: 同一次取消中读取了两次时钟, 取消费用的判断时刻与 `canceledAt` 可能不一致.
  修复: `cancelOrder` 中 `const at = now()` 只调用一次, 传给 `advanceOrder(order, 'cancel', at)`, 并把 `cancellationFee` 改为接收 instant 参数 (例如 `cancellationFee = (order, at) => ...`).

- src/catering/catering-service.mjs:122, 125 `isUpcoming(now)` 在 `filter` 中对每个订单调用一次 `now()`, 违反 src/AGENTS.md 规则 6.3 (一个 service 函数每次调用最多调用一次 `now`).
  影响: 同一次 `upcomingOrders` 查询中, 不同订单使用不同时刻判断是否即将送达, 结果随列表长度和遍历顺序变化.
  修复: 在 `upcomingOrders` 中 `const at = now()` 只调用一次, 把 `isUpcoming` 内联为 `canCancel(order) && order.deliverAt >= at`.

- src/catering/catering-notices.mjs:54 `vendorNotice` 在规则模块中调用 `Date.now()`, 违反 src/AGENTS.md 规则 6.1 (只有 service 模块读取当前时间, 规则模块只接收 instant).
  影响: 通知时间不由调用方的时间源决定, 无法在测试或同一次 service 调用中统一时刻. 调用链 src/catering/catering-service.mjs:33 `notifyVendor` 调用 `vendorNotice(order, menu)` 时没有传时间, 而 `placeOrder` 的 `at` (第 51 行) 已经存在.
  修复: `vendorNotice(order, menu, sentAt)` 接收 instant, 由 `placeOrder` 把 `at` 经 `notifyVendor` 传入.

- src/catering/catering-service.mjs:4, 40-42 `checkDeliverySlot` 导入并调用 src/schedules/front-desk-service.mjs 的 `isFrontDeskOpen`. 该文件是另一功能的 service 模块, 违反 src/AGENTS.md 规则 7.2 (功能模块可以导入其他功能的规则模块, 不得导入其他功能的 service 或 store 模块).
  修复: 通过已注入的 `desk` store 调用 `findSchedule(buildingId)` 与 `listClosures(buildingId)` (与 src/schedules/front-desk-service.mjs 中 `deskState` 的调用方式相同), 再用 src/schedules/desk-policy.mjs 导出的 `isDeskOpen(schedule, closures, at)` 判断.

- src/catering/catering-service.mjs:35 `notifyVendor` 用 `new Error(message, error)` 包装原始错误, 第二个参数不是 `{cause: error}`, 因此原始错误没有被保存为 `cause`, 违反 src/AGENTS.md 规则 4.2. 同文件第 162 行的 `notifyVendorWithRetry` 写法正确.
  修复: 改为 `new Error(message, {cause: error})`.

- src/catering/menu.mjs:35-41 `loadMenu` 是规则模块, 却用 try/catch 捕获 `JSON.parse` 错误, 违反 src/AGENTS.md 规则 4.1 (规则模块不得捕获错误). 同一失败路径已由 src/catering/catering-service.mjs:16-22 的 `menuFor` 捕获并以 `cause` 保留, 因此该 catch 与之重复.
  修复: 删除 `loadMenu` 中的 try/catch, 让解析错误向 `menuFor` 传播.

- src/catering/catering-states.mjs:35 使用 `export default advanceOrder`, 违反 src/AGENTS.md 规则 1 (禁止默认导出). 调用方 src/catering/catering-service.mjs:10 以默认导入使用它.
  修复: 改为具名导出 `export const advanceOrder`, 调用方改为具名导入.

- src/catering/kitchen-manifest.mjs:1, 46 规则模块 `kitchen-manifest.mjs` 导入了 `node:crypto` 的 `createHash`, 违反 src/AGENTS.md 规则 2 (只有 store 和 platform 模块可以导入 Node.js 内置模块).
  修复: 把 SHA-256 摘要计算放到 src/platform/ 下的公共模块中, 规则模块只负责生成 CSV 和订单元数据, 摘要由调用链上的 service 或 platform 函数补充.

- src/catering/menu.mjs:11 `export const DIETARY_TAGS = Object.keys(DIETARY_LABELS)` 导出的数组没有冻结, 违反 src/AGENTS.md 规则 3 (从模块直接导出的数组和普通对象必须先冻结). 使用方为 src/catering/catering-statements.mjs:3, 9 与 src/catering/menu.mjs:16.
  修复: 改为 `Object.freeze(Object.keys(DIETARY_LABELS))`.

- src/catering/catering-service.mjs:55 `placeOrder` 手写了停权判断 `at < (member.suspension?.expiresAt ?? at)`. 已存在的 src/members/suspension.mjs:6 `isSuspended(member, at)` 表达的是同一判断, 这里属于重复实现. `suspension.mjs` 是规则模块, 按规则 7.2 可以导入.
  影响: 停权规则日后变更时 (例如改为按状态字段判断), catering 会与 members 行为分叉.
  修复: 导入 `isSuspended` 并替换该行. 替换前需确认会员记录不会写入 `suspension: null`: 当前 src/members/suspension.mjs:24 的 `reinstate` 通过 `withOptional` 删除该键, `?.` 才容忍 null, `isSuspended` 不容忍.

- src/catering/catering-pricing.mjs:9-12 `share` 与已导出的 src/billing/totals.mjs:5 `roundedTax` 对非负整数金额的舍入规则相同 (`Math.round(amount * bp / 1e4)` 与 `Math.floor((amount * bp + 5000) / 10000)` 等价), 属于重复逻辑. catering-pricing 已经从 billing 导入 `lineItemFor`, 依赖方向允许导入规则模块.
  修复: 导入 `roundedTax` 并删除 `share`.

- src/catering/kitchen-manifest.mjs:19-25 (`KITCHENS` 与 `kitchenFor`) 与 src/catering/vendors.mjs:9-12 `vendorFor` 各自实现了同一条路由规则 (halal 去 crescent; 人数超过 30 去 banquet; 其余去 deli), 只是阈值写成了 `>= 31`. 修改供应商分配规则时, 订单分配和厨房清单会分流不一致. 同时 `KITCHENS` 的键与 `vendorId` 是同一概念, 却使用 kitchen 命名, 增加理解成本.
  修复: 厨房清单按订单已保存的 `order.vendorId` 分组 (`newOrder` 写入该字段, `changeHeadcount` 已拒绝会改变供应商的人数变更), 删除 `KITCHENS` 与 `kitchenFor`.

- 课程集合在三处各自枚举: src/catering/menu.mjs:13 `COURSES`, src/catering/catering-policy.mjs:6-14 `prepMinutes` 的 switch, src/catering/catering-notices.mjs:7 `SERVING_ORDER`. 新增课程需要修改三个文件. 只改其中一处会产生运行时问题: 只加入 `COURSES` 时菜单能通过校验, 但下单时在 `prepMinutes` 抛错; 漏掉 `SERVING_ORDER` 时排序比较返回 NaN, 配送通知顺序静默错误. `prepMinutes` 第 12 行的 default 分支也重复校验了 `prepareItem` (src/catering/menu.mjs:22) 已经校验过的数据, 不可达.
  修复: 在 src/catering/menu.mjs 中用一张冻结的课程表同时给出出餐顺序和准备分钟数, 其他模块从该表读取, 并删除 default 分支.

- src/catering/catering-time.mjs:1 只从 src/platform/time.mjs 重新导出 `DAY` 与 `addMinutes`, 不增加任何策略, 属于 Middle Man. 调用方 src/catering/catering-policy.mjs:4 与 src/catering/catering-service.mjs:11 可以直接导入平台模块; 同仓库的 src/schedules/desk-policy.mjs 即直接从 `../platform/time.mjs` 导入.
  修复: 删除 src/catering/catering-time.mjs, 调用方改为从 `../platform/time.mjs` 导入.

- src/catering/menu.mjs:52 `findMenuItem` 只是调用 `requireMenuItem` (同文件第 46-50 行), 行为完全相同, 属于没有增加策略的别名, 与 Middle Man 同类.
  修复: 删除 `findMenuItem`, 使用方 src/catering/catering-notices.mjs:2, 10 改为调用 `requireMenuItem`.

- src/catering/catering-statements.mjs:14-15 `vendorStatement` 的 `withCanceled` 选项在本次变更中没有任何调用方传入 (src/catering/catering-service.mjs:143-146 不传该选项), 其 canceled 分支没有可达的使用路径, 属于 Speculative Generality.
  修复: 删除该选项及 `counted` 中的 canceled 分支.

- src/catering/catering-service.mjs:155-166 `notifyVendorWithRetry` (含 `attempts`, `retryDelayMs` 选项) 在 src 中没有生产调用方; 唯一调用方是新增的 tests/catering/vendor-retry.spec.mjs. 生产路径 `placeOrder` (第 66 行) 只调用不重试的 `notifyVendor` (第 31-37 行), 两者的错误包装也重复.
  修复: 若需求确实要求通知重试, 把重试接入 `placeOrder` 的通知路径并只保留真正需要的参数; 否则删除该函数及其测试文件.

- 两个只用一次的薄封装没有封装复杂逻辑: src/catering/catering-pricing.mjs:7 `lineCost` 只在第 15 行使用一次, src/catering/catering-service.mjs:122 `isUpcoming` 只在第 125 行使用一次.
  修复: 分别内联到调用处.

- src/catering/catering-service.mjs:1-166 同一模块承担了多类互不相关的变更原因: 订单生命周期 (`placeOrder`, `addLine`, `changeHeadcount`, `postponeOrder`, `confirmOrder`, `deliverOrder`, `cancelOrder`), 订单查询 (`listOrders`, `upcomingOrders`, `deskDeliveries`), 报表与厨房清单 (`vendorStatements`, `vendorManifests`), 计费桥接 (`memberInvoiceCharges`) 以及供应商通知重试. 维护负担: 厨房清单字段或供应商报表口径的改动, 与订单状态转换的改动落在同一文件中, 每次修改都要重新核对该文件依赖的全部注入项 (feeds, desk, notifier), 报表代码会随订单流程改动一起被审核和回归.
  修复: 把 `vendorStatements`, `vendorManifests`, `deskDeliveries` 拆到单独的 service 模块 (例如 src/catering/catering-reports-service.mjs), 订单生命周期函数留在 src/catering/catering-service.mjs.

- src/catering/catering-states.mjs:29-33 `advanceOrder` 复制了仓库中已有的状态表查找与时间戳写入模式, 与 src/billing/invoice-states.mjs:9, src/maintenance/ticket-states.mjs:21, src/reservations/transitions.mjs:12, src/visitors/guest-states.mjs:9, src/waitlist/entry-states.mjs:21 同类. 该查找逻辑不依赖任何业务语义, 属于通用机制, 按 Standards 设计检查应放在 src/platform/ 的公共模块中, 而不是在新功能中再复制一份.
  修复: 在 src/platform/ 下新增通用的规则查找模块 (接收规则表, action 与当前状态, 返回规则或 undefined), `advanceOrder` 只保留 catering 的规则表和 history 写入. 上述五处既有副本 (既有) 不在本次变更中, 可另行处理.
