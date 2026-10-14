# 大世界战斗入口 · v0.9.0 原型

当前接口可供未来地图调用，不代表地图或SillyTavern侧闭环已经完成。

## 单只野生遭遇

仍使用页面粘贴JSON、URL的config参数或既有PKM_BATTLE_CONFIG消息。

```json
{
  "encounter": { "type": "wild" },
  "difficulty": "normal",
  "p1": { "entrants": [{ "name": "player" }] },
  "p2": { "entrants": [{ "name": "wild", "party": [
    { "name": "eevee", "lv": 35, "moves": ["tackle", "quickattack"] }
  ] }] }
}
```

- 只有显式 `encounter.type=wild` 且p2只有一只时才允许捕获；多个目标报错。
- 未指定encounter的配置默认训练家，不能靠敌方名称为wild绕过。
- 可选seed用于可复现测试，不是遭遇持久ID。
- 当前网页的球袋来自本机存档，不信任config里自带的球数量。
- UI动作动画期间不会启动另一场战斗。未来宿主应等当前结果，而非持续重发配置。

## 结果

PKM_BATTLE_RESULT原有winner/turns/playerTeam/enemyTeam/log等字段保留，新增：

- `encounterType`: wild / trainer。
- `outcome`: captured / victory / defeat / null。
- `capture`: 成功时包含球种、物种、spec、捕获时HP/状态等；否则null。
- `ballStock`: 本场结束后各球数量。

捕获时winner仍为player，但敌方并非濒死。宿主必须读取outcome区分击败和收服。
UI在一场结束后只发送一次结果。捕获存档在动画前同步提交，奖励按本机捕获id去重。

## 本机存档

```json
{
  "version": 1,
  "balls": { "pokeball": 20, "greatball": 10, "ultraball": 5 },
  "box": []
}
```

box条目包含id/caughtAt/ball/spec，最大1000条。不要把完整Battle对象写入存档（包含循环引用和临时战斗状态）。
导入经格式校验并由用户确认后替换本机球袋/仓库，编辑队伍不被自动覆盖。

## 后续边界

当前编队仍为可编辑配置，仓库保留捕获记录；尚未实现随行实例唯一归属、跨场HP/PP/状态/经验、云同步、多标签事务锁或可信服务端背包。
上线正式大世界前应把战斗结果交给统一玩家档案处理，采用稳定遭遇ID、幂等结算和受信宿主通信策略。当前宽松postMessage骨架不应被当作服务端授权边界。
