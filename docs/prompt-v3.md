# 提示词 v3：把项目做成可发布的 DSH 插件（Cordis bundle）

> 用法：替换 `<...>` 占位符，整段发给 AI。
> v3 的变化：不只给顺序流程，**每一步都带「如果出问题怎么办」的分支**；并补上 0.1.x 实际踩过的坑。

---

把这个项目做成一个可以发布的 DSH 插件（Cordis bundle），目标是别人一条命令装上，
并收录进 DSH 插件市场。

## 一、开工前先问我，不要自己假设

1. npm 用户名？`<npm 用户名>`（决定 scope：@用户名/包名，全小写）
2. GitHub 用户名、仓库名？`<用户名>` / `<仓库名>`
3. 只要求「能装」，还是必须「上架市场」？
4. 运行数据放哪：纯内存 / 浏览器存储 / 服务端文件？关掉后要不要留？自动持久化还是导出？
5. 有没有联网抓取？有就默认关闭并在设置里给开关。
6. 我能不能给你 GitHub PAT / npm token？还是你只做本地、由我自己发布？
7. 你那边有没有能截图的浏览器？没有的话截图由我提供。

## 二、正常流程（按顺序）

| 阶段 | 做什么 | 完成判据 |
| --- | --- | --- |
| 0 | 确认上面 7 个问题 | 用户明确回答 |
| 1 | 写代码：服务端路由 + 客户端面板 + seed | 本地能跑、`npm pack --dry-run` 干净 |
| 2 | npm 发布 | `npm view <包名> version` 有输出 |
| 3 | 建 GitHub 仓库、推代码 | 仓库能打开、README 渲染正常 |
| 4 | fork 登记册 → 新分支 → 加 yml → PR | PR 创建成功，文件只有 1 个 |
| 5 | 等 gate | `Submission gate: success` |
| 6 | 维护者合并 | `merged: true` |
| 7 | 等目录重建 | 市场详情页 200、`plugins.json` 含条目 |

## 三、异常分支（遇到 X 就做 Y）

| 现象 | 判定 | 处理 |
| --- | --- | --- |
| 市场拒收 / 装不上 | 只写了 `dsh.client` | 补 `dsh.bundle.patch`，两者都要 |
| gate: `repository is 0.x days old (needs 1)` | 仓库年龄不够 | 什么都不用做，等 24h 自动重跑；不要改仓库名/重开 PR |
| PR 里出现与本次无关的旧条目 | 分支基于自己的 fork main | 点 `Sync fork → Update branch`；或从上游 main 重建分支；**别点 Discard commits** |
| gate 一栏是 `—`（从未运行） | 分支与 main 冲突 | 自己修不了，留言请维护者 rebase |
| `check` 红 | 常见是 READMEs match / awesome-lint / stale fork | READMEs 那条归维护者；lint 和 fork 过期归你 |
| `mergeable_state: unstable` | 有检查在跑或未过 | 等；只有 `dirty` 才是冲突 |
| npm publish 403 | 账号开了 2FA，login token 不能发 | ① Granular token + Bypass 2FA；② `--otp=6位码` |
| npm publish 返回 202 | 异步入库 | 等 2–15 分钟，`npm view` 轮询；不要重发 |
| npm 页面图片全裂 | README 相对路径被解析到 raw.githubusercontent（国内不通） | 改成 unpkg：`https://unpkg.com/<pkg>@latest/docs/...`，或 GitHub 附件 URL |
| 目录里 `npm: null`、`version: null` | 探测任务还没跑到 / 匹配失败 | 先等一轮每日构建；仍 null 就检查 `package.json` 的 repository 是否与仓库完全一致（去掉 `.git` 再发补丁版本） |
| 市场里搜不到 | 搜的是中文名，条目名是 `owner/repo` | 搜英文仓库名；仍没有就重启 DSH 再搜 |
| 合并后市场迟迟不出现 | 目录每日重建 | 24h 内正常；超过 48h 再查 `plugins.json` 是否含条目 |
| 截图和实机不符 | 用了设计稿 | 换实机截图，bump patch 版本重发；截图放自己仓库，别再提市场 PR |
| GitHub 打不开 | 国内网络 | 换热点/合规代理；不要用第三方镜像登录；能开时点一次 Update branch 即可 |
| token 丢了 | npm/GitHub 只显示一次 | 重建 token；npm 也可用 `--otp` 免 token |
| 新插件与旧插件混在一起 | 以为要重新 fork | 不用；同一个 fork，每次新分支 + 新 yml |

## 四、硬性技术要求

- `package.json` 必须同时声明：

  ```json
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  }
  ```

- 仓库根必须有 `cordis.patch.yml`，`insert` 一个 entry（id / name / config）。
- 必填字段：`name` / `version` / `private:false` / `license` / `repository` / `homepage` / `bugs` / `files`。
- `repository` 必须指向真实仓库；包名与仓库名可以不同，对齐靠它；发布后都不能改名。
- 数据目录：环境变量 → 仓库内目录（仅开发）→ 用户目录；**绝不写 node_modules**。
- 端口不写死：用 `ctx.webServer.register({kind:'prefix', path})` 挂同源路由，无独立端口。
- 路由校验同源（跨站 403），请求体设上限。
- 首次启动 seed 示例数据。
- 联网默认关闭，设置里给开关，README 写明。

## 五、前端形态：照用户现有页面做，不要自由发挥

- `window.__ModuleLoader__.load({id, factory(require){...}})`；
  `ctx.slots.inject('sidebar.panellist', ...)` 加入口，`ctx.slots.inject('main', ...)` 挂整页；
- 样式内联；颜色、圆角、表格、弹窗照抄现有页面；
- 按钮位置、叫法、行内测算列顺序一律以现有页面为准；
- 改 UI 前先读 `index.html` / `js` / `css`，不许凭记忆。

## 六、美术与素材

- 截图必须是**实机截图**，4–5 张：整页 / 展开核心区 / 主要弹窗 / 分组或设置弹窗；
- 宽 1280、JPEG q88，不加水印、不拼接；
- 图标 512×512 PNG，深色底居中；
- 截图放自己仓库的 `docs/screenshots/` + 根目录 `screenshots.json`（1–8 条相对路径）；
- README 图片用**国内可达**的地址（unpkg / GitHub 附件），不要裸 `raw.githubusercontent.com`。

## 七、市场条目

- PR 到 `awesome-dsh-plugin/awesome-dsh-plugin`，文件 `data/plugins/<owner>__<repo>.yml`：

  ```yaml
  url: https://github.com/<owner>/<repo>
  name: <owner>/<repo>
  category: tools
  description:
    en: "..."
    zh: "..."
  icon: https://raw.githubusercontent.com/<owner>/<repo>/main/icon-512.png
  ```

- `category` 是枚举（无金融类，用 `tools`）；
- 从**上游 main** 拉分支，不要用 fork main；
- 描述必须属实，夸大是打回主因；
- 一个插件一个文件；更新自己条目只改自己的文件。

## 八、交付物

1. 可发布的 npm 包（`npm pack --dry-run` 干净）
2. GitHub 仓库（README / LICENSE / 图标 / 截图 / cordis.patch.yml）
3. README：是什么、怎么装、截图、数据在哪、隐私与权限、已知限制
4. 市场 yml

## 九、验收清单（带判定标准）

1. 空数据目录启动 → 有 seed 数据、`state.json` 落盘；
2. `npm view <包名> version repository.url` → 版本与仓库正确；
3. 下载 tarball → `integrity` 一致；解包对比 `client.js` 与本地 sha256 一致；
4. 在另一个 profile 里 `dsh plugin --profile <x> add <包名>` → 装得上、面板出得来；
5. PR → gate `success`；
6. 合并后 → 市场详情页 200、`plugins.json` 含条目、安装命令是 `npm` 而不是 `github:`；
7. 市场里能搜到（用英文仓库名），版本号与本地发布一致。

## 十、工作方式

- UI 位置、按钮、设置项名称，先读代码/截图再动手；
- 网络问题先实测（直连/镜像各测一次），别归因「网络不好」；
- 每步给证据（状态码、哈希、接口返回），不要只说「应该好了」；
- token 用文件交接（`.secrets/tokens.txt`），用完即删并提醒撤销；
- 给用户预期时要写清两段延迟：仓库满 24h、目录每日重建；维护者合并还可能排队数天。
