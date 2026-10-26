const DEFAULT_SENSOR_RANGES = Object.freeze({
  temperatureMin: 24, temperatureMax: 26,
  phMin: 6, phMax: 7,
  pollutionWarningZ: 1, pollutionDangerZ: 2.5,
});

function validateSensorRanges(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const finite = key => typeof value[key] === 'number' && Number.isFinite(value[key]);
  return Object.keys(DEFAULT_SENSOR_RANGES).every(finite)
    && value.temperatureMin >= 0 && value.temperatureMax <= 50
    && value.temperatureMin < value.temperatureMax
    && value.phMin >= 0 && value.phMax <= 14 && value.phMin < value.phMax
    && value.pollutionWarningZ >= 0.1 && value.pollutionDangerZ <= 20
    && value.pollutionWarningZ < value.pollutionDangerZ;
}

function createSensorSettingsStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_sensor_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ranges_json TEXT NOT NULL
  )`);
  const select = db.prepare('SELECT ranges_json FROM user_sensor_settings WHERE user_id = ?');
  const upsert = db.prepare(`INSERT INTO user_sensor_settings (user_id, ranges_json) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET ranges_json = excluded.ranges_json`);
  return {
    get(userId) {
      const row = select.get(userId);
      if (row) {
        try {
          const ranges = JSON.parse(row.ranges_json);
          if (validateSensorRanges(ranges)) return ranges;
        } catch { /* Fall back for a malformed legacy row. */ }
      }
      return { ...DEFAULT_SENSOR_RANGES };
    },
    save(userId, value) {
      if (!validateSensorRanges(value)) throw new Error('센서 알림 범위를 확인해주세요. 최솟값은 최댓값보다 작아야 합니다.');
      const ranges = Object.fromEntries(Object.keys(DEFAULT_SENSOR_RANGES).map(key => [key, value[key]]));
      upsert.run(userId, JSON.stringify(ranges));
      return ranges;
    },
  };
}

function sensorAlertsForValues(sensor, ranges = DEFAULT_SENSOR_RANGES) {
  const result = [];
  const numeric = value => value === null || value === undefined || value === '' ? NaN : Number(value);
  const temperature = numeric(sensor.temperature);
  const ph = numeric(sensor.ph);
  if (Number.isFinite(temperature)) {
    const detail = `수온이 설정 범위를 벗어났습니다. 적정 기준: ${ranges.temperatureMin} ~ ${ranges.temperatureMax}°C`;
    if (temperature > ranges.temperatureMax) result.push({ type: 'temperature-increase', title: '수온 상승 경고', detail });
    else if (temperature < ranges.temperatureMin) result.push({ type: 'temperature-decrease', title: '수온 저하 경고', detail });
  }
  if (Number.isFinite(ph)) {
    const detail = `pH가 설정 범위를 벗어났습니다. 적정 기준: ${ranges.phMin} ~ ${ranges.phMax}`;
    if (ph > ranges.phMax) result.push({ type: 'ph-increase', title: 'pH 상승 경고', detail });
    else if (ph < ranges.phMin) result.push({ type: 'ph-decrease', title: 'pH 하락 경고', detail });
  }
  if (numeric(sensor.water_level_detected) === 0) {
    result.push({ type: 'water-decrease', title: '수위 저하 경고', detail: '수위가 기준보다 낮습니다.' });
  }
  return result;
}

function isValidRgb(value) {
  return value === null || (!!value && typeof value === 'object' && !Array.isArray(value)
    && ['r', 'g', 'b'].every(key => Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 255));
}

module.exports = { DEFAULT_SENSOR_RANGES, validateSensorRanges, createSensorSettingsStore, sensorAlertsForValues, isValidRgb };
