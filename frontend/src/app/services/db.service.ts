import { Injectable, signal } from '@angular/core';
import { IdbDatabase } from '@bafgo/core/browser/idb';
import { Schedule, Employee } from '../models';
import { ViewerAccess } from './local-storage.service';

/**
 * DbService — IndexedDB-backed reactive data store for LeaveAt.
 *
 * Loads all app data into signals on open(), providing synchronous reads via
 * Angular signals while persisting to IndexedDB asynchronously on every write.
 * This allows LocalStorageService to remain a synchronous API with no component
 * changes required.
 *
 * Stores:
 *   schedules    — Schedule objects keyed by id
 *   employees    — Employee objects keyed by id
 *   viewer-access — ViewerAccess objects keyed by accessTokenId
 */
@Injectable({ providedIn: 'root' })
export class DbService {

  private _db = new IdbDatabase('leaveat', 1, [
    { name: 'schedules', keyPath: 'id' },
    { name: 'employees', keyPath: 'id' },
    { name: 'viewer-access', keyPath: 'accessTokenId' },
  ]);

  private _ready = false;

  // ── Reactive signals (read-only publicly) ──────────────────────────────────

  readonly schedules = signal<Schedule[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly viewerAccess = signal<ViewerAccess[]>([]);

  // ── Open ───────────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    if (this._ready) return;
    await this._db.open();

    const [schedules, employees, viewerAccess] = await Promise.all([
      this._db.store<Schedule>('schedules').getAll(),
      this._db.store<Employee>('employees').getAll(),
      this._db.store<ViewerAccess>('viewer-access').getAll(),
    ]);

    this.schedules.set(schedules);
    this.employees.set(employees);
    this.viewerAccess.set(viewerAccess.sort((a: ViewerAccess, b: ViewerAccess) => b.registeredAt - a.registeredAt));
    this._ready = true;
  }

  // ── Schedules ─────────────────────────────────────────────────────────────

  getSchedule(id: string): Schedule | null {
    return this.schedules().find(s => s.id === id) ?? null;
  }

  saveSchedule(schedule: Schedule): void {
    const all = this.schedules();
    const idx = all.findIndex(s => s.id === schedule.id);
    const now = Date.now();
    if (idx >= 0) {
      const item: Schedule = { ...schedule, updatedAt: now };
      this.schedules.set(all.map((s, i) => i === idx ? item : s));
      void this._db.store<Schedule>('schedules').put(item);
    } else {
      const item: Schedule = { ...schedule, createdAt: now, updatedAt: now };
      this.schedules.set([...all, item]);
      void this._db.store<Schedule>('schedules').put(item);
    }
  }

  deleteSchedule(id: string): void {
    this.schedules.set(this.schedules().filter(s => s.id !== id));
    void this._db.store<Schedule>('schedules').delete(id);
  }

  // ── Employees ─────────────────────────────────────────────────────────────

  saveEmployees(employees: Employee[]): void {
    this.employees.set(employees);
    const store = this._db.store<Employee>('employees');
    void store.clear().then(() => {
      for (const e of employees) void store.put(e);
    });
  }

  clearEmployees(): void {
    this.employees.set([]);
    void this._db.store<Employee>('employees').clear();
  }

  // ── Viewer Access ─────────────────────────────────────────────────────────

  addViewerAccess(data: ViewerAccess): void {
    const filtered = this.viewerAccess().filter(v => v.accessTokenId !== data.accessTokenId);
    const updated = [...filtered, data].sort((a, b) => b.registeredAt - a.registeredAt);
    this.viewerAccess.set(updated);
    void this._db.store<ViewerAccess>('viewer-access').put(data);
  }

  removeViewerAccess(accessTokenId: string): void {
    this.viewerAccess.set(this.viewerAccess().filter(v => v.accessTokenId !== accessTokenId));
    void this._db.store<ViewerAccess>('viewer-access').delete(accessTokenId);
  }

  clearViewerAccess(): void {
    this.viewerAccess.set([]);
    void this._db.store<ViewerAccess>('viewer-access').clear();
  }
}
