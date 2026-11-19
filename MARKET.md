# 上架步骤（照做即可）

## 0. 现状

- 插件已装进本机 DSH 的 desktop profile，`GET /positions/state` 返回 200，数据落在
  `%LOCALAPPDATA%\dsh-positions\state.json`。
- 还差：GitHub 仓库、npm 发布、市场 PR。

## 1. 建 GitHub 仓库

浏览器打开 <https://github.com/new>：

- Repository name：`dsh-positions`
- Owner：`zhang-1239`
- Public，**不要**勾选 README / .gitignore / license（本地已经有）

然后在本地：

```bat
cd /d D:\PositionsWorkbench\plugin
git init
git add .
git commit -m "feat: positions cost workbench v0.1.0"
git branch -M main
git remote add origin https://github.com/zhang-1239/dsh-positions.git
git push -u origin main
```

> 没装 git 的话，用 GitHub Desktop「Add local repository」把 `D:\PositionsWorkbench\plugin` 加进去，再 Publish。

## 2. 发布 npm

本机 `~/.npmrc` 里的 token 是占位符 `粘贴你的token`，需要先登录：

```bat
npm login
cd /d D:\PositionsWorkbench\plugin
npm publish --access public
```

验证：

```bat
npm view @zhangxij/dsh-positions version repository.url
```

## 3. 提交市场 PR

市场条目在仓库 `awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/` 下。

1. Fork：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/fork>
2. 把 `market/zhang-1239__dsh-positions.yml` 复制成 `data/plugins/zhang-1239__dsh-positions.yml`
3. 提 PR，标题：`Add dsh-positions: cost-basis workbench`

PR 描述：

```
Adds dsh-positions, a local-only cost-basis workbench for DSH.

- package: @zhangxij/dsh-positions@0.1.0
- repo: https://github.com/zhang-1239/dsh-positions
- entry: data/plugins/zhang-1239__dsh-positions.yml
- capabilities: fs-read, fs-write (only its own data dir)
- no network, no quotes, no telemetry

The panel lets you log buys/sells and preview how a trade changes cost,
position size and break-even before placing it.
```

## 4. 收录之后

- 市场每天重建一次，一般 24 小时内出现；
- 后续更新：改版本号 → `npm publish` → 无需再提 PR；
- 别改包名和仓库名，改了就是新条目。
