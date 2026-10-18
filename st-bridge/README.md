# st-bridge · 宝可梦·关都之旅 外置桥接（v1.3.5）

这个目录是给 SillyTavern 角色卡「宝可梦·关都之旅」用的**外置桥接脚本**。角色卡里的「酒馆助手」脚本只有几行，真正的逻辑都从这里加载：

```
https://<你的用户名>.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.5
```

| 文件 | 作用 |
| --- | --- |
| `bridge.js` | 桥接主体：开局登记向导、图鉴状态栏、右下角精灵球（队伍/电脑/跟随）、附近野生宝可梦、对战入口卡、对战弹窗（嵌入本站 `index.html?embed=1`）、战斗结果写回 MVU 变量、主线剧情自动注入、NPC 相遇同步 |
| `kanto-stats.json` | v1.3.4：精简的种族值与招式 PP 表（由 `node tools/build-bridge-stats.mjs` 从 `src/data` 生成），精灵球面板显示能力值 / PP 用 |
| `img/` | v1.3.3 开局美化界面用图：标题封面 `hero.webp`、三种模式卡 `mode-*.webp`、执照背景 `oak-lab.webp`、宝可梦 Logo、8 只初始伙伴官方立绘 `starter-*.webp` |
| `kanto-data.js` | 关都数据：地图节点、各地点遭遇表、初始伙伴、徽章、称号、球种中文名等 |

## 和对战网页的通信（v1.3.4 嵌入协议）

- 桥接 → 网页：`PKM_BATTLE_CONFIG`（双方队伍、遭遇类型、精灵球库存、`host.tag`）、`PKM_BATTLE_PING`
- 网页 → 桥接：`PKM_BATTLE_READY / LOADING / STARTED / ERROR / RESULT`（都带 `hostTag`）
- 嵌入模式下网页不读写本地存档（存档以角色卡的 MVU 变量为准），没写招式的宝可梦按 `src/data/levelup.json` 的升级招式取等级以内最近 4 招。

## 自检

```
npm test        # 含 tests/st-bridge.test.mjs
```

部署后打开 `https://<你的用户名>.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.5`，能看到代码（不是 404）就说明桥接已上线；网站页脚应显示 `v1.3.5`。

## 图片来源（同人非商用）

- 标题封面 / 模式卡 / 大木研究所：宝可梦动画与剧场版画面（© Nintendo · Creatures · GAME FREAK · TV Tokyo · ShoPro · JR Kikaku · Pokémon），取自公开壁纸站与新闻配图
- 初始伙伴立绘：宝可梦官方艺术图（经 PokeAPI/sprites 仓库）
- Pokémon 标志：Wikimedia Commons「International Pokémon logo」

想换图：把同名文件替换掉（建议 webp，封面约 1600×900，模式卡约 960×540，立绘 320×320 透明底）即可，不用改代码。
