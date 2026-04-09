import { Component, inject } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AiSchedulerComponent, AiSchedulerDialogData, AiSchedulerDialogResult } from '../../components/ai-scheduler/ai-scheduler';
import { LocalStorageService } from '../../services/local-storage.service';
import { PendingAiResultService } from '../../services/pending-ai-result.service';

@Component({
  selector: 'app-ai-scheduler-page',
  standalone: true,
  imports: [AiSchedulerComponent, RouterModule, MatButtonModule, MatIconModule],
  template: `
    <div class="page-wrapper">
      <a mat-button routerLink="/schedule" class="page-back">
        <mat-icon>arrow_back</mat-icon>
        Back to Schedule
      </a>
      <div class="page-content-card">
        <app-ai-scheduler
          [data]="data"
          (result)="onResult($event)"
        />
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; background: #f5f7f6; min-height: 100vh; }
    .page-wrapper {
      max-width: 780px;
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
export class AiSchedulerPageComponent {
  private readonly ls = inject(LocalStorageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly pendingAi = inject(PendingAiResultService);

  readonly data: AiSchedulerDialogData = this._buildData();

  private _buildData(): AiSchedulerDialogData {
    const schedule = this.ls.getCurrentSchedule();
    const weekParam = this.route.snapshot.queryParamMap.get('week');
    const weekStart = weekParam ?? this._getMonday(new Date());

    return {
      employees: schedule?.employees ?? [],
      weekStart,
      coverageRequirements: schedule?.coverageRequirements ?? null,
    };
  }

  onResult(result: AiSchedulerDialogResult | null): void {
    if (result?.accepted) {
      this.pendingAi.result.set(result);
    }
    this.router.navigate(['/schedule']);
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
}
