import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { RegisteredAccessService, MyScheduleData } from '../../services/registered-access.service';
import { LocalStorageService, ViewerAccess } from '../../services/local-storage.service';
import { Shift, Employee, ActivityEvent } from '../../models';

type PageError = 'no-access' | 'revoked' | 'failed' | null;

@Component({
  selector: 'app-my-schedule',
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
  ],
  templateUrl: './my-schedule.html',
  styleUrls: ['./my-schedule.css'],
})
export class MyScheduleComponent implements OnInit {
  loading = signal(true);
  error = signal<PageError>(null);
  scheduleData = signal<MyScheduleData | null>(null);
  activities = signal<ActivityEvent[]>([]);
  claimingEventId = signal<string | null>(null);

  /** All registrations stored on this device, newest first. */
  allRegistrations = signal<ViewerAccess[]>([]);
  /** The registration currently being viewed. */
  activeAccess = signal<ViewerAccess | null>(null);

  dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  daysOfWeek = [0, 1, 2, 3, 4, 5, 6];

  displayedEmployees = computed(() => {
    const data = this.scheduleData();
    if (!data) return [];
    if (data.visibility === 'all') return data.scheduleData.employees;
    return data.scheduleData.employees.filter(e => e.name === data.memberName);
  });

  constructor(
    private registeredAccess: RegisteredAccessService,
    private localStorageService: LocalStorageService
  ) {}

  async ngOnInit(): Promise<void> {
    const all = this.localStorageService.getAllViewerAccess();
    this.allRegistrations.set(all);

    if (all.length === 0) {
      this.error.set('no-access');
      this.loading.set(false);
      return;
    }

    await this._loadAccess(all[0]);
  }

  /** Switch the viewed schedule to a different registered device access. */
  async switchTo(access: ViewerAccess): Promise<void> {
    if (this.activeAccess()?.accessTokenId === access.accessTokenId) return;
    this.loading.set(true);
    this.error.set(null);
    this.scheduleData.set(null);
    this.activities.set([]);
    await this._loadAccess(access);
  }

  private async _loadAccess(access: ViewerAccess): Promise<void> {
    this.activeAccess.set(access);
    try {
      const [scheduleResult, eventsResult] = await Promise.allSettled([
        this.registeredAccess.getMySchedule(access.accessTokenId),
        this.registeredAccess.getMemberEvents(access.accessTokenId),
      ]);

      if (scheduleResult.status === 'fulfilled') {
        this.scheduleData.set(scheduleResult.value);
        this.localStorageService.setViewerCache(access.accessTokenId, scheduleResult.value);
      } else {
        throw scheduleResult.reason;
      }

      if (eventsResult.status === 'fulfilled') {
        this.activities.set(eventsResult.value.events);
      }
      // Activities failing is non-fatal — schedule still shows
    } catch (err: any) {
      if (err?.status === 401) {
        this.error.set('revoked');
        this.localStorageService.removeViewerAccess(access.accessTokenId);
        this.allRegistrations.set(this.localStorageService.getAllViewerAccess());
      } else {
        const cached = this.localStorageService.getViewerCache(access.accessTokenId);
        if (cached) {
          this.scheduleData.set(cached);
        } else {
          this.error.set('failed');
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  getShiftsForDay(day: number): Shift[] {
    const data = this.scheduleData();
    if (!data) return [];

    let shifts = data.scheduleData.shifts.filter(s => s.day === day);

    if (data.visibility === 'own') {
      const myEmployees = data.scheduleData.employees
        .filter(e => e.name === data.memberName)
        .map(e => e.id);
      shifts = shifts.filter(s => myEmployees.includes(s.employeeId));
    }

    return shifts.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  getEmployee(employeeId: string): Employee | undefined {
    return this.scheduleData()?.scheduleData.employees.find(e => e.id === employeeId);
  }

  // ─── Activities ───────────────────────────────────────────────────────────

  upcomingActivities = computed(() =>
    this.activities()
      .filter(a => new Date(a.endAt) >= new Date())
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  );

  isMyClaim(event: ActivityEvent, slotId: string): boolean {
    const access = this.activeAccess();
    if (!access) return false;
    const slot = event.volunteers.find(v => v.id === slotId);
    return slot?.tokenId === access.accessTokenId;
  }

  async claim(event: ActivityEvent, slotId: string): Promise<void> {
    const access = this.activeAccess();
    if (!access || this.claimingEventId()) return;
    this.claimingEventId.set(event.id);
    try {
      const updated = await this.registeredAccess.claimEventSlot(event.id, access.accessTokenId, slotId);
      this.activities.set(this.activities().map(a => a.id === updated.id ? updated : a));
    } catch (err) {
      console.error('[my-schedule] Claim failed:', err);
    } finally {
      this.claimingEventId.set(null);
    }
  }

  async unclaim(event: ActivityEvent, slotId: string): Promise<void> {
    const access = this.activeAccess();
    if (!access || this.claimingEventId()) return;
    this.claimingEventId.set(event.id);
    try {
      const updated = await this.registeredAccess.unclaimEventSlot(event.id, access.accessTokenId, slotId);
      this.activities.set(this.activities().map(a => a.id === updated.id ? updated : a));
    } catch (err) {
      console.error('[my-schedule] Unclaim failed:', err);
    } finally {
      this.claimingEventId.set(null);
    }
  }

  activityIcon(type: string): string {
    const icons: Record<string, string> = {
      sports: 'sports_soccer', school: 'school', music: 'music_note',
      medical: 'local_hospital', social: 'people', activity: 'event',
    };
    return icons[type] ?? 'event';
  }

  get memberLabel(): string {
    const mode = this.scheduleData()?.mode;
    if (mode === 'family') return 'member';
    if (mode === 'personal') return 'person';
    return 'employee';
  }
}
