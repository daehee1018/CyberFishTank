export interface SensorData {
  temperature: number;
  ph: number;
  water_level: number;
  light: number;
  timestamp?: string;
}

export interface HourlyAverage {
  timestamp: string;
  temperature: number;
  ph: number;
  water_level: number;
  light: number;
}