# 配套角色卡 · v1.3.21 实卡交互修复版

- `宝可梦·关都之旅-v1.3.21-跟随转向叫声长按修复版.json`：完整可导入的 Tavern Card V3，保留原设定、世界书、状态栏、MVU／酒馆助手脚本、情绪效果及队伍／仓库面板。
- **已移除酒馆互动演示页** `character-card/酒馆交互预览.html`；本包保留根目录 `preview.html`，它是战斗天气／场地效果工作台，首页和对战弹窗会用到。

## 本版修复

1. 跟随宝可梦的鼠标转向同时监听酒馆主页面和同源消息 iframe，并正确换算 iframe 坐标。
2. 缺少动漫录音时默认立即播放 Pokémon Showdown 提供的**原作游戏叫声**；它不是动画配音。语音合成仍可在面板里选择。
3. 按住跟随伙伴约 520ms，直接打开队伍／仓库面板；短按仍用于互动和叫声，拖动仍可移动精灵球。

## 部署与导入

1. 将本 ZIP 解压后，把仓库根目录中的文件和目录上传至 `hongshengh4-cmd/pokemon-battle`，保持原有目录结构，并等待 GitHub Pages 部署完成。
2. 确认 `https://hongshengh4-cmd.github.io/pokemon-battle/st-bridge/bridge.js?v=1.3.21-follow-voice-hold-1` 可以打开，网站页脚显示 `v1.3.21`。
3. 导入本目录中的角色卡，并允许运行卡内酒馆助手脚本。若部署到其他 Pages 地址，请在角色卡脚本中调整 `PKM_APP_BASE_URL`。

> ZIP 不含 `.git` 历史或 `node_modules`。如果现有 GitHub 仓库里仍有旧的 `character-card/酒馆交互预览.html`，请单独删除该路径并提交；仅上传不含该文件的新 ZIP 不会自动删除远程已有文件，Git 历史也不会被普通删除改写。
