# 提示词：把项目做成可发布的 DSH 插件（Cordis bundle）

> 用法：把 `<...>` 里的占位符换成你的信息，整段发给 AI。
> 这份是 v2，补上了「仓库需满 24 小时」这条硬规则和 0.1.0 踩过的坑。

---

把这个项目做成一个可以发布的 DSH 插件（Cordis bundle），目标是别人一条命令装上，
并收录进 DSH 插件市场。

## 一、开工前先问我，不要自己假设

1. npm 用户名是什么？`<npm 用户名>`（决定包名 scope：@用户名/包名，全小写）
2. GitHub 用户名和仓库名？用户名 `<github 用户名>`，仓库 `<仓库名>`（不存在的话先告诉我怎么建）
3. 这次只要求「能装」，还是必须「上架市场」？`<上架市场>`
4. 运行数据放哪：纯内存 / 浏览器存储 / 服务端文件？`<服务端文件>`
   关掉之后需不需要还在？要留的话是导出还是自动持久化？`<自动持久化>`
5. 有没有联网抓取行为？要不要默认关闭？`<没有 / 默认关闭>`

## 二、时间线：仓库必须满 24 小时（重要，别踩）

awesome-dsh-plugin 的 CI 里有一个 **Submission gate**，会检查仓库年龄：

```
repository is 0.0 days old (needs 1) — nothing to do: this check re-runs by itself
and should clear in about 24h. No need to resubmit, push, or close and reopen.
```

所以正确顺序是：

1. 先建 GitHub 仓库、推代码、发 npm；
2. **等仓库满 24 小时**再提市场 PR；
3. 或者先提 PR，等 gate 自己重跑变绿（同样约 24 小时）。

注意：

- 不要为了绕过它去改仓库名、换新仓库、关掉 PR 重开——gate 只看仓库创建时间；
- 提 PR 前先确认 `npm view <包名> version repository.url` 正常，否则 gate 还会因为别的项红；
- 给用户的时间预期要写清楚：从**合并**到市场出现还要等每日 CI 重建（通常 24 小时内）。

## 三、硬性技术要求

- `package.json` 必须同时声明：

  ```json
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  }
  ```

  只写 `dsh.client` 是不可安装的，这是市场最常见的拒收原因。

- 仓库根必须有 `cordis.patch.yml`，用 `insert` 挂一个 entry：

  ```yaml
  - insert:
      - id: <id>
        name: '@<scope>/<pkg>'
        config:
          dataDir: ''
  ```

- `package.json` 必填：`name` / `version` / `private: false` / `license` / `repository` /
  `homepage` / `bugs` / `files` 白名单；`type: module`（服务端插件用 ESM）。
- `repository` 必须指向真实 GitHub 仓库（市场靠它把 npm 包和仓库对上）。
  包名和仓库名**不需要一致**，对齐靠这个字段；但发布后**两者都不能再改名**。
- 数据目录必须可配置：环境变量 → 仓库内目录（仅开发时）→ 用户目录
  （`%LOCALAPPDATA%` 或 `~/.local/share`）。**绝不能写进 `node_modules`。**
- 端口不要写死。DSH 插件跑在宿主进程里，用 `ctx.webServer.register({ kind: 'prefix', path })`
  挂在同源路径上即可，**没有独立端口、也不需要扫描端口**；只有做独立服务时才需要扫描空闲端口。
- 服务端路由要校验同源（Origin/Host），跨站请求返回 403；请求体设大小上限。
- 首次启动写入示例数据，保证「装完第一眼不是空的」。
- 有联网/爬虫行为的一律默认关闭，设置里给开关，README 写明。

## 四、前端形态（照用户现有页面做，不要自由发挥）

- 客户端用 `window.__ModuleLoader__.load({ id, factory(require) { ... } })`，
  通过 `ctx.slots.inject('sidebar.panellist', ...)` 加入口，`ctx.slots.inject('main', ...)` 挂整页；
- 样式直接内联在组件里（`h('style', null, CSS)`），颜色/圆角/表格样式**照抄用户现有页面**；
- 交互位置、按钮叫法、行内测算的列顺序，一律以用户现有页面为准；
- 不要自创弹窗样式、不要给测算区换布局。

## 五、美术与素材（0.1.0 踩过的坑）

- 截图必须是**实机截图**，不能用设计稿/效果图顶替——用户一眼就能看出对不上；
- 5 张以内、4 张也够：整页、展开后的核心区、主要弹窗、设置/分组弹窗；
- 宽 1280、JPEG q88；不要营销文案水印、不要拼接；
- 图标 512×512 PNG，深色底、居中、小尺寸可辨识，放仓库根；
- README 里的图片路径要注意：**国内访问 `raw.githubusercontent.com` 经常不通**，
  npm 页面上容易一片裂图。要么用 GitHub 附件 URL（`github.com/user-attachments/assets/...`），
  要么确认所选 CDN 在国内可达。

## 六、npm 发布（2FA 会卡住你）

- 账号开了 2FA 时，`npm login` 拿到的 token **不能**发布，会 403：
  「Two-factor authentication or granular access token with bypass 2fa enabled is required」；
- 两条路：① 建 **Granular Access Token** 并勾 **Bypass 2FA**（7 天，用完撤销）；
  ② 用 `npm publish --otp=<6 位动态码>`；
- 发布可能返回 **202 + "being processed"**，要等几分钟到十几分钟才在 registry 可见，
  别当失败重发；用 `npm view` 轮询确认。

## 七、市场条目

- 提交方式：PR 到 `awesome-dsh-plugin/awesome-dsh-plugin`，
  文件放 `data/plugins/<owner>__<repo>.yml`：

  ```yaml
  url: https://github.com/<owner>/<repo>
  name: <owner>/<repo>
  category: tools
  description:
    en: "..."
    zh: "..."
  icon: https://raw.githubusercontent.com/<owner>/<repo>/main/icon-512.png
  ```

- `category` 是枚举（agi/ui/usage/theme/model/tools/workflow/...），**没有金融类**，用 `tools`；
- 从**上游 main** 拉一个分支提交，不要直接用自己的 fork `main` —— 否则会把 fork 里的历史提交
  一起带进 PR（本次就多带了一个 no-op 文件）；
- 提完 PR 看 CI：`Submission gate` 若只因仓库年龄失败，属正常，等 24h 自动重跑。

## 八、交付物

1. 可发布的 npm 包（`npm pack --dry-run` 能过，files 白名单干净）
2. GitHub 仓库（README / LICENSE / 图标 / 截图 / cordis.patch.yml）
3. README：是什么、怎么装、截图、数据在哪、隐私与权限、已知限制
4. 市场提交用的 yml

## 九、验收顺序（不许跳步）

1. 用全新空数据目录启动，确认自举示例数据；
2. `npm view <包名> version repository.url` 确认版本与仓库；
3. 下载 tarball 校验 `integrity`，解包对比 `client.js` 与本地一致；
4. 在**另一个 profile** 里 `dsh plugin --profile <x> add <包名>` 装一遍（不是 link 版本）；
5. 等 gate 变绿、市场收录，确认版本号与下载量正常。

## 十、工作方式

- 涉及 UI 位置、按钮在哪、设置项叫什么，必须先读用户现有代码/截图再动手，
  不许凭记忆或代码里的字符串推断界面；
- 遇到网络问题先实测（直连/镜像各测一次），不要归因给「网络不好」；
- 每一步给出可验证的证据（状态码、文件哈希、接口返回），不要只说「应该好了」；
- Token 一律用文件交接（如 `.secrets/tokens.txt`），用完即删，并提醒用户撤销。
