import { Component, Input, OnChanges, SimpleChanges, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RegisteredAccessService } from '../../services/registered-access.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { ActivityEvent, ACTIVITY_TYPES } from '../../models';
import { ActivityDialogComponent, ActivityDialogData, ActivityDialogResult } from '../activity-dialog/activity-dialog';

@Component({
  selector: 'app-activities-panel',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './activities-panel.html',
  styleUrls: ['./activities-panel.css'],
})
export class ActivitiesPanelComponent implements OnChanges {
  /** The schedule ID — used to look up the published workspaceId. */
  @Input() scheduleId!: string;
  /** Family member names for quick-add suggestions in the dialog. */
  @Input() familyMemberNames: string[] = [];
  /** Emitted whenever the events list changes (load, create, update, delete). */
  @Output() eventsChanged = new EventEmitter<ActivityEvent[]>();

  events = signal<ActivityEvent[]>([]);
  loading = signal(false);
  workspaceId = signal<string | null>(null);

  constructor(
    private registeredAccess: RegisteredAccessService,
    private localStorageService: LocalStorageService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scheduleId']?.currentValue) {
      const wid = this.localStorageService.getPublishedWorkspaceId(this.scheduleId);
      this.workspaceId.set(wid);
      if (wid) {
        this.loadEvents(wid);
      } else {
        this.events.set([]);
      }
    }
  }

  async loadEvents(wid: string): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.registeredAccess.getEvents(wid);
      this.events.set(result);
      this.eventsChanged.emit(result);
    } catch (err) {
      console.error('[activities-panel] Failed to load events:', err);
    } finally {
      this.loading.set(false);
    }
  }

  openCreateDialog(defaultDate?: string): void {
    const wid = this.workspaceId();
    if (!wid) {
      this.snackBar.open('Publish your schedule first to enable activities', 'OK', { duration: 4000 });
      return;
    }

    const dialogRef = this.dialog.open<ActivityDialogComponent, ActivityDialogData, ActivityDialogResult>(
      ActivityDialogComponent,
      {
        width: 'min(700px, 95vw)',
        data: { event: null, familyMembers: this.familyMemberNames, defaultDate },
      }
    );

    dialogRef.afterClosed().subscribe(async result => {
      if (!result || result.deleted) return;
      try {
        const created = await this.registeredAccess.createEvent(wid, {
          ...result,
          slots: result.slots,
        });
        const updated = [...this.events(), created].sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        );
        this.events.set(updated);
        this.eventsChanged.emit(updated);
        this.snackBar.open('Activity added', 'Close', { duration: 2500 });
      } catch (err) {
        this.snackBar.open('Failed to save activity', 'Close', { duration: 3000 });
        console.error('[activities-panel] Create failed:', err);
      }
    });
  }

  openEditDialog(event: ActivityEvent): void {
    const wid = this.workspaceId();
    if (!wid) return;

    const dialogRef = this.dialog.open<ActivityDialogComponent, ActivityDialogData, ActivityDialogResult>(
      ActivityDialogComponent,
      {
        width: 'min(700px, 95vw)',
        data: { event, familyMembers: this.familyMemberNames },
      }
    );

    dialogRef.afterClosed().subscribe(async result => {
      if (!result) return;

      if (result.deleted) {
        try {
          await this.registeredAccess.deleteEvent(wid, event.id);
          const updated = this.events().filter(e => e.id !== event.id);
          this.events.set(updated);
          this.eventsChanged.emit(updated);
          this.snackBar.open('Activity deleted', 'Close', { duration: 2500 });
        } catch (err) {
          this.snackBar.open('Failed to delete activity', 'Close', { duration: 3000 });
        }
        return;
      }

      try {
        const updated = await this.registeredAccess.updateEvent(wid, event.id, result);
        const newList = this.events()
          .map(e => e.id === updated.id ? updated : e)
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        this.events.set(newList);
        this.eventsChanged.emit(newList);
        this.snackBar.open('Activity updated', 'Close', { duration: 2500 });
      } catch (err) {
        this.snackBar.open('Failed to update activity', 'Close', { duration: 3000 });
        console.error('[activities-panel] Update failed:', err);
      }
    });
  }

  activityIcon(type: string): string {
    return ACTIVITY_TYPES.find(t => t.value === type)?.icon ?? 'event';
  }

  upcomingEvents = () => this.events().filter(e => new Date(e.endAt) >= new Date());
  pastEvents    = () => this.events().filter(e => new Date(e.endAt) <  new Date());
}
