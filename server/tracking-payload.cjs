// Visualization contract only. Do not use these defaults for activity/health records.
const pair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) ? value : null;
function trackingPayload(fish, ownerUserId, meta = {}) {
  const source = fish || meta;
  const timestamp = Number.isFinite(source.timestamp_ms) ? source.timestamp_ms
    : Number.isFinite(source.timestamp) ? source.timestamp * 1000 : null;
  return {
    type: 'fish_tracking', owner_user_id: ownerUserId,
    source: meta.source, stream_id: source.stream_id ?? meta.stream_id ?? null,
    frame_id: Number.isInteger(source.frame_id) ? source.frame_id : null,
    timestamp_ms: timestamp,
    frame_size: pair(source.frame_size), track_id: fish?.track_id ?? null,
    state: fish ? fish.state ?? 'tracked' : 'lost',
    center_norm: pair(fish?.center_norm), bbox: fish?.bbox ?? null,
    conf: Number.isFinite(fish?.conf) ? fish.conf : null,
    pose_conf: Number.isFinite(fish?.pose_conf) ? fish.pose_conf : null,
    keypoints: Object.fromEntries(['head', 'tail', 'dorsal', 'belly'].map(key => [key, pair(fish?.keypoints && Object.hasOwn(fish.keypoints, key) ? fish.keypoints[key] : fish?.[key])])),
    move_direction: fish?.move_direction ?? 'none', pose_direction: fish?.pose_direction ?? 'none',
    velocity_px_s: fish?.velocity_px_s ?? null,
    abnormal: Boolean(fish?.abnormal), abnormal_reason: fish?.abnormal_reason ?? null,
    flipped: Boolean(fish?.flipped),
  };
}
module.exports = { trackingPayload };
