# 持仓成本台 · DSH 插件

在 DeepSeek Harness 里记持仓、记成交，**买入/卖出之前先算清楚成本会变成多少**。

大多数看盘软件告诉你「现在多少钱」，但不告诉你「买完这 200 股之后，我的成本、仓位、保本价会变成多少」。
这个插件只做这一件事，顺便把持仓和成交流水记下来。

> 不含行情、不联网、不荐股。所有数字都来自你自己录入的成交记录。

## 截图

![持仓总览](https://unpkg.com/@zhangxij/dsh-positions@latest/docs/screenshots/01-overview.jpg)

![展开后的历史记录与测算](https://unpkg.com/@zhangxij/dsh-positions@latest/docs/screenshots/02-calc.jpg)

![测算弹窗](https://unpkg.com/@zhangxij/dsh-positions@latest/docs/screenshots/03-modal.jpg)

![分组弹窗](https://unpkg.com/@zhangxij/dsh-positions@latest/docs/screenshots/04-groups.jpg)

## 安装

```sh
dsh plugin --profile web add @zhangxij/dsh-positions
```

装完重启 DSH，左侧栏会多一个「持仓」入口。

本地开发时（未发布 npm）：

```sh
dsh plugin --profile web add file:D:\path\to\dsh-positions
```

具体参数以 `dsh plugin --help` 为准。

## 怎么用

1. **记一笔**：顶部填股票、日期、方向（买入 / 卖出 / **分红**）、价格、数量，点「新增」。
   - 分红填「每股分红 × 股数」，红利税按持股期自动估算（≤1 月 20%、≤12 月 10%、>1 年 0），净额冲减成本；
   - 费用留空就按「费率」规则算，写了就优先用你写的（* 号标注）。
2. **费率**：右上角「费率」——默认东方财富（佣金万 2.5、最低 5 元；卖出印花税 0.05%；过户费 0.001%）。
   可新建 / 切换 / 删除多家券商规则，也可以上传费率截图作参考（数值仍需手填）。
3. **分组**：展开股票，在「编辑分组」里改组名、现价、当日盈亏；表格按分组聚合汇总行。
4. **表头**：分组管理右边的「表头管理」——可新增自定义列（如股票代码、备注）、↑↓ 调顺序、删除自定义列；
   内置列不能删。自定义列的值在股票展开详情顶部填写。
5. **测算**：展开或点「测算」→ 填方向/价格/数量 → 立刻看到费用、累计数量、新成本；可加多组比较，支持保存。
6. **归档 / 删除**：
   - 「归档」= 从表格与统计里消失，数据保留；点「查看归档持仓」可查看完整记录并恢复；
   - 「删除」= 连同全部成交一起删除，不可恢复。

## 数据在哪

优先级从高到低：

1. `cordis.patch.yml` 里的 `config.dataDir`
2. 环境变量 `DSH_POSITIONS_DATA`
3. 仓库内 `data/`（仅开发目录存在时使用）
4. `%LOCALAPPDATA%\dsh-positions`（Windows）/ `~/.local/share/dsh-positions`（其他系统）

文件只有一个：`state.json`，每次修改立即落盘，里面包含持仓/成交、分组、费率规则、表头定义与自定义列的值。
**不会写进 `node_modules`。**

首次启动会写入 5 只示例股票和一条东方财富费率，保证装完不是空白页；示例可以直接删。

## 隐私与权限

- 不发起任何外部网络请求（没有行情、没有统计、没有遥测）。
- 只读写上面那个数据目录里的 `state.json`。
- 服务端路由挂在 DSH 自身 HTTP 服务下（`/positions/*`），会校验同源，跨站请求直接 403。
- 卸载插件不会删数据目录，需要清空请手动删。

## 已知限制

- 没有行情，所以「市值 / 当日盈亏」要你自己填现价与盈亏。
- 券商费率截图只作参考，不自动 OCR 识别（数值请手填）。
- 单机单用户，没有账号体系（数据在你自己电脑上）。
- 无导出功能（后续加 JSON/CSV 导出）。

## 开发

```
index.js         服务端：数据目录、读写、/positions 路由
client.js        浏览器端：左侧栏入口 + 单页面板
seed.js          首次启动的示例数据
cordis.patch.yml 插件挂载与默认配置
test/            服务端测试
```

跑测试：

```sh
node test/server.test.mjs
```

测试会用一个临时目录，不会碰你的真实数据。

## 免责声明

本插件只做记账与成本推算，不提供行情、不构成投资建议。市场有风险，决策请自负。
