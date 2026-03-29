import { Component, signal, effect, inject, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { ScheduleGridComponent } from '../../components/schedule-grid/schedule-grid';
import { EmployeeManagementComponent } from '../../components/employee-management/employee-management';
import { ShareDialogComponent } from '../../components/share-dialog/share-dialog';
import { CoverageDialogComponent, CoverageDialogData } from '../../components/coverage-dialog/coverage-dialog';
import { CopyDayDialogComponent } from '../../components/copy-day-dialog/copy-day-dialog';
import { HelpDialogComponent } from '../../components/help-dialog/help-dialog';
import { WorkspaceWizardDialogComponent, WorkspaceWizardResult } from '../../components/workspace-wizard-dialog/workspace-wizard-dialog';
import { PrintDialogComponent, PrintDialogData } from '../../components/print-dialog/print-dialog';
import { ActivitiesPanelComponent } from '../../components/activities-panel/activities-panel';
import { LocalStorageService, EmployeeService } from '../../services';
import { LicenseService } from '../../services/license.service';
import { Schedule, Shift, Employee, CoverageRequirements, ActivityEvent } from '../../models';

@Component({
  selector: 'app-schedule',
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    PrintDialogComponent,
    ScheduleGridComponent,
    EmployeeManagementComponent,
    ActivitiesPanelComponent,
  ],
  templateUrl: './schedule.html',
  styleUrls: ['./schedule.css']
})
export class ScheduleComponent {
  private _bp = inject(BreakpointObserver);

  isMobile = toSignal(
    this._bp.observe('(max-width: 600px)').pipe(map(r => r.matches)),
    { initialValue: false }
  );

  @ViewChild(ActivitiesPanelComponent) activitiesPanel?: ActivitiesPanelComponent;

  currentSchedule = signal<Schedule | null>(null);
  shifts = signal<Shift[]>([]);
  employees = signal<Employee[]>([]);
  employeePanelOpen = signal(false);
  panelActivities = signal<ActivityEvent[]>([]);

  scheduleMode = computed(() => this.currentSchedule()?.mode ?? 'workplace' as const);
  isPersonalMode = computed(() => this.scheduleMode() === 'personal');

  weekStartDate = signal<string>(this._getMonday(new Date()));
  weekDateRange = signal<string>('');

  /** Shifts for the currently viewed week only */
  currentWeekShifts = computed(() =>
    this.shifts().filter(s => s.weekStartDate === this.weekStartDate())
  );

  // ==================== Workspace (multi-schedule) ====================

  allSchedules = signal<Schedule[]>([]);
  isPremium = computed(() => this.licenseService.isPremium());
  scheduleLimit = computed(() => this.localStorageService.getScheduleLimit()); // null = unlimited
  atScheduleLimit = computed(() => this.localStorageService.isAtScheduleLimit());

  private _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // ==================== First-time experience ====================
  private readonly WELCOME_BANNER_KEY = 'leaveat:welcome-banner-dismissed';
  private readonly MODE_SUGGEST_KEY = 'leaveat:mode-suggest-shown';

  isWelcomeBannerVisible = signal(false);
  modeSuggestion = signal<'workplace' | 'family' | 'personal' | null>(null);

  modeLabel = computed(() => {
    const mode = this.scheduleMode();
    if (mode === 'personal') return 'Personal';
    if (mode === 'family') return 'Family';
    return 'Work';
  });

  constructor(
    private localStorageService: LocalStorageService,
    private employeeService: EmployeeService,
    private licenseService: LicenseService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.loadOrCreateSchedule();
    this.loadEmployees();
    this.updateWeekDateRange();
    this.isWelcomeBannerVisible.set(!localStorage.getItem(this.WELCOME_BANNER_KEY));

    // Mode suggestion effect — fires after 3+ shifts reveal a usage pattern
    effect(() => {
      const allShifts = this.shifts();
      if (allShifts.length < 3) return;
      if (this.modeSuggestion() !== null) return;
      if (this.scheduleMode() !== 'workplace') return;
      if (localStorage.getItem(this.MODE_SUGGEST_KEY)) return;
      const uniqueEmployees = new Set(allShifts.map(s => s.employeeId));
      if (uniqueEmployees.size === 1) {
        this.modeSuggestion.set('personal');
      }
    });

    // Auto-save effect — debounced to avoid a write on every signal change
    effect(() => {
      const shifts = this.shifts();
      const schedule = this.currentSchedule();
      if (schedule && shifts) {
        if (this._autoSaveTimer !== null) clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => this._saveSchedule(), 400);
      }
    });
  }

  loadOrCreateSchedule(): void {
    this._refreshAllSchedules();
    // Try the pinned current schedule, then fall back to the first stored one
    const schedule = this.localStorageService.getCurrentSchedule()
      ?? this.localStorageService.getSchedules()[0]
      ?? null;

    if (!schedule) {
      // No schedule yet — auto-create a default schedule (no wizard on first visit)
      const defaultSchedule: Schedule = {
        id: this._generateId(),
        name: 'My Schedule',
        mode: 'workplace',
        shifts: [],
        employees: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.localStorageService.saveSchedule(defaultSchedule);
      this.localStorageService.setCurrentScheduleId(defaultSchedule.id);
      this.currentSchedule.set(defaultSchedule);
      this.shifts.set([]);
      this._refreshAllSchedules();
      return;
    }

    this.currentSchedule.set(schedule);

    // Migrate any legacy shifts that are missing weekStartDate — stamp them with the current week
    const currentWeek = this.weekStartDate();
    const rawShifts = (schedule.shifts || []).map(s =>
      s.weekStartDate ? s : { ...s, weekStartDate: currentWeek }
    );
    this.shifts.set(rawShifts);
    this._refreshAllSchedules();
    // weekStartDate stays at current Monday — schedules no longer track a single week
  }

  openWorkspaceWizard(isFirst: boolean): void {
    if (!isFirst) {
      this._saveSchedule();
    }

    const dialogRef = this.dialog.open(WorkspaceWizardDialogComponent, {
      data: { isFirst },
      disableClose: isFirst,
      panelClass: 'workspace-wizard-panel'
    });

    dialogRef.afterClosed().subscribe((result: WorkspaceWizardResult | null) => {
      if (result) {
        const newSchedule: Schedule = {
          id: this._generateId(),
          name: result.name,
          mode: result.mode,
          shifts: [],
          employees: isFirst ? [] : this.employees(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.localStorageService.saveSchedule(newSchedule);
        this.localStorageService.setCurrentScheduleId(newSchedule.id);
        this.currentSchedule.set(newSchedule);
        this.shifts.set([]);
        this.weekStartDate.set(this._getMonday(new Date()));
        this.updateWeekDateRange();
        this._refreshAllSchedules();
        if (result.mode === 'personal') {
          this._ensurePersonalSelfEmployee();
        } else if (isFirst) {
          // Open the employee panel so they can immediately add people
          this.employeePanelOpen.set(true);
        }
      } else if (isFirst) {
        // Wizard dismissed on first load — create a safe fallback
        const fallback: Schedule = {
          id: this._generateId(),
          name: 'My Schedule',
          mode: 'workplace',
          shifts: [],
          employees: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.localStorageService.saveSchedule(fallback);
        this.localStorageService.setCurrentScheduleId(fallback.id);
        this.currentSchedule.set(fallback);
        this.shifts.set([]);
        this._refreshAllSchedules();
      }
    });
  }

  loadEmployees(): void {
    this.employees.set(this.employeeService.getEmployees());
  }

  onShiftsChange(weekShifts: Shift[]): void {
    const week = this.weekStartDate();
    // Stamp the current week on any new/updated shifts, then merge back into the full set
    const stamped = weekShifts.map(s => ({ ...s, weekStartDate: week }));
    const otherWeeks = this.shifts().filter(s => s.weekStartDate !== week);
    this.shifts.set([...otherWeeks, ...stamped]);
    this._saveSchedule();
  }

  onRequestAddActivity(day: number): void {
    if (!this.activitiesPanel) return;
    const weekStart = new Date(this.weekStartDate() + 'T00:00:00');
    weekStart.setDate(weekStart.getDate() + day);
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultDate = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
    this.activitiesPanel.openCreateDialog(defaultDate);
  }

  toggleEmployeePanel(): void {
    this.employeePanelOpen.set(!this.employeePanelOpen());
  }

  refreshEmployees(): void {
    this.loadEmployees();
  }

  openShareDialog(): void {
    const schedule = this.currentSchedule();
    if (!schedule) {
      this.snackBar.open('No schedule to share', 'Close', { duration: 3000 });
      return;
    }

    // Share a snapshot of the current week only — always use the live employees()
    // signal rather than schedule.employees, which may lag behind if employees were
    // added/edited after the last auto-save (auto-save only fires on shift changes).
    const weekSnapshot = {
      ...schedule,
      name: `Week of ${this.weekStartDate()}`,
      weekStartDate: this.weekStartDate(),
      shifts: this.currentWeekShifts(),
      employees: this.employees()
    };

    this.dialog.open(ShareDialogComponent, {
      width: 'min(500px, 95vw)',
      data: weekSnapshot
    });
  }

  openHelpDialog(): void {
    this.dialog.open(HelpDialogComponent, {
      width: '700px',
      maxWidth: '95vw'
    });
  }

  openPrintDialog(): void {
    const schedule = this.currentSchedule();
    if (!schedule) return;

    this.dialog.open(PrintDialogComponent, {
      width: 'min(600px, 95vw)',
      data: {
        schedule,
        shifts: this.currentWeekShifts(),
        employees: this.employees(),
        weekDateRange: this.weekDateRange(),
        weekStartDate: this.weekStartDate(),
        mode: this.scheduleMode(),
        activities: this.panelActivities()
      } as PrintDialogData
    });
  }

  openCoverageDialog(): void {
    const schedule = this.currentSchedule();
    if (!schedule) return;

    const dialogRef = this.dialog.open(CoverageDialogComponent, {
      width: 'min(600px, 95vw)',
      data: {
        requirements: schedule.coverageRequirements || null
      } as CoverageDialogData
    });

    dialogRef.afterClosed().subscribe((result: CoverageRequirements | null | undefined) => {
      // result is null when user clicks Cancel, undefined when dismissed via ESC/backdrop — skip save in both cases
      if (result != null && schedule) {
        const updated: Schedule = {
          ...schedule,
          coverageRequirements: result,
          updatedAt: Date.now()
        };
        this.localStorageService.saveSchedule(updated);
        this.currentSchedule.set(updated);
        this.snackBar.open('Coverage requirements updated', 'Close', { duration: 3000 });
      }
    });
  }

  openCopyDayDialog(): void {
    const dialogRef = this.dialog.open(CopyDayDialogComponent, {
      width: 'min(500px, 95vw)'
    });

    dialogRef.afterClosed().subscribe((result: { fromDay: number; toDays: number[] } | null) => {
      if (result) {
        this.copyDay(result.fromDay, result.toDays);
      }
    });
  }

  previousWeek(): void {
    const currentDate = new Date(this.weekStartDate() + 'T00:00:00');
    currentDate.setDate(currentDate.getDate() - 7);
    this._navigateToWeek(this._getMonday(currentDate));
  }

  nextWeek(): void {
    const currentDate = new Date(this.weekStartDate() + 'T00:00:00');
    currentDate.setDate(currentDate.getDate() + 7);
    this._navigateToWeek(this._getMonday(currentDate));
  }

  thisWeek(): void {
    this._navigateToWeek(this._getMonday(new Date()));
  }

  private _navigateToWeek(weekStr: string): void {
    this._saveSchedule();
    this.weekStartDate.set(weekStr);
    this.updateWeekDateRange();
  }

  updateWeekDateRange(): void {
    const start = new Date(this.weekStartDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    
    const formatDate = (d: Date) => {
      const month = d.toLocaleString('default', { month: 'short' });
      const day = d.getDate();
      return `${month} ${day}`;
    };
    
    this.weekDateRange.set(`${formatDate(start)} - ${formatDate(end)}, ${start.getFullYear()}`);
  }

  copyFromLastWeek(): void {
    const currentMonday = new Date(this.weekStartDate() + 'T00:00:00');
    const lastMonday = new Date(currentMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastWeekStr = this._getMonday(lastMonday);

    const lastWeekShifts = this.shifts().filter(s => s.weekStartDate === lastWeekStr);

    if (lastWeekShifts.length === 0) {
      this.snackBar.open('No shifts found in last week\'s schedule', 'Close', { duration: 3000 });
      return;
    }

    if (!confirm(`Copy ${lastWeekShifts.length} shift(s) from last week?`)) return;

    const copied = lastWeekShifts.map(s => ({
      ...s,
      id: this._generateShiftId(),
      weekStartDate: this.weekStartDate()
    }));

    this.shifts.set([...this.shifts(), ...copied]);
    this._saveSchedule();
    this.snackBar.open(`Copied ${copied.length} shift(s) from last week`, 'Close', { duration: 3000 });
  }

  copyDay(fromDay: number, toDays: number[]): void {
    const week = this.weekStartDate();
    const shiftsFromDay = this.currentWeekShifts().filter(s => s.day === fromDay);
    
    if (shiftsFromDay.length === 0) {
      this.snackBar.open('No shifts to copy from selected day', 'Close', { duration: 3000 });
      return;
    }
    
    const copiedShifts: Shift[] = [];
    toDays.forEach(toDay => {
      shiftsFromDay.forEach(shift => {
        copiedShifts.push({
          ...shift,
          id: this._generateShiftId(),
          weekStartDate: week,
          day: toDay
        });
      });
    });
    
    this.shifts.set([...this.shifts(), ...copiedShifts]);
    this._saveSchedule();
    
    this.snackBar.open(
      `Copied ${shiftsFromDay.length} shift(s) to ${toDays.length} day(s)`, 
      'Close', 
      { duration: 3000 }
    );
  }

  clearWeek(): void {
    if (!confirm('Delete all shifts for this week?')) return;
    const week = this.weekStartDate();
    this.shifts.set(this.shifts().filter(s => s.weekStartDate !== week));
    this._saveSchedule();
    this.snackBar.open('All shifts cleared', 'Close', { duration: 3000 });
  }

  clearAllData(): void {
    if (!confirm('This will permanently delete ALL employees, schedules, and shifts. This cannot be undone.\n\nAre you sure?')) return;
    this.localStorageService.clearAll();
    this.employeeService.clearAll();
    this.employees.set([]);
    this.shifts.set([]);
    this.currentSchedule.set(null);
    this._refreshAllSchedules();
    this.openWorkspaceWizard(true);
  }


  dismissWelcomeBanner(): void {
    localStorage.setItem(this.WELCOME_BANNER_KEY, '1');
    this.isWelcomeBannerVisible.set(false);
  }

  acceptModeSuggestion(): void {
    const mode = this.modeSuggestion();
    if (!mode) return;
    this.switchToMode(mode);
    localStorage.setItem(this.MODE_SUGGEST_KEY, '1');
    this.modeSuggestion.set(null);
  }

  dismissModeSuggestion(): void {
    localStorage.setItem(this.MODE_SUGGEST_KEY, '1');
    this.modeSuggestion.set(null);
  }

  private _saveSchedule(): void {
    const schedule = this.currentSchedule();
    if (!schedule) return;

    const updated: Schedule = {
      ...schedule,
      shifts: this.shifts(),
      employees: this.employees(),
      updatedAt: Date.now()
    };

    this.localStorageService.saveSchedule(updated);
    this._refreshAllSchedules();
  }

  private _refreshAllSchedules(): void {
    this.allSchedules.set(this.localStorageService.getSchedules());
  }

  // ==================== Workspace management ====================

  /** Personal-mode sentinel employee — invisible single-user stand-in */
  private readonly PERSONAL_SELF_ID = 'personal_self';

  private _ensurePersonalSelfEmployee(): void {
    this.employeeService.upsertById({
      id: this.PERSONAL_SELF_ID,
      name: 'Me',
      role: '',
      color: '#5c6bc0'
    });
    this.loadEmployees();
  }

  setWorkspaceMode(mode: 'workplace' | 'family' | 'personal'): void {
    const schedule = this.currentSchedule();
    if (!schedule) return;
    const updated = { ...schedule, mode, updatedAt: Date.now() };
    this.localStorageService.saveSchedule(updated);
    this.currentSchedule.set(updated);
    this._refreshAllSchedules();
    if (mode === 'personal') {
      this._ensurePersonalSelfEmployee();
    }
  }

  /** Alias exposed to the mode submenu in the template */
  switchToMode(mode: 'workplace' | 'family' | 'personal'): void {
    this.setWorkspaceMode(mode);
  }

  createWorkspace(): void {
    if (this.atScheduleLimit()) {
      this.snackBar.open('Upgrade to Premium for unlimited workspaces', 'Upgrade', {
        duration: 5000,
        panelClass: 'snack-premium'
      }).onAction().subscribe(() => {
        window.location.href = '/premium';
      });
      return;
    }

    this.openWorkspaceWizard(false);
  }

  switchWorkspace(schedule: Schedule): void {
    if (schedule.id === this.currentSchedule()?.id) return;
    this._saveSchedule();
    this.localStorageService.setCurrentScheduleId(schedule.id);
    this.currentSchedule.set(schedule);
    this.shifts.set(schedule.shifts || []);
    this.weekStartDate.set(this._getMonday(new Date()));
    this.updateWeekDateRange();
    if (schedule.mode === 'personal') {
      this._ensurePersonalSelfEmployee();
    } else {
      this.loadEmployees();
    }
  }

  renameWorkspace(): void {
    const schedule = this.currentSchedule();
    if (!schedule) return;
    const name = prompt('Rename workspace:', schedule.name);
    if (!name?.trim() || name.trim() === schedule.name) return;
    const updated = { ...schedule, name: name.trim(), updatedAt: Date.now() };
    this.localStorageService.saveSchedule(updated);
    this.currentSchedule.set(updated);
    this._refreshAllSchedules();
  }

  deleteWorkspace(): void {
    const schedule = this.currentSchedule();
    if (!schedule) return;
    if (this.allSchedules().length <= 1) {
      this.snackBar.open('Cannot delete the only workspace', 'Close', { duration: 3000 });
      return;
    }
    if (!confirm(`Delete workspace "${schedule.name}"? This will permanently remove all its shifts.`)) return;
    this.localStorageService.deleteSchedule(schedule.id);
    this.loadOrCreateSchedule();
    this.snackBar.open('Workspace deleted', 'Close', { duration: 3000 });
  }

  private _getMonday(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setDate(diff);
    // Use local date parts to avoid UTC offset shifting the date (toISOString() returns UTC,
    // which can be a different day than local midnight in UTC+ timezones).
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayNum}`;
  }

  private _generateId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _generateShiftId(): string {
    return `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
