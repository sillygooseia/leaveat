import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { EmployeeService } from '../../services';
import { AiScheduleService } from '../../services/ai-schedule.service';
import { Employee } from '../../models';

@Component({
  selector: 'app-employee-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  templateUrl: './employee-dialog.html',
  styleUrls: ['./employee-dialog.css']
})
export class EmployeeDialogComponent {
  isEditMode: boolean;
  name = signal('');
  role = signal('');
  color = signal('');
  maxWeeklyHours = signal<number | undefined>(undefined);
  aiNote = signal('');

  colors = [
    { hex: '#3f51b5', name: 'Indigo' },
    { hex: '#2196f3', name: 'Blue' },
    { hex: '#00bcd4', name: 'Cyan' },
    { hex: '#4caf50', name: 'Green' },
    { hex: '#8bc34a', name: 'Light Green' },
    { hex: '#ff9800', name: 'Orange' },
    { hex: '#ff5722', name: 'Deep Orange' },
    { hex: '#f44336', name: 'Red' },
    { hex: '#e91e63', name: 'Pink' },
    { hex: '#9c27b0', name: 'Purple' },
    { hex: '#607d8b', name: 'Blue Grey' },
    { hex: '#795548', name: 'Brown' },
  ];

  constructor(
    private dialogRef: MatDialogRef<EmployeeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { employee: Employee | null; mode: 'workplace' | 'family' },
    private employeeService: EmployeeService,
    private aiService: AiScheduleService,
  ) {
    this.isEditMode = !!data.employee;

    if (data.employee) {
      this.name.set(data.employee.name);
      this.role.set(data.employee.role);
      this.color.set(data.employee.color);
      this.maxWeeklyHours.set(data.employee.maxWeeklyHours);
      this.aiNote.set(this.aiService.getNotesMap()[data.employee.id] ?? '');
    } else {
      this.color.set(this.employeeService.getDefaultColor());
    }
  }

  get personLabel(): string {
    return this.data.mode === 'family' ? 'Member' : 'Employee';
  }

  get isValid(): boolean {
    return !!this.name().trim() && !!this.role().trim() && !!this.color();
  }

  get isNameUnique(): boolean {
    return this.employeeService.isNameUnique(this.name(), this.data.employee?.id);
  }

  save(): void {
    if (!this.isValid || !this.isNameUnique) return;

    if (this.isEditMode && this.data.employee) {
      const updated = this.employeeService.updateEmployee(this.data.employee.id, {
        name: this.name(),
        role: this.role(),
        color: this.color(),
        maxWeeklyHours: this.maxWeeklyHours() || undefined,
      });
      this.aiService.setNote(this.data.employee.id, this.aiNote().trim());
      this.dialogRef.close(updated);
    } else {
      const newEmployee = this.employeeService.addEmployee({
        name: this.name(),
        role: this.role(),
        color: this.color(),
        maxWeeklyHours: this.maxWeeklyHours() || undefined,
      });
      if (this.aiNote().trim()) {
        this.aiService.setNote(newEmployee.id, this.aiNote().trim());
      }
      this.dialogRef.close(newEmployee);
    }
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
