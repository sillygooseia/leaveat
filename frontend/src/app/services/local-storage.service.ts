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
    if (this.licenseService.hasFeature('unlimited_schedules')) return false;
    return this.db.schedules().length >= FREE_SCHEDULE_LIMIT;
  }

  getScheduleLimit(): number | null {
    return this.licenseService.hasFeature('unlimited_schedules') ? null : FREE_SCHEDULE_LIMIT;
  }

  saveSchedule(schedule: Schedule): void {
    const isNew = !this.db.schedules().find(s => s.id === schedule.id);
    if (isNew && !this.licenseService.hasFeature('unlimited_schedules') && this.db.schedules().length >= FREE_SCHEDULE_LIMIT) {
      throw new Error('FREE_TIER_LIMIT');
    }
    this.db.saveSchedule(schedule);
  }

  deleteSchedule(id: string): void {
    this.db.deleteSchedule(id);
    if (this.getCurrentScheduleId() === id) {
      this.clearCurrentScheduleId();
    }
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
    ['leaveat:current-schedule-id', 'leaveat:license', 'leaveat:license-public-key'].forEach(k =>
      localStorage.removeItem(k)
    );
    console.warn('[LocalStorage] All data cleared');
  }
}
