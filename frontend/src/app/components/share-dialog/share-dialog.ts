import { Component, Inject, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ShareService, PERMANENT_LINK_TTL } from '../../services/share.service';
import { LicenseService } from '../../services/license.service';
import { RegisteredAccessService, RegistrationEntry } from '../../services/registered-access.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { Schedule } from '../../models';

@Component({
  selector: 'app-share-dialog',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatTabsModule,
  ],
  templateUrl: './share-dialog.html',
  styleUrls: ['./share-dialog.css']
})
export class ShareDialogComponent {
  private readonly licenseService = inject(LicenseService);
  private readonly shareService = inject(ShareService);
  private readonly registeredAccessService = inject(RegisteredAccessService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly snackBar = inject(MatSnackBar);

  // ── Share Link tab ──────────────────────────────────────────────────────
  loading = signal(false);
  shareUrl = signal<string | null>(null);
  expiresAt = signal<number | null>(null);
  selectedTtl = signal(604800); // 7 days default

  readonly isPremium = this.licenseService.isPremium;
  readonly hasPremiumFeature = (f: Parameters<typeof this.licenseService.hasFeature>[0]) =>
    this.licenseService.hasFeature(f);
  readonly PERMANENT_TTL = PERMANENT_LINK_TTL;

  ttlOptions = [
    { label: '1 Day', value: 86400, premium: false },
    { label: '7 Days (Recommended)', value: 604800, premium: false },
    { label: '30 Days', value: 2592000, premium: true },
    { label: 'Permanent', value: PERMANENT_LINK_TTL, premium: true },
  ];

  // ── Registered Access tab ───────────────────────────────────────────────
  publishing = signal(false);
  inviting = signal(false);
  loadingRegistrations = signal(false);

  selectedMode = signal<'workplace' | 'family' | 'personal'>('workplace');
  selectedVisibility = signal<'own' | 'all'>('own');
  newMemberName = signal('');
  publishedWorkspaceId = signal<string | null>(null);
  publishedUpdatedAt = signal<string | null>(null);
  latestInviteUrl = signal<string | null>(null);
  registrations = signal<RegistrationEntry[]>([]);

  modeOptions = [
    { label: 'Workplace (employees)', value: 'workplace' as const },
    { label: 'Family', value: 'family' as const },
    { label: 'Personal', value: 'personal' as const },
  ];

  visibilityOptions = [
    { label: 'Own shifts only', value: 'own' as const },
    { label: 'Full schedule', value: 'all' as const },
  ];

  constructor(
    private dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public schedule: Schedule
  ) {
    // Default mode from the schedule so the tab matches what the builder uses
    this.selectedMode.set(this.schedule.mode ?? 'workplace');
    // Restore previously published workspace ID for this schedule
    const saved = this.localStorageService.getPublishedWorkspaceId(this.schedule.id);
    if (saved) {
      this.publishedWorkspaceId.set(saved);
    }
  }

  // ── Share Link methods ──────────────────────────────────────────────────

  async generateLink(): Promise<void> {
    this.loading.set(true);

    try {
      const result = await this.shareService.shareSchedule(this.schedule, this.selectedTtl());
      this.shareUrl.set(this.shareService.getShareUrl(result.id));
      this.expiresAt.set(result.expiresAt);
    } catch (err: any) {
      if (err?.message === 'PREMIUM_REQUIRED') {
        this.snackBar.open('This option requires a Premium license', 'Upgrade', { duration: 5000 });
      } else {
        console.error('Error generating share link:', err);
        this.snackBar.open('Failed to generate share link', 'Close', { duration: 5000 });
      }
    } finally {
      this.loading.set(false);
    }
  }

  copyLink(): void {
    const url = this.shareUrl();
    if (!url) return;

    navigator.clipboard.writeText(url).then(
      () => { this.snackBar.open('Link copied to clipboard!', 'Close', { duration: 3000 }); },
      () => { this.snackBar.open('Failed to copy link', 'Close', { duration: 3000 }); }
    );
  }

  formatExpiration(): string {
    const expires = this.expiresAt();
    if (!expires) return '';
    return new Date(expires).toLocaleString();
  }

  // ── Registered Access methods ───────────────────────────────────────────

  get memberLabel(): string {
    return this.selectedMode() === 'family' ? 'Member' : this.selectedMode() === 'personal' ? 'Person' : 'Employee';
  }

  async publishWorkspace(): Promise<void> {
    if (this.publishing()) return;
    this.publishing.set(true);

    try {
      const result = await this.registeredAccessService.publishWorkspace(
        this.schedule.id,
        this.schedule,
        this.selectedMode(),
        (this.selectedMode() === 'family' || this.selectedMode() === 'personal') ? 'all' : this.selectedVisibility()
      );
      this.publishedWorkspaceId.set(result.workspaceId);
      this.publishedUpdatedAt.set(result.updatedAt);
      this.localStorageService.setPublishedWorkspaceId(this.schedule.id, result.workspaceId);
      await this.loadRegistrations();
      this.snackBar.open('Schedule published for registered access', 'Close', { duration: 3000 });
    } catch (err: any) {
      console.error('Error publishing workspace:', err);
      this.snackBar.open('Failed to publish — check your Premium license', 'Close', { duration: 5000 });
    } finally {
      this.publishing.set(false);
    }
  }

  async loadRegistrations(): Promise<void> {
    const wid = this.publishedWorkspaceId();
    if (!wid) return;
    this.loadingRegistrations.set(true);

    try {
      const entries = await this.registeredAccessService.getRegistrations(wid);
      this.registrations.set(entries);
    } catch (err) {
      console.error('Error loading registrations:', err);
    } finally {
      this.loadingRegistrations.set(false);
    }
  }

  async createInvite(): Promise<void> {
    const wid = this.publishedWorkspaceId();
    const name = this.newMemberName().trim();
    if (!wid || !name || this.inviting()) return;

    this.inviting.set(true);
    this.latestInviteUrl.set(null);

    try {
      const result = await this.registeredAccessService.createInvite(wid, name);
      this.latestInviteUrl.set(this.registeredAccessService.getJoinUrl(result.inviteId));
      this.newMemberName.set('');
      await this.loadRegistrations();
    } catch (err) {
      console.error('Error creating invite:', err);
      this.snackBar.open('Failed to create invite', 'Close', { duration: 3000 });
    } finally {
      this.inviting.set(false);
    }
  }

  copyInviteLink(): void {
    const url = this.latestInviteUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => { this.snackBar.open('Invite link copied!', 'Close', { duration: 3000 }); },
      () => { this.snackBar.open('Failed to copy', 'Close', { duration: 3000 }); }
    );
  }

  async revokeDevice(tokenId: string): Promise<void> {
    try {
      await this.registeredAccessService.revokeDevice(tokenId);
      await this.loadRegistrations();
      this.snackBar.open('Device revoked', 'Close', { duration: 3000 });
    } catch (err) {
      console.error('Error revoking device:', err);
      this.snackBar.open('Failed to revoke device', 'Close', { duration: 3000 });
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
