import { Shift } from './shift.model';
import { Employee } from './employee.model';
import { CoverageRequirements } from './coverage.model';

/**
 * Schedule model
 * Represents a named workspace containing shifts across all weeks.
 * Free users get one Schedule; Premium users can create multiple.
 */
export interface Schedule {
  id: string;
  name: string;
  mode?: 'workplace' | 'family' | 'personal'; // Controls terminology throughout the UI
  weekStartDate?: string; // Optional — only used in share snapshots for public-view context
  shifts: Shift[];
  employees: Employee[]; // Snapshot of employees at schedule creation time
  coverageRequirements?: CoverageRequirements; // Optional coverage rules
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
}

/**
 * Share link response from backend
 */
export interface ShareLinkResponse {
  id: string;
  url: string;
  expiresAt: number; // Timestamp
}

/**
 * Share link data (stored in Redis)
 */
export interface ShareData {
  schedule: Schedule;
  sharedAt: number; // Timestamp
}
