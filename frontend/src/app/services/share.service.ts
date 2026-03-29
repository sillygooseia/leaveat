import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ShareLinkResponse, Schedule } from '../models';
import { LicenseService } from './license.service';

/** Pass ttlSeconds = 0 for a permanent link (Premium only). */
export const PERMANENT_LINK_TTL = 0;

/**
 * ShareService — handles sharing schedules via backend API
 *
 * Creates ephemeral share links with configurable TTL.
 * Premium users can request permanent links (ttlSeconds = 0).
 */
@Injectable({ providedIn: 'root' })
export class ShareService {

  constructor(
    private http: HttpClient,
    private licenseService: LicenseService,
    @Inject(APP_BASE_HREF) private baseHref: string
  ) {}

  /**
   * Share a schedule and get a temporary (or permanent) link.
   *
   * @param schedule   - Schedule to share
   * @param ttlSeconds - Time-to-live in seconds. 0 = permanent (Premium only).
   */
  async shareSchedule(schedule: Schedule, ttlSeconds: number = 604800): Promise<ShareLinkResponse> {
    const isPermanent = ttlSeconds === PERMANENT_LINK_TTL;

    if (isPermanent && !this.licenseService.hasFeature('permanent_links')) {
      throw new Error('PREMIUM_REQUIRED');
    }

    if (ttlSeconds > 604800 && !this.licenseService.isPremium()) {
      throw new Error('PREMIUM_REQUIRED');
    }

    const payload = {
      data: { schedule, sharedAt: Date.now() },
      ttlSeconds: isPermanent ? 0 : ttlSeconds,
    };

    const response = await firstValueFrom(
      this.http.post<ShareLinkResponse>('/api/share', payload)
    );

    console.log('[ShareService] Schedule shared:', response.id, isPermanent ? '(permanent)' : `(TTL: ${ttlSeconds}s)`);
    return response;
  }

  /**
   * Get a shared schedule by ID
   * 
   * @param id - Share link ID
   * @returns Promise with schedule data or null if not found/expired
   */
  async getSharedSchedule(id: string): Promise<{ schedule: Schedule; expiresAt: number } | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ id: string; data: { schedule: Schedule; sharedAt: number }; expiresAt: number }>(`/api/share/${id}`)
      );
      
      return {
        schedule: response.data.schedule,
        expiresAt: response.expiresAt
      };
    } catch (err: any) {
      if (err.status === 404 || err.status === 410) {
        console.warn('[ShareService] Share link not found or expired:', id);
        return null;
      }
      throw err;
    }
  }

  /**
   * Get the full share URL for display/copy
   */
  getShareUrl(id: string): string {
    const baseUrl = window.location.origin;
    const basePath = this.baseHref === '/' ? '' : this.baseHref.replace(/\/$/, '');
    return `${baseUrl}${basePath}/s/${id}`;
  }
}
