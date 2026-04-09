/**
 * Coverage requirements model
 * Defines minimum staffing requirements for schedules
 */

/** Time slot for coverage requirements */
export interface CoverageTimeSlot {
  startTime: string;      // HH:mm format
  endTime: string;        // HH:mm format
  minStaff: number;       // Minimum number of employees required
  requiredRole?: string;  // If set, only staff with this role count toward this slot
}

/** Coverage requirement for a specific day of the week */
export interface DayCoverageRequirement {
  day: number; // 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
  timeSlots: CoverageTimeSlot[];
}

/** A room or area within a facility (used in room-ratio mode) */
export interface RoomDefinition {
  id: string;
  name: string;           // e.g. "Infant Room"
  ageGroup?: string;      // e.g. "0–18 months"
  capacity: number;       // Number of children enrolled in the room
  ratioStaff: number;     // Staff side of ratio (usually 1)
  ratioChildren: number;  // Children per staff member (e.g. 4 means 1:4 ratio)
  requiredRole?: string;  // If set, only staff with this role count toward this room's ratio
}

/** Complete coverage requirements for a schedule */
export interface CoverageRequirements {
  enabled: boolean;
  mode: 'simple' | 'time-based' | 'room-ratio';
  disabledDays?: number[];
  hideClosedDays?: boolean;

  // Simple mode: single minimum applied to all days
  simpleMinStaff?: number;

  // Time-based mode: per-day time slot requirements
  dayRequirements?: DayCoverageRequirement[];

  // Room-ratio mode: per-room staffing ratios
  rooms?: RoomDefinition[];
}

/** Coverage status for a specific time period or aggregate */
export interface CoverageStatus {
  scheduled: number;
  required: number;
  deficit: number;  // required - scheduled; positive means understaffed
  status: 'met' | 'warning' | 'critical';
}

/** Coverage status for a specific room */
export interface RoomCoverageStatus {
  room: RoomDefinition;
  scheduled: number;
  required: number;
  deficit: number;
  status: 'met' | 'warning' | 'critical';
}

/** Predefined coverage templates */
export interface CoverageTemplate {
  id: string;
  name: string;
  description: string;
  requirements: CoverageRequirements;
}

const WEEKDAYS = [0, 1, 2, 3, 4];       // Mon–Fri
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]; // Mon–Sun

export const COVERAGE_TEMPLATES: CoverageTemplate[] = [
  {
    id: 'daycare-rooms',
    name: 'Daycare (Rooms & Ratios)',
    description: 'Per-room ratio tracking: Infant 1:4, Toddler 1:6, Preschool 1:10',
    requirements: {
      enabled: true,
      mode: 'room-ratio',
      rooms: [
        { id: 'room_infant',    name: 'Infant Room',    ageGroup: '0–18 months',  capacity: 8,  ratioStaff: 1, ratioChildren: 4  },
        { id: 'room_toddler',   name: 'Toddler Room',   ageGroup: '18–36 months', capacity: 12, ratioStaff: 1, ratioChildren: 6  },
        { id: 'room_preschool', name: 'Preschool Room', ageGroup: '3–5 years',    capacity: 20, ratioStaff: 1, ratioChildren: 10 },
      ]
    }
  },
  {
    id: 'daycare-timebased',
    name: 'Daycare (Time-based)',
    description: 'Mon–Fri: lighter coverage at arrival/departure, full staff 9am–3pm',
    requirements: {
      enabled: true,
      mode: 'time-based',
      dayRequirements: WEEKDAYS.map(day => ({
        day,
        timeSlots: [
          { startTime: '07:00', endTime: '09:00', minStaff: 2 }, // Arrival/drop-off
          { startTime: '09:00', endTime: '15:00', minStaff: 5 }, // Peak enrollment
          { startTime: '15:00', endTime: '18:00', minStaff: 2 }, // Pick-up/departure
        ]
      }))
    }
  },
  {
    id: 'nursing-home',
    name: 'Nursing Home',
    description: '24/7 three-shift coverage: 3 day, 2 evening, 1 overnight',
    requirements: {
      enabled: true,
      mode: 'time-based',
      dayRequirements: ALL_DAYS.map(day => ({
        day,
        timeSlots: [
          { startTime: '07:00', endTime: '15:00', minStaff: 3 },
          { startTime: '15:00', endTime: '23:00', minStaff: 2 },
          { startTime: '23:00', endTime: '07:00', minStaff: 1 },
        ]
      }))
    }
  },
  {
    id: 'retail',
    name: 'Retail Store',
    description: '9am–9pm with peak lunch/evening coverage; busy weekends',
    requirements: {
      enabled: true,
      mode: 'time-based',
      dayRequirements: [
        ...WEEKDAYS.map(day => ({
          day,
          timeSlots: [
            { startTime: '09:00', endTime: '12:00', minStaff: 2 },
            { startTime: '12:00', endTime: '14:00', minStaff: 3 }, // Lunch rush
            { startTime: '14:00', endTime: '17:00', minStaff: 2 },
            { startTime: '17:00', endTime: '21:00', minStaff: 3 }, // Evening rush
          ]
        })),
        ...[5, 6].map(day => ({
          day,
          timeSlots: [{ startTime: '09:00', endTime: '21:00', minStaff: 3 }]
        }))
      ]
    }
  },
  {
    id: 'simple',
    name: 'Simple Coverage',
    description: 'Minimum 2 staff members at all times',
    requirements: {
      enabled: true,
      mode: 'simple',
      simpleMinStaff: 2
    }
  }
];
