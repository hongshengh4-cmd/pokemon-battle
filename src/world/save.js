/* Local prototype world save: a finite ball bag and captured Pokemon records. */
(function (root) {
  'use strict';
  const KEY = 'pkm-world-save-v1';
  const INITIAL_BALLS = { pokeball: 20, greatball: 10, ultraball: 5 };
  const clone = value => JSON.parse(JSON.stringify(value));
  const newSave = () => ({ version: 1, balls: { ...INITIAL_BALLS }, box: [] });
  function validate(raw) {
    if (!raw || raw.version !== 1 || !raw.balls || !Array.isArray(raw.box) || raw.box.length > 1000) throw new Error('不是有效的世界存档（版本1，仓库最多1000只）。');
    const balls = {};
    for (const key of Object.keys(INITIAL_BALLS)) {
      const n = raw.balls[key];
      if (!Number.isInteger(n) || n < 0 || n > 9999) throw new Error('精灵球数量不合法。');
      balls[key] = n;
    }
    const ids = new Set();
    const box = raw.box.map(record => {
      const spec = record?.spec;
      if (!record || typeof record.id !== 'string' || record.id.length > 160 || ids.has(record.id)
        || !spec || typeof spec.species !== 'string' || !/^[a-z0-9]+$/.test(spec.species)
        || !Number.isInteger(spec.level) || spec.level < 1 || spec.level > 100
        || !Array.isArray(spec.moves) || spec.moves.length < 1 || spec.moves.length > 4
        || !spec.moves.every(x => typeof x === 'string' && /^[a-z0-9]+$/.test(x))) throw new Error('仓库记录不合法或包含重复编号。');
      ids.add(record.id);
      return clone(record);
    });
    return { version: 1, balls, box };
  }
  class Store {
    constructor(storage) {
      this.storage = storage; this.state = newSave(); this.error = ''; this.blocked = false;
      try {
        const text = storage?.getItem(KEY);
        if (text) this.state = validate(JSON.parse(text));
        else if (!storage) this.error = '本机存储不可用，存档只在本次页面中暂存，请及时导出。';
      } catch (e) {
        this.blocked = true;
        this.error = '旧存档无法读取，已保留原数据。请先导出原始存档备份，再导入有效存档。';
      }
    }
    write(next) {
      if (this.blocked) throw new Error(this.error);
      const valid = validate(next);
      this.state = valid;
      try {
        if (!this.storage) throw new Error('Storage unavailable');
        this.storage.setItem(KEY, JSON.stringify(valid)); this.error = '';
      } catch (e) { this.error = '写入本机存档失败，当前内容仅临时保留，请立即导出存档备份。'; }
      return !this.error;
    }
    recordAttempt(stock, record) {
      const next = clone(this.state); next.balls = { ...stock };
      if (record && !next.box.some(x => x.id === record.id)) {
        if (next.box.length >= 1000) throw new Error('仓库已满，请先整理存档。');
        next.box.push(clone(record));
      }
      return this.write(next);
    }
    import(raw) {
      const valid = validate(raw);
      this.blocked = false;
      return this.write(valid);
    }
    supply() {
      return this.write({ ...this.state, balls: { ...INITIAL_BALLS } });
    }
  }
  root.PKMWorldSave = { KEY, INITIAL_BALLS, newSave, validate, Store };
})(typeof globalThis !== 'undefined' ? globalThis : this);
