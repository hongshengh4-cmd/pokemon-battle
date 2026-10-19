# 自定义叫声（动画配音）

点精灵球旁边跟随的宝可梦，或在精灵球面板里点「出球跟随」，会播放这只宝可梦的叫声。

- 默认用 Pokémon Showdown 的**原作叫声**（游戏里的电子音）。
- 把你自己的录音放进这个文件夹，就会**优先播放你的录音**；没录的那只自动退回原作叫声。
- 精灵球面板底部有「叫声」音量滑块和来源下拉：`动画配音优先`（默认）／`仅动画配音`（没录的不出声）／`仅原作叫声`。设置记在本机。

## 命名规则（只有一条）

**`英文名小写（只留字母和数字）.mp3`**

| 宝可梦 | 文件名 |
| --- | --- |
| 皮卡丘 | `pikachu.mp3` |
| 魔墙人偶 | `mrmime.mp3` |
| 大葱鸭 | `farfetchd.mp3` |
| 尼多兰（♀）／尼多朗（♂） | `nidoranf.mp3`／`nidoranm.mp3` |
| 凤王 | `hooh.mp3` |

- 关都 151 只的完整对照表：[CHECKLIST.md](CHECKLIST.md)（带 ★ 的是卡里的遭遇表和初始伙伴会出现的，建议先录这些）。表格版 `cries-checklist.csv` 可以用 Excel / WPS 当进度表。
- 其他宝可梦同理：英文名小写、只留字母数字（`Ho-Oh → hooh`、`Porygon2 → porygon2`、`Mime Jr. → mimejr`）。
- **同一只想录好几个版本随机播放**：`pikachu.mp3`、`pikachu_2.mp3`、`pikachu_3.mp3`……（最多到 `_9`，编号要连续）。录完运行一次 `node tools/cries-check.mjs --manifest`（或 `--fix`、`--pack`，它们会自动更新）刷新 `manifest.json`，备选版本才会被用上。

## 录音建议

- 每条 0.4～3 秒，只留叫声，别夹对白和背景音乐。
- 格式：mp3，单声道，96kbps 左右（每条约 10～40 KB，整套 151 只约 3～5 MB）。
- 音量不用自己调：`--pack` 会统一响度，游戏里还有音量滑块。

## 工具（不需要安装任何依赖；`--pack` 需要电脑里有 ffmpeg）

```bash
node tools/cries-check.mjs                    # 检查文件名，统计关都 151 只录了多少，列出还差哪些 ★
node tools/cries-check.mjs --fix              # 把认得出来的文件改成标准名，并更新 manifest.json
node tools/cries-check.mjs --pack 原始录音/    # 原始录音批量转成标准 mp3（认名、去首尾静音、统一响度）
```

`--fix` 和 `--pack` 认得这些文件名：`25.wav`、`025.wav`、`#025.wav`、`025-皮卡丘.wav`、`皮卡丘.wav`、`Pikachu.wav`、`皮卡丘_2.wav`（第 2 个版本），
也可以把同一只的多个录音放进一个以名字命名的文件夹，如 `原始录音/皮卡丘/1.wav`、`2.wav`。输入可以是 wav / m4a / ogg / flac / mp4 等 ffmpeg 能读的格式。

## 想听听某只会播哪个文件

在浏览器控制台执行 `__PKM_KANTO__.testCry('皮卡丘')`：会立刻播一声，并返回游戏去找的文件地址。

## 部署与缓存

- 文件放在仓库的 `st-bridge/audio/cries/` 里随网站一起上传。上传后 GitHub Pages 最多要几分钟才生效，生效后在酒馆里 Ctrl+F5 强刷一次。
- 想把音频只放在自己电脑上、不放进公开仓库：把文件放进酒馆安装目录的 `public/pkm-cries/`，然后在浏览器控制台执行一次
  `localStorage.setItem('pkmKantoCryBase','/pkm-cries/')`（改回默认：`localStorage.removeItem('pkmKantoCryBase')`）。

## 版权提示

动画里的配音归原作方所有。自己录下来在私人环境里用没问题；如果你的仓库和网站是公开的，请不要把这些音频提交进去（用上面的「只放在本机」方式），也不要打包分发。
