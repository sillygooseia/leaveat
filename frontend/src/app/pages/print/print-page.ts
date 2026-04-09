import { Component, inject } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PrintDialogComponent, PrintDialogData } from '../../components/print-dialog/print-dialog';
import { LocalStorageService } from '../../services/local-storage.service';
import { Shift } from '../../models';

@Component({
  selector: 'app-print-page',
  standalone: true,
  imports: [PrintDialogComponent, RouterModule, MatButtonModule, MatIconModule],
  template: `
    <div class="page-wrapper">
      <a mat-button routerLink="/schedule" class="page-back">
        <mat-icon>arrow_back</mat-icon>
        Back to Schedule
      </a>
      <div class="page-content-card">
        <app-print-dialog
          [pageData]="data"
          (closePanel)="goBack()"
        />
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; background: #f5f7f6; min-height: 100vh; }
    .page-wrapper {
      max-width: 700px;
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
export class PrintPageComponent {
  private readonly ls = inject(LocalStorageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly data: PrintDialogData = this._buildData();

  goBack(): void {
    this.router.navigate(['/schedule']);
  }

  private _buildData(): PrintDialogData {
    const schedule = this.ls.getCurrentSchedule();
    const weekParam = this.route.snapshot.queryParamMap.get('week');
    const weekStart = weekParam ?? this._getMonday(new Date());
    const weekDateRange = this._buildDateRange(weekStart);
    const weekShifts: Shift[] = (schedule?.shifts ?? []).filter(s => s.weekStartDate === weekStart);

    return {
      schedule: schedule ?? { id: '', name: '', mode: 'workplace', shifts: [], employees: [], createdAt: 0, updatedAt: 0 },
      shifts: weekShifts,
      employees: schedule?.employees ?? [],
      weekDateRange,
      weekStartDate: weekStart,
      mode: schedule?.mode ?? 'workplace',
      activities: [],
    };
  }

  private _getMonday(d: Date): string {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private _buildDateRange(weekStart: string): string {
    const start = new Date(weekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d: Date) => `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`;
    return `${fmt(start)} - ${fmt(end)}, ${start.getFullYear()}`;
  }
}
