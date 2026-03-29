/**
 * Shift model
 * Represents a work shift assigned to an employee
 */
export interface Shift {
  id: string;
  employeeId: string;
  weekStartDate?: string; // ISO date YYYY-MM-DD — Monday of the week this shift belongs to (stamped by ScheduleComponent)
  day: number; // 0 = Monday, 1 = Tuesday, ..., 6 = Sunday (within the week)
  startTime: string; // HH:mm format (e.g., "09:00")
  endTime: string; // HH:mm format (e.g., "17:00")
  role?: string; // Optional: override employee's default role
  roomId?: string; // Optional: which room this shift covers (room-ratio mode)
  notes?: string; // Optional: shift-specific notes
}

/**
 * Time slot for grid display
 */
export interface TimeSlot {
  hour: number; // 0-23
  minute: number; // 0, 15, 30, 45
  label: string; // Display label (e.g., "9:00 AM")
}
