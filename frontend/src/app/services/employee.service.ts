import { Injectable, inject } from '@angular/core';
import { Employee } from '../models';
import { LocalStorageService } from './local-storage.service';

/**
 * EmployeeService — manages employee CRUD operations
 * 
 * Stores employee list in localStorage.
 * Provides methods to add, update, delete, and retrieve employees.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeService {

  private localStorageService = inject(LocalStorageService);

  /**
   * Get all employees from localStorage
   */
  getEmployees(): Employee[] {
    return this.localStorageService.getEmployees();
  }

  /**
   * Get a single employee by ID
   */
  getEmployee(id: string): Employee | null {
    return this.getEmployees().find(e => e.id === id) || null;
  }

  /**
   * Add a new employee
   */
  addEmployee(employee: Omit<Employee, 'id'>): Employee {
    const employees = this.getEmployees();
    
    // Generate unique ID
    const newEmployee: Employee = {
      ...employee,
      id: this._generateId()
    };
    
    employees.push(newEmployee);
    this._save(employees);
    
    console.log('[EmployeeService] Employee added:', newEmployee.id);
    return newEmployee;
  }

  /**
   * Update an existing employee
   */
  updateEmployee(id: string, updates: Partial<Omit<Employee, 'id'>>): Employee | null {
    const employees = this.getEmployees();
    const index = employees.findIndex(e => e.id === id);
    
    if (index === -1) {
      console.warn('[EmployeeService] Employee not found:', id);
      return null;
    }
    
    employees[index] = { ...employees[index], ...updates };
    this._save(employees);
    
    console.log('[EmployeeService] Employee updated:', id);
    return employees[index];
  }

  /**
   * Delete an employee
   */
  deleteEmployee(id: string): boolean {
    const employees = this.getEmployees();
    const filtered = employees.filter(e => e.id !== id);
    
    if (filtered.length === employees.length) {
      console.warn('[EmployeeService] Employee not found:', id);
      return false;
    }
    
    this._save(filtered);
    console.log('[EmployeeService] Employee deleted:', id);
    return true;
  }

  /**
   * Check if an employee name is unique
   */
  isNameUnique(name: string, excludeId?: string): boolean {
    const employees = this.getEmployees();
    return !employees.some(e => 
      e.name.toLowerCase() === name.toLowerCase() && e.id !== excludeId
    );
  }

  /**
   * Get default color for new employee (cycles through Material colors)
   */
  getDefaultColor(index?: number): string {
    const colors = [
      '#3f51b5', // Indigo
      '#e91e63', // Pink
      '#9c27b0', // Purple
      '#00bcd4', // Cyan
      '#4caf50', // Green
      '#ff9800', // Orange
      '#f44336', // Red
      '#2196f3', // Blue
      '#8bc34a', // Light Green
      '#ff5722'  // Deep Orange
    ];
    
    const idx = index !== undefined ? index : this.getEmployees().length;
    return colors[idx % colors.length];
  }

  /**
   * Upsert an employee with a known ID (used for sentinel/system employees)
   */
  upsertById(employee: Employee): void {
    const employees = this.getEmployees();
    const idx = employees.findIndex(e => e.id === employee.id);
    if (idx >= 0) {
      employees[idx] = employee;
    } else {
      employees.push(employee);
    }
    this._save(employees);
  }

  clearAll(): void {
    this.localStorageService.clearEmployees();
    console.warn('[EmployeeService] All employees cleared');
  }

  // ==================== Private Methods ====================

  private _save(employees: Employee[]): void {
    this.localStorageService.saveEmployees(employees);
  }

  private _generateId(): string {
    return `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
