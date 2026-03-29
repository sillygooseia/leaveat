import { Component, Inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import {
  CoverageRequirements, COVERAGE_TEMPLATES,
  CoverageTimeSlot, DayCoverageRequirement, RoomDefinition
} from '../../models';

export interface CoverageDialogData {
  requirements: CoverageRequirements | null;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

@Component({
  selector: 'app-coverage-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatRadioModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule
  ],
  templateUrl: './coverage-dialog.html',
  styleUrls: ['./coverage-dialog.css']
})
export class CoverageDialogComponent {
  enabled = signal(false);
  mode = signal<'simple' | 'time-based' | 'room-ratio'>('simple');
  simpleMinStaff = signal(2);
  dayRequirements = signal<DayCoverageRequirement[]>(
    ALL_DAYS.map(day => ({ day, timeSlots: [] }))
  );
  rooms = signal<RoomDefinition[]>([]);

  templates = COVERAGE_TEMPLATES;
  allDays = ALL_DAYS;
  dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  constructor(
    private dialogRef: MatDialogRef<CoverageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CoverageDialogData
  ) {
    if (data.requirements) {
      const req = data.requirements;
      this.enabled.set(req.enabled);
      this.mode.set(req.mode);
      if (req.simpleMinStaff !== undefined) {
        this.simpleMinStaff.set(req.simpleMinStaff);
      }
      if (req.dayRequirements) {
        this.dayRequirements.set(
          ALL_DAYS.map(day => {
            const existing = req.dayRequirements!.find(d => d.day === day);
            return existing
              ? { day, timeSlots: existing.timeSlots.map(s => ({ ...s })) }
              : { day, timeSlots: [] };
          })
        );
      }
      if (req.rooms) {
        this.rooms.set(req.rooms.map(r => ({ ...r })));
      }
    }
  }

  // ==================== Template Application ====================

  applyTemplate(templateId: string): void {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) return;
    const req = template.requirements;
    this.enabled.set(req.enabled);
    this.mode.set(req.mode);
    if (req.simpleMinStaff !== undefined) {
      this.simpleMinStaff.set(req.simpleMinStaff);
    }
    if (req.dayRequirements) {
      this.dayRequirements.set(
        ALL_DAYS.map(day => {
          const saved = req.dayRequirements!.find(d => d.day === day);
          return saved
            ? { day, timeSlots: saved.timeSlots.map(s => ({ ...s })) }
            : { day, timeSlots: [] };
        })
      );
    }
    if (req.rooms) {
      this.rooms.set(req.rooms.map(r => ({ ...r })));
    }
  }

  // ==================== Time-based Helpers ====================

  getSlotsForDay(day: number): CoverageTimeSlot[] {
    return this.dayRequirements().find(d => d.day === day)?.timeSlots ?? [];
  }

  addTimeSlot(day: number): void {
    this.dayRequirements.update(days =>
      days.map(d => d.day === day
        ? { ...d, timeSlots: [...d.timeSlots, { startTime: '09:00', endTime: '17:00', minStaff: 2 }] }
        : d
      )
    );
  }

  removeTimeSlot(day: number, index: number): void {
    this.dayRequirements.update(days =>
      days.map(d => d.day === day
        ? { ...d, timeSlots: d.timeSlots.filter((_, i) => i !== index) }
        : d
      )
    );
  }

  updateSlotField(day: number, index: number, field: 'startTime' | 'endTime', value: string): void {
    this.dayRequirements.update(days =>
      days.map(d => d.day === day
        ? { ...d, timeSlots: d.timeSlots.map((s, i) => i === index ? { ...s, [field]: value } : s) }
        : d
      )
    );
  }

  updateSlotMinStaff(day: number, index: number, value: number): void {
    this.dayRequirements.update(days =>
      days.map(d => d.day === day
        ? { ...d, timeSlots: d.timeSlots.map((s, i) => i === index ? { ...s, minStaff: value } : s) }
        : d
      )
    );
  }

  // ==================== Room-ratio Helpers ====================

  addRoom(): void {
    const newRoom: RoomDefinition = {
      id: `room_${Date.now()}`,
      name: 'New Room',
      ageGroup: '',
      capacity: 10,
      ratioStaff: 1,
      ratioChildren: 6
    };
    this.rooms.update(rs => [...rs, newRoom]);
  }

  removeRoom(id: string): void {
    this.rooms.update(rs => rs.filter(r => r.id !== id));
  }

  updateRoomField(id: string, field: keyof RoomDefinition, value: any): void {
    this.rooms.update(rs =>
      rs.map(r => r.id === id ? { ...r, [field]: value } : r)
    );
  }

  calcRoomMinStaff(room: RoomDefinition): number {
    if (!room.capacity || !room.ratioChildren) return 0;
    return Math.ceil(room.capacity / room.ratioChildren) * (room.ratioStaff || 1);
  }

  totalRoomsRequired = computed(() =>
    this.rooms().reduce((sum, r) => sum + this.calcRoomMinStaff(r), 0)
  );

  // ==================== Save / Cancel ====================

  save(): void {
    if (!this.enabled()) {
      this.dialogRef.close({ enabled: false, mode: 'simple' } as CoverageRequirements);
      return;
    }

    const requirements: CoverageRequirements = {
      enabled: true,
      mode: this.mode()
    };

    if (this.mode() === 'simple') {
      requirements.simpleMinStaff = this.simpleMinStaff();
    } else if (this.mode() === 'time-based') {
      requirements.dayRequirements = this.dayRequirements().filter(d => d.timeSlots.length > 0);
    } else if (this.mode() === 'room-ratio') {
      requirements.rooms = this.rooms();
    }

    this.dialogRef.close(requirements);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  disable(): void {
    this.enabled.set(false);
    this.save();
  }
}

