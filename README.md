# 宝可梦·关都之旅 v1.3.20 · 队伍／仓库面板恢复版（不含酒馆演示页）

这是可部署到 GitHub Pages 的完整仓库包，附配套完整 SillyTavern 角色卡；**不包含单独的“酒馆交互预览.html”演示页**。

> 注意：网站根目录的 `preview.html` 是对战天气／场地效果工作台；主页面和对战弹窗会链接到它，本包保留它以免破坏网页功能。它不是酒馆卡片演示页。

## 包含内容

- `index.html`、`src/`：完整对战网页、引擎、数据、样式与界面。
- `st-bridge/`：酒馆角色卡加载的桥接、关都数据、开局图片与统计数据。
- `preview.html`：网站的战斗效果工作台（网页功能，保留）。
- `character-card/宝可梦·关都之旅-v1.3.20-队伍仓库面板恢复版.json`：完整可导入角色卡。
- `tests/`、`tools/`：回归测试及数据构建／检查工具；`docs/`：版本文档和历史记录。

本包不含 `.git` 历史或 `node_modules`。GitHub Pages 从仓库根目录直接提供 `index.html` 与相对路径资源。

## 部署到现有仓库

1. 解压 ZIP，将外层 `pokemon-battle-v1.3.20-panel-restore-no-tavern-demo/` **里面**的文件和目录放到 `hongshengh4-cmd/pokemon-battle` 仓库根目录。
2. 如果仓库之前上传过酒馆演示页，请在 GitHub 删除 `character-card/酒馆交互预览.html` 并提交删除；**仅覆盖上传不会自动删除 ZIP 里缺少的旧文件**。
3. 不要删除根目录的 `preview.html`：它是网页战斗效果工作台，`index.html` 和桥接会使用它。
4. 部署后验证 `https://hongshengh4-cmd.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.20-panel-restore-1` 能返回 JavaScript；然后导入 `character-card/` 中的恢复版卡片。

若想彻底清理再上传，可先备份自定义内容，在 GitHub 仓库中删除旧的 `character-card/酒馆交互预览.html`，再上传本 ZIP 的内容。Git 提交历史仍会保留旧文件版本；普通删除只会把它从当前仓库页面移除，不会改写历史。

## 面板与音频

- 面板按已确认的 v1.3.0 机制修复卡恢复：蓝色队伍卡、绿色六列仓库格（每页 30 格），窄屏使用单列队伍卡和可返回的详情层。
- 实时读取 MVU `stat_data.pkm`；保留设首发、跟随／收回、队伍与仓库存取、叫声／配音与战斗流程。缺失最大 HP 时显示“当前 HP/—”，不从缺项推算。
- 本 ZIP 不附动漫配音 MP3。Showdown 音频为原作游戏叫声，不是动画配音。

## 本地运行与测试

```sh
npm test
python3 -m http.server 8000 --bind 0.0.0.0
```

测试套件已通过，包括核心战斗、战斗回归、精灵图锚点／体型、捕获、桥接布局、招式说明、配音、阵容、场地特效与在线精灵图检查。
