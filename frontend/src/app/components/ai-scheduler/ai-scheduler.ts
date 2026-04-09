import { Component, Input, Output, EventEmitter, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Employee, Shift } from '../../models';
import { LicenseService } from '../../services/license.service';
import { AiScheduleService, AiScheduleResult, coverageToText } from '../../services/ai-schedule.service';
import type { CoverageRequirements } from '../../models';

export interface AiSchedulerDialogData {
  employees: Employee[];
  weekStart: string; // ISO YYYY-MM-DD Monday
  coverageRequirements?: CoverageRequirements | null;
}

export interface AiSchedulerDialogResult {
  accepted: true;
  shifts: Shift[];
}

type Phase = 'notes' | 'generating' | 'review' | 'error';

@Component({
  selector: 'app-ai-scheduler',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './ai-scheduler.html',
  styleUrls: ['./ai-scheduler.css'],
})
export class AiSchedulerComponent implements OnDestroy {
  private readonly aiService = inject(AiScheduleService);
  private readonly licenseService = inject(LicenseService);
  readonly dialogRef = inject<MatDialogRef<AiSchedulerComponent, AiSchedulerDialogResult>>(MatDialogRef, { optional: true });

  readonly aiAccess = computed(() => this.licenseService.featureAccess('ai_scheduling'));

  employees: Employee[] = [];
  weekStart = '';

  // Per-employee notes
  employeeNotes: Record<string, string> = {};

  businessNotes = signal('');
  managerNotes = signal('');

  phase = signal<Phase>('notes');
  errorMessage = signal('');
  rateLimitResetsAt = signal(0);
  rateLimitCountdown = signal('');
  private _countdownInterval: ReturnType<typeof setInterval> | null = null;

  aiResult = signal<AiScheduleResult | null>(null);

  coverageAutoFilled = false;

  /** Emits a result (or null on dismiss) when used as a standalone page component. */
  @Output() result = new EventEmitter<AiSchedulerDialogResult | null>();

  constructor() {
    const dialogData = inject<AiSchedulerDialogData>(MAT_DIALOG_DATA, { optional: true });
    if (dialogData) {
      this._init(dialogData);
    }
  }

  /** Called by the page wrapper via property binding: `[data]="..."`. */
  @Input() set data(d: AiSchedulerDialogData) { this._init(d); }

  private _init(data: AiSchedulerDialogData): void {
    this.employees = data.employees;
    this.weekStart = data.weekStart;

    // Pre-populate business notes from coverage requirements
    const coverageText = coverageToText(data.coverageRequirements);
    if (coverageText) {
      this.businessNotes.set(coverageText);
      this.coverageAutoFilled = true;
    }

    // Pre-load saved employee notes
    const saved = this.aiService.getNotesMap();
    for (const emp of data.employees) {
      this.employeeNotes[emp.id] = saved[emp.id] ?? '';
    }
  }

  private _close(res: AiSchedulerDialogResult | null): void {
    if (this.dialogRef) {
      this.dialogRef.close(res ?? undefined);
    } else {
      this.result.emit(res);
    }
  }

  onNoteChange(employeeId: string, value: string): void {
    this.employeeNotes[employeeId] = value;
    this.aiService.setNote(employeeId, value);
  }

  async generate(): Promise<void> {
    this.phase.set('generating');
    this.errorMessage.set('');

    const outcome = await this.aiService.generate({
      employees: this.employees.map(e => ({
        id: e.id,
        name: e.name,
        notes: this.employeeNotes[e.id] ?? '',
      })),
      businessNotes: this.businessNotes(),
      managerNotes: this.managerNotes(),
      weekStart: this.weekStart,
    });

    if (outcome.ok) {
      this.aiResult.set(outcome.result);
      this.phase.set('review');
    } else {
      const err = outcome.error;
      if (err.type === 'rate_limited') {
        this.rateLimitResetsAt.set(err.resetsAt);
        this._startCountdown(err.resetsAt);
        this.errorMessage.set(`Daily AI limit reached (${this.rateLimitCountdown()}).`);
      } else if (err.type === 'service_unavailable') {
        this.errorMessage.set(err.message);
      } else if (err.type === 'unauthenticated' || err.type === 'feature_required') {
        this.errorMessage.set('Premium license required. Please activate your plan.');
      } else {
        this.errorMessage.set('An unexpected error occurred. Please try again.');
      }
      this.phase.set('error');
    }
  }

  regenerate(): void {
    this._stopCountdown();
    this.aiResult.set(null);
    this.phase.set('notes');
  }

  acceptSchedule(): void {
    const result = this.aiResult();
    if (!result) return;
    this._close({ accepted: true, shifts: result.shifts });
  }

  dismiss(): void {
    this._stopCountdown();
    this._close(null);
  }

  ngOnDestroy(): void {
    this._stopCountdown();
  }

  private _startCountdown(resetsAt: number): void {
    this._stopCountdown();
    const update = () => {
      const remaining = resetsAt - Math.floor(Date.now() / 1000);
      if (remaining <= 0) {
        this.rateLimitCountdown.set('resets now');
        this._stopCountdown();
        return;
      }
      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      if (h > 0) {
        this.rateLimitCountdown.set(`resets in ${h}h ${m}m`);
      } else if (m > 0) {
        this.rateLimitCountdown.set(`resets in ${m}m ${s}s`);
      } else {
        this.rateLimitCountdown.set(`resets in ${s}s`);
      }
    };
    update();
    this._countdownInterval = setInterval(update, 1000);
  }

  private _stopCountdown(): void {
    if (this._countdownInterval !== null) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
  }

  private _formatReset(unix: number): string {
    if (!unix) return 'midnight UTC';
    const d = new Date(unix * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  readonly dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  readonly dayIndexes = [0, 1, 2, 3, 4, 5, 6];

  getEmployeeName(employeeId: string): string {
    return this.employees.find(emp => emp.id === employeeId)?.name ?? employeeId;
  }

  getShiftsForDay(shifts: Shift[], day: number): Shift[] {
    return shifts
      .filter(shift => shift.day === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  formatShiftMeta(shift: Shift): string {
    const parts: string[] = [];
    if (shift.role) parts.push(shift.role);
    if (shift.roomId) parts.push(`Room: ${shift.roomId}`);
    if (shift.notes) parts.push(shift.notes);
    return parts.join(' · ');
  }
}
