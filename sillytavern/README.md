# 与 SillyTavern 角色卡的对接（阶段五细化前的草案）

对战页面已经预留了三种配置入口，桥接脚本（阶段五）会基于它们完成闭环：

1. **页面内粘贴**：对战页"高级"面板可直接粘贴 `<PKM_BATTLE>{...}</PKM_BATTLE>` 或纯 JSON。
2. **URL 传参**：`https://你的用户名.github.io/pokemon-battle/?config=<encodeURIComponent(JSON)>`。
3. **postMessage**（正式对接方式）：宿主页面向对战 iframe 发送
   `{ type: 'PKM_BATTLE_CONFIG', payload: <配置对象> }`；
   战斗结束后对战页向父窗口回发
   `{ type: 'PKM_BATTLE_RESULT', payload: { winner, turns, playerTeam, enemyTeam, log } }`。

## 计划中的卡侧组件

- **世界书《战斗规则》条目**：约束 AI 仅在战斗触发时输出 `<PKM_BATTLE>` 配置：
  - `difficulty`: easy / normal / hard / expert
  - `p1.entrants` / `p2.entrants`：训练师或野生实体；玩家默认引用 MVU 存档队伍
  - 实体 `party` 支持两种写法：引用内置训练师，或现场构造
    `{ "name": "Garchomp", "lv": 60, "moves": ["Earthquake", "Dragon Claw", "Stone Edge", "Swords Dance"] }`
  - 可选 `environment`: `{ "weather": "sandstorm", "weatherTurns": 5 }`
  - `lines`: start / win / lose / escape 台词
- **`[initvar]` MVU 变量**：`pkm.player / party.slots[6] / box / world / npcs / battle.lastResult / settings`（结构在阶段五按最终字段冻结后写入卡文件）。
- **《变量规则》条目**：AI 只用 JSONPatch 增量更新队伍与成长字段，禁止整表覆写。
- **正则组**：发送时裁剪战斗配置块避免回灌；显示时把配置块替换为 iframe 包装器（内嵌上方地址的对战页，并把该楼的变量快照透传给页面）。
- **酒馆助手桥接脚本**：监听楼层变量 → 打开/刷新对战 → 接收 `PKM_BATTLE_RESULT` → 回写 `battle.lastResult` 与队伍剩余 HP → 注入"按结果回放叙事"的系统提示。

## 当前状态

对战页侧的接口已就绪且经过测试；卡侧组件在阶段五统一制作成一张可直接导入的角色卡 JSON（与前面对话中已修复的那张 MVU 卡同样的交付方式），避免半成品协议先行扩散。
