/* Starter trainers/teams (move ids use Showdown normalization: lowercase, no punctuation). */
(function (root) {
  'use strict';
  const TRAINERS = {
    player: {
      name: '玩家', tier: 3,
      party: [
        { species: 'venusaur', level: 62, ability: 'Overgrow', item: 'leftovers', moves: ['seedbomb', 'sludgebomb', 'earthpower', 'sleeppowder'] },
        { species: 'charizard', level: 62, ability: 'Blaze', item: 'charcoal', moves: ['flamethrower', 'airslash', 'dragonpulse', 'willowisp'] },
        { species: 'blastoise', level: 62, ability: 'Torrent', item: 'mysticwater', moves: ['hydropump', 'icebeam', 'aurasphere', 'rapidspin'] },
        { species: 'pikachu', level: 62, ability: 'Static', item: 'lightball', moves: ['thunderbolt', 'irontail', 'quickattack', 'surf'] },
        { species: 'gengar', level: 62, ability: 'Cursed Body', item: 'lifeorb', moves: ['shadowball', 'sludgebomb', 'focusblast', 'thunderbolt'] },
        { species: 'dragonite', level: 62, ability: 'Multiscale', item: 'leftovers', moves: ['dragonclaw', 'extremespeed', 'earthquake', 'roost'] },
      ],
    },
    rookie: {
      name: '短裤小子', tier: 1,
      party: [
        { species: 'rattata', level: 18, moves: ['quickattack', 'tackle', 'bite'] },
        { species: 'pidgey', level: 18, moves: ['gust', 'quickattack', 'sandattack'] },
        { species: 'caterpie', level: 16, moves: ['tackle', 'stringshot'] },
      ],
    },
    gym: {
      name: '馆主·岚', tier: 2,
      party: [
        { species: 'corviknight', level: 45, ability: 'Pressure', item: 'leftovers', moves: ['bravebird', 'ironhead', 'bodypress', 'roost'] },
        { species: 'skarmory', level: 45, ability: 'Sturdy', item: 'rockyhelmet', moves: ['steelwing', 'drillpeck', 'roost', 'spikes'] },
        { species: 'gyarados', level: 47, ability: 'Intimidate', item: 'lifeorb', moves: ['waterfall', 'crunch', 'icefang', 'dragondance'] },
        { species: 'talonflame', level: 47, ability: 'Gale Wings', item: 'heavydutyboots', moves: ['bravebird', 'flareblitz', 'swordsdance', 'uturn'] },
      ],
    },
    champion: {
      name: '冠军·希罗娜风', tier: 4,
      party: [
        { species: 'spiritomb', level: 66, ability: 'Pressure', item: 'leftovers', moves: ['shadowball', 'darkpulse', 'willowisp', 'painsplit'] },
        { species: 'roserade', level: 66, ability: 'Natural Cure', item: 'choicespecs', moves: ['leafstorm', 'sludgebomb', 'dazzlinggleam', 'extrasensory'] },
        { species: 'togekiss', level: 66, ability: 'Serene Grace', item: 'leftovers', moves: ['airslash', 'dazzlinggleam', 'aurasphere', 'roost'] },
        { species: 'lucario', level: 66, ability: 'Inner Focus', item: 'lifeorb', moves: ['closecombat', 'bulletpunch', 'extremespeed', 'swordsdance'] },
        { species: 'milotic', level: 66, ability: 'Marvel Scale', item: 'flameorb', moves: ['scald', 'icebeam', 'dragonpulse', 'recover'] },
        { species: 'garchomp', level: 68, ability: 'Rough Skin', item: 'rockyhelmet', moves: ['earthquake', 'dragonclaw', 'stoneedge', 'swordsdance'] },
      ],
    },
    wild: {
      name: '野生宝可梦', tier: 1,
      party: [
        { species: 'zubat', level: 22, moves: ['wingattack', 'confuseray', 'bite'] },
        { species: 'geodude', level: 22, moves: ['rockthrow', 'bulldoze', 'tackle'] },
      ],
    },
  };
  root.PKMPresets = { TRAINERS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
