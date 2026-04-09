import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Shift, Employee } from '../../models';
import { ShiftDialogComponent, ShiftDialogData } from '../shift-dialog/shift-dialog';
import { CoverageRequirements } from '../../models/coverage.model';

// 1 pixel per minute ⟹ 60 px per hour
const PX_PER_MIN = 1;

export interface DayShiftBlock {
  shift: Shift;
  topPx: number;
  heightPx: number;
  isOvernightStart: boolean;
  isOvernightEnd: boolean;
  metaLabel: string;
}

@Component({
  selector: 'app-schedule-day-view',
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatButtonModule],
  templateUrl: './schedule-day-view.html',
  styleUrls: ['./schedule-day-view.css'],
})
export class ScheduleDayViewComponent {
  @Input() shifts: Shift[] = [];
  @Input() employees: Employee[] = [];
  @Input() day = 0;
  @Input() weekStartDate = '';
  @Input() coverageRequirements: CoverageRequirements | null = null;
  @Input() personalMode = false;
  @Output() shiftsChange = new EventEmitter<Shift[]>();

  readonly dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  private readonly dialog = inject(MatDialog);

  // ── Time range ────────────────────────────────────────────────────

  get rangeStartMin(): number {
    const all = this._allVisibleMins();
    if (!all.length) return 6 * 60;
    return Math.max(0, (Math.floor(Math.min(...all.map(m => m.start)) / 60) - 1) * 60);
  }

  get rangeEndMin(): number {
    const all = this._allVisibleMins();
    if (!all.length) return 22 * 60;
    return Math.min(1440, (Math.ceil(Math.max(...all.map(m => m.end)) / 60) + 1) * 60);
  }

  get totalPx(): number {
    return (this.rangeEndMin - this.rangeStartMin) * PX_PER_MIN;
  }

  get hourLabels(): { topPx: number; label: string }[] {
    const out: { topPx: number; label: string }[] = [];
    for (let min = this.rangeStartMin; min <= this.rangeEndMin; min += 60) {
      out.push({ topPx: (min - this.rangeStartMin) * PX_PER_MIN, label: this._formatHour(min / 60) });
    }
    return out;
  }

  get halfHourLines(): number[] {
    const lines: number[] = [];
    for (let min = this.rangeStartMin + 30; min < this.rangeEndMin; min += 60) {
      lines.push((min - this.rangeStartMin) * PX_PER_MIN);
    }
    return lines;
  }

  // ── Employees / Shifts ────────────────────────────────────────────

  get todayShifts(): Shift[] {
    return this.shifts.filter(s => s.day === this.day);
  }

  get prevOvernightShifts(): Shift[] {
    const prev = (this.day + 6) % 7;
    return this.shifts.filter(s => s.day === prev && s.endTime < s.startTime);
  }

  get visibleEmployees(): Employee[] {
    const empIds = new Set([
      ...this.todayShifts.map(s => s.employeeId),
      ...this.prevOvernightShifts.map(s => s.employeeId),
    ]);
    return this.employees.filter(e => empIds.has(e.id));
  }

  getBlocksFor(employeeId: string): DayShiftBlock[] {
    const blocks: DayShiftBlock[] = [];
    const rs = this.rangeStartMin;
    const re = this.rangeEndMin;

    this.todayShifts.filter(s => s.employeeId === employeeId).forEach(shift => {
      const start = this._t(shift.startTime);
      const rawEnd = shift.endTime < shift.startTime ? 1440 : this._t(shift.endTime);
      const clampStart = Math.max(start, rs);
      const clampEnd = Math.min(rawEnd, re);
      if (clampEnd <= clampStart) return;
      blocks.push({
        shift,
        topPx: (clampStart - rs) * PX_PER_MIN,
        heightPx: Math.max(24, (clampEnd - clampStart) * PX_PER_MIN),
        isOvernightStart: shift.endTime < shift.startTime,
        isOvernightEnd: false,
        metaLabel: shift.endTime < shift.startTime ? 'Overnight →' : '',
      });
    });

    this.prevOvernightShifts.filter(s => s.employeeId === employeeId).forEach(shift => {
      const end = this._t(shift.endTime);
      const clampStart = Math.max(0, rs);
      const clampEnd = Math.min(end, re);
      if (clampEnd <= clampStart) return;
      blocks.push({
        shift,
        topPx: (clampStart - rs) * PX_PER_MIN,
        heightPx: Math.max(24, (clampEnd - clampStart) * PX_PER_MIN),
        isOvernightStart: false,
        isOvernightEnd: true,
        metaLabel: '← From yesterday',
      });
    });

    return blocks.sort((a, b) => a.topPx - b.topPx);
  }

  getTotalHours(employeeId: string): string {
    let mins = 0;
    this.todayShifts.filter(s => s.employeeId === employeeId).forEach(s => {
      const start = this._t(s.startTime);
      const end = s.endTime < s.startTime ? this._t(s.endTime) + 1440 : this._t(s.endTime);
      mins += end - start;
    });
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  getEmployee(id: string): Employee | undefined {
    return this.employees.find(e => e.id === id);
  }

  editShift(shift: Shift): void {
    const ref = this.dialog.open(ShiftDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: {
        shift,
        day: shift.day,
        employees: this.employees,
        allShifts: this.shifts,
        weekStartDate: this.weekStartDate,
        coverageRequirements: this.coverageRequirements,
        personalMode: this.personalMode,
      } as ShiftDialogData,
    });
    ref.afterClosed().subscribe((result: any) => {
      if (!result) return;
      if (result.delete) {
        this.shiftsChange.emit(this.shifts.filter(s => s.id !== result.id));
      } else {
        const updated = result.shift || result;
        const idx = this.shifts.findIndex(s => s.id === updated.id);
        if (idx >= 0) {
          const copy = [...this.shifts];
          copy[idx] = updated;
          this.shiftsChange.emit(copy);
        }
      }
    });
  }

  // ── Private ───────────────────────────────────────────────────────

  private _allVisibleMins(): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    this.todayShifts.forEach(s => {
      out.push({ start: this._t(s.startTime), end: s.endTime < s.startTime ? 1440 : this._t(s.endTime) });
    });
    this.prevOvernightShifts.forEach(s => {
      out.push({ start: 0, end: this._t(s.endTime) });
    });
    return out;
  }

  private _t(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private _formatHour(h: number): string {
    const hh = Math.round(h) % 24;
    if (hh === 0) return '12 AM';
    if (hh === 12) return '12 PM';
    return hh < 12 ? `${hh} AM` : `${hh - 12} PM`;
  }
}
