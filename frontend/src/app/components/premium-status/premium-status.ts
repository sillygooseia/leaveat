import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LicenseService } from '../../services/license.service';
import { BackupService } from '../../services/backup.service';
import { PremiumActivationComponent } from '../premium-activation/premium-activation';

@Component({
  selector: 'app-premium-status',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './premium-status.html',
  styleUrls: ['./premium-status.css'],
})
export class PremiumStatusComponent {
  readonly licenseService = inject(LicenseService);
  private backupService = inject(BackupService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private http = inject(HttpClient);

  readonly isPremium = this.licenseService.isPremium;
  readonly license = computed(() => this.licenseService.getLicense());
  readonly expiryDate = computed(() => {
    const exp = this.licenseService.licenseExpiry();
    return exp ? new Date(exp * 1000) : null;
  });
  readonly lastBackupAt = this.backupService.lastBackupAt;

  // Restore code state
  restoreCode = signal<string | null>(null);
  restoreCodeLoading = signal(false);

  // Backup/restore state
  backupLoading = signal(false);
  restoreLoading = signal(false);

  // QR export state
  qrDataUrl = signal<string | null>(null);
  qrLoading = signal(false);

  // Passkey registration
  passkeyLoading = signal(false);

  // For PIN prompts (backup)
  pinPrompt = signal<'backup' | 'restore' | null>(null);
  pinValue = signal('');

  openActivation(): void {
    this.dialog.open(PremiumActivationComponent, {
      position: { right: '0', top: '0' },
      height: '100vh',
      width: 'min(480px, 95vw)',
      maxWidth: '95vw',
      panelClass: 'side-sheet-panel',
    });
  }

  deactivate(): void {
    this.licenseService.deactivate();
    this.snackBar.open('Premium license removed from this device', 'Close', { duration: 4000 });
  }

  async generateRestoreCode(): Promise<void> {
    const token = this.licenseService.token();
    if (!token) return;
    this.restoreCodeLoading.set(true);
    this.restoreCode.set(null);
    try {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      const resp = await firstValueFrom(
        this.http.post<{ code: string; expiresInSeconds: number }>(
          '/api/license/restore/code', {}, { headers }
        )
      );
      this.restoreCode.set(resp.code);
    } catch (err: any) {
      this.snackBar.open(err?.error?.error || 'Failed to generate restore code', 'Close', { duration: 4000 });
    } finally {
      this.restoreCodeLoading.set(false);
    }
  }

  async exportQr(): Promise<void> {
    const token = this.licenseService.token();
    if (!token) return;
    this.qrLoading.set(true);
    try {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(token, { width: 400, margin: 2 });
      this.qrDataUrl.set(dataUrl);
    } catch (err) {
      this.snackBar.open('Failed to generate QR code', 'Close', { duration: 4000 });
    } finally {
      this.qrLoading.set(false);
    }
  }

  async registerPasskey(): Promise<void> {
    if (!window.PublicKeyCredential) {
      this.snackBar.open('WebAuthn is not supported in this browser', 'Close', { duration: 4000 });
      return;
    }
    const token = this.licenseService.token();
    if (!token) return;
    this.passkeyLoading.set(true);
    try {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

      // Get registration options
      const options = await firstValueFrom(
        this.http.post<any>('/api/license/passkey/register/options', {}, { headers })
      );
      options.challenge = this._b64ToBuffer(options.challenge);
      options.user.id = this._b64ToBuffer(options.user.id);
      if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map((c: any) => ({
          ...c, id: this._b64ToBuffer(c.id)
        }));
      }

      const cred = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential;
      const resp = cred.response as AuthenticatorAttestationResponse;

      const verifyPayload = {
        id: cred.id,
        rawId: this._bufferToB64(cred.rawId),
        type: cred.type,
        response: {
          attestationObject: this._bufferToB64(resp.attestationObject),
          clientDataJSON: this._bufferToB64(resp.clientDataJSON),
        },
      };

      await firstValueFrom(
        this.http.post('/api/license/passkey/register/verify', verifyPayload, { headers })
      );

      this.snackBar.open('Passkey registered! You can now restore your license using it.', 'Close', { duration: 5000 });
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        this.snackBar.open('Passkey registration cancelled', 'Close', { duration: 3000 });
      } else {
        this.snackBar.open(err?.error?.error || 'Passkey registration failed', 'Close', { duration: 4000 });
      }
    } finally {
      this.passkeyLoading.set(false);
    }
  }

  showPinPrompt(action: 'backup' | 'restore'): void {
    this.pinValue.set('');
    this.pinPrompt.set(action);
  }

  cancelPinPrompt(): void {
    this.pinPrompt.set(null);
    this.pinValue.set('');
  }

  async confirmPinAction(): Promise<void> {
    const action = this.pinPrompt();
    const pin = this.pinValue();
    if (!action || !pin) return;

    this.pinPrompt.set(null);

    if (action === 'backup') {
      this.backupLoading.set(true);
      try {
        await this.backupService.backup(pin);
        this.snackBar.open('Backup complete!', 'Close', { duration: 4000 });
      } catch (err: any) {
        this.snackBar.open('Backup failed: ' + (err?.message || 'Unknown error'), 'Close', { duration: 5000 });
      } finally {
        this.backupLoading.set(false);
      }
    } else {
      this.restoreLoading.set(true);
      try {
        await this.backupService.restore(pin);
        this.snackBar.open('Restore complete! Refresh the page to see your data.', 'Refresh', { duration: 8000 })
          .onAction().subscribe(() => window.location.reload());
      } catch (err: any) {
        const msg = err?.message?.includes('OperationError')
          ? 'Incorrect PIN — could not decrypt the backup.'
          : 'Restore failed: ' + (err?.message || 'Unknown error');
        this.snackBar.open(msg, 'Close', { duration: 6000 });
      } finally {
        this.restoreLoading.set(false);
      }
    }
    this.pinValue.set('');
  }

  private _b64ToBuffer(b64url: string): ArrayBuffer {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  private _bufferToB64(buf: ArrayBuffer): string {
    const arr = new Uint8Array(buf);
    let bin = '';
    for (const b of arr) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
