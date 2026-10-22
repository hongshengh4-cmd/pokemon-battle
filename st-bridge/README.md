# st-bridge · 宝可梦·关都之旅 外置桥接（v1.3.20·面板恢复修订）

这个目录是给 SillyTavern 角色卡「宝可梦·关都之旅」用的**外置桥接脚本**。角色卡里的「酒馆助手」脚本只有几行，真正的逻辑都从这里加载：

```
https://<你的用户名>.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.20-panel-restore-1
```

| 文件 | 作用 |
| --- | --- |
| `bridge.js` | 桥接主体：开局登记向导、图鉴状态栏、右下角精灵球（队伍/电脑/跟随）、附近野生宝可梦、对战入口卡、对战弹窗（嵌入本站 `index.html?embed=1`）、战斗结果写回 MVU 变量、主线剧情自动注入、NPC 相遇同步 |
| `kanto-stats.json` | v1.3.4：精简的种族值与招式 PP 表（由 `node tools/build-bridge-stats.mjs` 从 `src/data` 生成），精灵球面板显示能力值 / PP 用；v1.3.8 加身高表 `h`（语音合成按体型调音高） |
| `img/` | v1.3.3 开局美化界面用图：标题封面 `hero.webp`、三种模式卡 `mode-*.webp`、执照背景 `oak-lab.webp`、宝可梦 Logo、8 只初始伙伴官方立绘 `starter-*.webp` |
| `kanto-data.js` | 关都数据：地图节点、各地点遭遇表、初始伙伴、徽章、称号、球种中文名、v1.3.8 赛制表（`EVENT_FORMATS` / `GYM_RULES`）、v1.3.9 伙伴阵容表（`NPC_ROSTERS`）与对战标签（`BATTLE_LABEL`）等 |
| `audio/cries/` | 动漫配音录音：放 `<英文名小写>.mp3`；没有录音的按面板设置用语音合成 / 游戏叫声 / 不出声代替；命名对照表、录音建议、检查 / 转换工具见该目录的 `README.md` 与 `CHECKLIST.md` |

## 队伍／仓库面板（v1.3.20 面板恢复修订）

- 面板布局按 v1.3.0 机制修复卡恢复：蓝色队伍卡、绿色六列仓库网格（每页 30 格）、右侧详情；窄屏改为单列队伍卡和可返回的详情层。
- 面板实时读取 MVU `stat_data.pkm`；支持设首发、跟随／收回、队伍与仓库互存。未记录最大 HP 时显示“当前 HP/—”，不从缺项推算。
- 动漫录音目录目前不附 MP3；选动漫配音时按设置回退。🎮 游戏配音使用 Pokémon Showdown 的原作游戏叫声，并非动画配音。

## 精灵球：自由拖拽与配音（v1.3.8 起）

- 按住精灵球（或它旁边跟随的宝可梦）可以拖到屏幕任意位置；位置按“离最近两条边的距离”记在本机浏览器里，窗口缩放 / 手机旋转后自动收回屏内。点一下（没拖动）仍然是打开 / 关闭队伍面板；面板和叫声气泡会贴着球、按球所在的象限换边。面板标题栏的 📍 把球放回右下角。
- **配音二选一**：选择宝可梦后，在详情区可为它选「配音」：`默认`（跟随全局）／`🎬 动漫`／`🎮 游戏`，▶ 试听；详情区还可设音量、**默认配音**、**没有动漫录音时**（`🗣️ 语音合成` 默认／`🎮 游戏叫声`／`🔇 不出声`）和「动漫录音地址（高级）」。
  - 🎬 动漫：有 `audio/cries/<id>.mp3` 就播录音；没有就按上面的替代方式。语音合成用浏览器自带的中文语音念气泡里那句叫声（去掉括号里的动作），音高按体型；设备没有中文语音时自动改播游戏叫声。
  - 🎮 游戏：Pokémon Showdown 的原作叫声。
  - 本机设置键：`pkmKantoCrySrc`（anime|game）、`pkmKantoCryFallback`（tts|game|mute）、`pkmKantoCryMon:<uid>`（单只）、`pkmKantoCryBase`、`pkmKantoCryVol`、`pkmKantoMute`。
- 控制台试听：`__PKM_KANTO__.testCry('皮卡丘')`、`__PKM_KANTO__.testCry('皮卡丘', 'game')`。

## 赛制（v1.3.8 起；v1.3.9 加两边全队）

- 野外 / 捕捉：对方 1 只 vs 我方队伍里能战斗的全部（最多 6 只，不足不补）。
- 和 NPC 对战（trainer / rival / rocket / boss）：没写 `teamSize` / `format` 就**两边全队**——对方带着的全部 vs 我方能战斗的全部（各最多 6 只，只数可以不一样）。写了才按 NvN，选人界面可一键「改成两边全队」。
- 道馆 / 大会 NvN：`teamSize`（或 `format:"3v3"`）→ 道馆规矩表（`EVENT_FORMATS` 按事件、`GYM_RULES` 按馆主；华蓝 v1.3.9 起 3v3）→ 对方阵容只数。
- 我方能战斗的多于 N 只时，开战前在对战窗口点选参赛名单（点选顺序 = 出场顺序）；不足 N 只照常开战；参赛的全倒立即判负。
- 结果 `<pkm_result>` 带 `format / rule / lineup / verdict / bench`（v1.3.9 加 `autoTeam`：按原作进度补上的对手成员）；入口卡片的 `status` 消息带 `format / rule`（v1.3.9 加 `team / added`）。
- 对战配置 `rules` 带 `tag / label / rule / typeLabel / opponent / sideLabel`，`host.intro` 是战斗记录第一行（v1.3.9）。

## 伙伴阵容（v1.3.9）

- `kanto-data.js` 的 `NPC_ROSTERS`：小智 / 小霞 / 小刚每只宝可梦的 `forms`（进化顺序）、`join` / `evolve` / `leave`（时间点：`'EP003#1'` = EP003 第 1 个节点演完之后，`'EP010'` = EP010 整集演完之后）、`ace`（王牌）、`since`（从哪个事件起出场，注入用）。
- 和他们对战时，对战块里漏写的成员按当前剧情进度补在后面（最多 6 只；对战块写 `"exact":true` 不补；小智模式不补小智；“跳过”的事件不生效）。生成前注入有【伙伴阵容】一行。

## 和对战网页的通信（v1.3.4 嵌入协议）

- 桥接 → 网页：`PKM_BATTLE_CONFIG`（双方队伍、遭遇类型、精灵球库存、`host.tag`）、`PKM_BATTLE_PING`
- 网页 → 桥接：`PKM_BATTLE_READY / LOADING / STARTED / ERROR / RESULT`（都带 `hostTag`）
- 嵌入模式下网页不读写本地存档（存档以角色卡的 MVU 变量为准），没写招式的宝可梦按 `src/data/levelup.json` 的升级招式取等级以内最近 4 招。

## 自检

```
npm test        # 含 tests/st-bridge.test.mjs
```

部署后打开 `https://<你的用户名>.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.20-panel-restore-1`，能看到代码（不是 404）就说明面板恢复桥接已上线；网站页脚仍显示 `v1.3.20`。

## 图片来源（同人非商用）

- 标题封面 / 模式卡 / 大木研究所：宝可梦动画与剧场版画面（© Nintendo · Creatures · GAME FREAK · TV Tokyo · ShoPro · JR Kikaku · Pokémon），取自公开壁纸站与新闻配图
- 初始伙伴立绘：宝可梦官方艺术图（经 PokeAPI/sprites 仓库）
- Pokémon 标志：Wikimedia Commons「International Pokémon logo」

想换图：把同名文件替换掉（建议 webp，封面约 1600×900，模式卡约 960×540，立绘 320×320 透明底）即可，不用改代码。
