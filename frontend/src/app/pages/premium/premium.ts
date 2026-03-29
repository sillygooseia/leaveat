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

interface PlanFeature {
  label: string;
  free: boolean;
  premium: boolean;
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

  features: PlanFeature[] = [
    { label: 'Weekly schedule builder', free: true, premium: true },
    { label: 'Employee management', free: true, premium: true },
    { label: 'Share links (up to 7 days)', free: true, premium: true },
    { label: 'Number of schedules', free: false, premium: true }, // special row
    { label: 'Share links up to 30 days', free: false, premium: true },
    { label: 'Permanent share links', free: false, premium: true },
    { label: 'Cloud backup (encrypted)', free: false, premium: true },
    { label: 'Schedule templates', free: false, premium: true },
    { label: 'Duplicate schedule', free: false, premium: true },
    { label: 'Multi-week history', free: false, premium: true },
    { label: 'Registered device access', free: false, premium: true },
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
