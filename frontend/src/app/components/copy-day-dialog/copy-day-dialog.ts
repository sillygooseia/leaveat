import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';

export interface CopyDayResult {
  fromDay: number;
  toDays: number[];
}

@Component({
  selector: 'app-copy-day-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatRadioModule,
    MatIconModule
  ],
  templateUrl: './copy-day-dialog.html',
  styleUrls: ['./copy-day-dialog.css']
})
export class CopyDayDialogComponent {
  fromDay = signal(0); // Monday by default
  selectedDays = signal<Set<number>>(new Set());
  
  dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  constructor(private dialogRef: MatDialogRef<CopyDayDialogComponent>) {}

  toggleDay(day: number): void {
    const current = this.selectedDays();
    if (current.has(day)) {
      current.delete(day);
    } else {
      current.add(day);
    }
    this.selectedDays.set(new Set(current));
  }

  isDaySelected(day: number): boolean {
    return this.selectedDays().has(day);
  }

  isDayDisabled(day: number): boolean {
    return day === this.fromDay();
  }

  get isValid(): boolean {
    return this.selectedDays().size > 0;
  }

  copy(): void {
    if (!this.isValid) return;

    const result: CopyDayResult = {
      fromDay: this.fromDay(),
      toDays: Array.from(this.selectedDays())
    };

    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
