export interface FishRgb { r: number; g: number; b: number }

export interface SensorRanges {
  temperatureMin: number;
  temperatureMax: number;
  phMin: number;
  phMax: number;
  pollutionWarningZ: number;
  pollutionDangerZ: number;
}

export const DEFAULT_SENSOR_RANGES: SensorRanges = {
  temperatureMin: 24, temperatureMax: 26,
  phMin: 6, phMax: 7,
  pollutionWarningZ: 1, pollutionDangerZ: 2.5,
};
