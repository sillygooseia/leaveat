import { Component, Inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { Shift, Employee } from '../../models';
import { calculateShiftHours, calculateWeeklyHours, getOvertimeStatus, formatHours, findConflicts, getCoverageIssuesAfterDelete } from '../../utils/schedule-helpers';
import { CoverageRequirements, RoomDefinition } from '../../models/coverage.model';

export interface ShiftDialogData {
  shift: Shift | null; // null for new shift
  day: number; // 0-6 (Mon-Sun in display order)
  employees: Employee[];
  allShifts: Shift[]; // All shifts in the schedule (for hours calculation)
  weekStartDate?: string; // Active week (ISO YYYY-MM-DD) — used to scope weekly hours
  coverageRequirements?: CoverageRequirements | null; // Optional coverage tracking
  defaultEmployeeId?: string; // Pre-select an employee (used when dragging)
  personalMode?: boolean; // When true: hides employee selector, uses sentinel employee, uses 'Event' terminology
}

@Component({
  selector: 'app-shift-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule
  ],
  templateUrl: './shift-dialog.html',
  styleUrls: ['./shift-dialog.css']
})
export class ShiftDialogComponent {
  isEditMode: boolean;
  employeeId = signal('');
  startTime = signal('');
  endTime = signal('');
  notes = signal('');
  roomId = signal<string | undefined>(undefined);
  createAnother = signal(false);
  day: number;

  dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  availableRooms = computed<RoomDefinition[]>(() =>
    this.data.coverageRequirements?.mode === 'room-ratio'
      ? this.data.coverageRequirements.rooms ?? []
      : []
  );

  hasRooms = computed(() => this.availableRooms().length > 0);

  constructor(
    private dialogRef: MatDialogRef<ShiftDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ShiftDialogData
  ) {
    this.isEditMode = !!data.shift;
    this.day = data.day;
    
    if (data.shift) {
      // Edit mode
      this.employeeId.set(data.shift.employeeId);
      this.startTime.set(data.shift.startTime);
      this.endTime.set(data.shift.endTime);
      this.notes.set(data.shift.notes || '');
      this.roomId.set(data.shift.roomId);
    } else if (data.personalMode) {
      // Personal mode: always use the sentinel employee
      this.employeeId.set('personal_self');
      const defaults = this._getSmartDefaults();
      this.startTime.set(defaults.startTime);
      this.endTime.set(defaults.endTime);
    } else {
      // Add mode: use smart defaults based on employee's recent shifts
      if (data.defaultEmployeeId) {
        this.employeeId.set(data.defaultEmployeeId);
      } else if (data.employees.length > 0) {
        this.employeeId.set(data.employees[0].id);
      }
      
      // Try to find smart defaults for this employee
      const defaults = this._getSmartDefaults();
      this.startTime.set(defaults.startTime);
      this.endTime.set(defaults.endTime);
    }
  }

  get isValid(): boolean {
    return !!this.employeeId() && !!this.startTime() && !!this.endTime();
  }

  get entryLabel(): string {
    return this.data.personalMode ? 'Event' : 'Shift';
  }

  getEmployee(id: string): Employee | undefined {
    return this.data.employees.find(e => e.id === id);
  }

  // ==================== Hours Calculation ====================

  /**
   * Calculate hours for this shift
   */
  getThisShiftHours = computed(() => {
    if (!this.startTime() || !this.endTime()) return 0;
    const tempShift: Shift = {
      id: 'temp',
      employeeId: this.employeeId(),
      day: this.day,
      startTime: this.startTime(),
      endTime: this.endTime()
    };
    return calculateShiftHours(tempShift);
  });

  /**
   * Calculate current weekly hours for selected employee (excluding this shift if editing)
   */
  getCurrentWeeklyHours = computed(() => {
    if (!this.employeeId()) return 0;
    
    const shifts = this.data.allShifts.filter(s => {
      // Exclude current shift if editing
      if (this.isEditMode && this.data.shift && s.id === this.data.shift.id) {
        return false;
      }
      if (s.employeeId !== this.employeeId()) return false;
      // Scope to active week when weekStartDate is available
      if (this.data.weekStartDate) {
        return s.weekStartDate === this.data.weekStartDate;
      }
      return true;
    });
    
    return shifts.reduce((total, shift) => total + calculateShiftHours(shift), 0);
  });

  /**
   * Calculate new total hours if this shift is saved
   */
  getNewTotalHours = computed(() => {
    return this.getCurrentWeeklyHours() + this.getThisShiftHours();
  });

  /**
   * Get overtime status for color coding
   */
  getHoursStatus = computed(() => {
    const employee = this.getEmployee(this.employeeId());
    if (!employee) return 'under';
    return getOvertimeStatus(this.getNewTotalHours(), employee.maxWeeklyHours);
  });

  /**
   * Get CSS class for hours status
   */
  getHoursClass = computed(() => {
    return `hours-${this.getHoursStatus()}`;
  });

  /**
   * Get formatted hours string for display
   */
  getFormattedThisShift = computed(() => formatHours(this.getThisShiftHours()));
  getFormattedCurrent = computed(() => formatHours(this.getCurrentWeeklyHours()));
  getFormattedNewTotal = computed(() => formatHours(this.getNewTotalHours()));

  // ==================== Conflict Detection ====================

  /**
   * Find any conflicts with this shift
   */
  getConflicts = computed(() => {
    if (!this.employeeId() || !this.startTime() || !this.endTime()) return [];
    
    const tempShift: Shift = {
      id: this.data.shift?.id || 'temp',
      employeeId: this.employeeId(),
      day: this.day,
      startTime: this.startTime(),
      endTime: this.endTime()
    };
    
    return findConflicts(tempShift, this.data.allShifts, this.data.shift?.id);
  });

  /**
   * Check if there are any conflicts
   */
  hasConflicts = computed(() => this.getConflicts().length > 0);

  /**
   * Get conflict warning message
   */
  getConflictMessage = computed(() => {
    const conflicts = this.getConflicts();
    if (conflicts.length === 0) return '';
    
    const employee = this.getEmployee(this.employeeId());
    const dayName = this.dayNames[this.day];
    
    if (conflicts.length === 1) {
      const conflict = conflicts[0];
      return `This overlaps with ${employee?.name}'s shift on ${dayName} from ${conflict.startTime} - ${conflict.endTime}`;
    } else {
      return `This overlaps with ${conflicts.length} other shifts for ${employee?.name} on ${dayName}`;
    }
  });

  // ==================== Coverage Warnings ====================

  /**
   * Get coverage issues if this shift is deleted
   */
  getCoverageIssuesForDelete = computed(() => {
    if (!this.data.shift || !this.data.coverageRequirements) return [];
    return getCoverageIssuesAfterDelete(this.data.shift, this.data.allShifts, this.data.coverageRequirements);
  });

  /**
   * Check if deleting would cause coverage issues
   */
  hasCoverageIssues = computed(() => this.getCoverageIssuesForDelete().length > 0);

  /**
   * Get coverage warning message for deletion
   */
  getCoverageDeleteWarning = computed(() => {
    const issues = this.getCoverageIssuesForDelete();
    if (issues.length === 0) return '';

    const dayName = this.dayNames[this.day];
    const issue = issues[0];

    if (issue.room) {
      return `Removing this shift leaves ${issue.room.name} understaffed (${issue.status.scheduled}/${issue.status.required})`;
    }
    if (issue.timeSlot) {
      return `Removing this shift leaves ${dayName} ${issue.timeSlot.startTime}-${issue.timeSlot.endTime} understaffed (${issue.status.scheduled}/${issue.status.required})`;
    }
    return `Removing this shift leaves ${dayName} understaffed (${issue.status.scheduled}/${issue.status.required})`;
  });

  // ==================== Actions ====================

  save(): void {
    if (!this.isValid) return;

    const result: Shift = {
      id: this.data.shift?.id || this._generateId(),
      employeeId: this.employeeId(),
      day: this.day,
      startTime: this.startTime(),
      endTime: this.endTime(),
      roomId: this.roomId() || undefined,
      notes: this.notes() || undefined
    };

    this.dialogRef.close({ shift: result, createAnother: this.createAnother() });
  }

  delete(): void {
    let confirmMessage = 'Delete this shift?';
    
    if (this.hasCoverageIssues()) {
      confirmMessage = `${this.getCoverageDeleteWarning()}\n\nAre you sure you want to delete this shift?`;
    }
    
    if (confirm(confirmMessage)) {
      this.dialogRef.close({ delete: true, id: this.data.shift?.id });
    }
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  private _generateId(): string {
    return `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get smart default times based on employee's recent shifts
   */
  private _getSmartDefaults(): { startTime: string; endTime: string } {
    const employeeId = this.employeeId();
    if (!employeeId) {
      return { startTime: '09:00', endTime: '17:00' };
    }

    // Find all shifts for this employee
    const employeeShifts = this.data.allShifts.filter(s => s.employeeId === employeeId);
    
    if (employeeShifts.length === 0) {
      // No previous shifts, use default 9-5
      return { startTime: '09:00', endTime: '17:00' };
    }

    // Count shift patterns (start-end combinations)
    const patterns = new Map<string, { count: number; startTime: string; endTime: string }>();
    
    for (const shift of employeeShifts) {
      const key = `${shift.startTime}-${shift.endTime}`;
      const existing = patterns.get(key);
      if (existing) {
        existing.count++;
      } else {
        patterns.set(key, { count: 1, startTime: shift.startTime, endTime: shift.endTime });
      }
    }

    // Find the most common pattern
    let mostCommon: { count: number; startTime: string; endTime: string } | null = null;
    for (const pattern of patterns.values()) {
      if (!mostCommon || pattern.count > mostCommon.count) {
        mostCommon = pattern;
      }
    }

    if (mostCommon) {
      return { startTime: mostCommon.startTime, endTime: mostCommon.endTime };
    }

    // Fallback to default
    return { startTime: '09:00', endTime: '17:00' };
  }
}
