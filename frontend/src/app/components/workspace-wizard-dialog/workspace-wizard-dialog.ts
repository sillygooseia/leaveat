import { Component, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

export interface WorkspaceWizardResult {
  name: string;
  mode: 'workplace' | 'family' | 'personal';
}

export interface WorkspaceWizardData {
  isFirst: boolean;
}

@Component({
  selector: 'app-workspace-wizard-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule
  ],
  templateUrl: './workspace-wizard-dialog.html',
  styleUrls: ['./workspace-wizard-dialog.css']
})
export class WorkspaceWizardDialogComponent {
  step = signal(0);
  selectedMode = signal<'workplace' | 'family' | 'personal' | null>(null);
  scheduleName = signal('');

  get isFirst(): boolean {
    return this.data?.isFirst ?? true;
  }

  get modePlaceholder(): string {
    if (this.selectedMode() === 'family') return 'Family Schedule';
    if (this.selectedMode() === 'personal') return 'My Personal Schedule';
    return 'My Business';
  }

  get finalName(): string {
    return this.scheduleName().trim() || this.modePlaceholder;
  }

  constructor(
    private dialogRef: MatDialogRef<WorkspaceWizardDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: WorkspaceWizardData
  ) {}

  selectMode(mode: 'workplace' | 'family' | 'personal'): void {
    this.selectedMode.set(mode);
  }

  goToName(): void {
    if (!this.selectedMode()) return;
    this.step.set(1);
  }

  goToDone(): void {
    this.step.set(2);
  }

  finish(): void {
    this.dialogRef.close({
      name: this.finalName,
      mode: this.selectedMode()!
    } as WorkspaceWizardResult);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
