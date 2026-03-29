/**
 * Employee model
 * Represents a team member who can be assigned shifts
 */
export interface Employee {
  id: string;
  name: string;
  role: string;
  color: string; // Hex color for visual identification
  maxWeeklyHours?: number; // Optional: custom max hours per week (default 40)
  availability?: DayAvailability[]; // Optional: future MVP+ feature
}

/**
 * Availability for a specific day (future MVP+ feature)
 */
export interface DayAvailability {
  day: number; // 0 = Sunday, 1 = Monday, etc.
  available: boolean;
  startTime?: string; // HH:mm format
  endTime?: string; // HH:mm format
  notes?: string;
}
