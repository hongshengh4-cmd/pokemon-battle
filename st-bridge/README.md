# st-bridge · 宝可梦·关都之旅 外置桥接（v1.3.2）

这个目录是给 SillyTavern 角色卡「宝可梦·关都之旅」用的**外置桥接脚本**。角色卡里的「酒馆助手」脚本只有几行，真正的逻辑都从这里加载：

```
https://<你的用户名>.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.2
```

| 文件 | 作用 |
| --- | --- |
| `bridge.js` | 桥接主体：开局登记向导、图鉴状态栏、右下角精灵球（队伍/电脑/跟随）、附近野生宝可梦、对战入口卡、对战弹窗（嵌入本站 `index.html?embed=1`）、战斗结果写回 MVU 变量、主线剧情自动注入、NPC 相遇同步 |
| `kanto-data.js` | 关都数据：地图节点、各地点遭遇表、初始伙伴、徽章、称号、球种中文名等 |

## 和对战网页的通信（v1.3.2 嵌入协议）

- 桥接 → 网页：`PKM_BATTLE_CONFIG`（双方队伍、遭遇类型、精灵球库存、`host.tag`）、`PKM_BATTLE_PING`
- 网页 → 桥接：`PKM_BATTLE_READY / LOADING / STARTED / ERROR / RESULT`（都带 `hostTag`）
- 嵌入模式下网页不读写本地存档（存档以角色卡的 MVU 变量为准），没写招式的宝可梦按 `src/data/levelup.json` 的升级招式取等级以内最近 4 招。

## 自检

```
npm test        # 含 tests/st-bridge.test.mjs
```

部署后打开 `https://<你的用户名>.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.2`，能看到代码（不是 404）就说明桥接已上线；网站页脚应显示 `v1.3.2`。
