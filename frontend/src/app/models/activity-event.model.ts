/**
 * ActivityEvent model
 *
 * Represents a family activity (e.g. basketball practice, school play)
 * with a configurable list of volunteer roles (e.g. driver, snack duty)
 * that registered family members can claim via their device.
 */
export interface ActivityVolunteerSlot {
  id: string;       // Client-generated UUID, stable across edits
  label: string;    // e.g. 'Driver', 'Pick up', 'Bring snacks'
  tokenId?: string | null;  // Set when a registered device claims this slot
  name?: string | null;     // Display name of the claimant
}

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  title: string;
  activityType: string;       // e.g. 'sports', 'school', 'music', 'activity'
  location?: string;
  startAt: string;            // ISO 8601 timestamp
  endAt: string;              // ISO 8601 timestamp
  participants: string[];     // Array of participant names (free text)
  notes?: string;
  volunteers: ActivityVolunteerSlot[];  // Configurable volunteer roles
  createdAt: string;
  updatedAt: string;
}

export const ACTIVITY_TYPES = [
  { value: 'sports',  label: 'Sports',      icon: 'sports_soccer' },
  { value: 'school',  label: 'School',      icon: 'school' },
  { value: 'music',   label: 'Music',       icon: 'music_note' },
  { value: 'medical', label: 'Medical',     icon: 'local_hospital' },
  { value: 'social',  label: 'Social',      icon: 'people' },
  { value: 'activity',label: 'Activity',    icon: 'event' },
] as const;

