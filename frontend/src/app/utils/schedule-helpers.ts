import { Shift } from '../models/shift.model';
import { Employee } from '../models/employee.model';

/**
 * Calculate the duration of a shift in hours (decimal format)
 * Handles overnight shifts where endTime < startTime
 * @param shift The shift to calculate hours for
 * @returns Number of hours (e.g., 8.5 for 8 hours 30 minutes)
 */
export function calculateShiftHours(shift: Shift): number {
  const [startHour, startMin] = shift.startTime.split(':').map(Number);
  const [endHour, endMin] = shift.endTime.split(':').map(Number);
  
  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;
  
  // Handle overnight shifts (e.g., 11:00 PM to 7:00 AM)
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // Add 24 hours
  }
  
  const durationMinutes = endMinutes - startMinutes;
  return durationMinutes / 60; // Convert to decimal hours
}

/**
 * Calculate total weekly hours for a specific employee
 * @param shifts All shifts in the schedule
 * @param employeeId The employee to calculate hours for
 * @returns Total hours worked this week
 */
export function calculateWeeklyHours(shifts: Shift[], employeeId: string): number {
  return shifts
    .filter(shift => shift.employeeId === employeeId)
    .reduce((total, shift) => total + calculateShiftHours(shift), 0);
}

/**
 * Check if hours exceed overtime threshold
 * @param hours Hours worked
 * @param customLimit Custom limit per employee (optional)
 * @returns 'under' | 'warning' | 'over'
 */
export function getOvertimeStatus(hours: number, customLimit?: number): 'under' | 'warning' | 'over' {
  const limit = customLimit || 40;
  const warningThreshold = limit * 0.8; // 80% of limit
  
  if (hours > limit) {
    return 'over';
  } else if (hours >= warningThreshold) {
    return 'warning';
  }
  return 'under';
}

/**
 * Check if two shifts overlap
 * @param shift1 First shift
 * @param shift2 Second shift
 * @returns true if shifts overlap
 */
export function shiftsOverlap(shift1: Shift, shift2: Shift): boolean {
  // Must be on the same day
  if (shift1.day !== shift2.day) {
    return false;
  }
  
  const [start1Hour, start1Min] = shift1.startTime.split(':').map(Number);
  const [end1Hour, end1Min] = shift1.endTime.split(':').map(Number);
  const [start2Hour, start2Min] = shift2.startTime.split(':').map(Number);
  const [end2Hour, end2Min] = shift2.endTime.split(':').map(Number);
  
  let start1 = start1Hour * 60 + start1Min;
  let end1 = end1Hour * 60 + end1Min;
  let start2 = start2Hour * 60 + start2Min;
  let end2 = end2Hour * 60 + end2Min;
  
  // Handle overnight shifts
  if (end1 <= start1) {
    end1 += 24 * 60;
  }
  if (end2 <= start2) {
    end2 += 24 * 60;
  }
  
  // Check for overlap: shifts overlap if one starts before the other ends
  // and the other starts before the first ends
  return start1 < end2 && start2 < end1;
}

/**
 * Find all shifts that conflict with a given shift for the same employee
 * @param shift The shift to check
 * @param allShifts All shifts in the schedule
 * @param excludeShiftId Optional shift ID to exclude (when editing existing shift)
 * @returns Array of conflicting shifts
 */
export function findConflicts(
  shift: Shift,
  allShifts: Shift[],
  excludeShiftId?: string
): Shift[] {
  return allShifts.filter(existingShift => {
    // Skip if it's the same shift (when editing)
    if (excludeShiftId && existingShift.id === excludeShiftId) {
      return false;
    }
    
    // Must be same employee
    if (existingShift.employeeId !== shift.employeeId) {
      return false;
    }
    
    // Check for time overlap
    return shiftsOverlap(shift, existingShift);
  });
}

/**
 * Calculate overlap severity (for future differentiation between minor/major conflicts)
 * @param shift1 First shift
 * @param shift2 Second shift
 * @returns Overlap duration in hours, or 0 if no overlap
 */
export function calculateOverlapHours(shift1: Shift, shift2: Shift): number {
  if (!shiftsOverlap(shift1, shift2)) {
    return 0;
  }
  
  const [start1Hour, start1Min] = shift1.startTime.split(':').map(Number);
  const [end1Hour, end1Min] = shift1.endTime.split(':').map(Number);
  const [start2Hour, start2Min] = shift2.startTime.split(':').map(Number);
  const [end2Hour, end2Min] = shift2.endTime.split(':').map(Number);
  
  let start1 = start1Hour * 60 + start1Min;
  let end1 = end1Hour * 60 + end1Min;
  let start2 = start2Hour * 60 + start2Min;
  let end2 = end2Hour * 60 + end2Min;
  
  // Handle overnight shifts
  if (end1 <= start1) end1 += 24 * 60;
  if (end2 <= start2) end2 += 24 * 60;
  
  // Calculate overlap
  const overlapStart = Math.max(start1, start2);
  const overlapEnd = Math.min(end1, end2);
  const overlapMinutes = overlapEnd - overlapStart;
  
  return overlapMinutes / 60;
}

/**
 * Get conflict severity level based on overlap duration
 * @param overlapHours Hours of overlap
 * @returns 'minor' for <1 hour, 'major' for >=1 hour
 */
export function getConflictSeverity(overlapHours: number): 'minor' | 'major' {
  return overlapHours < 1 ? 'minor' : 'major';
}

/**
 * Format hours for display (e.g., "8h" or "8.5h")
 * @param hours Decimal hours
 * @returns Formatted string
 */
export function formatHours(hours: number): string {
  // Round to 1 decimal place, but hide .0
  const rounded = Math.round(hours * 10) / 10;
  return rounded % 1 === 0 ? `${rounded}h` : `${rounded}h`;
}

/**
 * Get day name from day number
 * @param day 0=Sunday, 1=Monday, etc.
 * @returns Day name
 */
export function getDayName(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day] || 'Unknown';
}

/**
 * Get short day name from day number
 * @param day 0=Sunday, 1=Monday, etc.
 * @returns Short day name
 */
export function getShortDayName(day: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[day] || '?';
}

// ==================== Coverage Calculations ====================

import { CoverageRequirements, CoverageStatus, CoverageTimeSlot, RoomDefinition, RoomCoverageStatus } from '../models/coverage.model';

/** One hour bucket within a time slot, for breakdown display */
export interface HourlyBreakdown {
  hourLabel: string;   // e.g. "07:00"
  count: number;
  required: number;
  status: 'met' | 'warning' | 'critical';
}

function minutesToHHmm(minutes: number): string {
  const normalised = minutes % (24 * 60);
  const h = Math.floor(normalised / 60);
  const m = normalised % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Count how many employees are working during a specific time period on a day
 * @param shifts All shifts in the schedule
 * @param day Day of week (0=Mon, 6=Sun)
 * @param startTime Start time in HH:mm format
 * @param endTime End time in HH:mm format
 * @returns Number of employees scheduled during this period
 */
export function countStaffDuringPeriod(
  shifts: Shift[],
  day: number,
  startTime: string,
  endTime: string
): number {
  const [periodStartHour, periodStartMin] = startTime.split(':').map(Number);
  const [periodEndHour, periodEndMin] = endTime.split(':').map(Number);
  
  let periodStart = periodStartHour * 60 + periodStartMin;
  let periodEnd = periodEndHour * 60 + periodEndMin;
  
  // Handle overnight periods
  if (periodEnd <= periodStart) {
    periodEnd += 24 * 60;
  }
  
  // Filter shifts for this day
  const dayShifts = shifts.filter(s => s.day === day);
  
  // Count unique employees who work during this period
  const employeesWorking = new Set<string>();
  
  for (const shift of dayShifts) {
    const [shiftStartHour, shiftStartMin] = shift.startTime.split(':').map(Number);
    const [shiftEndHour, shiftEndMin] = shift.endTime.split(':').map(Number);
    
    let shiftStart = shiftStartHour * 60 + shiftStartMin;
    let shiftEnd = shiftEndHour * 60 + shiftEndMin;
    
    // Handle overnight shifts
    if (shiftEnd <= shiftStart) {
      shiftEnd += 24 * 60;
    }
    
    // Check if shift overlaps with period
    if (shiftStart < periodEnd && shiftEnd > periodStart) {
      employeesWorking.add(shift.employeeId);
    }
  }
  
  return employeesWorking.size;
}

/**
 * Returns hour-by-hour staff counts for a single time slot.
 * Works with absolute minute arithmetic so overnight slots are handled correctly.
 */
export function getHourlyBreakdown(
  shifts: Shift[],
  day: number,
  slot: CoverageTimeSlot
): HourlyBreakdown[] {
  const [slotStartH, slotStartM] = slot.startTime.split(':').map(Number);
  const [slotEndH, slotEndM] = slot.endTime.split(':').map(Number);

  let slotStart = slotStartH * 60 + slotStartM;
  let slotEnd = slotEndH * 60 + slotEndM;
  if (slotEnd <= slotStart) slotEnd += 24 * 60;

  // Pre-compute shift ranges as absolute minutes so overnight shifts extend past 1440
  const ranges = shifts
    .filter(s => s.day === day)
    .map(s => {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      let start = sh * 60 + sm;
      let end = eh * 60 + em;
      if (end <= start) end += 24 * 60;
      return { employeeId: s.employeeId, start, end };
    });

  const result: HourlyBreakdown[] = [];
  for (let t = slotStart; t < slotEnd; t += 60) {
    const bucketEnd = Math.min(t + 60, slotEnd);
    const working = new Set<string>();
    for (const r of ranges) {
      if (r.start < bucketEnd && r.end > t) working.add(r.employeeId);
    }
    const count = working.size;
    const required = slot.minStaff;
    const deficit = required - count;
    const status: 'met' | 'warning' | 'critical' =
      deficit <= 0 ? 'met' : deficit === 1 ? 'warning' : 'critical';
    result.push({ hourLabel: minutesToHHmm(t), count, required, status });
  }
  return result;
}

/**
 * Returns true if at least one shift overlaps the slot but doesn't fully span it.
 * This means the headcount looks satisfied but there is a gap within the window.
 */
export function hasPartialSlotCoverage(
  shifts: Shift[],
  day: number,
  slot: CoverageTimeSlot
): boolean {
  const [slotStartH, slotStartM] = slot.startTime.split(':').map(Number);
  const [slotEndH, slotEndM] = slot.endTime.split(':').map(Number);

  let slotStart = slotStartH * 60 + slotStartM;
  let slotEnd = slotEndH * 60 + slotEndM;
  if (slotEnd <= slotStart) slotEnd += 24 * 60; // overnight slot

  for (const shift of shifts.filter(s => s.day === day)) {
    const [shiftStartH, shiftStartM] = shift.startTime.split(':').map(Number);
    const [shiftEndH, shiftEndM] = shift.endTime.split(':').map(Number);

    let shiftStart = shiftStartH * 60 + shiftStartM;
    let shiftEnd = shiftEndH * 60 + shiftEndM;
    if (shiftEnd <= shiftStart) shiftEnd += 24 * 60; // overnight shift

    // Does this shift overlap the slot but NOT fully cover it?
    if (shiftStart < slotEnd && shiftEnd > slotStart) {
      if (shiftStart > slotStart || shiftEnd < slotEnd) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate coverage status for a specific time slot
 * @param shifts All shifts in the schedule
 * @param day Day of week
 * @param timeSlot Time slot requirement
 * @returns Coverage status
 */
export function calculateCoverageForSlot(
  shifts: Shift[],
  day: number,
  timeSlot: CoverageTimeSlot
): CoverageStatus {
  const scheduled = countStaffDuringPeriod(shifts, day, timeSlot.startTime, timeSlot.endTime);
  const required = timeSlot.minStaff;
  const deficit = required - scheduled;
  
  let status: 'met' | 'warning' | 'critical';
  if (deficit <= 0) {
    status = 'met';
  } else if (deficit === 1) {
    status = 'warning';
  } else {
    status = 'critical';
  }
  
  return { scheduled, required, deficit, status };
}

/**
 * Calculate overall coverage status for a day (simple mode)
 * @param shifts All shifts in the schedule
 * @param day Day of week
 * @param minStaff Minimum staff required
 * @returns Coverage status for the entire day
 */
export function calculateSimpleCoverageForDay(
  shifts: Shift[],
  day: number,
  minStaff: number
): CoverageStatus {
  // For simple mode, count total unique employees scheduled that day
  const dayShifts = shifts.filter(s => s.day === day);
  const uniqueEmployees = new Set(dayShifts.map(s => s.employeeId));
  const scheduled = uniqueEmployees.size;
  const required = minStaff;
  const deficit = required - scheduled;
  
  let status: 'met' | 'warning' | 'critical';
  if (deficit <= 0) {
    status = 'met';
  } else if (deficit === 1) {
    status = 'warning';
  } else {
    status = 'critical';
  }
  
  return { scheduled, required, deficit, status };
}

/**
 * Calculate minimum required staff for a room based on its ratio settings
 */
export function calcRoomMinStaff(room: RoomDefinition): number {
  return Math.ceil(room.capacity / room.ratioChildren) * room.ratioStaff;
}

/**
 * Count staff scheduled in a specific room on a given day.
 * If the room has a requiredRole, only employees with that role are counted.
 */
export function countStaffInRoomOnDay(
  shifts: Shift[],
  room: RoomDefinition,
  day: number,
  employees?: import('../models/employee.model').Employee[]
): number {
  const roomShifts = shifts.filter(s => s.roomId === room.id && s.day === day);
  const uniqueIds = new Set(roomShifts.map(s => s.employeeId));

  // Only apply role filter if the required role is set AND at least one employee
  // in the roster actually carries that role — otherwise count all assigned staff.
  if (room.requiredRole && employees) {
    const roleExists = employees.some(e => e.role === room.requiredRole);
    if (roleExists) {
      let count = 0;
      for (const empId of uniqueIds) {
        if (employees.find(e => e.id === empId)?.role === room.requiredRole) count++;
      }
      return count;
    }
  }

  return uniqueIds.size;
}

/**
 * Calculate coverage status for a specific room on a given day
 */
export function calculateRoomCoverageStatus(
  shifts: Shift[],
  room: RoomDefinition,
  day: number,
  employees?: import('../models/employee.model').Employee[]
): RoomCoverageStatus {
  const scheduled = countStaffInRoomOnDay(shifts, room, day, employees);
  const required = calcRoomMinStaff(room);
  const deficit = required - scheduled;
  const status: 'met' | 'warning' | 'critical' =
    deficit <= 0 ? 'met' : deficit === 1 ? 'warning' : 'critical';
  return { room, scheduled, required, deficit, status };
}

/**
 * Calculate coverage status for all rooms on a given day
 */
export function calculateAllRoomCoverages(
  shifts: Shift[],
  rooms: RoomDefinition[],
  day: number,
  employees?: import('../models/employee.model').Employee[]
): RoomCoverageStatus[] {
  return rooms.map(room => calculateRoomCoverageStatus(shifts, room, day, employees));
}

/**
 * Get the single worst-case coverage status across all rooms on a given day
 */
export function getWorstRoomCoverage(
  shifts: Shift[],
  rooms: RoomDefinition[],
  day: number,
  employees?: import('../models/employee.model').Employee[]
): CoverageStatus | null {
  if (!rooms.length) return null;
  const statuses = calculateAllRoomCoverages(shifts, rooms, day, employees);
  return statuses.reduce<CoverageStatus>(
    (worst, rs) => rs.deficit > worst.deficit ? rs : worst,
    statuses[0]
  );
}

/**
 * Get worst time-based coverage status for a specific day
 */
export function getWorstTimeBasedCoverage(
  shifts: Shift[],
  day: number,
  requirements: CoverageRequirements
): CoverageStatus | null {
  if (!requirements.dayRequirements) return null;
  const dayReq = requirements.dayRequirements.find(d => d.day === day);
  if (!dayReq || dayReq.timeSlots.length === 0) return null;
  return dayReq.timeSlots
    .map(slot => calculateCoverageForSlot(shifts, day, slot))
    .reduce((worst, s) => s.deficit > worst.deficit ? s : worst);
}

/**
 * Get all coverage issues for a schedule
 */
export function getCoverageIssues(
  shifts: Shift[],
  requirements: CoverageRequirements,
  employees?: import('../models/employee.model').Employee[]
): { day: number; timeSlot?: CoverageTimeSlot; room?: RoomDefinition; status: CoverageStatus }[] {
  if (!requirements.enabled) return [];

  const issues: { day: number; timeSlot?: CoverageTimeSlot; room?: RoomDefinition; status: CoverageStatus }[] = [];

  if (requirements.mode === 'simple' && requirements.simpleMinStaff) {
    for (let day = 0; day < 7; day++) {
      const status = calculateSimpleCoverageForDay(shifts, day, requirements.simpleMinStaff);
      if (status.deficit > 0) issues.push({ day, status });
    }
  } else if (requirements.mode === 'time-based' && requirements.dayRequirements) {
    for (const dayReq of requirements.dayRequirements) {
      for (const timeSlot of dayReq.timeSlots) {
        const status = calculateCoverageForSlot(shifts, dayReq.day, timeSlot);
        if (status.deficit > 0) issues.push({ day: dayReq.day, timeSlot, status });
      }
    }
  } else if (requirements.mode === 'room-ratio' && requirements.rooms) {
    for (let day = 0; day < 7; day++) {
      for (const room of requirements.rooms) {
        const status = calculateRoomCoverageStatus(shifts, room, day, employees);
        if (status.deficit > 0) issues.push({ day, room, status });
      }
    }
  }

  return issues;
}

/**
 * Check if deleting a shift would cause coverage issues
 * @param shift Shift to be deleted
 * @param allShifts All shifts in the schedule
 * @param requirements Coverage requirements
 * @returns Coverage issues that would be caused by deletion
 */
export function getCoverageIssuesAfterDelete(
  shift: Shift,
  allShifts: Shift[],
  requirements: CoverageRequirements,
  employees?: import('../models/employee.model').Employee[]
): { timeSlot?: CoverageTimeSlot; room?: RoomDefinition; status: CoverageStatus }[] {
  if (!requirements.enabled) return [];

  const shiftsWithoutThis = allShifts.filter(s => s.id !== shift.id);
  const issues: { timeSlot?: CoverageTimeSlot; room?: RoomDefinition; status: CoverageStatus }[] = [];

  if (requirements.mode === 'simple' && requirements.simpleMinStaff) {
    const status = calculateSimpleCoverageForDay(shiftsWithoutThis, shift.day, requirements.simpleMinStaff);
    if (status.deficit > 0) issues.push({ status });
  } else if (requirements.mode === 'time-based' && requirements.dayRequirements) {
    const dayReq = requirements.dayRequirements.find(dr => dr.day === shift.day);
    if (dayReq) {
      for (const timeSlot of dayReq.timeSlots) {
        const before = calculateCoverageForSlot(allShifts, shift.day, timeSlot);
        const after = calculateCoverageForSlot(shiftsWithoutThis, shift.day, timeSlot);
        if (after.deficit > before.deficit) issues.push({ timeSlot, status: after });
      }
    }
  } else if (requirements.mode === 'room-ratio' && requirements.rooms && shift.roomId) {
    const room = requirements.rooms.find(r => r.id === shift.roomId);
    if (room) {
      const before = calculateRoomCoverageStatus(allShifts, room, shift.day, employees);
      const after = calculateRoomCoverageStatus(shiftsWithoutThis, room, shift.day, employees);
      if (after.deficit > before.deficit) issues.push({ room, status: after });
    }
  }

  return issues;
}
