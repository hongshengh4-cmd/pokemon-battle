# SillyTavern 角色卡导入 · v1.3.20

完整角色卡位于：

```text
../character-card/宝可梦·关都之旅-v1.3.20-完整配套角色卡.json
```

## 使用前

1. 先按仓库根目录 [`README.md`](../README.md) 部署配套的 `pokemon-battle` v1.3.20 GitHub Pages 仓库。
2. 确认 `https://hongshengh4-cmd.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.20` 可访问，主页页脚显示 `v1.3.20`。
3. 在 SillyTavern 安装并启用 MVU 和酒馆助手（JS-Slash-Runner）。

## 导入

1. 将上述 JSON 导入 SillyTavern，打开角色卡。
2. 按酒馆助手提示允许角色卡脚本运行；需允许脚本和网络请求。
3. 发送开场消息，进入开局登记流程并选择旅程模式、训练家档案和初始伙伴。
4. 图鉴、状态栏、跟随宝可梦、附近遭遇和对战由配套外置桥接加载。对战页使用本站 `index.html`。

卡片中的 `scripts[1]` 会加载桥接，并安装卡侧的兼容插件：短按互动、按 HP/异常状态/羁绊变化的情绪反应、抚摸、闲置动作、睡眠/唤醒及聊天事件反应。拖动会抑制误触；长按跟随宝可梦打开队伍面板。实际情绪与队伍状态读取卡内数据，不会由本地预览写入存档。

若 Pages 部署到其他域名或仓库路径，请在角色卡脚本 `scripts[1]` 中修改 `PKM_APP_BASE_URL`。

## 本地互动预览

[`../character-card/酒馆交互预览.html`](../character-card/酒馆交互预览.html) 是独立演示页：可以切换健康、低血量、中毒、麻痹、普通羁绊和睡眠场景，并测试输入/发送、拖动和长按。预览不连接 SillyTavern、不写入 MVU。
