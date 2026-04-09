import { Injectable, inject } from '@angular/core';
import { Schedule, Employee } from '../models';
import { LicenseService } from './license.service';
import { DbService } from './db.service';

export const FREE_SCHEDULE_LIMIT = 1;

export interface ViewerAccess {
  accessTokenId: string;
  workspaceName: string;
  memberName: string;
  mode: 'workplace' | 'family' | 'personal';
  visibility: 'own' | 'all';
  registeredAt: number;
}

/**
 * LocalStorageService â€” synchronous data API for LeaveAt.
 *
 * Data (schedules, employees, viewer-access) is now backed by IndexedDB via
 * DbService, loaded eagerly into signals on app init. This service reads from
 * those signals so all callers remain synchronous with no code changes.
 *
 * Credentials (license JWT, Hub JWT) and UI preferences (current-schedule-id)
 * stay in localStorage as before.
 */
@Injectable({ providedIn: 'root' })
export class LocalStorageService {

  private licenseService = inject(LicenseService);
  private db = inject(DbService);

  // ==================== Schedules ====================

  getSchedules(): Schedule[] {
    return this.db.schedules();
  }

  isAtScheduleLimit(): boolean {
    return false;
  }

  getScheduleLimit(): number | null {
    return null;
  }

  saveSchedule(schedule: Schedule): void {
    this.db.saveSchedule(schedule);
  }

  deleteSchedule(id: string): void {
    this.db.deleteSchedule(id);
    if (this.getCurrentScheduleId() === id) {
      this.clearCurrentScheduleId();
    }
  }

  clearSchedules(): void {
    this.db.clearSchedules();
    this.clearCurrentScheduleId();
  }

  getSchedule(id: string): Schedule | null {
    return this.db.getSchedule(id);
  }

  // ==================== Current Schedule ====================

  getCurrentScheduleId(): string | null {
    return localStorage.getItem('leaveat:current-schedule-id');
  }

  setCurrentScheduleId(id: string): void {
    localStorage.setItem('leaveat:current-schedule-id', id);
  }

  clearCurrentScheduleId(): void {
    localStorage.removeItem('leaveat:current-schedule-id');
  }

  getCurrentSchedule(): Schedule | null {
    const id = this.getCurrentScheduleId();
    return id ? this.db.getSchedule(id) : null;
  }

  // ==================== Employees ====================

  getEmployees(): Employee[] {
    return this.db.employees();
  }

  saveEmployees(employees: Employee[]): void {
    this.db.saveEmployees(employees);
  }

  exportAppData(): string {
    const payload = {
      schema: 'leaveat-export',
      version: 1,
      exportedAt: Date.now(),
      currentScheduleId: this.getCurrentScheduleId(),
      schedules: this.getSchedules(),
      employees: this.getEmployees(),
      aiNotes: this.getAiNotes(),
    } as const;

    return JSON.stringify(payload, null, 2);
  }

  importAppData(raw: string): void {
    let payload: {
      schema: string;
      version: number;
      currentScheduleId: string | null;
      schedules: Schedule[];
      employees: Employee[];
      aiNotes?: Record<string, string>;
    };

    try {
      payload = JSON.parse(raw);
    } catch (error) {
      throw new Error('Invalid JSON file');
    }

    if (payload?.schema !== 'leaveat-export' || payload.version !== 1) {
      throw new Error('Unsupported import file format');
    }

    this.clearSchedules();
    this.clearEmployees();
    this.saveEmployees(payload.employees);
    payload.schedules.forEach(schedule => this.saveSchedule(schedule));
    this.setAiNotes(payload.aiNotes ?? {});

    if (payload.currentScheduleId && payload.schedules.some(s => s.id === payload.currentScheduleId)) {
      this.setCurrentScheduleId(payload.currentScheduleId);
    } else if (payload.schedules.length > 0) {
      this.setCurrentScheduleId(payload.schedules[0].id);
    }
  }

  getAiNotes(): Record<string, string> {
    try {
      const raw = localStorage.getItem('leaveat:ai-notes');
      return raw ? JSON.parse(raw) as Record<string, string> : {};
    } catch {
      return {};
    }
  }

  setAiNotes(notes: Record<string, string>): void {
    try {
      localStorage.setItem('leaveat:ai-notes', JSON.stringify(notes));
    } catch {
      // ignore storage failures
    }
  }

  clearEmployees(): void {
    this.db.clearEmployees();
  }

  // ==================== Viewer Access (Registered Member) ====================

  getAllViewerAccess(): ViewerAccess[] {
    return this.db.viewerAccess();
  }

  getViewerAccess(): ViewerAccess | null {
    return this.db.viewerAccess()[0] ?? null;
  }

  addViewerAccess(data: ViewerAccess): void {
    this.db.addViewerAccess(data);
  }

  /** Alias for addViewerAccess. */
  setViewerAccess(data: ViewerAccess): void {
    this.db.addViewerAccess(data);
  }

  removeViewerAccess(accessTokenId: string): void {
    this.db.removeViewerAccess(accessTokenId);
    localStorage.removeItem(`leaveat:viewer-cache:${accessTokenId}`);
  }

  clearViewerAccess(): void {
    this.db.viewerAccess().forEach(v =>
      localStorage.removeItem(`leaveat:viewer-cache:${v.accessTokenId}`)
    );
    this.db.clearViewerAccess();
  }

  // ==================== Viewer Cache (transient â€” stays in localStorage) ====================

  getViewerCache(accessTokenId: string): any | null {
    try {
      const raw = localStorage.getItem(`leaveat:viewer-cache:${accessTokenId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  setViewerCache(accessTokenId: string, data: any): void {
    localStorage.setItem(`leaveat:viewer-cache:${accessTokenId}`, JSON.stringify(data));
  }

  // ==================== Published Workspace IDs (stays in localStorage) ====================

  getPublishedWorkspaceId(scheduleId: string): string | null {
    return localStorage.getItem(`leaveat:published-wid:${scheduleId}`);
  }

  setPublishedWorkspaceId(scheduleId: string, workspaceId: string): void {
    localStorage.setItem(`leaveat:published-wid:${scheduleId}`, workspaceId);
  }

  // ==================== Utility ====================

  clearAll(): void {
    this.db.schedules.set([]);
    this.db.employees.set([]);
    this.db.viewerAccess.set([]);
    // Clear credentials and preferences from localStorage
    ['leaveat:current-schedule-id', 'leaveat:license', 'leaveat:license-public-key', 'leaveat:ai-notes', 'leaveat:ai-draft'].forEach(k =>
      localStorage.removeItem(k)
    );
    console.warn('[LocalStorage] All data cleared');
  }
}
