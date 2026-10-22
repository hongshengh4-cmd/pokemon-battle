// 宝可梦·关都之旅 · 外置桥接数据（v1.3.2 起；v1.3.8 加赛制表；v1.3.9 加伙伴阵容表）
// 地图坐标、附近野生遭遇表、初始伙伴、道具图标映射。全部为同人整理数据。

export const VERSION = '1.3.22';

/* ---------- 关都地图（示意，坐标为 0~100 的画布比例） ---------- */
export const MAP_NODES = [
  { id: 'pallet', name: '真新镇', x: 22, y: 76, kind: 'town', alias: ['真新', '大木研究所', '1号道路'] },
  { id: 'viridian', name: '常青市', x: 22, y: 58, kind: 'city', alias: ['常青', '常磐', '22号道路'] },
  { id: 'vforest', name: '常青森林', x: 22, y: 42, kind: 'wild', alias: ['常磐森林'] },
  { id: 'pewter', name: '深灰市', x: 22, y: 27, kind: 'city', alias: ['深灰', '尼比', '3号道路'] },
  { id: 'mtmoon', name: '月见山', x: 40, y: 22, kind: 'wild', alias: ['月见'] },
  { id: 'cerulean', name: '华蓝市', x: 60, y: 22, kind: 'city', alias: ['华蓝', '24号道路', '25号道路', '金珠桥', '正辉的灯塔'] },
  { id: 'saffron', name: '金黄市', x: 60, y: 42, kind: 'city', alias: ['金黄', '金黄道馆'] },
  { id: 'celadon', name: '玉虹市', x: 42, y: 42, kind: 'city', alias: ['玉虹', '7号道路', '16号道路', '自行车道'] },
  { id: 'lavender', name: '紫苑镇', x: 80, y: 42, kind: 'town', alias: ['紫苑', '宝可梦塔', '8号道路', '10号道路'] },
  { id: 'vermilion', name: '枯叶市', x: 60, y: 62, kind: 'city', alias: ['枯叶', '圣特安努号', '6号道路', '11号道路', '地鼠洞穴'] },
  { id: 'fuchsia', name: '浅红市', x: 48, y: 84, kind: 'city', alias: ['浅红', '狩猎地带', '宝可梦保护区', '18号道路'] },
  { id: 'seafoam', name: '双子岛', x: 34, y: 92, kind: 'wild', alias: ['双子'] },
  { id: 'cinnabar', name: '红莲镇', x: 22, y: 92, kind: 'town', alias: ['红莲', '红莲岛', '宝可梦屋敷'] },
  { id: 'indigo', name: '石英高原', x: 7, y: 30, kind: 'league', alias: ['石英', '石英大会', '宝可梦联盟', '23号道路', '冠军之路'] },
];
export const MAP_EDGES = [
  ['pallet', 'viridian'], ['viridian', 'vforest'], ['vforest', 'pewter'], ['pewter', 'mtmoon'], ['mtmoon', 'cerulean'],
  ['cerulean', 'saffron'], ['saffron', 'vermilion'], ['saffron', 'celadon'], ['saffron', 'lavender'], ['cerulean', 'lavender'],
  ['lavender', 'fuchsia'], ['celadon', 'fuchsia'], ['vermilion', 'lavender'], ['fuchsia', 'seafoam'], ['seafoam', 'cinnabar'],
  ['cinnabar', 'pallet'], ['viridian', 'indigo'],
];
// 动画原创地点 → 最接近的地图城镇（只用于地图高亮与遭遇表，不代表官方设定）
export const ANIME_PLACES = {
  '宝可梦研究学院': 'cerulean', '宝可梦乡': 'cerulean', '小火龙等待的岩石': 'cerulean', '杰尼龟军团的小镇': 'vermilion',
  '巨大宝可梦之岛': 'vermilion', '蓝普尔其': 'vermilion', '鸠羽港': 'vermilion', '少女峡': 'vermilion', '巴大蝶告别的海崖': 'vermilion',
  '火暴猴的野餐地': 'lavender', '哎呀呀镇': 'celadon', '美容街': 'celadon', '斗魂道馆': 'saffron', '黑云市': 'celadon', '奥兹高水坝': 'celadon',
  '拉拉美村': 'fuchsia', '阳光镇': 'fuchsia', '伊美蒂的演艺屋': 'fuchsia', '马察市': 'fuchsia', '皮卡丘的森林': 'fuchsia', '史顿镇': 'fuchsia',
  '进化山': 'fuchsia', '卡比兽堵住的泉源': 'fuchsia', '黑暗市': 'fuchsia', '椰蛋森林': 'fuchsia', '松藻镇': 'fuchsia', '霓虹镇': 'fuchsia',
  '大傻谷': 'fuchsia', '杜医生的医院': 'fuchsia', '小次郎的家': 'fuchsia', '大葱鸭的树林': 'fuchsia', '波克比诞生的城市': 'fuchsia',
  '不思议花园': 'fuchsia', '玩偶镇': 'fuchsia', '樱花育幼院': 'fuchsia', '警犬训练所': 'fuchsia', '阿彻的家': 'fuchsia',
  '宝可梦联盟检定中心': 'fuchsia', '大姐姐抚养家所在的港镇': 'fuchsia', '水箭龟之岛': 'cinnabar', '宝可梦马戏团': 'viridian',
  '比努': 'pallet', '村雨植物园': 'pallet', '湖边露营区': 'viridian', '好莱坞': 'viridian', '米亚查山': 'viridian', '波多罗山': 'viridian',
  '山间捷径': 'indigo', '小明的道馆': 'pewter',
};

/* ---------- 附近野生遭遇表：[中文名, 最低等级, 最高等级, 权重] ---------- */
export const ENCOUNTERS = {
  pallet: [['波波', 2, 5, 4], ['小拉达', 2, 5, 4], ['烈雀', 3, 5, 2]],
  viridian: [['波波', 3, 6, 3], ['小拉达', 3, 6, 3], ['烈雀', 3, 6, 2], ['尼多兰', 3, 6, 2], ['尼多朗', 3, 6, 2]],
  vforest: [['绿毛虫', 3, 6, 4], ['独角虫', 3, 6, 4], ['铁甲蛹', 4, 7, 2], ['铁壳蛹', 4, 7, 2], ['波波', 4, 7, 2], ['皮卡丘', 4, 7, 1]],
  pewter: [['烈雀', 6, 10, 3], ['小拉达', 6, 10, 3], ['尼多兰', 6, 10, 2], ['尼多朗', 6, 10, 2], ['胖丁', 7, 11, 1], ['穿山鼠', 7, 11, 2]],
  mtmoon: [['超音蝠', 7, 12, 4], ['小拳石', 7, 12, 3], ['派拉斯', 8, 12, 2], ['皮皮', 8, 12, 1]],
  cerulean: [['走路草', 9, 14, 3], ['喇叭芽', 9, 14, 3], ['阿柏蛇', 9, 14, 2], ['凯西', 10, 14, 1], ['可达鸭', 10, 14, 2], ['绿毛虫', 9, 12, 2]],
  vermilion: [['喵喵', 12, 18, 2], ['地鼠', 12, 18, 3], ['走路草', 12, 18, 2], ['烈雀', 12, 18, 2], ['大舌贝', 13, 18, 1], ['小拉达', 12, 18, 2]],
  saffron: [['波波', 14, 22, 2], ['喵喵', 14, 22, 2], ['凯西', 14, 20, 1], ['卡蒂狗', 15, 22, 2], ['六尾', 15, 22, 2], ['催眠貘', 15, 22, 2]],
  celadon: [['胖丁', 14, 24, 2], ['卡蒂狗', 15, 24, 2], ['六尾', 15, 24, 2], ['臭泥', 15, 24, 2], ['走路草', 14, 22, 2], ['喇叭芽', 14, 22, 2]],
  lavender: [['鬼斯', 15, 22, 3], ['卡拉卡拉', 15, 22, 2], ['超音蝠', 15, 22, 2], ['小磁怪', 16, 22, 2]],
  fuchsia: [['尼多力诺', 20, 28, 2], ['尼多娜', 20, 28, 2], ['毛球', 18, 26, 2], ['蛋蛋', 20, 28, 2], ['肯泰罗', 22, 30, 1], ['飞天螳螂', 22, 30, 1], ['凯罗斯', 22, 30, 1], ['袋兽', 22, 30, 1]],
  seafoam: [['小海狮', 28, 36, 3], ['大嘴蝠', 28, 36, 3], ['呆呆兽', 28, 36, 2], ['墨海马', 28, 34, 2]],
  cinnabar: [['小火马', 30, 40, 3], ['鸭嘴火兽', 32, 40, 1], ['卡蒂狗', 30, 38, 2], ['角金鱼', 30, 38, 2], ['毒刺水母', 30, 38, 2]],
  indigo: [['尼多力诺', 35, 45, 2], ['尼多娜', 35, 45, 2], ['阿柏怪', 36, 46, 2], ['大岩蛇', 36, 46, 2], ['大嘴蝠', 35, 45, 2], ['豪力', 36, 46, 1]],
};
export const WATER_ENCOUNTERS = [['鲤鱼王', 5, 25, 4], ['毒刺水母', 10, 30, 3], ['海星星', 10, 30, 2], ['墨海马', 10, 30, 2], ['角金鱼', 10, 30, 2], ['蚊香蝌蚪', 8, 25, 2]];
export const INDOOR_WORDS = ['宝可梦中心', '研究所', '道馆', '家', '屋', '店', '商店', '酒店', '旅馆', '餐厅', '船舱', '会场', '运动场', '医院', '教室', '电视台', '大楼'];
export const WATER_WORDS = ['海', '港', '湖', '河', '水边', '岸', '湾', '岛', '码头', '瀑布', '船'];

/* ---------- 初始伙伴（Lv5，招式为官方简体中文名） ---------- */
export const STARTERS = {
  妙蛙种子: { ability: '茂盛', moves: ['撞击', '叫声', null, null], gender: 'M', desc: '草/毒 · 性格温和，背上的种子会随成长发芽。' },
  小火龙: { ability: '猛火', moves: ['抓', '叫声', null, null], gender: 'M', desc: '火 · 尾巴的火焰代表生命力，有点急性子。' },
  杰尼龟: { ability: '激流', moves: ['撞击', '摇尾巴', null, null], gender: 'M', desc: '水 · 缩进壳里防御，喜欢恶作剧。' },
  皮卡丘: { ability: '静电', moves: ['电击', '叫声', null, null], gender: 'M', desc: '电 · 不喜欢待在精灵球里，脾气很倔。' },
  小拉达: { ability: '逃跑', moves: ['撞击', '摇尾巴', null, null], gender: 'M', desc: '一般 · 精力旺盛，什么都想啃一啃。' },
  波波: { ability: '锐利目光', moves: ['撞击', '泼沙', null, null], gender: 'F', desc: '一般/飞行 · 温顺，方向感很好。' },
  尼多兰: { ability: '毒刺', moves: ['叫声', '撞击', null, null], gender: 'F', desc: '毒 · 胆子小，但毒针很厉害。' },
  伊布: { ability: '逃跑', moves: ['撞击', '摇尾巴', null, null], gender: 'M', desc: '一般 · 拥有多种进化可能的稀有宝可梦。' },
};
export const MODE_STARTERS = {
  同行模式: ['妙蛙种子', '小火龙', '杰尼龟'],
  小智模式: ['皮卡丘'],
  沙盒模式: ['小拉达', '波波', '尼多兰', '伊布'],
};
export const MODE_INFO = {
  同行模式: { icon: '🤝', start: { time: '第1年 5月22日 07:00', location: '真新镇·大木研究所' }, desc: '你是同一天从真新镇出发的新人训练家。小智、小霞、小刚都是 NPC，可以同行，也可以各走各的路。', greeting: 0 },
  小智模式: { icon: '🧢', start: { time: '第1年 5月22日 10:40', location: '真新镇·小智家' }, desc: '你就是小智。睡过头、只剩一只不肯进精灵球的皮卡丘——接下来怎么走由你决定。', greeting: 1 },
  沙盒模式: { icon: '🗺️', start: { time: '第1年 5月22日 09:00', location: '真新镇·大木研究所后院' }, desc: '你是关都的一名训练家，自由旅行。动画事件在各地按时间发生，不在场就只会听到消息。', greeting: 2 },
};
export const NATURES = ['勤奋', '大胆', '内敛', '温和', '胆小', '怕寂寞', '坦率', '慢吞吞', '温顺', '急躁', '固执', '淘气', '害羞', '慎重', '马虎', '爽朗', '顽皮', '乐天', '浮躁', '天真', '勇敢', '悠闲', '冷静', '自大', '认真'];

/* ---------- v1.3.4：性格 / 个体值 / 叫声 ---------- */
// 性格 → [提高的能力, 降低的能力]；勤奋、坦率、害羞、浮躁、认真为无修正性格
export const NATURE_EFFECT = {
  固执: ['atk', 'spa'], 内敛: ['spa', 'atk'], 爽朗: ['spe', 'spa'], 胆小: ['spe', 'atk'], 大胆: ['def', 'atk'], 温和: ['spd', 'atk'],
  淘气: ['def', 'spa'], 慎重: ['spd', 'spa'], 勇敢: ['atk', 'spe'], 冷静: ['spa', 'spe'], 悠闲: ['def', 'spe'], 自大: ['spd', 'spe'],
  怕寂寞: ['atk', 'def'], 慢吞吞: ['spa', 'def'], 急躁: ['spe', 'def'], 天真: ['spe', 'spd'], 顽皮: ['atk', 'spd'], 马虎: ['spa', 'spd'],
  乐天: ['def', 'spd'], 温顺: ['spd', 'def'],
};
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_ZH = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };
// quality（资质）→ 个体值范围；没写资质的按 0~31 随机，再按总和推算资质
export const IV_BAND = { low: [0, 15], medium: [5, 25], high: [16, 31], perfect: [24, 31] };
export const QUALITY_ZH = { low: '资质平平', medium: '资质不错', high: '资质优秀', perfect: '资质完美' };
// 羁绊四项
export const AVS_ZH = { trust: '信任', passion: '热情', insight: '默契', devotion: '亲密' };
// 动画风格的叫声：宝可梦（会说话的喵喵除外）只会喊自己名字或名字的音节。表里没有的按名字自动生成（见 bridge.js cryLines）。
export const CRIES = {
  皮卡丘: ['皮卡～皮卡丘！', '皮卡皮卡！', '皮卡？'], 雷丘: ['雷丘！', '雷～丘！'],
  杰尼龟: ['杰尼杰尼！', '杰尼～！'], 卡咪龟: ['卡咪～卡咪！'], 水箭龟: ['水箭——龟！'],
  妙蛙种子: ['妙蛙～种子！', '种子种子！'], 妙蛙草: ['妙蛙～草！'], 妙蛙花: ['妙蛙——花！'],
  小火龙: ['小火龙～！', '火龙！火龙！'], 火恐龙: ['火恐龙！'], 喷火龙: ['（喷出一团火焰）喷火——龙！'],
  伊布: ['布伊～！', '伊布～！'], 胖丁: ['胖丁～♪', '胖～丁～胖～丁～'], 可达鸭: ['可达？', '可达……可达～'],
  卡比兽: ['卡比～……', '卡～比～'], 波克比: ['波克比～！', '克比克比！'], 喵喵: ['喵～！', '喵喵！'],
  鬼斯: ['鬼斯～'], 鬼斯通: ['鬼斯通～嘻嘻嘻'], 耿鬼: ['耿～鬼～！'], 大岩蛇: ['（低沉的轰鸣）大岩——蛇！'],
  绿毛虫: ['绿毛～虫！'], 波波: ['波波！', '波～波～'], 比比鸟: ['比比鸟！'], 大比鸟: ['大比——鸟！'],
  呆呆兽: ['呆～呆～……'], 走路草: ['走路～草！'], 拉达: ['拉达！'], 小拉达: ['拉达拉达！'],
  阿柏蛇: ['阿柏蛇——！'], 阿柏怪: ['阿柏——怪！'], 瓦斯弹: ['瓦斯～瓦斯～'], 宝石海星: ['（核心闪着光）嘿呀！'],
  海星星: ['（核心闪着光）嘿呀！'], 墨海马: ['墨海～'], 鲤鱼王: ['（扑腾，扑腾）'], 暴鲤龙: ['（震耳的咆哮）'],
  胡地: ['胡地……'], 凯西: ['凯西……（睡着）'], 喇叭芽: ['喇叭芽～'], 菊草叶: ['菊草～叶！'], 火球鼠: ['火球鼠！'], 小锯鳄: ['小锯鳄！'],
};

/* ---------- 精灵球与道具 ---------- */
export const BALL_ZH = { pokeball: '精灵球', greatball: '超级球', ultraball: '高级球' };
export const ZH_BALL = { 精灵球: 'pokeball', 超级球: 'greatball', 高级球: 'ultraball' };
// 道具中文名 → PokeAPI 道具图文件名
export const ITEM_ICONS = {
  精灵球: 'poke-ball', 超级球: 'great-ball', 高级球: 'ultra-ball', 大师球: 'master-ball', 狩猎球: 'safari-ball',
  伤药: 'potion', 好伤药: 'super-potion', 厉害伤药: 'hyper-potion', 全满药: 'max-potion', 全复药: 'full-restore',
  解毒药: 'antidote', 解麻药: 'paralyze-heal', 灼伤药: 'burn-heal', 解冻药: 'ice-heal', 解眠药: 'awakening', 万灵药: 'full-heal',
  活力碎片: 'revive', 活力块: 'max-revive', 美味之水: 'fresh-water', 劲爽汽水: 'soda-pop', 果汁牛奶: 'lemonade', 哞哞鲜奶: 'moomoo-milk',
  除虫喷雾: 'repel', 白银喷雾: 'super-repel', 黄金喷雾: 'max-repel', 离洞绳: 'escape-rope',
  破旧钓竿: 'old-rod', 好钓竿: 'good-rod', 厉害钓竿: 'super-rod', 自行车: 'bicycle', 船票: 's-s-ticket', 宝可梦之笛: 'poke-flute',
  雷之石: 'thunder-stone', 火之石: 'fire-stone', 水之石: 'water-stone', 叶之石: 'leaf-stone', 月之石: 'moon-stone',
  神奇糖果: 'rare-candy', 力量粉: 'x-attack', 树果: 'oran-berry', 橙橙果: 'oran-berry', 文柚果: 'sitrus-berry',
  化石: 'helix-fossil', 贝壳化石: 'helix-fossil', 甲壳化石: 'dome-fossil', 秘密琥珀: 'old-amber', 宝可梦图鉴: 'pokedex',
};
export const ITEM_EMOJI = [[/球$/, '🔴'], [/药|水|奶|汽水/, '🧪'], [/石$/, '💎'], [/喷雾/, '🧴'], [/竿/, '🎣'], [/票|证|卡/, '🎫'], [/果$/, '🍒'], [/化石|琥珀/, '🦴']];

export const BADGES = ['灰色徽章', '蓝色徽章', '橙色徽章', '彩虹徽章', '粉红徽章', '金色徽章', '深红徽章', '绿色徽章'];
export const BADGE_COLORS = { 灰色徽章: '#9aa3ad', 蓝色徽章: '#4aa3ff', 橙色徽章: '#ff9a3c', 彩虹徽章: '#c58cff', 粉红徽章: '#ff7cc0', 金色徽章: '#f2c94c', 深红徽章: '#e5484d', 绿色徽章: '#45c46b' };
export const BADGE_GYM = { 灰色徽章: '深灰道馆·小刚', 蓝色徽章: '华蓝道馆·小霞的姐姐们', 橙色徽章: '枯叶道馆·马志士', 彩虹徽章: '玉虹道馆·莉佳', 粉红徽章: '浅红道馆·阿桔', 金色徽章: '金黄道馆·娜姿', 深红徽章: '红莲道馆·夏伯', 绿色徽章: '常青道馆·坂木' };

export const TITLES = [[2000, '石英大会的强者'], [1000, '联盟挑战者'], [500, '徽章收集者'], [200, '实力派训练家'], [50, '小有名气的训练家'], [-Infinity, '新人训练家']];
export const DIFFICULTY_BY_TYPE = { wild: 'normal', trainer: 'normal', rocket: 'normal', gym: 'hard', rival: 'expert', boss: 'expert', league: 'expert' };
export const WEATHER = { 晴: 'sunnyday', 晴天: 'sunnyday', 雨: 'raindance', 下雨: 'raindance', 沙暴: 'sandstorm', 雪: 'snow', 下雪: 'snow', 冰雹: 'snow' };
export const STATUS_TO_ZH = { par: '麻痹', brn: '灼伤', psn: '中毒', tox: '中毒', slp: '睡眠', frz: '冰冻' };
export const TYPE_LABEL = { wild: '野生', trainer: '训练家', gym: '道馆战', rival: '劲敌', boss: '强敌', rocket: '火箭队', league: '联盟大会' };
// v1.3.9：对战画面里的标签（第一段）
export const BATTLE_LABEL = { wild: '野生遭遇', trainer: '训练家对战', gym: '道馆战', rival: '劲敌对战', boss: '强敌对战', rocket: '火箭队', league: '联盟大会' };

/* ---------- v1.3.8：赛制（几 v 几） ----------
 * 野外 / 捕捉：对方只出 1 只；我方队伍里能战斗的都能轮换上场（最多 6 只，没有 6 只就按实际只数，不补）。
 * 和 NPC 对战（v1.3.9）：没约定几对几就两边全队——对方带着的全部 vs 我方能战斗的全部（各最多 6 只），只数可以不一样。
 * 道馆 / 大会：按该馆（该场）的规矩。对战块没写 teamSize 时，先按事件、再按馆主兜底；都对不上才按对方阵容只数。
 * 下表与卡内各“事件详情”条目、动画关都篇一致（n = 每方最多几只）。 */
export const EVENT_FORMATS = {
  EP005: { type: 'gym', n: 2, rule: '深灰道馆·小刚：双方最多各派两只' },
  EP007: { type: 'gym', n: 3, rule: '华蓝道馆·小霞：三对三（小霞的初始三只：海星星、宝石海星、角金鱼）' },
  EP014: { type: 'gym', n: 1, rule: '枯叶道馆·马志士：一对一单挑，中途不能换' },
  EP022: { type: 'gym', n: 1, rule: '金黄道馆·娜姿：一对一' },
  EP024: { type: 'gym', n: 1, rule: '金黄道馆·娜姿（再战）：一对一' },
  EP026: { type: 'gym', n: 3, rule: '玉虹道馆·莉佳：三对三' },
  EP032: { type: 'gym', n: 2, rule: '浅红道馆·阿桔：二对二' },
  EP057: { type: 'gym', n: 3, rule: '红莲道馆·夏伯：三对三' },
  EP058: { type: 'gym', n: 1, rule: '红莲道馆·夏伯（火山口重赛）：一对一' },
  EP062: { type: 'gym', n: 3, rule: '常青道馆（火箭队代管）：各三只、不限时' },
  EP076: { type: 'league', n: 3, rule: '石英大会预赛：各三只' },
  EP077: { type: 'league', n: 3, rule: '石英大会预赛：各三只' },
  EP078: { type: 'league', n: 3, rule: '石英大会预赛：各三只' },
  EP080: { type: 'league', n: 3, rule: '石英大会第五轮：各三只' },
};
// 自由剧情 / 沙盒里的道馆战（对战块没写 teamSize、事件也对不上时，按对手名字认馆）
export const GYM_RULES = [
  { re: /小刚|武志|深灰/, n: 2, rule: '深灰道馆：双方最多各派两只' },
  { re: /小霞|华蓝|樱花|菖蒲|牡丹/, n: 3, rule: '华蓝道馆：三对三（小霞的初始三只：海星星、宝石海星、角金鱼）' },
  { re: /马志士|枯叶/, n: 1, rule: '枯叶道馆：一对一单挑' },
  { re: /娜姿|金黄/, n: 1, rule: '金黄道馆：一对一' },
  { re: /莉佳|玉虹/, n: 3, rule: '玉虹道馆：三对三' },
  { re: /阿桔|绫女|浅红/, n: 2, rule: '浅红道馆：二对二' },
  { re: /夏伯|红莲/, n: 3, rule: '红莲道馆：三对三' },
  { re: /坂木|常青/, n: 3, rule: '常青道馆：各三只' },
];
/* ---------- v1.3.9：同行伙伴现在带着的宝可梦（动画关都篇的默认进度，与卡内《分阶段人设》一致） ----------
 * 和小智 / 小霞 / 小刚对战时，对战块里漏写的成员由桥接按这张表补上（对战块写 "exact":true 时不补）；生成前注入也会把名单告诉 AI。
 * 时间点：'EP003#1' = EP003 的第 1 个节点演完之后；'EP010' = EP010 整集演完之后。状态栏里标了“跳过”的事件不生效。
 * forms = 这一只的进化顺序（按 evolve 的时间点依次进化）；leave = 离队；ace = 王牌（补进来时等级 +2）；since = 从哪个事件起出场（生成前注入用）。
 * 只记随身携带、会上场对战的：寄放在大木研究所的（大钳蟹、臭臭泥、肯泰罗）和小霞抱着的波克比不算。 */
export const NPC_ROSTERS = {
  ash: { name: '小智', alias: ['阿智'], skipMode: '小智', members: [
    { forms: ['皮卡丘'], ace: true },
    { forms: ['绿毛虫', '铁甲蛹', '巴大蝶'], join: 'EP003#1', evolve: ['EP003', 'EP004'], leave: 'EP021' },
    { forms: ['比比鸟'], join: 'EP003#3' },
    { forms: ['妙蛙种子'], join: 'EP010' },
    { forms: ['小火龙', '火恐龙', '喷火龙'], join: 'EP011', evolve: ['EP042', 'EP045'] },
    { forms: ['杰尼龟'], join: 'EP012' },
    { forms: ['鬼斯通'], join: 'EP023', leave: 'EP024' },
    { forms: ['火暴猴'], join: 'EP025', leave: 'EP029' },
  ] },
  misty: { name: '小霞', since: 'EP001', members: [
    { forms: ['海星星'] },
    { forms: ['宝石海星'], ace: true, leave: 'EP060' },
    { forms: ['角金鱼'] },
    { forms: ['墨海马'], join: 'EP019', leave: 'EP060' },
    { forms: ['可达鸭'], join: 'EP027' },
  ] },
  brock: { name: '小刚', since: 'EP005', members: [
    { forms: ['小拳石'] },
    { forms: ['大岩蛇'], ace: true },
    { forms: ['超音蝠'], join: 'EP006#1' },
    { forms: ['六尾'], join: 'EP028' },
  ] },
};
// 人物名的常见写法 → records key（在场名单同步“已结识”用）
export const NPC_ALIASES = {
  ash: ['小智', '阿智'], misty: ['小霞'], brock: ['小刚'], gary: ['小茂'], oak: ['大木博士', '大木'], jessie: ['武藏'], james: ['小次郎'],
  meowth: ['喵喵（火箭队）', '火箭队喵喵', '会说话的喵喵'], delia: ['花子', '小智妈妈', '小智的妈妈'], joy: ['乔伊小姐', '乔伊'],
  jenny: ['君莎小姐', '君莎'], erika: ['莉佳'], sabrina: ['娜姿'], aya: ['绫女'],
};
