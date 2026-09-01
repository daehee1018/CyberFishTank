export interface SensorData {
  timestamp: string;

  millis: number;

  temperature_c: number;

  ph: number;

  ph_voltage: number;

  tds_ppm: number;

  tds_voltage: number;

  turbidity_voltage: number;

  turbidity_delta: number;

  turbidity_warning: string;

  water_level_detected: string;
}


export interface HourlyAverage {
  timestamp: string;

  temperature: number;

  ph: number;

  water_level: number;

  light: number;
}