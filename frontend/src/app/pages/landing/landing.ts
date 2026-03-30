import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LocalStorageService, ViewerAccess } from '../../services/local-storage.service';
import { LicenseService } from '../../services/license.service';

const PROMO_BANNER_KEY = 'leaveat:promo-banner-dismissed';

interface PromoStatus {
  claimed: number;
  total: number;
  remaining: number;
}

@Component({
  selector: 'app-landing',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatMenuModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingComponent implements OnInit {
  viewerAccess = signal<ViewerAccess | null>(null);

  private licenseService = inject(LicenseService);
  private http = inject(HttpClient);
  private localStorageService = inject(LocalStorageService);

  readonly isPremium = this.licenseService.isPremium;

  promoRemaining = signal<number | null>(null);
  promoTotal = signal<number>(100);
  promoClaiming = signal(false);
  promoClaimed = signal(false);
  promoError = signal('');
  bannerDismissed = signal(false);

  supportName = '';
  supportEmail = '';
  supportMessage = '';
  supportSubmitting = signal(false);
  supportSent = signal(false);
  supportError = signal('');

  constructor() {}

  async ngOnInit(): Promise<void> {
    this.viewerAccess.set(this.localStorageService.getViewerAccess());
    this.bannerDismissed.set(!!localStorage.getItem(PROMO_BANNER_KEY));
    await this._loadPromoStatus();
  }

  private async _loadPromoStatus(): Promise<void> {
    try {
      const status = await firstValueFrom(
        this.http.get<PromoStatus>('/api/license/promo/status')
      );
      this.promoRemaining.set(status.remaining);
      this.promoTotal.set(status.total);
    } catch (err) {
      console.error('[promo] failed to load promo status', err);
    }
  }

  async claimPromo(): Promise<void> {
    if (this.promoClaiming()) return;
    this.promoClaiming.set(true);
    this.promoError.set('');
    try {
      const result = await firstValueFrom(
        this.http.post<{ token: string; remaining: number }>('/api/license/promo/claim', {})
      );
      const ok = await this.licenseService.activate(result.token);
      if (ok) {
        this.promoClaimed.set(true);
        this.promoRemaining.set(result.remaining);
      } else {
        this.promoError.set('License received but could not be activated. Please contact support.');
      }
    } catch (err: any) {
      const code = err?.error?.error;
      if (code === 'already_claimed') {
        this.promoError.set('A free license has already been claimed from this network.');
      } else if (code === 'pool_exhausted') {
        this.promoRemaining.set(0);
        this.promoError.set('All 100 free licenses have been claimed!');
      } else if (err?.status === 429) {
        this.promoError.set('Too many requests. Please wait a moment and try again.');
      } else {
        this.promoError.set('Something went wrong. Please try again.');
      }
    } finally {
      this.promoClaiming.set(false);
    }
  }

  dismissBanner(): void {
    localStorage.setItem(PROMO_BANNER_KEY, '1');
    this.bannerDismissed.set(true);
  }

  async submitSupport(): Promise<void> {
    if (this.supportSubmitting()) return;
    this.supportSubmitting.set(true);
    this.supportError.set('');
    try {
      await firstValueFrom(
        this.http.post('/api/support', {
          name: this.supportName.trim(),
          email: this.supportEmail.trim(),
          message: this.supportMessage.trim(),
        })
      );
      this.supportSent.set(true);
    } catch (err: any) {
      this.supportError.set(err?.error?.error || 'Something went wrong. Please try again.');
    } finally {
      this.supportSubmitting.set(false);
    }
  }
}