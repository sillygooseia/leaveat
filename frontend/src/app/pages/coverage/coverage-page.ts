import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CoverageDialogComponent, CoverageDialogData } from '../../components/coverage-dialog/coverage-dialog';
import { LocalStorageService } from '../../services/local-storage.service';
import { CoverageRequirements, Schedule } from '../../models';

@Component({
  selector: 'app-coverage-page',
  standalone: true,
  imports: [CoverageDialogComponent, RouterModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="page-wrapper">
      <a mat-button routerLink="/schedule" class="page-back">
        <mat-icon>arrow_back</mat-icon>
        Back to Schedule
      </a>
      <div class="page-content-card">
        <app-coverage-dialog
          [data]="data"
          (result)="onResult($event)"
        />
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; background: #f5f7f6; min-height: 100vh; }
    .page-wrapper {
      max-width: 900px;
      margin: 0 auto;
      padding: 1.5rem 1.5rem 5rem;
    }
    .page-back {
      margin-bottom: 1.5rem;
      display: inline-flex;
      color: #555;
    }
    .page-content-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 8px rgba(0,0,0,0.08);
      padding: 2rem;
    }
    @media (max-width: 600px) {
      .page-wrapper { padding: 1rem 0.75rem 4rem; }
      .page-content-card { padding: 1.25rem; }
    }
  `]
})
export class CoveragePageComponent {
  private readonly ls = inject(LocalStorageService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly data: CoverageDialogData = {
    requirements: this.ls.getCurrentSchedule()?.coverageRequirements ?? null
  };

  onResult(result: CoverageRequirements | null): void {
    if (result !== null) {
      const schedule = this.ls.getCurrentSchedule();
      if (schedule) {
        const updated: Schedule = {
          ...schedule,
          coverageRequirements: result,
          updatedAt: Date.now()
        };
        this.ls.saveSchedule(updated);
        this.snackBar.open('Coverage requirements updated', 'Close', { duration: 3000 });
      }
    }
    this.router.navigate(['/schedule']);
  }
}
