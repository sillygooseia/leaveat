import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LicenseService } from '../../services/license.service';
import { PremiumActivationComponent } from '../../components/premium-activation/premium-activation';
import { PremiumStatusComponent } from '../../components/premium-status/premium-status';

interface FreeFeature {
  label: string;
}

interface AiFeature {
  icon: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-premium',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    PremiumStatusComponent,
  ],
  templateUrl: './premium.html',
  styleUrls: ['./premium.css'],
})
export class PremiumComponent {
  readonly licenseService = inject(LicenseService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private http = inject(HttpClient);

  readonly isPremium = this.licenseService.isPremium;

  checkoutLoading = signal(false);

  freeFeatures: FreeFeature[] = [
    { label: 'Weekly schedule builder' },
    { label: 'Personal, Family & Work modes' },
    { label: 'Unlimited schedules' },
    { label: 'Unlimited employees' },
    { label: 'Share links (7-day, 30-day, permanent)' },
    { label: 'Print & export' },
    { label: 'Registered device access for team members' },
    { label: 'Encrypted cloud backup & restore' },
    { label: 'Multi-week schedule history' },
    { label: 'No account or identity required' },
    { label: 'Local-first — your data stays on your device' },
  ];

  aiFeatures: AiFeature[] = [
    {
      icon: 'auto_awesome',
      label: 'AI schedule generation',
      desc: 'Describe availability, restrictions, and preferences in plain text — AI builds a complete weekly schedule.',
    },
    {
      icon: 'tune',
      label: 'Adjust & regenerate',
      desc: 'Accept the proposed schedule, tweak it manually, or regenerate with updated constraints in seconds.',
    },
    {
      icon: 'warning_amber',
      label: 'Conflict detection',
      desc: 'AI flags understaffed shifts, scheduling conflicts, and constraint violations automatically.',
    },
    {
      icon: 'meeting_room',
      label: 'Room & role coverage',
      desc: 'Define required headcount, stations, and roles per shift — AI ensures your business rules are met.',
    },
  ];

  async startCheckout(): Promise<void> {
    this.checkoutLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<{ checkoutUrl: string }>('/api/license/checkout', {})
      );
      window.location.href = response.checkoutUrl;
    } catch (err: any) {
      const msg = err?.error?.error;
      if (msg === 'Payment processor not configured') {
        this.snackBar.open(
          'Payment is not yet configured. Use "Activate License" to paste a dev token instead.',
          'Activate',
          { duration: 8000 }
        ).onAction().subscribe(() => this.openActivation());
      } else {
        this.snackBar.open('Failed to start checkout. Please try again.', 'Close', { duration: 5000 });
      }
    } finally {
      this.checkoutLoading.set(false);
    }
  }

  openActivation(): void {
    this.dialog.open(PremiumActivationComponent, { width: '480px' });
  }
}
