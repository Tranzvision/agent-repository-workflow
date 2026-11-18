- `src/catering/catering-states.mjs:35` 使用 `export default advanceOrder;`, `src/catering/catering-service.mjs:10` 以默认导入消费它. 违反 `src/AGENTS.md` Source Rules 第 1 条 (模块必须使用具名导出, 禁止默认导出).
  影响: 同一 feature 的导入方式不统一, 且违反仓库强制规则.
  修复: 把 `advanceOrder` (`catering-states.mjs:29`) 改为具名导出并删除第 35 行; `catering-service.mjs` 改为具名导入.
- `src/catering/kitchen-manifest.mjs:1` 在规则模块中导入 `node:crypto`, 用于 `manifestOf` 计算 sha256 摘要. 违反 `src/AGENTS.md` Source Rules 第 2 条 (只有 store 与 platform 模块可以导入 Node.js 内置模块).
  影响: 规则模块依赖运行时能力, 与其纯计算职责不符, 且违反导入边界.
  修复: 把摘要计算放入 `src/platform/` 下的公共模块, `kitchen-manifest.mjs` 改为导入该模块.
- `src/catering/menu.mjs:11` 导出的 `DIETARY_TAGS` 由 `Object.keys` 生成, 没有冻结. 违反 `src/AGENTS.md` Source Rules 第 3 条 (导出的数组和普通对象必须在导出前冻结).
  影响: 任何调用方都可以修改该数组, 进而改变饮食标签的校验结果和统计分类.
  修复: 改为 `Object.freeze(Object.keys(DIETARY_LABELS))`.
- `src/catering/menu.mjs:37-41` 的 `loadMenu` 在规则模块中用 `try`/`catch` 包装 `JSON.parse`. 违反 `src/AGENTS.md` Source Rules 第 4.1 条 (规则模块不得捕获错误, 必须向调用方传播).
  影响: 同一解析失败会先在规则层包装, 再在 `catering-service.mjs` 的 `menuFor` 中包装一次, 形成多余的错误路径.
  修复: 删除 `loadMenu` 中的 `try`/`catch`, 让错误传播到 `menuFor`, 由服务层统一包装并保留 `cause`.
- `src/catering/catering-service.mjs:35` 的 `notifyVendor` 用 `new Error(message, error)` 替换捕获的错误, 但第二个参数是 options 而不是 `cause`, 原始错误没有保存为 `cause`. 违反 `src/AGENTS.md` Source Rules 第 4.2 条 (替换错误必须以 `cause` 保留原错误). 同文件的 `notifyVendorWithRetry` 正确使用了 `{cause: error}`.
  影响: 调用方和日志无法看到底层 notifier 的失败原因.
  修复: 改为 `{cause: error}`.
- `src/catering/catering-store.mjs:39-40` 的 `save` 返回 `this.#writes`, 而该值已经是 `.catch(() => undefined)` 的结果. 写入失败时返回的 promise 解析为 `undefined`, 不会以原始错误 reject. 违反 `src/AGENTS.md` Source Rules 第 4.3 条 (store 只可为保持写队列可用而捕获错误, 返回给调用方的 promise 仍须以原始错误 reject 或抛出).
  影响: `src/platform/records.mjs` 的 `saveThenNotify` 会把 `undefined` 交给通知函数, 例如 `placedNotice(undefined)` 抛出 TypeError 替代原错误; `catering-service.mjs` 的 `postponeOrder` 会把 `undefined` 返回给调用方.
  修复: 保存未捕获的链, 如 `const write = this.#writes.then(...)`, 再设置 `this.#writes = write.catch(() => undefined)` 并返回 `write`. 可参照 `src/platform/append-log.mjs` 的 `append`.
- `src/catering/catering-store.mjs:12` 用 `class CateringStore` 实现 store. 违反根 `AGENTS.md` 的 "Source Checkout JavaScript 样式" (除非外部 Interface 要求, 否则避免使用 `class`). 同仓库的 store 都是闭包工厂并返回 `Object.freeze` 的对象, 例如 `src/platform/append-log.mjs` 和 `src/waitlist/waitlist-store.mjs`.
  影响: 与仓库 store 风格不一致, 返回对象可被随意扩展或替换方法.
  修复: 改为 `createCateringStore` 的闭包实现, 返回冻结对象, 形状与 `createWaitlistStore` 一致.
- `src/catering/catering-store.mjs:8-10,33-41` 把通用的串行写入队列 (`#writes`) 与 request key 唯一性策略 (`requestKeyHolder` 及 `save` 中的检查) 混在同一个 class 中. 通用机制与业务策略混合时, 应分离通用机制. 同样的写入队列已在 `src/platform/append-log.mjs:13-22` 与 `src/waitlist/waitlist-store.mjs:14-21` 内联存在 (既有重复), 本次又复制了一份.
  影响: 写队列的错误处理需要在多处独立修正, 业务策略的变更也会牵动通用队列代码.
  修复: 把串行写入机制移入 `src/platform/` 公共模块, catering store 只保留 request key 策略并调用该机制. 是否同时迁移既有的 append-log 与 waitlist 实现可以单独处理.
- `src/catering/catering-service.mjs:73-74` (`addLine`), `:83` (`changeHeadcount`) 和 `:90-94` (`postponeOrder`) 直接修改调用方传入的订单或 store 返回的记录. 违反 `src/AGENTS.md` Source Rules 第 5 条 (导出函数不得修改调用方对象; store 返回的记录视为调用方对象, 须构造修改后的副本再保存).
  影响: `addLine` 的 `{...order}` 只是浅拷贝, `amended.lines` 与 `order.lines` 仍是同一数组, 第 74 行的 `push` 在校验 (第 75 行) 之前修改了原数组. `changeHeadcount` 先赋值 `order.headcount` 再检查供应商. `postponeOrder` 对 `store.find` 的结果执行 `Object.assign`, 而内存 store 保存的是同一对象引用, 因此即使随后 `checkDeliverySlot` 抛错, 存储中的记录也已被改动. 失败路径会留下半更新的订单.
  修复: 每个函数先完成校验, 再构造新对象并保存副本: `addLine` 用 `lines: [...order.lines, prepareLine(line)]`, `changeHeadcount` 用 `{...order, headcount}` 检查供应商, `postponeOrder` 用 `{...order, deliverAt, postponedAt}` 并以新对象执行 `checkDeliverySlot`.
- `src/catering/kitchen-manifest.mjs:27` 的 `inDeliveryOrder` 对参数执行 `orders.sort(byDelivery)` 原地排序, 参数来自导出函数 `kitchenManifests` 的调用方 (第 50-51 行). 违反 `src/AGENTS.md` Source Rules 第 5 条 (导出函数不得修改调用方数组). 该一行函数只被调用一次, 也违反 Efficiency First 第 4 条 (只用一次的逻辑直接写在调用处).
  影响: 调用方传入的数组顺序被改变.
  修复: 删除 `inDeliveryOrder`, 第 51 行改为 `orders.filter(...).sort(byDelivery)`, 排序作用于过滤产生的新数组.
- `src/catering/catering-service.mjs:111` 的 `cancelOrder` 调用一次 `now()` 传给 `advanceOrder`, 同时把 `context` 传给 `cancellationFee`; `src/catering/catering-pricing.mjs:35` 的 `cancellationFee` 又调用一次 `context.now()`. 一次服务调用读取了两次当前时间, 且规则模块接收了 `now` 函数. 违反 `src/AGENTS.md` Source Rules 第 6.3 条 (服务函数对每次调用最多调用一次 `now`) 与第 6.2 条 (规则模块接收 instant, 不接收 `now` 函数).
  影响: 取消时间戳与费用判定可能使用不同时刻, 费用判定也依赖注入的时钟读取方式.
  修复: `cancelOrder` 中 `const at = now();`, 同时用于 `advanceOrder(order, 'cancel', at)` 与 `cancellationFee(order, at)`; `cancellationFee` 改为接收 `at` 参数.
- `src/catering/catering-service.mjs:122-125` 的 `upcomingOrders` 把 `now` 传给 `isUpcoming`, 过滤时每个订单都调用一次 `now()`. 违反 `src/AGENTS.md` Source Rules 第 6.3 条.
  影响: 同一次查询中不同订单可能使用不同时刻, 结果依赖订单数量.
  修复: `upcomingOrders` 开头执行 `const at = now();`, 把 `at` 传给过滤函数, 过滤函数改为接收 instant.
- `src/catering/catering-notices.mjs:54` 的 `vendorNotice` 使用 `sentAt: Date.now()`. 违反 `src/AGENTS.md` Source Rules 第 6.1 条 (只有服务模块可以读取当前时间, 且只能调用注入的 `now`; 规则模块不得读取时钟).
  影响: 通知时间不受服务的注入时钟控制, 测试和重放无法固定该值.
  修复: `vendorNotice(order, menu, at)` 接收 instant 并写入 `sentAt: at`; `catering-service.mjs` 的 `notifyVendor` 增加 `at` 参数, 由 `placeOrder` 传入其已有的 `const at = now();`.
- `src/catering/catering-service.mjs:4` 从 `../schedules/front-desk-service.mjs` 导入 `isFrontDeskOpen`. 该文件是另一 feature 的 service 模块. 违反 `src/AGENTS.md` Source Rules 第 7.2 条 (feature 模块可以导入其他 feature 的规则模块, 但不得导入 service 或 store 模块).
  影响: 订单服务依赖前台服务的内部实现, 两个 feature 的依赖方向被打破.
  修复: 按第 7.4 条先把营业判断能力移入 `src/platform/`. platform 不得导入 feature 模块, 因此该能力依赖的纯计算 (`desk-policy.mjs`, `closures.mjs`, `opening-hours.mjs`, `week-clock.mjs`) 也需要一并下沉, 或由调用方改用已有的规则模块.
- `src/catering/kitchen-manifest.mjs:19-25` 的 `KITCHENS` 与 `kitchenFor` 复制了 `src/catering/vendors.mjs:9-12` 的 `vendorFor` 路由规则 (halal 进入 crescent, 大单进入 banquet, 其余进入 deli), 阈值写法也不同 (`>= 31` 与 `> LARGE_ORDER`). 违反 Duplicated Code 检查.
  影响: 修改供应商路由规则时, 厨房清单会与实际下单供应商分叉, 生成错误的分组.
  修复: `kitchenManifests` 使用从 `./vendors.mjs` 导入的 `vendorFor(order)`, 删除 `KITCHENS` 与 `kitchenFor`.
- `src/catering/catering-pricing.mjs:9-12` 的 `share` 复制了 `src/billing/totals.mjs:5` 的 `roundedTax` 半值进位计算 (对非负整数结果相同). `billing/totals.mjs` 是规则模块, 按第 7.2 条可以被导入. 违反 Duplicated Code 检查.
  影响: 税额舍入规则需要在两处独立维护, 任一处修改都会导致账单与订单税额不一致.
  修复: 从 `../billing/totals.mjs` 导入 `roundedTax`, 删除 `share`.
- `src/catering/catering-states.mjs:1-5,29-33` 复制了 `src/billing/invoice-states.mjs:1-13` 的转换机制 (按 action 与当前状态查找规则, 找不到时抛出 `cannot ${action} a ${state}`, 再写入时间戳). 该机制不依赖订单业务语义, 通用设计检查要求放入 `src/platform/`.
  影响: 状态转换的查找和错误语义需要在两个 feature 中同步维护.
  修复: 把通用的规则查找和应用抽到 `src/platform/` 公共模块, 两个 feature 的规则模块只保留各自的规则表和时间戳字段.
- `src/catering/menu.mjs:52` 的 `findMenuItem` 与 `requireMenuItem` (`menu.mjs:46-50`) 行为完全相同, 只是转发调用. `src/catering/catering-notices.mjs:2,10` 使用 `findMenuItem`. 违反 `docs/agents/writing.md` 的 Common capabilities 规则 (不得创建只转发调用且没有隐藏复杂性的公共包装器).
  修复: 删除 `findMenuItem`, `catering-notices.mjs` 改用 `requireMenuItem`.
- `src/catering/catering-time.mjs:1` 只把 `DAY` 与 `addMinutes` 从 `../platform/time.mjs` 转发出来, 没有隐藏任何复杂性. 违反 `docs/agents/writing.md` 的 Common capabilities 规则. 同仓库其他 feature 直接导入 `../platform/time.mjs`, 例如 `src/schedules/week-clock.mjs:1`.
  修复: 删除 `catering-time.mjs`, `catering-policy.mjs:4` 与 `catering-service.mjs:11` 改为直接导入 `../platform/time.mjs`.
- `src/catering/catering-service.mjs:31-37` 的 `notifyVendor` (下单路径 `:66` 调用, 不重试) 与 `:157-166` 的 `notifyVendorWithRetry` 是同一供应商通知的两条并行实现. 后者在生产代码中没有调用方, 只被 `tests/catering/vendor-retry.spec.mjs` 调用. 违反 Duplicated Code 检查, 且属于 Speculative Generality (没有当前调用方).
  影响: 生产路径与被测路径不是同一段代码, 重试用例无法证明下单路径会重试.
  修复: 只保留一条供应商通知路径. 若需要重试, 让 `placeOrder` 调用同一函数并删除另一条; 若不需要, 删除未调用的函数及其测试. 是否需要重试属于需求决定, 应由 Main Agent 确认后再选择其中一种修复.
- `src/catering/catering-service.mjs:157` 的 `notifyVendorWithRetry` 把 `retryDelayMs` 与 `attempts` 做成参数. `tests/catering/vendor-retry.spec.mjs:12` 传入 `retryDelayMs: 0` 以缩短耗时, `:19` 传入 `attempts: 2`. 根 `AGENTS.md` 的 "Source Checkout Baseline 例外" 节规定本仓库不为缩短测试耗时修改生产代码 (含为测试增加的注入接缝), 本处违反该规定. `attempts` 没有生产调用方, 也违反 Efficiency First 第 3 条 (不为假设的需求增加选项).
  影响: 生产函数签名为测试而扩大, 测试耗时规则被绕开.
  修复: 把延迟 (250 ms) 与次数 (3) 写成函数内常量并删除两个参数; 测试侧用 `node:test` 的计时器模拟推进延迟, 第二个用例改为断言默认 3 次调用.
- `src/catering/catering-statements.mjs:14-15` 的 `vendorStatement` 带有 `{withCanceled = false}` 选项, 唯一调用方 `src/catering/catering-service.mjs:145` 没有传入该选项. 违反 Efficiency First 第 3 条 (不为假设的需求增加选项) 与 Speculative Generality 检查.
  影响: 未被使用的分支 (`withCanceled && ...`) 仍需维护和测试.
  修复: 删除选项与该分支, `counted` 简化为 `deliveredIn(period)`.
- `src/catering/kitchen-manifest.mjs:52` 再次判断 `order.state === 'confirmed'`, 而唯一调用方 `src/catering/catering-service.mjs:152` 已用 `store.list({state: 'confirmed'})` 完成过滤. 违反 Efficiency First 第 3 条 (信任边界之内对已校验数据不重复判断).
  修复: 删除该条件, 保留 `contains(period, deliveryWindow(order))` 过滤.
- `src/catering/catering-policy.mjs:12` 的 `prepMinutes` 对 course 的 `default` 分支不可达: 菜单条目的 course 已在 `src/catering/menu.mjs:22` 经 `COURSES` 校验, 进入订单计算的只有这些条目. 同一套 course 知识还分散在 `src/catering/menu.mjs:13` (`COURSES`) 和 `src/catering/catering-notices.mjs:7` (`SERVING_ORDER`) 中. 违反 Efficiency First 第 3 条, 并构成 Repeated Switches / Duplicated Code.
  影响: 新增 course 时需同时修改三处, 漏改时会在运行时出错或静默排序错误.
  修复: 在 `menu.mjs` 中用一张 course 表同时定义合法 course, 准备时间与服务顺序, 删除 `default` 分支和其他两处枚举.
- `src/billing/invoice-service.mjs:32-36` 的 `issueInvoice` 删除了 `if (draft.lineItems.length === 0) throw new Error('nothing to invoice');`, 且在本比较中没有替代检查. 根 `AGENTS.md` 的 Efficiency First 第 6 条要求删除检查前写明它守护的目标, 以及该目标已不存在或由何处覆盖; 说不出时保留, 或交用户决定. 在本比较的可核对证据中没有找到这类说明.
  影响: 没有可开票行项目时, 仍会保存并通知一张发票.
  修复: 恢复该检查. 若认为它已不需要, 应在授权 issue 的 `## Comments` 中写明守护目标与覆盖处, 并交用户决定后再删除.
