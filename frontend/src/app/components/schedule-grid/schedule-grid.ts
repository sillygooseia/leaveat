import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { Shift, Employee, ActivityEvent } from '../../models';
import { ShiftDialogComponent, ShiftDialogData } from '../shift-dialog/shift-dialog';
import { findConflicts, getDayName, calculateSimpleCoverageForDay, calculateAllRoomCoverages, getWorstRoomCoverage, getWorstTimeBasedCoverage, calculateCoverageForSlot, hasPartialSlotCoverage, getHourlyBreakdown, HourlyBreakdown } from '../../utils/schedule-helpers';
import { CoverageRequirements, CoverageStatus, RoomCoverageStatus, CoverageTimeSlot } from '../../models/coverage.model';
import { ScheduleDayViewComponent } from '../schedule-day-view/schedule-day-view';

@Component({
  selector: 'app-schedule-grid',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    ScheduleDayViewComponent,
  ],
  templateUrl: './schedule-grid.html',
  styleUrls: ['./schedule-grid.css']
})
export class ScheduleGridComponent {
  @Input() shifts: Shift[] = [];
  @Input() employees: Employee[] = [];
  @Input() activities: ActivityEvent[] = [];
  @Input() coverageRequirements: CoverageRequirements | null = null;
  @Input() disabledDays: number[] = [];
  @Input() hideClosedDays = false;
  @Input() weekStartDate: string = '';
  @Input() viewMode: 'week' | 'day' = 'week';
  @Input() selectedDay: number | null = null;
  @Input() personalMode: boolean = false;
  @Input() compactShiftCards: boolean = false;
  @Output() shiftsChange = new EventEmitter<Shift[]>();
  @Output() requestAddActivity = new EventEmitter<number>();

  dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  daysOfWeek = [0, 1, 2, 3, 4, 5, 6]; // Mon-Sun

  get visibleDays(): number[] {
    return this.hideClosedDays
      ? this.daysOfWeek.filter(day => !this.isDayDisabled(day))
      : this.daysOfWeek;
  }

  get displayDays(): number[] {
    if (this.viewMode === 'day' && this.selectedDay !== null) {
      return [this.selectedDay];
    }
    return this.visibleDays;
  }

  dragOverDay: number | null = null;

  /** Keys of expanded slot breakdown panels, format: "day-HH:mm" */
  expandedSlots = new Set<string>();

  constructor(private dialog: MatDialog) {}

  private _slotKey(day: number, startTime: string): string {
    return `${day}-${startTime}`;
  }

  toggleSlotBreakdown(day: number, startTime: string): void {
    const key = this._slotKey(day, startTime);
    if (this.expandedSlots.has(key)) {
      this.expandedSlots.delete(key);
    } else {
      this.expandedSlots.add(key);
    }
  }

  isSlotExpanded(day: number, startTime: string): boolean {
    return this.expandedSlots.has(this._slotKey(day, startTime));
  }

  getHourlyBreakdownForSlot(day: number, slot: CoverageTimeSlot): HourlyBreakdown[] {
    return getHourlyBreakdown(this.shifts, day, slot);
  }

  onDragOver(event: DragEvent, day: number): void {
    if (this.isDayDisabled(day)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    this.dragOverDay = day;
  }

  onDragLeave(event: DragEvent): void {
    // Only clear if leaving the column entirely (not entering a child)
    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !target.contains(related)) {
      this.dragOverDay = null;
    }
  }

  onDrop(event: DragEvent, day: number): void {
    if (this.isDayDisabled(day)) {
      this.dragOverDay = null;
      return;
    }
    event.preventDefault();
    this.dragOverDay = null;
    const employeeId = event.dataTransfer?.getData('employeeId');
    if (!employeeId) return;
    this.openAddShiftDialogForEmployee(day, employeeId);
  }

  openAddShiftDialogForEmployee(day: number, employeeId: string): void {
    const dialogRef = this.dialog.open(ShiftDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: {
        shift: null,
        day,
        employees: this.employees,
        allShifts: this.shifts,
        weekStartDate: this.weekStartDate,
        coverageRequirements: this.coverageRequirements,
        defaultEmployeeId: employeeId,
        personalMode: this.personalMode
      } as ShiftDialogData
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result?.shift) {
        this.shifts.push(result.shift);
        this.shiftsChange.emit([...this.shifts]);
        if (result.createAnother) {
          setTimeout(() => this.openAddShiftDialog(day), 100);
        }
      } else if (result && !result.shift) {
        this.shifts.push(result);
        this.shiftsChange.emit([...this.shifts]);
      }
    });
  }

  getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      sports: 'sports_soccer', school: 'school', music: 'music_note',
      medical: 'local_hospital', social: 'people', activity: 'event',
    };
    return icons[type] ?? 'event';
  }

  getActivitiesForDay(day: number): ActivityEvent[] {
    if (!this.weekStartDate || !this.activities.length) return [];
    const dayStart = new Date(this.weekStartDate + 'T00:00:00');
    dayStart.setDate(dayStart.getDate() + day);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return this.activities.filter(a => {
      const t = new Date(a.startAt);
      return t >= dayStart && t < dayEnd;
    });
  }

  getVolunteerCount(activity: ActivityEvent): { claimed: number; total: number } {
    const total = activity.volunteers?.length ?? 0;
    const claimed = activity.volunteers?.filter(v => !!v.tokenId).length ?? 0;
    return { claimed, total };
  }

  getDateForDay(day: number): string {
    if (!this.weekStartDate) return '';
    const date = new Date(this.weekStartDate + 'T00:00:00');
    date.setDate(date.getDate() + day);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  isToday(day: number): boolean {
    if (!this.weekStartDate) return false;
    const date = new Date(this.weekStartDate + 'T00:00:00');
    date.setDate(date.getDate() + day);
    const today = new Date();
    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  }

  getShiftsForDay(day: number): Shift[] {
    const todayShifts = this.shifts.filter(s => s.day === day);
    const previousOvernight = (this.viewMode === 'day' && this.selectedDay === day)
      ? this.shifts.filter(s => s.day === (day + 6) % 7 && this.isOvernightShift(s))
      : [];

    return [...todayShifts, ...previousOvernight]
      .sort((a, b) => this._shiftSortKey(day, a) - this._shiftSortKey(day, b));
  }

  private isOvernightShift(shift: Shift): boolean {
    return shift.endTime <= shift.startTime;
  }

  private _shiftSortKey(day: number, shift: Shift): number {
    if (shift.day !== day && this.isOvernightShift(shift)) {
      return 0;
    }
    const [hour, minute] = shift.startTime.split(':').map(Number);
    return hour * 60 + minute;
  }

  getShiftOriginLabel(day: number, shift: Shift): string {
    if (this.viewMode !== 'day' || this.selectedDay !== day) return '';
    if (shift.day !== day && this.isOvernightShift(shift)) {
      return 'From yesterday';
    }
    if (shift.day === day && this.isOvernightShift(shift)) {
      return 'Overnight';
    }
    return '';
  }

  isDayDisabled(day: number): boolean {
    return (this.disabledDays || []).includes(day);
  }

  getEmployee(employeeId: string): Employee | undefined {
    return this.employees.find(e => e.id === employeeId);
  }

  getEmployeeInitials(name?: string): string {
    if (!name) return '';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0].toUpperCase())
      .slice(0, 2)
      .join('');
  }

  /**
   * Check if a shift has conflicts
   */
  hasConflict(shift: Shift): boolean {
    const conflicts = findConflicts(shift, this.shifts, shift.id);
    return conflicts.length > 0;
  }

  /**
   * Get conflict tooltip text
   */
  getConflictTooltip(shift: Shift): string {
    const conflicts = findConflicts(shift, this.shifts, shift.id);
    if (conflicts.length === 0) return 'Click to edit';
    
    const employee = this.getEmployee(shift.employeeId);
    const dayName = getDayName(shift.day);
    
    if (conflicts.length === 1) {
      const conflict = conflicts[0];
      return `⚠️ Conflicts with ${employee?.name}'s shift on ${dayName} (${conflict.startTime}-${conflict.endTime}). Click to edit.`;
    } else {
      return `⚠️ Conflicts with ${conflicts.length} other shifts. Click to edit.`;
    }
  }

  openAddShiftDialog(day: number): void {
    if (this.isDayDisabled(day)) {
      alert('This day is marked closed. Remove the closed-day setting to add shifts.');
      return;
    }

    if (this.employees.length === 0) {
      alert('Please add employees before creating shifts');
      return;
    }

    const dialogRef = this.dialog.open(ShiftDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: {
        shift: null,
        day,
        employees: this.employees,
        allShifts: this.shifts,
        weekStartDate: this.weekStartDate,
        coverageRequirements: this.coverageRequirements,
        personalMode: this.personalMode
      } as ShiftDialogData
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        if (result.shift) {
          // New format with createAnother support
          this.shifts.push(result.shift);
          this.shiftsChange.emit([...this.shifts]);
          
          if (result.createAnother) {
            // Reopen dialog for another shift
            setTimeout(() => this.openAddShiftDialog(day), 100);
          }
        } else {
          // Legacy format (direct shift object)
          this.shifts.push(result);
          this.shiftsChange.emit([...this.shifts]);
        }
      }
    });
  }

  openEditShiftDialog(shift: Shift): void {
    const dialogRef = this.dialog.open(ShiftDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: {
        shift,
        day: shift.day,
        employees: this.employees,
        allShifts: this.shifts,
        weekStartDate: this.weekStartDate,
        coverageRequirements: this.coverageRequirements,
        personalMode: this.personalMode
      } as ShiftDialogData
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        if (result.delete) {
          // Delete shift
          this.shifts = this.shifts.filter(s => s.id !== result.id);
          this.shiftsChange.emit([...this.shifts]);
        } else {
          // Update shift - handle both new format ({ shift }) and legacy format (direct object)
          const updatedShift = result.shift || result;
          const index = this.shifts.findIndex(s => s.id === updatedShift.id);
          if (index >= 0) {
            this.shifts[index] = updatedShift;
            this.shiftsChange.emit([...this.shifts]);
          }
        }
      }
    });
  }

  /**
   * Check if coverage tracking is enabled
   */
  isCoverageEnabled(): boolean {
    return this.coverageRequirements?.enabled || false;
  }

  isRoomRatioMode(): boolean {
    return this.coverageRequirements?.mode === 'room-ratio';
  }

  isTimeBasedMode(): boolean {
    return this.coverageRequirements?.mode === 'time-based';
  }

  getTimeSlotCoverageStatuses(day: number): { slot: CoverageTimeSlot; status: CoverageStatus; hasPartial: boolean }[] {
    if (!this.coverageRequirements?.enabled || !this.coverageRequirements.dayRequirements) return [];
    const dayReq = this.coverageRequirements.dayRequirements.find(d => d.day === day);
    if (!dayReq) return [];
    return dayReq.timeSlots.map(slot => ({
      slot,
      status: calculateCoverageForSlot(this.shifts, day, slot),
      hasPartial: hasPartialSlotCoverage(this.shifts, day, slot)
    }));
  }

  getSlotTooltip(slot: CoverageTimeSlot, status: CoverageStatus, hasPartial: boolean): string {
    const range = `${slot.startTime}\u2013${slot.endTime}`;
    let text: string;
    if (status.deficit <= 0) {
      text = `${range}: ${status.scheduled}/${status.required} (met)`;
    } else {
      text = `${range}: ${status.scheduled}/${status.required} \u2014 ${status.deficit} short`;
    }
    if (hasPartial) {
      text += '\nSome shifts only partially cover this window';
    }
    return text;
  }

  /**
   * Get coverage status for a day (simple or time-based modes)
   */
  getCoverageStatus(day: number): CoverageStatus | null {
    if (!this.coverageRequirements?.enabled) return null;
    const req = this.coverageRequirements;

    if (req.mode === 'simple' && req.simpleMinStaff) {
      return calculateSimpleCoverageForDay(this.shifts, day, req.simpleMinStaff);
    }
    if (req.mode === 'time-based') {
      return getWorstTimeBasedCoverage(this.shifts, day, req);
    }
    if (req.mode === 'room-ratio' && req.rooms) {
      return getWorstRoomCoverage(this.shifts, req.rooms, day, this.employees);
    }
    return null;
  }

  /**
   * Get per-room coverage statuses for a day (room-ratio mode)
   */
  getRoomCoverageStatuses(day: number): RoomCoverageStatus[] {
    if (!this.coverageRequirements?.enabled || !this.coverageRequirements.rooms) return [];
    return calculateAllRoomCoverages(this.shifts, this.coverageRequirements.rooms, day, this.employees);
  }

  getRoomStatusClass(rs: RoomCoverageStatus): string {
    return `coverage-${rs.status}`;
  }

  getRoomTooltip(rs: RoomCoverageStatus): string {
    if (rs.deficit <= 0) return `${rs.room.name}: ${rs.scheduled}/${rs.required} (met)`;
    return `${rs.room.name}: ${rs.scheduled}/${rs.required} — ${rs.deficit} short`;
  }

  /**
   * Get CSS class for coverage status
   */
  getCoverageClass(status: CoverageStatus | null): string {
    if (!status) return '';
    return `coverage-${status.status}`;
  }

  /**
   * Get coverage display text
   */
  getCoverageText(status: CoverageStatus | null): string {
    if (!status) return '';
    
    if (status.deficit <= 0) {
      return `✓ ${status.scheduled}/${status.required}`;
    } else {
      return `${status.scheduled}/${status.required}`;
    }
  }

  /**
   * Get coverage tooltip text
   */
  getCoverageTooltip(status: CoverageStatus | null): string {
    if (!status) return '';
    
    if (status.deficit <= 0) {
      return `Coverage met: ${status.scheduled} scheduled, ${status.required} required`;
    } else if (status.deficit === 1) {
      return `1 person short (${status.scheduled}/${status.required})`;
    } else {
      return `${status.deficit} people short (${status.scheduled}/${status.required})`;
    }
  }

  scrollToCoverage(day: number, event: MouseEvent): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const dayColumn = target?.closest('.day-column') as HTMLElement | null;
    const coverageSection = dayColumn?.querySelector('.coverage-footer, .coverage-slots-footer, .coverage-rooms-footer') as HTMLElement | null;
    if (coverageSection) {
      coverageSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      coverageSection.classList.add('coverage-scroll-target');
      window.setTimeout(() => coverageSection?.classList.remove('coverage-scroll-target'), 1200);
    }
  }
}
