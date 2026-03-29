import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ShareService } from '../../services';
import { Schedule, Shift, Employee } from '../../models';

@Component({
  selector: 'app-public-view',
  imports: [
    CommonModule,
    MatToolbarModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './public-view.html',
  styleUrls: ['./public-view.css']
})
export class PublicViewComponent implements OnInit {
  loading = signal(true);
  schedule = signal<Schedule | null>(null);
  error = signal<string | null>(null);
  expiresAt = signal<number | null>(null);
  
  dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  daysOfWeek = [0, 1, 2, 3, 4, 5, 6];

  constructor(
    private route: ActivatedRoute,
    private shareService: ShareService
  ) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    
    if (!id) {
      this.error.set('Invalid share link');
      this.loading.set(false);
      return;
    }

    try {
      const result = await this.shareService.getSharedSchedule(id);
      
      if (!result) {
        this.error.set('This share link has expired or does not exist');
      } else {
        this.schedule.set(result.schedule);
        this.expiresAt.set(result.expiresAt);
      }
    } catch (err: any) {
      console.error('Error loading shared schedule:', err);
      this.error.set('Failed to load schedule');
    } finally {
      this.loading.set(false);
    }
  }

  getShiftsForDay(day: number): Shift[] {
    const schedule = this.schedule();
    if (!schedule) return [];
    
    return schedule.shifts
      .filter(s => s.day === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  getEmployee(employeeId: string): Employee | undefined {
    const schedule = this.schedule();
    if (!schedule) return undefined;
    return schedule.employees.find(e => e.id === employeeId);
  }

  formatExpiration(): string {
    const expires = this.expiresAt();
    if (!expires) return '';
    return new Date(expires).toLocaleString();
  }
}
