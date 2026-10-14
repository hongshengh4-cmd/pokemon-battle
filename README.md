# 宝可梦对战（自研版）

一个为 SillyTavern 角色卡设计的宝可梦对战游戏：对战本体是独立的静态网页（可部署到 GitHub Pages），角色卡只负责剧情、队伍存档（MVU 变量）和触发战斗。架构思路参考了同类卡的分层方式，代码与素材均为本项目原创/公开数据生成，不复制任何现有项目的代码。

## 现在能玩什么（第一、二阶段）

- 单打对战，双方最多 6 只宝可梦，可换人
- 完整 18 属性克制表、种族值/个体值/性格计算、官方伤害公式（含 STAB、会心、0.85–1.00 随机数、灼伤减攻）
- 优先度与速度判定、命中/闪避与能力等级（攻防特攻特防速度 ±6、命中/闪避）
- 异常状态：麻痹（减速+概率无法行动）、灼伤、中毒、剧毒、睡眠、冰冻、混乱、退缩
- 招式追加效果：能力变化、状态赋予、吸取、反伤、回复、连续攻击（按 Showdown 数据格式解释）
- 天气基础效果：晴天/雨天属性增减、沙暴残伤
- 四档敌方 AI（easy 经常失误 → expert 会估算斩杀、换人应对克制）
- 数据：Showdown 公开 JSON 生成的 1518 条图鉴 + 954 条招式 + 1121 个物种的第九代学习面（见 `tools/build-data.mjs`）
- 队伍编辑器：为双方各编辑 6 只宝可梦的物种、等级、性格、特性和 4 个招式；招式列表按 Gen 9 学习面过滤，支持合法性校验、自动配招、随机队伍和浏览器本地保存
- 对接预留：支持粘贴 `<PKM_BATTLE>` 配置开战、URL `?config=` 传参、宿主页面 `postMessage` 下发配置、结束后回发 `PKM_BATTLE_RESULT`

暂未实现（已在路线图中排期）：特性与道具的实际效果、Mega/Z/极巨化/太晶化、双打、捕获/成长、地图与 NPC 数据库、动画与音效。

## 本地运行

不要直接双击 `index.html`（浏览器会拦截读取数据 JSON）。在本目录开一个静态服务器：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

运行引擎测试（需要 Node 18+，无第三方依赖）：

```bash
node tests/run-tests.mjs
node tools/build-data.mjs   # 重新从 Showdown 拉取并生成数据
```

## 部署到 GitHub Pages（你自己的仓库）

1. 在 GitHub 新建一个仓库（比如 `pokemon-battle`），把本目录的全部文件放进仓库根目录并 push。
2. 仓库 Settings → Pages → Build and deployment 选择 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存。
3. 等一两分钟，访问 `https://你的用户名.github.io/pokemon-battle/` 就能打开对战页面。
4. 把这个地址填进角色卡的正则/桥接脚本里（见 `sillytavern/` 文件夹的对接说明），酒馆里就能调用。

## 目录结构

```text
index.html                 对战页面
src/engine/typechart.js    18 属性克制表
src/engine/battle.js       战斗引擎（纯逻辑、无 DOM，可在 Node 里跑测试）
src/data/pokedex.json      图鉴数据（自动生成，勿手改）
src/data/moves.json        招式数据（自动生成，勿手改）
src/data/learnsets.json    第九代招式学习面（自动生成，勿手改）
src/engine/team.js         招式合法性、自动配招与队伍校验
src/data/presets.js        内置训练师队伍
src/ui/app.js              页面交互 + 与酒馆宿主的 postMessage 桥
src/ui/styles.css          页面样式
tools/build-data.mjs       数据生成脚本
tests/run-tests.mjs        引擎自动化测试
sillytavern/               角色卡对接协议（世界书条目文案、正则、桥接脚本）
ROADMAP.md                 分阶段开发路线图
```

## 数据与版权说明

- 图鉴与招式数值来自 Pokémon Showdown 公开的数据端点，由脚本自动抓取生成；精灵图片运行时从 Showdown 的公开图库加载，加载失败会自动降级显示占位图。
- 宝可梦相关名称、形象的权利归 Nintendo / Creatures Inc. / GAME FREAK inc. 所有。本项目为非商业同人用途，请勿用于收费分发。
