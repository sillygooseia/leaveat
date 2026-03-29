import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ActivityEvent, ACTIVITY_TYPES } from '../../models';

export interface ActivityDialogData {
  event: ActivityEvent | null; // null = create mode
  familyMembers: string[];     // Participant name suggestions (from employee list)
  defaultDate?: string;        // YYYY-MM-DD pre-fill for create mode (when opening from a day column)
}

export interface ActivityDialogResult {
  title: string;
  activityType: string;
  location: string;
  startAt: string;
  endAt: string;
  participants: string[];
  notes: string;
  slots: { id: string; label: string }[];
  deleted?: boolean;
}

@Component({
  selector: 'app-activity-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatChipsModule,
  ],
  templateUrl: './activity-dialog.html',
  styleUrls: ['./activity-dialog.css'],
})
export class ActivityDialogComponent {
  isEditMode: boolean;
  activityTypes = ACTIVITY_TYPES;
  readonly QUICK_DURATIONS = [30, 60, 120];

  title = signal('');
  activityType = signal('activity');
  location = signal('');
  startAt = signal('');
  endAt = signal('');
  participants = signal<string[]>([]);
  notes = signal('');
  slots = signal<{ id: string; label: string }[]>([
    { id: crypto.randomUUID(), label: 'Driver' },
    { id: crypto.randomUUID(), label: 'Pick up' },
  ]);
  activeDuration = signal<number | null>(60); // minutes; null = manual end time

  participantInput = '';
  newSlotLabel = '';

  constructor(
    private dialogRef: MatDialogRef<ActivityDialogComponent, ActivityDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: ActivityDialogData
  ) {
    this.isEditMode = !!data.event;
    if (data.event) {
      const e = data.event;
      this.title.set(e.title);
      this.activityType.set(e.activityType || 'activity');
      this.location.set(e.location || '');
      this.startAt.set(this._toLocalDateTimeInput(e.startAt));
      this.endAt.set(this._toLocalDateTimeInput(e.endAt));
      this.participants.set([...e.participants]);
      this.notes.set(e.notes || '');
      // Load slots from existing volunteers (preserve stable IDs)
      this.slots.set(e.volunteers.map(v => ({ id: v.id, label: v.label })));
      // Detect duration for quick-pick highlighting
      const diffMs = new Date(e.endAt).getTime() - new Date(e.startAt).getTime();
      const diffMin = Math.round(diffMs / 60000);
      this.activeDuration.set(this.QUICK_DURATIONS.includes(diffMin) ? diffMin : null);
    } else if (data.defaultDate) {
      // Pre-fill start/end from the clicked day column (9 AM default, 1-hour duration)
      this.startAt.set(data.defaultDate + 'T09:00');
      const end = new Date(data.defaultDate + 'T09:00:00');
      end.setMinutes(end.getMinutes() + 60);
      this.endAt.set(this._toLocalDateTimeInput(end.toISOString()));
    }
  }

  // ─── Date / Duration ───────────────────────────────────────────────────────

  onStartChange(value: string): void {
    this.startAt.set(value);
    if (this.activeDuration() !== null && value) {
      const start = new Date(value);
      if (!isNaN(start.getTime())) {
        const end = new Date(start.getTime() + this.activeDuration()! * 60000);
        this.endAt.set(this._toLocalDateTimeInput(end.toISOString()));
      }
    }
  }

  setDuration(mins: number): void {
    this.activeDuration.set(mins);
    if (this.startAt()) {
      const start = new Date(this.startAt());
      if (!isNaN(start.getTime())) {
        const end = new Date(start.getTime() + mins * 60000);
        this.endAt.set(this._toLocalDateTimeInput(end.toISOString()));
      }
    }
  }

  onEndChange(value: string): void {
    this.endAt.set(value);
    this.activeDuration.set(null); // user manually set end time
  }

  durationLabel(mins: number): string {
    if (mins < 60) return `${mins} min`;
    if (mins === 60) return '1 hr';
    return `${mins / 60} hr`;
  }

  // ─── Participants ──────────────────────────────────────────────────────────

  addParticipant(name: string): void {
    const trimmed = name.trim();
    if (trimmed && !this.participants().includes(trimmed)) {
      this.participants.set([...this.participants(), trimmed]);
    }
    this.participantInput = '';
  }

  removeParticipant(name: string): void {
    this.participants.set(this.participants().filter(p => p !== name));
  }

  onParticipantKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addParticipant(this.participantInput);
    }
  }

  // ─── Volunteer Slots ───────────────────────────────────────────────────────

  addSlot(): void {
    const label = this.newSlotLabel.trim();
    if (!label) return;
    this.slots.set([...this.slots(), { id: crypto.randomUUID(), label }]);
    this.newSlotLabel = '';
  }

  removeSlot(id: string): void {
    this.slots.set(this.slots().filter(s => s.id !== id));
  }

  onSlotKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addSlot();
    }
  }

  // ─── Save / Cancel / Delete ────────────────────────────────────────────────

  isValid(): boolean {
    return !!(this.title().trim() && this.startAt() && this.endAt());
  }

  save(): void {
    if (!this.isValid()) return;
    this.dialogRef.close({
      title:        this.title().trim(),
      activityType: this.activityType(),
      location:     this.location().trim(),
      startAt:      new Date(this.startAt()).toISOString(),
      endAt:        new Date(this.endAt()).toISOString(),
      participants: this.participants(),
      notes:        this.notes().trim(),
      slots:        this.slots(),
    });
  }

  delete(): void {
    this.dialogRef.close({ deleted: true } as ActivityDialogResult);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private _toLocalDateTimeInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
