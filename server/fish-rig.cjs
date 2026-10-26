const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pair = p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
const rect = r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) &&
  r[0] >= 0 && r[1] >= 0 && r[2] > .005 && r[3] > .005 && r[0] + r[2] <= 1.000001 && r[1] + r[3] <= 1.000001;
const strength = p => ['low', 'medium', 'high'].includes(p.strength);
function validRig(rig) {
  return rig && rig.version === 1 && /^[a-f0-9]{64}$/.test(rig.imageHash) &&
    Array.isArray(rig.sourceSize) && rig.sourceSize.length === 2 && rig.sourceSize.every(v => Number.isInteger(v) && v > 0 && v <= 16384) &&
    ['right', 'left'].includes(rig.facing) && rect(rig.body?.rect) &&
    (rig.tail == null || (rect(rig.tail.rect) && pair(rig.tail.root) && strength(rig.tail))) &&
    ['dorsal', 'lower'].every(key => rig[key] == null || (rect(rig[key].rect) && strength(rig[key]) &&
      Array.isArray(rig[key].rootLine) && rig[key].rootLine.length === 2 && rig[key].rootLine.every(pair) &&
      Math.hypot(rig[key].rootLine[0][0] - rig[key].rootLine[1][0], rig[key].rootLine[0][1] - rig[key].rootLine[1][1]) > .005));
}
function readGraphicSource(publicDir, userId, graphic) {
  // Paths originate only from the owned database row; reject malformed legacy rows.
  if (graphic.dir_name && !/^[a-zA-Z0-9_-]+$/.test(graphic.dir_name)) throw new Error('잘못된 그래픽 경로입니다.');
  const relative = ['fish_sprites', String(userId), ...(graphic.dir_name ? [graphic.dir_name] : []), 'fish_right.png'];
  let file = path.join(publicDir, ...relative);
  if (!fs.existsSync(file) && !graphic.dir_name) { relative.splice(1, 1); file = path.join(publicDir, ...relative); }
  const bytes = fs.readFileSync(file);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG 원본을 읽을 수 없습니다.');
  return { imageHash: crypto.createHash('sha256').update(bytes).digest('hex'), sourceSize: [bytes.readUInt32BE(16), bytes.readUInt32BE(20)], imageUrl: '/' + relative.join('/') };
}
function registerRigRoutes({ app, requireAuth, db, publicDir, ensureDefault }) {
  const owned = db.prepare('SELECT * FROM fish_graphics WHERE id = ? AND user_id = ?');
  const update = db.prepare('UPDATE fish_graphics SET rig_json = ? WHERE id = ? AND user_id = ?');
  const respond = (graphic, req, res) => {
    if (!graphic) return res.status(404).json({ success: false, error: '그래픽을 찾을 수 없습니다.' });
    try {
      const source = readGraphicSource(publicDir, req.session.userId, graphic);
      let rig = null;
      try { rig = JSON.parse(graphic.rig_json); } catch { /* legacy or empty */ }
      if (!rig && source.imageUrl === '/fish_sprites/fish_right.png') {
        try { rig = JSON.parse(fs.readFileSync(path.join(publicDir, 'fish_sprites', 'fish_right.rig.json'), 'utf8')); } catch { /* optional built-in rig */ }
      }
      const stale = !!rig && (rig.imageHash !== source.imageHash || !validRig(rig) || rig.sourceSize.some((n, i) => n !== source.sourceSize[i]));
      return res.json({ success: true, ...source, rig: stale ? null : rig, stale });
    } catch { return res.status(404).json({ success: false, error: '원본 이미지를 찾을 수 없습니다.' }); }
  };
  app.get('/api/fish/graphics/:id/rig', requireAuth, (req, res) => respond(owned.get(Number(req.params.id), req.session.userId), req, res));
  app.get('/api/fish/rig', requireAuth, (req, res) => {
    ensureDefault(req.session.userId);
    const graphic = db.prepare(`SELECT g.* FROM fish_graphics g JOIN user_fish f ON f.user_id = g.user_id
      AND g.dir_name = COALESCE(f.active_graphic_dir, '') WHERE g.user_id = ? ORDER BY g.id DESC LIMIT 1`).get(req.session.userId);
    respond(graphic, req, res);
  });
  app.put('/api/fish/graphics/:id/rig', requireAuth, (req, res) => {
    const graphic = owned.get(Number(req.params.id), req.session.userId);
    if (!graphic) return res.status(404).json({ success: false, error: '그래픽을 찾을 수 없습니다.' });
    const rig = req.body?.rig;
    if (JSON.stringify(req.body ?? {}).length > 8192 || (rig !== null && !validRig(rig))) return res.status(400).json({ success: false, error: '부위와 붙는 지점을 확인해주세요.' });
    try {
      const source = readGraphicSource(publicDir, req.session.userId, graphic);
      if (rig && (rig.imageHash !== source.imageHash || rig.sourceSize.some((n, i) => n !== source.sourceSize[i]))) {
        return res.status(409).json({ success: false, error: '원본 이미지가 변경되었습니다. 다시 열어 부위를 지정해주세요.' });
      }
      update.run(rig === null ? null : JSON.stringify(rig), graphic.id, req.session.userId);
      return res.json({ success: true, rig });
    } catch { return res.status(404).json({ success: false, error: '원본 이미지를 찾을 수 없습니다.' }); }
  });
}
module.exports = { validRig, readGraphicSource, registerRigRoutes };
