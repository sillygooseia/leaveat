import { Component, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EmployeeService } from '../../services';
import { Employee, Shift } from '../../models';
import { EmployeeDialogComponent } from '../employee-dialog/employee-dialog';
import { calculateWeeklyHours, getOvertimeStatus, formatHours } from '../../utils/schedule-helpers';

@Component({
  selector: 'app-employee-management',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  templateUrl: './employee-management.html',
  styleUrls: ['./employee-management.css']
})
export class EmployeeManagementComponent {
  // Input from parent schedule component
  shifts = input<Shift[]>([]);
  mode = input<'workplace' | 'family' | 'personal'>('workplace');
  weekStartDate = input<string>('');

  // Fired whenever employees are added, edited, or deleted so the parent can re-sync
  employeesChanged = output<void>();

  employees = signal<Employee[]>([]);
  draggingEmployeeId = signal<string | null>(null);

  constructor(
    private employeeService: EmployeeService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.loadEmployees();
  }

  loadEmployees(): void {
    this.employees.set(this.employeeService.getEmployees());
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(EmployeeDialogComponent, {
      width: 'min(480px, 95vw)',
      data: { employee: null, mode: this.mode() }
    });

    dialogRef.afterClosed().subscribe((result: Employee | null) => {
      if (result) {
        this.loadEmployees();
        this.employeesChanged.emit();
        const label = this.mode() === 'family' ? 'Member' : 'Employee';
        this.snackBar.open(`${label} "${result.name}" added`, 'Close', { duration: 3000 });
      }
    });
  }

  openEditDialog(employee: Employee): void {
    const dialogRef = this.dialog.open(EmployeeDialogComponent, {
      width: 'min(480px, 95vw)',
      data: { employee, mode: this.mode() }
    });

    dialogRef.afterClosed().subscribe((result: Employee | null) => {
      if (result) {
        this.loadEmployees();
        this.employeesChanged.emit();
        const label = this.mode() === 'family' ? 'Member' : 'Employee';
        this.snackBar.open(`${label} "${result.name}" updated`, 'Close', { duration: 3000 });
      }
    });
  }

  onDragStart(event: DragEvent, employee: Employee): void {
    event.dataTransfer!.setData('employeeId', employee.id);
    event.dataTransfer!.effectAllowed = 'copy';
    this.draggingEmployeeId.set(employee.id);
  }

  onDragEnd(): void {
    this.draggingEmployeeId.set(null);
  }

  deleteEmployee(employee: Employee): void {
    const label = this.mode() === 'family' ? 'member' : 'employee';
    if (confirm(`Delete ${label} "${employee.name}"?`)) {
      this.employeeService.deleteEmployee(employee.id);
      this.loadEmployees();
      this.employeesChanged.emit();
      const labelCap = this.mode() === 'family' ? 'Member' : 'Employee';
      this.snackBar.open(`${labelCap} "${employee.name}" deleted`, 'Close', { duration: 3000 });
    }
  }

  /**
   * Calculate weekly hours for an employee (scoped to active week)
   */
  getEmployeeHours(employeeId: string): number {
    const week = this.weekStartDate();
    const shifts = week
      ? this.shifts().filter(s => s.weekStartDate === week)
      : this.shifts();
    return calculateWeeklyHours(shifts, employeeId);
  }

  /**
   * Get formatted hours string for display
   */
  getFormattedHours(employeeId: string): string {
    const hours = this.getEmployeeHours(employeeId);
    return formatHours(hours);
  }

  /**
   * Get overtime status for color coding
   */
  getHoursStatus(employee: Employee): 'under' | 'warning' | 'over' {
    const hours = this.getEmployeeHours(employee.id);
    return getOvertimeStatus(hours, employee.maxWeeklyHours);
  }

  /**
   * Get hours status class for styling
   */
  getHoursClass(employee: Employee): string {
    const status = this.getHoursStatus(employee);
    return `hours-${status}`;
  }

  /**
   * Get tooltip text for hours column
   */
  getHoursTooltip(employee: Employee): string {
    const hours = this.getEmployeeHours(employee.id);
    const limit = employee.maxWeeklyHours || 40;
    const status = this.getHoursStatus(employee);
    
    if (status === 'over') {
      return `Over limit by ${(hours - limit).toFixed(1)} hours`;
    } else if (status === 'warning') {
      return `Approaching limit (${limit}h)`;
    }
    return `${hours.toFixed(1)} hours this week`;
  }
}
