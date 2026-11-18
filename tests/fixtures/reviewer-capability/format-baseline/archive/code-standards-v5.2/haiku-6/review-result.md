- src/catering/catering-states.mjs:35 违反 src/AGENTS.md 第 1 条 (模块必须使用具名导出). 文件使用 `export default advanceOrder;`, 唯一使用方 src/catering/catering-service.mjs:10 以默认导入使用它.
  影响: 违反源码规则, 且导入形式与同功能其他模块不一致.
  修复: 改为具名导出 (例如在定义处使用 `export const advanceOrder`), 并把 src/catering/catering-service.mjs:10 改为具名导入.
- src/catering/kitchen-manifest.mjs:1,46 规则模块 (非 service, store 或 platform 模块) 导入了 `node:crypto` 的 `createHash`. 违反 src/AGENTS.md 第 2 条 (只有 store 和 platform 模块可以导入 Node.js 内置模块).
  影响: 规则模块直接依赖运行时内置模块, 通用的摘要计算也留在了业务功能内.
  修复: 把 SHA-256 摘要计算放入 src/platform/ 下的平台模块, kitchen-manifest.mjs 改为调用该平台函数.
- src/catering/kitchen-manifest.mjs:27,51 `inDeliveryOrder(orders)` 调用 `orders.sort(byDelivery)` 原地排序, 而 `kitchenManifests` (src/catering/kitchen-manifest.mjs:50) 是导出函数, `orders` 是调用方提供的数组. 违反 src/AGENTS.md 第 5 条 (导出函数不得修改调用方数组). 当前调用方 src/catering/catering-service.mjs:152 传入的是 store.list 返回的新数组, 所以现在不会造成可见错误, 但契约已被破坏.
  同时 `inDeliveryOrder` 只在 src/catering/kitchen-manifest.mjs:51 使用一次, 没有封装复杂逻辑, 属于可删除的提取函数 (根 AGENTS.md 效率原则第 4 条).
  修复: 删除 src/catering/kitchen-manifest.mjs:27 的辅助函数, 在 :51 处先 filter 再 `toSorted(byDelivery)`, 使 filter 结果成为新数组.
- src/catering/kitchen-manifest.mjs:19-25 复制了 src/catering/vendors.mjs:9-12 中 `vendorFor` 的派单规则 (halal 进 crescent, headcount 超过 30 进 banquet, 其余进 deli). `KITCHENS` 中的 `headcount >= 31` 与 `> 30` 对 prepareHeadcount 校验过的整数等价. 两处规则若分叉, 厨房清单的分组会与实际派单的供应方不一致. 这是 Duplicated Code.
  修复: kitchen-manifest.mjs 直接使用同功能规则模块 vendors.mjs 的 `vendorFor`, 删除 `KITCHENS` 与 `kitchenFor`.
- src/catering/catering-notices.mjs:54 `vendorNotice` 调用 `Date.now()` 读取当前时间. 违反 src/AGENTS.md 第 6.1 条 (只有 service 模块读取时间) 和第 6.2 条 (规则模块只接收数值参数, 不读取时间).
  影响: 通知中的 sentAt 不能被测试固定, 也可能与 src/catering/catering-service.mjs:51 中 placeOrder 的 `at` 不一致.
  修复: `vendorNotice` 增加 `sentAt` 参数; src/catering/catering-service.mjs 的 notifyVendor (:31-36) 增加对应参数, 由 placeOrder 把 `at` 传入.
- src/catering/catering-notices.mjs:41 `deliveredNotice` 自行 `reduce` 汇总 servings, 与 src/catering/catering-statements.mjs:5 的 `servingsOf` 逻辑重复. 同功能规则模块之间允许导入.
  修复: 导入 `servingsOf` 替换这段 reduce.
- src/catering/catering-time.mjs:1 整个文件只把 src/platform/time.mjs 的 `DAY` 和 `addMinutes` 重新导出, 没有隐藏任何复杂性, 属于 Middle Man. 功能模块可以直接导入平台模块 (src/AGENTS.md 第 7.1 条). 使用方是 src/catering/catering-policy.mjs:4 和 src/catering/catering-service.mjs:11.
  修复: 删除该文件, 两处改为从 `../platform/time.mjs` 导入.
- src/catering/menu.mjs:11 导出的数组 `DIETARY_TAGS = Object.keys(DIETARY_LABELS)` 没有冻结. 违反 src/AGENTS.md 第 3 条 (导出的数组和普通对象必须在导出前冻结).
  修复: 改为 `Object.freeze(Object.keys(DIETARY_LABELS))`.
- src/catering/menu.mjs:52 `findMenuItem` 只把参数原样转发给 `requireMenuItem`, 没有增加任何策略, 属于 Middle Man. 唯一使用方是 src/catering/catering-notices.mjs:2,10.
  修复: 删除 `findMenuItem`, catering-notices.mjs 直接使用 `requireMenuItem`.
- src/catering/menu.mjs:37-41 规则模块 `loadMenu` 使用 try/catch 包装 `JSON.parse`. 违反 src/AGENTS.md 第 4.1 条 (规则模块不得捕获错误). 调用链 src/catering/catering-service.mjs:16-22 的 `menuFor` 已经在外层捕获并以 `cause` 保留了原始错误, 该 try/catch 与之重复.
  修复: 删除 `loadMenu` 中的 try/catch, 让 JSON.parse 的错误向上传播, 由 `menuFor` 统一包装.
- src/catering/catering-pricing.mjs:35 `cancellationFee(order, context)` 是规则模块, 却接收含 `now` 函数的 `context` 并调用 `context.now()`. 违反 src/AGENTS.md 第 6.2 条 (规则模块接收瞬时数值, 不接收 now 函数).
  同一调用链 src/catering/catering-service.mjs:109-112 的 `cancelOrder` 先通过 `now()` 取得时间给 `advanceOrder`, 又在 `cancellationFee` 中再次读取时间. 违反第 6.3 条 (服务函数每次调用最多调用一次 now). 两次读取可能得到不同时刻, 取消时间戳和费用截止判断可能依据不同的时间.
  修复: `cancelOrder` 中写 `const at = now();` 一次, 把 `at` 同时传给 `advanceOrder` 和 `cancellationFee`; `cancellationFee` 改为 `(order, at)`, 接收数值参数.
- src/catering/catering-service.mjs:122-125 `upcomingOrders` 把 `isUpcoming(now)` 放进 `.filter`, 每个订单都会调用一次 `now()`. 违反 src/AGENTS.md 第 6.3 条. 同一次列表查询中不同订单可能以不同时刻判断是否即将到来.
  修复: 在函数开头执行一次 `const at = now();`, filter 中使用 `at`, 删除只用一次的辅助函数 `isUpcoming`.
- src/catering/catering-service.mjs:35 `notifyVendor` 中 `throw new Error(message, error)` 把原错误放在了 options 的位置, 原错误不会成为新错误的 `cause`. 违反 src/AGENTS.md 第 4.2 条 (替代已捕获错误的新错误必须以 `cause` 保留原错误). 同文件 :19-20 和 :162 的写法 `{cause: error}` 是正确的.
  影响: 供应商通知失败时, 调用方丢失底层原因 (例如网络错误), 只剩下消息文本.
  修复: 改为 `new Error(message, {cause: error})`.
- src/catering/catering-store.mjs:33-40 `save` 把 `.catch(() => undefined)` 应用在了返回给调用方的 promise 上 (:39-40). 违反 src/AGENTS.md 第 4.3 条 (store 只能为保持写队列可用而捕获, 返回给调用方的 promise 仍须以原错误 reject).
  影响: 例如 request key 冲突时, `save` 解析为 undefined 而不是抛错. src/platform/records.mjs 的 `saveThenNotify` 会把 undefined 当作已保存记录传给 notifier, 例如 `placedNotice(undefined, menu)` 在读取 `order.id` 时抛出 TypeError, 掩盖了原始的 "request key is already used" 错误. 确认类操作也会以同样方式产生错误通知.
  修复: 保存 `const write = this.#writes.then(...)`, 设置 `this.#writes = write.catch(() => undefined)`, 返回 `write`.
- src/catering/catering-store.mjs:12 新增了 `class CateringStore`. 根 AGENTS.md 的 "Source Checkout JavaScript 样式" 规定除非外部 Interface 要求, 否则避免使用 class. 当前没有外部接口要求 class, 而 `createCateringStore` 返回的对象字面量已能满足 find, findByRequestKey, list 和 save 的方法接口.
  修复: 改为工厂函数内以闭包保存 records 与写队列, 返回包含上述方法的对象.
- src/catering/catering-service.mjs:70-76 `addLine` 中 `amended = {...order}` 是浅拷贝, 紧接着的 `amended.lines.push(...)` 修改了调用方 order 的 lines 数组. 违反 src/AGENTS.md 第 5 条 (导出函数不得修改调用方的对象或数组).
  影响: 即使 :75 的 itemsFor 因菜单项不可用而抛错, 调用方持有的订单也已多出一行.
  修复: 改为 `const amended = {...order, lines: [...order.lines, prepareLine(line)]};`, 之后的校验和计价都使用 amended.
- src/catering/catering-service.mjs:81-86 `changeHeadcount` 中 `order.headcount = prepareHeadcount(headcount);` 直接修改调用方的 order. 违反 src/AGENTS.md 第 5 条. :84 的供应方校验失败时, 调用方对象已被改动.
  修复: 构造副本 `const changed = {...order, headcount: prepareHeadcount(headcount)};`, 校验后保存并返回 changed.
- src/catering/catering-service.mjs:89-96 `postponeOrder` 中 `Object.assign(order, {deliverAt, postponedAt: now()});` 修改了 `store.find` 返回的记录. src/catering/catering-store.mjs:21-23 的 `find` 直接返回存储内部对象的引用, 所以修改直接作用于存储中的数据. 违反 src/AGENTS.md 第 5 条 (注入的 store 返回的记录视为调用方对象).
  影响: :95 的 checkDeliverySlot 抛错时, 存储中的订单 deliverAt 已经变为新值, 但并未保存为成功的改期.
  修复: 构造副本 `const postponed = {...order, deliverAt, postponedAt: at};`, 校验副本后调用 `store.save(postponed)`, `now()` 在函数内只调用一次.
- src/catering/catering-service.mjs:4 功能模块 catering 导入了 `../schedules/front-desk-service.mjs` 的 `isFrontDeskOpen`. 该文件是 schedules 功能的 service 模块, 违反 src/AGENTS.md 第 7.2 条 (功能模块不得导入其他功能的 service 或 store 模块). 使用点是 :40.
  修复: 把营业时间判断的规则部分 (src/schedules/desk-policy.mjs 中的 `isDeskOpen` 及其所需的加载) 提取到平台模块后由 catering 导入, 或者由调用方把该检查作为依赖注入.
- src/catering/catering-service.mjs:157-166 `notifyVendorWithRetry` 中的通用重试循环 (attempts, 延迟, `pause`) 不依赖 catering 的业务语义, 却放在功能服务模块中. 不依赖业务语义的通用功能必须放入公共模块.
  修复: 若保留该重试能力, 把带延迟的重试循环放入 src/platform/ 下的公共模块, catering-service.mjs 只保留供应方错误的包装.
- src/catering/catering-service.mjs:157-166 `notifyVendorWithRetry` 在生产代码中没有调用方, 只有 tests/catering/vendor-retry.spec.mjs 使用它, placeOrder 实际使用的是 :31-36 的 `notifyVendor`. 两者都包装 `notifier.vendor` 的同样错误消息, 是重复实现. 参数 `attempts` 和 `retryDelayMs` 也是当前无调用方的选项, 属于 Speculative Generality (根 AGENTS.md 效率原则第 3 条).
  修复: 如果没有当前的生产调用方, 删除 `notifyVendorWithRetry`, `pause`, 以及依赖它的测试用例; 如果需要重试, 在 placeOrder 中接入唯一的通知实现, 不保留两套包装.
- src/catering/catering-statements.mjs:14-15 `vendorStatement` 的 `withCanceled` 选项没有任何调用方传入 (唯一调用方 src/catering/catering-service.mjs:145 不传该选项). 这是没有当前要求的参数, 属于 Speculative Generality (根 AGENTS.md 效率原则第 3 条).
  修复: 删除 `withCanceled` 参数与 :15 中的对应分支.
- src/catering/catering-service.mjs:134-140 `deskDeliveries` 内联重写了 `contains({startAt: day, endAt: day + DAY}, deliveryWindow(order))` 的判断 (`arrivesFrom` 即 deliveryWindow 的 startAt), 与 src/catering/kitchen-manifest.mjs:52 的判断重复, 且没有使用 src/catering/catering-policy.mjs:22 的 `deliveryWindow`. 两处对"在某一天内交付"的定义需要同步维护. 这是 Duplicated Code.
  修复: `deskDeliveries` 改用 `contains(...)` 和 `deliveryWindow(order)`, 删除 `arrivesFrom` 局部变量; 删除 :2 中因此不再使用的 `CATERING` 导入.
- src/catering/catering-policy.mjs:12 `prepMinutes` 的 `default` 分支抛出 `course ... is unknown`. course 已由 src/catering/menu.mjs 的 `prepareItem` 用 COURSES 校验过, 而 prepMinutes 只接收校验后的菜单项, 该分支不可达. 这是对信任边界内已校验数据的重复判断, 违反根 AGENTS.md 效率原则第 3 条.
  修复: 删除 `default` 分支.
