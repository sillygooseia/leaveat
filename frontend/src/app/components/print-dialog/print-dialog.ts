import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { Schedule, Shift, Employee, ActivityEvent } from '../../models';
import { calculateShiftHours } from '../../utils/schedule-helpers';

export interface PrintDialogData {
  schedule: Schedule;
  shifts: Shift[];       // current week's shifts only
  employees: Employee[];
  weekDateRange: string; // e.g. "Mar 25 - Mar 31, 2026"
  weekStartDate: string; // e.g. "2026-03-25"
  mode: 'workplace' | 'family' | 'personal';
  activities?: ActivityEvent[];
}

@Component({
  selector: 'app-print-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule],
  templateUrl: './print-dialog.html',
  styleUrls: ['./print-dialog.css']
})
export class PrintDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<PrintDialogComponent>>(MatDialogRef, { optional: true });
  private readonly dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  private readonly shortDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  data!: PrintDialogData;

  /** Emits void when the user dismisses the print panel (page mode only). */
  @Output() closePanel = new EventEmitter<void>();

  constructor() {
    const dialogData = inject<PrintDialogData>(MAT_DIALOG_DATA, { optional: true });
    if (dialogData) {
      this.data = dialogData;
    }
  }

  /** Called by the page wrapper via property binding: `[pageData]="..."`. */
  @Input() set pageData(d: PrintDialogData) { this.data = d; }

  close(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.closePanel.emit();
    }
  }

  get isFamily(): boolean {
    return this.data.mode === 'family';
  }

  get isPersonal(): boolean {
    return this.data.mode === 'personal';
  }

  printWorkChart(): void {
    const html = this.buildWorkChartHtml();
    const title = this.isFamily ? 'Family Schedule' : 'Work Chart';
    this.openPrintWindow(`${title} – ${this.data.weekDateRange}`, html);
  }

  printStaffingReport(): void {
    const html = this.buildStaffingReportHtml();
    const title = this.isFamily ? 'Family Report' : 'Staffing Report';
    this.openPrintWindow(`${title} – ${this.data.weekDateRange}`, html);
  }

  printPersonalSchedule(): void {
    const html = this.buildPersonalScheduleHtml();
    this.openPrintWindow(`My Schedule – ${this.data.weekDateRange}`, html);
  }

  private openPrintWindow(title: string, bodyAndHead: string): void {
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print.');
      return;
    }
    win.document.write(`<!DOCTYPE html><html lang="en">${bodyAndHead}</html>`);
    win.document.close();
    win.focus();
    // Give the browser a moment to render before triggering print
    setTimeout(() => win.print(), 600);
  }

  // ─── Work Chart ────────────────────────────────────────────────────────────

  private buildWorkChartHtml(): string {
    const { schedule, shifts, employees, weekDateRange } = this.data;
    const isFamily = this.isFamily;
    const memberLabel = isFamily ? 'Member' : 'Employee';
    const chartTitle = isFamily ? 'Family Schedule' : 'Work Chart';
    const printDate = new Date().toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });

    const footerCounts: number[] = Array(7).fill(0);
    let grandTotalHours = 0;

    const tableRows = employees.map(emp => {
      const empShifts = shifts.filter(s => s.employeeId === emp.id);
      const totalHours = empShifts.reduce((sum, s) => sum + calculateShiftHours(s), 0);
      grandTotalHours += totalHours;

      let cells = '';
      for (let day = 0; day < 7; day++) {
        const dayShifts = empShifts
          .filter(s => s.day === day)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        if (dayShifts.length > 0) {
          footerCounts[day]++;
          const entries = dayShifts.map(s => {
            const hrs = calculateShiftHours(s);
            const role = s.role || emp.role;
            const roleStr = role ? ` · ${this.escapeHtml(role)}` : '';
            const notesStr = s.notes ? `<br><em>${this.escapeHtml(s.notes)}</em>` : '';
            return `<div class="shift-entry">${this.formatTime12h(s.startTime)}–${this.formatTime12h(s.endTime)}<br><small>${this.fmtHours(hrs)}${roleStr}${notesStr}</small></div>`;
          }).join('');
          cells += `<td class="shift-cell">${entries}</td>`;
        } else {
          cells += `<td class="off-cell">—</td>`;
        }
      }

      return `<tr>
        <td class="emp-cell"><strong>${this.escapeHtml(emp.name)}</strong><br><small class="emp-role">${this.escapeHtml(emp.role)}</small></td>
        ${cells}
        <td class="total-cell">${this.fmtHours(totalHours)}</td>
      </tr>`;
    }).join('');

    const headerCols = this.shortDayNames
      .map((n, i) => `<th>${n}<br><span class="day-date">${this.getDateForDay(i)}</span></th>`)
      .join('');

    const footerCols = footerCounts
      .map(c => `<td>${c > 0 ? `${c} ${isFamily ? 'member' : 'staff'}${c !== 1 ? 's' : ''}` : '—'}</td>`)
      .join('');

    return `
<head>
  <meta charset="utf-8">
  <title>Work Chart – ${weekDateRange}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; padding: 0.4in; }
    .print-header { margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #000; }
    .print-header h1 { font-size: 22px; margin-bottom: 2px; }
    .print-header h2 { font-size: 14px; font-weight: normal; color: #333; margin-bottom: 2px; }
    .print-header .meta { font-size: 10px; color: #666; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #bbb; padding: 5px 6px; text-align: center; vertical-align: top; word-wrap: break-word; }
    th { background: #eaeaea; font-weight: bold; font-size: 11px; }
    .day-date { font-weight: normal; font-size: 10px; }
    .emp-cell { text-align: left; width: 90px; }
    .emp-role { color: #555; }
    .shift-cell { font-size: 10px; min-width: 70px; }
    .shift-entry { margin-bottom: 3px; line-height: 1.3; }
    .off-cell { color: #bbb; font-size: 13px; }
    .total-cell { font-weight: bold; background: #f5f5f5; width: 52px; }
    tfoot td { background: #eaeaea; font-weight: bold; font-size: 10px; }
    .act-table { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: auto; }
    .act-table th, .act-table td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 10px; }
    .act-table th { background: #eaeaea; font-weight: bold; }
    .activities-section-title { font-size: 13px; margin: 14px 0 5px; padding-bottom: 3px; border-bottom: 1px solid #999; }
    .act-notes { color: #555; font-style: italic; }
    .nowrap { white-space: nowrap; }
    .slot-item { display: inline-block; margin-right: 8px; white-space: nowrap; }
    .slot-open { color: #888; font-style: italic; }
    @page { size: landscape; margin: 0.4in; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>${chartTitle}</h1>
    <h2>${this.escapeHtml(schedule.name)} &mdash; ${this.escapeHtml(weekDateRange)}</h2>
    <div class="meta">Printed: ${printDate}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${memberLabel}</th>
        ${headerCols}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="9"><em>No employees added yet.</em></td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td style="text-align:left">${isFamily ? 'Members' : 'Coverage'}</td>
        ${footerCols}
        <td>${this.fmtHours(grandTotalHours)}</td>
      </tr>
    </tfoot>
  </table>
  ${this._activitiesWeeklySectionHtml()}
</body>`;
  }

  // ─── Staffing Report ───────────────────────────────────────────────────────

  private buildStaffingReportHtml(): string {
    const { schedule, shifts, employees, weekDateRange } = this.data;
    const isFamily = this.isFamily;
    const memberLabel = isFamily ? 'Member' : 'Employee';
    const reportTitle = isFamily ? 'Family Report' : 'Staffing Report';
    const printDate = new Date().toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });

    let scheduledCount = 0;
    let grandTotalHours = 0;

    const summaryRows = employees.map(emp => {
      const empShifts = shifts.filter(s => s.employeeId === emp.id);
      const daysWorked = new Set(empShifts.map(s => s.day)).size;
      const totalHours = empShifts.reduce((sum, s) => sum + calculateShiftHours(s), 0);
      grandTotalHours += totalHours;
      if (empShifts.length > 0) scheduledCount++;

      const hoursDisplay = totalHours > 0 ? this.fmtHours(totalHours) : '—';
      const cls = totalHours === 0 ? ' class="no-shifts"' : '';
      return `<tr${cls}>
        <td>${this.escapeHtml(emp.name)}</td>
        <td>${this.escapeHtml(emp.role)}</td>
        <td style="text-align:center">${daysWorked || '—'}</td>
        <td style="text-align:right">${hoursDisplay}</td>
      </tr>`;
    }).join('');

    const daySections = this.dayNames.map((dayName, day) => {
      const dayShifts = shifts
        .filter(s => s.day === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const dayActivities = this.getActivitiesForWeekDay(day);
      if (dayShifts.length === 0 && dayActivities.length === 0) return '';

      const staffCount = new Set(dayShifts.map(s => s.employeeId)).size;
      const dayTotalHours = dayShifts.reduce((sum, s) => sum + calculateShiftHours(s), 0);
      const dutyLabel = isFamily
        ? `${staffCount} member${staffCount !== 1 ? 's' : ''}`
        : `${staffCount} staff on\u00a0duty`;

      const shiftRows = dayShifts.map(shift => {
        const emp = employees.find(e => e.id === shift.employeeId);
        if (!emp) return '';
        const role = shift.role || emp.role;
        const hrs = calculateShiftHours(shift);
        return `<tr>
          <td>${this.escapeHtml(emp.name)}</td>
          <td>${this.escapeHtml(role)}</td>
          <td style="text-align:center">${this.formatTime12h(shift.startTime)}</td>
          <td style="text-align:center">${this.formatTime12h(shift.endTime)}</td>
          <td style="text-align:right">${this.fmtHours(hrs)}</td>
          <td class="notes-cell">${shift.notes ? this.escapeHtml(shift.notes) : ''}</td>
        </tr>`;
      }).join('');

      const activitiesHtml = this._activitiesDaySectionHtml(dayActivities);
      const shiftsTable = dayShifts.length > 0 ? `<table>
          <thead>
            <tr><th>${memberLabel}</th><th>Role</th><th>Start</th><th>End</th><th>Hours</th><th>Notes</th></tr>
          </thead>
          <tbody>${shiftRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right">${dutyLabel}</td>
              <td style="text-align:right">${this.fmtHours(dayTotalHours)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>` : '';
      return `<div class="day-section">
        <h3 class="day-heading">${this.getFullDateForDay(day)}</h3>
        ${shiftsTable}
        ${activitiesHtml}
      </div>`;
    }).join('');

    return `
<head>
  <meta charset="utf-8">
  <title>Staffing Report – ${weekDateRange}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; padding: 0.5in; }
    .print-header { margin-bottom: 18px; padding-bottom: 8px; border-bottom: 2px solid #000; }
    .print-header h1 { font-size: 22px; margin-bottom: 2px; }
    .print-header h2 { font-size: 14px; font-weight: normal; color: #333; margin-bottom: 2px; }
    .print-header .meta { font-size: 10px; color: #666; }
    h2.section-title { font-size: 13px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #999; }
    .day-section { margin-bottom: 16px; page-break-inside: avoid; }
    .day-heading { font-size: 12px; font-weight: bold; margin-bottom: 4px; color: #333; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 4px 7px; }
    th { background: #eaeaea; font-weight: bold; text-align: left; }
    tfoot td { background: #f5f5f5; font-weight: bold; }
    .no-shifts td { color: #aaa; }
    .notes-cell { font-style: italic; color: #555; }
    .act-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .act-table th, .act-table td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 10px; }
    .act-table th { background: #eaeaea; font-weight: bold; }
    .act-section-head { background: #d5ecd6 !important; }
    .act-table--inday { margin-top: 8px; }
    .act-notes { color: #555; font-style: italic; }
    .nowrap { white-space: nowrap; }
    .slot-item { display: inline-block; margin-right: 8px; white-space: nowrap; }
    .slot-open { color: #888; font-style: italic; }
    @page { size: portrait; margin: 0.5in; }
    @media print { body { padding: 0; } .day-section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>${reportTitle}</h1>
    <h2>${this.escapeHtml(schedule.name)} &mdash; ${this.escapeHtml(weekDateRange)}</h2>
    <div class="meta">Printed: ${printDate}</div>
  </div>

  <h2 class="section-title">Weekly Summary</h2>
  <table>
    <thead>
      <tr><th>${memberLabel}</th><th>Role</th><th style="text-align:center">Days</th><th style="text-align:right">Total Hours</th></tr>
    </thead>
    <tbody>
      ${summaryRows || '<tr><td colspan="4"><em>No employees.</em></td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2"><strong>${scheduledCount} of ${employees.length} ${isFamily ? 'member' : 'employee'}${employees.length !== 1 ? 's' : ''} scheduled</strong></td>
        <td></td>
        <td style="text-align:right">${this.fmtHours(grandTotalHours)}</td>
      </tr>
    </tfoot>
  </table>

  <h2 class="section-title">Daily Breakdown</h2>
  ${daySections || '<p style="color:#888;font-style:italic;margin-top:8px">No shifts or activities scheduled this week.</p>'}
</body>`;
  }

  // ─── Personal Schedule ─────────────────────────────────────────────────────

  private buildPersonalScheduleHtml(): string {
    const { schedule, shifts, weekDateRange } = this.data;
    const printDate = new Date().toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });

    const daySections = this.dayNames.map((dayName, day) => {
      const dayShifts = shifts
        .filter(s => s.day === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      const dateLabel = this.getFullDateForDay(day);

      if (dayShifts.length === 0) {
        return `<div class="day-row empty-day">
          <div class="day-label">${dateLabel}</div>
          <div class="day-entries"><span class="no-events">No events</span></div>
        </div>`;
      }

      const entries = dayShifts.map(s => {
        const notesStr = s.notes ? ` &mdash; <em>${this.escapeHtml(s.notes)}</em>` : '';
        const hrs = calculateShiftHours(s);
        return `<div class="event-entry">
          <span class="event-time">${this.formatTime12h(s.startTime)}&ndash;${this.formatTime12h(s.endTime)}</span>
          <span class="event-dur">${this.fmtHours(hrs)}</span>
          ${notesStr ? `<span class="event-notes">${notesStr}</span>` : ''}
        </div>`;
      }).join('');

      const dayTotal = dayShifts.reduce((sum, s) => sum + calculateShiftHours(s), 0);
      return `<div class="day-row">
        <div class="day-label">${dateLabel}</div>
        <div class="day-entries">${entries}</div>
        <div class="day-total">${this.fmtHours(dayTotal)}</div>
      </div>`;
    }).join('');

    const weekTotal = shifts.reduce((sum, s) => sum + calculateShiftHours(s), 0);
    const eventCount = shifts.length;

    return `
<head>
  <meta charset="utf-8">
  <title>My Schedule – ${weekDateRange}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; padding: 0.5in; }
    .print-header { margin-bottom: 18px; padding-bottom: 8px; border-bottom: 2px solid #000; }
    .print-header h1 { font-size: 22px; margin-bottom: 2px; }
    .print-header h2 { font-size: 14px; font-weight: normal; color: #333; margin-bottom: 2px; }
    .print-header .meta { font-size: 10px; color: #666; }
    .day-row { display: flex; align-items: flex-start; border-bottom: 1px solid #ddd; padding: 8px 0; gap: 14px; page-break-inside: avoid; }
    .day-row.empty-day { color: #aaa; }
    .day-label { width: 160px; flex-shrink: 0; font-weight: bold; font-size: 11px; padding-top: 2px; }
    .day-entries { flex: 1; }
    .day-total { width: 48px; text-align: right; font-weight: bold; font-size: 11px; color: #444; padding-top: 2px; }
    .event-entry { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; flex-wrap: wrap; }
    .event-time { font-weight: bold; white-space: nowrap; }
    .event-dur { color: #555; font-size: 10px; white-space: nowrap; }
    .event-notes { color: #555; font-size: 11px; }
    .no-events { font-style: italic; font-size: 11px; }
    .footer-row { display: flex; justify-content: flex-end; gap: 24px; margin-top: 12px; padding-top: 8px; border-top: 2px solid #000; font-size: 12px; }
    .footer-row strong { font-size: 13px; }
    @page { size: portrait; margin: 0.5in; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>My Schedule</h1>
    <h2>${this.escapeHtml(schedule.name)} &mdash; ${this.escapeHtml(weekDateRange)}</h2>
    <div class="meta">Printed: ${printDate}</div>
  </div>

  ${daySections}

  <div class="footer-row">
    <span>${eventCount} event${eventCount !== 1 ? 's' : ''}</span>
    <span>Total: <strong>${this.fmtHours(weekTotal)}</strong></span>
  </div>
</body>`;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private formatTime12h(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  private getDateForDay(day: number): string {
    const date = new Date(this.data.weekStartDate + 'T00:00:00');
    date.setDate(date.getDate() + day);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  private getFullDateForDay(day: number): string {
    const date = new Date(this.data.weekStartDate + 'T00:00:00');
    date.setDate(date.getDate() + day);
    const month = date.toLocaleString('default', { month: 'long' });
    return `${this.dayNames[day]}, ${month} ${date.getDate()}, ${date.getFullYear()}`;
  }

  private fmtHours(hours: number): string {
    if (hours === 0) return '0h';
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded}h`;
  }

  private getActivitiesForWeekDay(day: number): ActivityEvent[] {
    if (!this.data.activities?.length) return [];
    const dayStart = new Date(this.data.weekStartDate + 'T00:00:00');
    dayStart.setDate(dayStart.getDate() + day);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return this.data.activities.filter(a => {
      const t = new Date(a.startAt);
      return t >= dayStart && t < dayEnd;
    }).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  private activityTypeEmoji(type: string): string {
    const map: Record<string, string> = {
      sports: '⚽', school: '📚', music: '🎵', medical: '🏥', social: '👥', activity: '📅',
    };
    return map[type] ?? '📅';
  }

  private formatIsoTime12h(iso: string): string {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  private _fmtSlots(activity: ActivityEvent): string {
    if (!activity.volunteers?.length) return '—';
    return activity.volunteers.map(v => {
      const name = v.name
        ? `<strong>${this.escapeHtml(v.name)}</strong>`
        : '<span class="slot-open">open</span>';
      return `<span class="slot-item">${this.escapeHtml(v.label)}: ${name}</span>`;
    }).join('');
  }

  private _activitiesWeeklySectionHtml(): string {
    if (!this.data.activities?.length) return '';
    let actRows = '';
    for (let day = 0; day < 7; day++) {
      actRows += this.getActivitiesForWeekDay(day).map(a =>
        `<tr>
          <td>${this.activityTypeEmoji(a.activityType)} ${this.shortDayNames[day]}<br><span class="day-date">${this.getDateForDay(day)}</span></td>
          <td><strong>${this.escapeHtml(a.title)}</strong>${a.notes ? `<br><em class="act-notes">${this.escapeHtml(a.notes)}</em>` : ''}</td>
          <td class="nowrap">${this.formatIsoTime12h(a.startAt)}&ndash;${this.formatIsoTime12h(a.endAt)}</td>
          <td>${a.location ? this.escapeHtml(a.location) : '—'}</td>
          <td>${this._fmtSlots(a)}</td>
        </tr>`
      ).join('');
    }
    if (!actRows) return '';
    return `
  <h2 class="activities-section-title">Activities This Week</h2>
  <table class="act-table">
    <thead><tr><th style="width:80px">Day</th><th>Activity</th><th style="width:130px">Time</th><th style="width:110px">Location</th><th>Volunteer Slots</th></tr></thead>
    <tbody>${actRows}</tbody>
  </table>`;
  }

  private _activitiesDaySectionHtml(activities: ActivityEvent[]): string {
    if (!activities.length) return '';
    const rows = activities.map(a =>
      `<tr>
        <td>${this.activityTypeEmoji(a.activityType)} <strong>${this.escapeHtml(a.title)}</strong>${a.notes ? `<br><em class="act-notes">${this.escapeHtml(a.notes)}</em>` : ''}</td>
        <td class="nowrap">${this.formatIsoTime12h(a.startAt)}&ndash;${this.formatIsoTime12h(a.endAt)}</td>
        <td>${a.location ? this.escapeHtml(a.location) : '—'}</td>
        <td>${this._fmtSlots(a)}</td>
      </tr>`
    ).join('');
    return `<table class="act-table act-table--inday">
      <thead>
        <tr><th colspan="4" class="act-section-head">Activities</th></tr>
        <tr><th>Activity</th><th>Time</th><th>Location</th><th>Volunteer Slots</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  private escapeHtml(text: string | undefined | null): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
