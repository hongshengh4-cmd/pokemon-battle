# Pokémon Battle / 宝可梦·关都之旅 v1.3.20

这是可直接部署到 GitHub Pages 的完整静态仓库包，附带配套的 SillyTavern 完整角色卡和本地交互预览。项目分为对战网页、SillyTavern 外置桥接与角色卡三部分；卡片和站点必须配套使用。

## 包含内容

- `index.html`、`src/`：完整对战网页、引擎、图鉴数据、样式和界面。
- `st-bridge/`：角色卡使用的桥接脚本、关都数据、开局图片及统计数据。
- `character-card/宝可梦·关都之旅-v1.3.20-完整配套角色卡.json`：完整可导入角色卡，包含世界书、MVU/酒馆助手脚本、状态栏、随行情绪表现和剧情设定。
- `character-card/酒馆交互预览.html`：本地可交互预览，不连接或写入酒馆存档。
- `tests/`、`tools/`：回归测试及数据构建/检查工具。
- `docs/`：版本文档、世界协议与历史说明。

本包是**源代码与静态站点文件**，没有 `.git` 历史，也不包含 `node_modules`。无需构建产物；GitHub Pages 从仓库根目录直接提供 `index.html` 和相对路径资源。

## 部署到配套 GitHub Pages

当前角色卡的桥接地址设为：

```text
https://hongshengh4-cmd.github.io/pokemon-battle/
```

1. 解压 ZIP，将 `pokemon-battle-v1.3.20-complete/` **里面的全部文件和目录**上传到 GitHub 仓库 `hongshengh4-cmd/pokemon-battle` 的根目录（不要把整个外层文件夹再嵌套一层）。
2. GitHub 仓库设置中启用 Pages，来源选部署分支的根目录；等待部署完成。
3. 验证 `https://hongshengh4-cmd.github.io/pokemon-battle/` 能打开，网页页脚显示 `v1.3.20`。
4. 验证 `https://hongshengh4-cmd.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.20` 能打开 JavaScript 内容而不是 404。
5. 再把 `character-card/` 下的角色卡 JSON 导入 SillyTavern。

如果部署到不同用户名或仓库路径，请在角色卡的酒馆助手脚本 `scripts[1]` 中，把 `PKM_APP_BASE_URL` 改为你自己的 Pages 根地址（末尾保留 `/`）。

## 导入与互动

需要 SillyTavern、酒馆助手（JS-Slash-Runner）和 MVU；导入卡后允许该卡脚本运行。第一条消息会进入开局登记。预览页顶部可切换互动场景；卡内实际表现会依据跟随宝可梦的 HP、异常状态和羁绊作出反应。短按仍会触发叫声/互动，拖动不会误触发，长按可打开队伍面板。详见 [`sillytavern/README.md`](sillytavern/README.md) 与 [`character-card/README.md`](character-card/README.md)。

## 本地运行与测试

项目没有 npm 运行时依赖。需要 Node.js（建议 20+）和 Python 3。

```sh
npm test
python3 -m http.server 8000 --bind 0.0.0.0
```

打开 `http://localhost:8000/` 可预览对战网页；若只想看角色卡外观和互动演示，可直接打开 `character-card/酒馆交互预览.html`。

本交付包运行 `npm test` 全部通过，包括 52 项核心战斗测试、11 项新增战斗回归测试，以及锚点、体型、捕获、桥接、招式说明、赛制、NPC 阵容、特效与在线精灵图等测试。

## v1.3.20 本次交付重点

- 对战回归修正：守住连续使用成功率递减；火系免灼伤、冰系免冰冻，绝对零度不能击倒冰系；毒菱只由接地毒系吸收；飞行/飘浮免疫撒菱、黏黏网和接地场地效果，但仍会受到隐形岩伤害。
- 状态栏：未正式结识人物不提前出现；窄屏地点和时间完整换行。
- 随行宝可梦：跟随时隐藏精灵球；拖动、短按互动与长按队伍面板彼此区分。
- 旧版情绪表现移植在角色卡侧：HP/异常/羁绊反应、气泡表情和粒子、闲置动作、游走/凝视、睡眠/唤醒、抚摸、输入/发送/新消息反应。

历史版本记录保存在 `docs/README-历史版本记录-截止v1.3.9.md`；当前外置桥接使用说明见 `st-bridge/README.md`。
