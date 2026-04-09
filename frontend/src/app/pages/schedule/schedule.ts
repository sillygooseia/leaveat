import { Component, signal, effect, inject, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
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
import { CopyDayDialogComponent } from '../../components/copy-day-dialog/copy-day-dialog';
import { HelpDialogComponent } from '../../components/help-dialog/help-dialog';
import { WorkspaceWizardDialogComponent, WorkspaceWizardResult } from '../../components/workspace-wizard-dialog/workspace-wizard-dialog';
import { ActivitiesPanelComponent } from '../../components/activities-panel/activities-panel';
import { AiSchedulerDialogResult } from '../../components/ai-scheduler/ai-scheduler';
import { LocalStorageService, EmployeeService, LicenseService } from '../../services';
import { PendingAiResultService } from '../../services/pending-ai-result.service';
import { Schedule, Shift, Employee, ActivityEvent } from '../../models';

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
    ScheduleGridComponent,
    EmployeeManagementComponent,
    ActivitiesPanelComponent,
  ],
  templateUrl: './schedule.html',
  styleUrls: ['./schedule.css']
})
export class ScheduleComponent {
  private _bp = inject(BreakpointObserver);
  private _licenseService = inject(LicenseService);
  private _router = inject(Router);
  private _pendingAi = inject(PendingAiResultService);

  readonly isPremium = this._licenseService.isPremium;
  readonly isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  isMobile = toSignal(
    this._bp.observe('(max-width: 600px)').pipe(map(r => r.matches)),
    { initialValue: false }
  );

  @ViewChild(ActivitiesPanelComponent) activitiesPanel?: ActivitiesPanelComponent;
  @ViewChild('dataImportInput') dataImportInput?: ElementRef<HTMLInputElement>;

  currentSchedule = signal<Schedule | null>(null);
  shifts = signal<Shift[]>([]);
  employees = signal<Employee[]>([]);
  employeePanelOpen = signal(false);
  panelActivities = signal<ActivityEvent[]>([]);

  scheduleMode = computed(() => this.currentSchedule()?.mode ?? 'workplace' as const);
  isPersonalMode = computed(() => this.scheduleMode() === 'personal');

  dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  viewMode = signal<'week' | 'day'>('week');
  selectedDay = signal<number>(this._getTodayIndexInWeek(this._getMonday(new Date())));
  compactShiftMode = signal(false);

  weekStartDate = signal<string>(this._getMonday(new Date()));
  weekDateRange = signal<string>('');
  currentDayLabel = signal<string>('');

  /** Shifts for the currently viewed week only */
  currentWeekShifts = computed(() =>
    this.shifts().filter(s => s.weekStartDate === this.weekStartDate())
  );

  currentDayShifts = computed(() => {
    const day = this.selectedDay();
    return this.currentWeekShifts().filter(s => s.day === day || (s.day === ((day + 6) % 7) && s.endTime < s.startTime));
  });

  currentViewLabel = computed(() => {
    if (this.viewMode() === 'week') {
      return this.weekDateRange();
    }
    const start = new Date(this.weekStartDate() + 'T00:00:00');
    start.setDate(start.getDate() + this.selectedDay());
    const month = start.toLocaleString('default', { month: 'short' });
    return `${this.dayNames[this.selectedDay()]} ${month} ${start.getDate()}, ${start.getFullYear()}`;
  });

  // ==================== Workspace (multi-schedule) ====================

  allSchedules = signal<Schedule[]>([]);

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
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.loadOrCreateSchedule();
    this.loadEmployees();
    this.updateWeekDateRange();
    this.isWelcomeBannerVisible.set(!localStorage.getItem(this.WELCOME_BANNER_KEY));

    // Apply any AI-generated shifts that came back from the /ai page
    const aiResult = this._pendingAi.take();
    if (aiResult?.accepted) {
      this._applyAiShifts(aiResult);
    }

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
      position: { right: '0', top: '0' },
      height: '100vh',
      width: 'min(520px, 95vw)',
      maxWidth: '95vw',
      panelClass: 'side-sheet-panel',
      data: weekSnapshot
    });
  }

  loadDaycareDemo(): void {
    const { schedule, employees, aiNotes } = this.buildDaycareDemo();
    this.saveDemoSchedule(schedule, employees, aiNotes);
    this.snackBar.open('Daycare demo loaded', 'Close', { duration: 3000 });
  }

  loadNursingDemo(): void {
    const { schedule, employees, aiNotes } = this.buildNursingDemo();
    this.saveDemoSchedule(schedule, employees, aiNotes);
    this.snackBar.open('Nursing facility demo loaded', 'Close', { duration: 3000 });
  }

  private saveDemoSchedule(schedule: Schedule, employees: Employee[], aiNotes: Record<string, string>): void {
    this.localStorageService.clearSchedules();
    this.localStorageService.clearEmployees();
    this.localStorageService.setAiNotes({});

    this.localStorageService.saveEmployees(employees);
    schedule.employees = employees;
    this.localStorageService.saveSchedule(schedule);
    this.localStorageService.setAiNotes(aiNotes);
    this.localStorageService.setCurrentScheduleId(schedule.id);
    this.currentSchedule.set(schedule);
    this.shifts.set(schedule.shifts);
    this.employees.set(employees);
    this._refreshAllSchedules();
    this.weekStartDate.set(this._getMonday(new Date()));
    this.updateWeekDateRange();
  }

  private buildDaycareDemo(): { schedule: Schedule; employees: Employee[]; aiNotes: Record<string,string> } {
    const employees: Employee[] = [
      { id: 'emp_amy', name: 'Amy Torres', role: 'Infant Lead', color: '#3f51b5', maxWeeklyHours: 40 },
      { id: 'emp_brian', name: 'Brian Lee', role: 'Toddler Lead', color: '#4caf50', maxWeeklyHours: 40 },
      { id: 'emp_clara', name: 'Clara Patel', role: 'Preschool Lead', color: '#ff9800', maxWeeklyHours: 34 },
      { id: 'emp_danielle', name: 'Danielle Kim', role: 'Infant Assistant', color: '#9c27b0', maxWeeklyHours: 32 },
      { id: 'emp_eli', name: 'Eli Johnson', role: 'Toddler Assistant', color: '#2196f3', maxWeeklyHours: 32 },
      { id: 'emp_nia', name: 'Nia Davis', role: 'Preschool Assistant', color: '#00bcd4', maxWeeklyHours: 30 },
      { id: 'emp_oliver', name: 'Oliver Park', role: 'Floater', color: '#ff5722', maxWeeklyHours: 28 },
    ];

    const shifts: Shift[] = [];
    const weekStart = this._getMonday(new Date());
    for (let day = 0; day < 5; day++) {
      if (day === 0) {
        // Monday is lightly staffed to demonstrate undercoverage
        shifts.push(
          { id: `shift_daycare_amy_${day}`, employeeId: 'emp_amy', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Check attendance and morning snack' },
          { id: `shift_daycare_brian_${day}`, employeeId: 'emp_brian', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Supervise nap time and pickup' },
          { id: `shift_daycare_clara_${day}`, employeeId: 'emp_clara', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Cover preschool room' },
        );
      } else if (day === 1) {
        // Tuesday meets staffing exactly
        shifts.push(
          { id: `shift_daycare_amy_${day}`, employeeId: 'emp_amy', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Check attendance and morning snack' },
          { id: `shift_daycare_danielle_${day}`, employeeId: 'emp_danielle', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Support infant care and diaper routines' },
          { id: `shift_daycare_brian_${day}`, employeeId: 'emp_brian', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Supervise nap time and pickup' },
          { id: `shift_daycare_eli_${day}`, employeeId: 'emp_eli', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Support toddler activities and crafts' },
          { id: `shift_daycare_clara_${day}`, employeeId: 'emp_clara', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Cover preschool room' },
          { id: `shift_daycare_nia_${day}`, employeeId: 'emp_nia', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Lead preschool circle time and learning centers' },
        );
      } else if (day === 2) {
        // Wednesday has overstaff in preschool
        shifts.push(
          { id: `shift_daycare_amy_${day}`, employeeId: 'emp_amy', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Check attendance and morning snack' },
          { id: `shift_daycare_danielle_${day}`, employeeId: 'emp_danielle', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Support infant care and diaper routines' },
          { id: `shift_daycare_brian_${day}`, employeeId: 'emp_brian', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Supervise nap time and pickup' },
          { id: `shift_daycare_eli_${day}`, employeeId: 'emp_eli', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Support toddler activities and crafts' },
          { id: `shift_daycare_clara_${day}`, employeeId: 'emp_clara', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Cover preschool room' },
          { id: `shift_daycare_nia_${day}`, employeeId: 'emp_nia', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Lead preschool circle time and learning centers' },
          { id: `shift_daycare_oliver_${day}`, employeeId: 'emp_oliver', day, startTime: '10:00', endTime: '14:00', roomId: 'room_preschool', notes: 'Extra preschool support for art activities' },
        );
      } else if (day === 3) {
        // Thursday is short one toddler staff
        shifts.push(
          { id: `shift_daycare_amy_${day}`, employeeId: 'emp_amy', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Check attendance and morning snack' },
          { id: `shift_daycare_danielle_${day}`, employeeId: 'emp_danielle', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Support infant care and diaper routines' },
          { id: `shift_daycare_brian_${day}`, employeeId: 'emp_brian', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Supervise nap time and pickup' },
          { id: `shift_daycare_clara_${day}`, employeeId: 'emp_clara', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Cover preschool room' },
          { id: `shift_daycare_nia_${day}`, employeeId: 'emp_nia', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Lead preschool circle time and learning centers' },
        );
      } else {
        // Friday has overcoverage in Infant Room
        shifts.push(
          { id: `shift_daycare_amy_${day}`, employeeId: 'emp_amy', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Check attendance and morning snack' },
          { id: `shift_daycare_danielle_${day}`, employeeId: 'emp_danielle', day, startTime: '08:00', endTime: '16:00', roomId: 'room_infant', notes: 'Support infant care and diaper routines' },
          { id: `shift_daycare_oliver_${day}`, employeeId: 'emp_oliver', day, startTime: '09:00', endTime: '14:00', roomId: 'room_infant', notes: 'Extra infant coverage for busy drop-off' },
          { id: `shift_daycare_brian_${day}`, employeeId: 'emp_brian', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Supervise nap time and pickup' },
          { id: `shift_daycare_eli_${day}`, employeeId: 'emp_eli', day, startTime: '08:30', endTime: '17:00', roomId: 'room_toddler', notes: 'Support toddler activities and crafts' },
          { id: `shift_daycare_clara_${day}`, employeeId: 'emp_clara', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Cover preschool room' },
          { id: `shift_daycare_nia_${day}`, employeeId: 'emp_nia', day, startTime: '09:00', endTime: '15:00', roomId: 'room_preschool', notes: 'Lead preschool circle time and learning centers' },
        );
      }
    }

    const demo: Schedule = {
      id: this._generateId(),
      name: 'Daycare Demo',
      mode: 'workplace',
      weekStartDate: weekStart,
      shifts,
      employees,
      coverageRequirements: {
        enabled: true,
        mode: 'room-ratio',
        rooms: [
          { id: 'room_infant', name: 'Infant Room', ageGroup: '0–18 months', capacity: 8, ratioStaff: 1, ratioChildren: 4 },
          { id: 'room_toddler', name: 'Toddler Room', ageGroup: '18–36 months', capacity: 12, ratioStaff: 1, ratioChildren: 6 },
          { id: 'room_preschool', name: 'Preschool Room', ageGroup: '3–5 years', capacity: 20, ratioStaff: 1, ratioChildren: 10 },
        ]
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const aiNotes: Record<string, string> = {
      emp_amy: 'Prefers early shifts and handles infant care. Avoids Friday evenings.',
      emp_brian: 'Best with toddlers and staffing transitions. Not available Tuesdays after 5pm.',
      emp_clara: 'Great in preschool room. Needs a shorter day on Thursdays.',
      emp_danielle: 'Supports infants and morning drop-off routines.',
      emp_eli: 'Strong with toddlers and outdoor play activities.',
      emp_nia: 'Enjoys preschool circle time and arts projects.',
    };

    return { schedule: demo, employees, aiNotes };
  }

  private buildNursingDemo(): { schedule: Schedule; employees: Employee[]; aiNotes: Record<string,string> } {
    const employees: Employee[] = [
      { id: 'emp_emma', name: 'Emma Rodriguez', role: 'RN', color: '#e91e63', maxWeeklyHours: 36 },
      { id: 'emp_nora', name: 'Nora Patel', role: 'RN', color: '#9c27b0', maxWeeklyHours: 36 },
      { id: 'emp_tom', name: 'Tom Baker', role: 'LPN', color: '#2196f3', maxWeeklyHours: 40 },
      { id: 'emp_avery', name: 'Avery Lee', role: 'LPN', color: '#00bcd4', maxWeeklyHours: 36 },
      { id: 'emp_sarah', name: 'Sarah Nguyen', role: 'CNA', color: '#8bc34a', maxWeeklyHours: 40 },
      { id: 'emp_linda', name: 'Linda Brooks', role: 'CNA', color: '#ff9800', maxWeeklyHours: 40 },
      { id: 'emp_mike', name: 'Mike Johnson', role: 'Night Nurse', color: '#607d8b', maxWeeklyHours: 32 },
    ];

    const shifts: Shift[] = [];
    const weekStart = this._getMonday(new Date());
    for (let day = 0; day < 7; day++) {
      const isWeekend = day >= 5;
      if (day === 1 || day === 4) {
        // Tuesday and Friday are understaffed in the morning
        shifts.push(
          { id: `shift_nursing_emma_day_${day}`, employeeId: 'emp_emma', day, startTime: '07:00', endTime: '15:00', notes: 'Morning med rounds and care planning' },
        );
      } else if (day === 2) {
        // Wednesday has extra RN coverage
        shifts.push(
          { id: `shift_nursing_emma_day_${day}`, employeeId: 'emp_emma', day, startTime: '07:00', endTime: '15:00', notes: 'Morning med rounds and care planning' },
          { id: `shift_nursing_nora_day_${day}`, employeeId: 'emp_nora', day, startTime: '07:00', endTime: '15:00', notes: 'Assist with medication review and admissions' },
          { id: `shift_nursing_sarah_day_${day}`, employeeId: 'emp_sarah', day, startTime: '07:00', endTime: '15:00', notes: 'Resident hygiene and activity support' },
        );
      } else {
        shifts.push(
          { id: `shift_nursing_emma_day_${day}`, employeeId: 'emp_emma', day, startTime: '07:00', endTime: '15:00', notes: 'Morning med rounds and care planning' },
          { id: `shift_nursing_nora_day_${day}`, employeeId: 'emp_nora', day, startTime: '07:00', endTime: '15:00', notes: 'Assist with medication review and admissions' },
          { id: `shift_nursing_sarah_day_${day}`, employeeId: 'emp_sarah', day, startTime: '07:00', endTime: '15:00', notes: 'Resident hygiene and activity support' },
        );
      }

      if (day === 3) {
        // Thursday has extra evening support
        shifts.push(
          { id: `shift_nursing_tom_day_${day}`, employeeId: 'emp_tom', day, startTime: '15:00', endTime: '23:00', notes: 'Evening medication checks and resident support' },
          { id: `shift_nursing_avery_day_${day}`, employeeId: 'emp_avery', day, startTime: '15:00', endTime: '23:00', notes: 'Dinner support and rest rounds' },
          { id: `shift_nursing_linda_day_${day}`, employeeId: 'emp_linda', day, startTime: '15:00', endTime: '23:00', notes: 'Assists with quiet hours and resident comfort' },
        );
      } else if (day === 4) {
        // Friday is short one evening RN/LPN staff
        shifts.push(
          { id: `shift_nursing_tom_day_${day}`, employeeId: 'emp_tom', day, startTime: '15:00', endTime: '23:00', notes: 'Evening medication checks and resident support' },
        );
      } else {
        shifts.push(
          { id: `shift_nursing_tom_day_${day}`, employeeId: 'emp_tom', day, startTime: '15:00', endTime: '23:00', notes: 'Evening medication checks and resident support' },
          { id: `shift_nursing_avery_day_${day}`, employeeId: 'emp_avery', day, startTime: '15:00', endTime: '23:00', notes: 'Dinner support and rest rounds' },
        );
      }

      shifts.push({ id: `shift_nursing_mike_day_${day}`, employeeId: 'emp_mike', day, startTime: '23:00', endTime: '07:00', notes: 'Night coverage and safety checks' });
    }

    const demo: Schedule = {
      id: this._generateId(),
      name: 'Nursing Facility Demo',
      mode: 'workplace',
      weekStartDate: weekStart,
      shifts,
      employees,
      coverageRequirements: {
        enabled: true,
        mode: 'time-based',
        dayRequirements: Array.from({ length: 7 }, (_, day) => ({
          day,
          timeSlots: [
            { startTime: '07:00', endTime: '15:00', minStaff: 3, requiredRole: 'RN' },
            { startTime: '15:00', endTime: '23:00', minStaff: 2, requiredRole: 'LPN' },
            { startTime: '23:00', endTime: '07:00', minStaff: 1, requiredRole: 'Night Nurse' },
          ]
        }))
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const aiNotes: Record<string, string> = {
      emp_emma: 'Experienced RN. Handles admissions and medication review. Prefers daytime shifts.',
      emp_tom: 'Great with evening handoffs and resident charting.',
      emp_sarah: 'Strong resident engagement and morning care routines.',
      emp_linda: 'Excellent at evening resident support and dinner prep.',
      emp_mike: 'Prefers overnight shifts and handles quiet-hour safety rounds.',
    };

    return { schedule: demo, employees, aiNotes };
  }

  openHelpDialog(): void {
    this.dialog.open(HelpDialogComponent, {
      width: '700px',
      maxWidth: '95vw'
    });
  }

  openPrintDialog(): void {
    if (!this.currentSchedule()) return;
    this._router.navigate(['/print'], { queryParams: { week: this.weekStartDate() } });
  }

  exportData(): void {
    const payload = this.localStorageService.exportAppData();
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `leaveat-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.snackBar.open('Data exported as JSON', 'Close', { duration: 3000 });
  }

  triggerDataImport(): void {
    this.dataImportInput?.nativeElement.click();
  }

  async handleDataImport(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    try {
      const raw = await file.text();
      this.localStorageService.importAppData(raw);
      this._refreshAllSchedules();
      this.currentSchedule.set(this.localStorageService.getCurrentSchedule());
      this.shifts.set(this.currentSchedule()?.shifts ?? []);
      this.employees.set(this.localStorageService.getEmployees());
      this.weekStartDate.set(this._getMonday(new Date()));
      this.updateWeekDateRange();
      this.snackBar.open('Data imported successfully', 'Close', { duration: 3000 });
    } catch (error) {
      console.error(error);
      this.snackBar.open('Import failed: invalid file', 'Close', { duration: 5000 });
    }
  }

  openCoverageDialog(): void {
    if (!this.currentSchedule()) return;
    this._router.navigate(['/coverage']);
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

  previousDay(): void {
    this.selectedDay.set((this.selectedDay() + 6) % 7);
  }

  nextDay(): void {
    this.selectedDay.set((this.selectedDay() + 1) % 7);
  }

  thisWeek(): void {
    this._navigateToWeek(this._getMonday(new Date()));
    if (this.viewMode() === 'day') {
      this.selectedDay.set(this._getTodayIndexInWeek(this._getMonday(new Date())));
    }
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

  private _getTodayIndexInWeek(weekStr: string): number {
    const weekStart = new Date(weekStr + 'T00:00:00');
    const today = new Date();
    const diff = Math.floor((today.getTime() - weekStart.getTime()) / 86400000);
    if (diff >= 0 && diff < 7) return diff;
    return 0;
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

  openAiScheduler(): void {
    if (this.employees().length === 0) {
      this.snackBar.open('Add employees before using AI scheduling', 'Close', { duration: 4000 });
      return;
    }
    this._router.navigate(['/ai'], { queryParams: { week: this.weekStartDate() } });
  }

  private _applyAiShifts(result: AiSchedulerDialogResult): void {
    if (!result.accepted) return;
    const week = this.weekStartDate();
    const newShifts = result.shifts.map(s => ({
      ...s,
      id: s.id ?? `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      weekStartDate: week,
    }));
    const otherWeeks = this.shifts().filter(s => s.weekStartDate !== week);
    this.shifts.set([...otherWeeks, ...newShifts]);
    this._saveSchedule();
    this.snackBar.open(`${newShifts.length} AI-generated shift${newShifts.length === 1 ? '' : 's'} applied`, 'Close', { duration: 4000 });
  }

  private _generateId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _generateShiftId(): string {
    return `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
