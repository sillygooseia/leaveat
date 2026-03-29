import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RegisteredAccessService } from '../../services/registered-access.service';
import { LocalStorageService } from '../../services/local-storage.service';

type JoinError = 'not-found' | 'used' | 'expired' | 'failed' | null;

@Component({
  selector: 'app-join',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './join.html',
  styleUrls: ['./join.css'],
})
export class JoinComponent implements OnInit {
  loading = signal(true);
  registering = signal(false);
  error = signal<JoinError>(null);
  preview = signal<{
    workspaceName: string;
    memberName: string;
    mode: 'workplace' | 'family' | 'personal';
  } | null>(null);

  private inviteId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private registeredAccess: RegisteredAccessService,
    private localStorageService: LocalStorageService
  ) {}

  async ngOnInit(): Promise<void> {
    this.inviteId = this.route.snapshot.paramMap.get('id') ?? '';

    if (!this.inviteId) {
      this.error.set('not-found');
      this.loading.set(false);
      return;
    }

    try {
      const data = await this.registeredAccess.getInvitePreview(this.inviteId);
      this.preview.set({
        workspaceName: data.workspaceName,
        memberName: data.memberName,
        mode: data.mode,
      });
    } catch (err: any) {
      const status = err?.status ?? 0;
      const msg = err?.error?.error ?? '';
      if (status === 404) {
        this.error.set('not-found');
      } else if (status === 410 && msg.includes('already been used')) {
        this.error.set('used');
      } else if (status === 410 && msg.includes('expired')) {
        this.error.set('expired');
      } else {
        this.error.set('failed');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async register(): Promise<void> {
    if (this.registering()) return;
    this.registering.set(true);

    try {
      const result = await this.registeredAccess.claimInvite(this.inviteId);
      this.localStorageService.addViewerAccess({
        accessTokenId: result.accessTokenId,
        workspaceName: result.workspaceName,
        memberName: result.memberName,
        mode: result.mode,
        visibility: result.visibility,
        registeredAt: Date.now(),
      });
      await this.router.navigate(['/my-schedule']);
    } catch (err: any) {
      const status = err?.status ?? 0;
      const msg = err?.error?.error ?? '';
      if (status === 410 && msg.includes('already been used')) {
        this.error.set('used');
      } else if (status === 410 && msg.includes('expired')) {
        this.error.set('expired');
      } else {
        this.error.set('failed');
      }
      this.registering.set(false);
    }
  }

  get memberLabel(): string {
    return this.preview()?.mode === 'family' ? 'member' : 'employee';
  }

  get workplaceLabel(): string {
    return this.preview()?.mode === 'family' ? 'family schedule' : 'schedule';
  }
}
