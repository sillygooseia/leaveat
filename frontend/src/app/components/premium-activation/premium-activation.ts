import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RouterModule } from '@angular/router';
import { LicenseService } from '../../services/license.service';

type TabId = 'paste' | 'code' | 'qr' | 'passkey';

@Component({
  selector: 'app-premium-activation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatTabsModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './premium-activation.html',
  styleUrls: ['./premium-activation.css'],
})
export class PremiumActivationComponent {
  private licenseService = inject(LicenseService);
  private dialogRef = inject(MatDialogRef<PremiumActivationComponent>);
  private snackBar = inject(MatSnackBar);
  private http = inject(HttpClient);

  // ── Paste token tab ─────────────────────────────────────────────────────────
  pasteToken = signal('');
  pasteLoading = signal(false);
  pasteError = signal('');

  async activateFromPaste(): Promise<void> {
    const token = this.pasteToken().trim();
    if (!token) return;
    this.pasteLoading.set(true);
    this.pasteError.set('');
    try {
      const ok = await this.licenseService.activate(token);
      if (ok) {
        this._onSuccess();
      } else {
        this.pasteError.set('Invalid or expired token. Please check the token and try again.');
      }
    } finally {
      this.pasteLoading.set(false);
    }
  }

  // ── Restore code tab ────────────────────────────────────────────────────────
  restoreCode = signal('');
  codeLoading = signal(false);
  codeError = signal('');

  async activateFromCode(): Promise<void> {
    const code = this.restoreCode().trim().toUpperCase();
    if (code.length !== 8) {
      this.codeError.set('Please enter the full 8-character restore code.');
      return;
    }
    this.codeLoading.set(true);
    this.codeError.set('');
    try {
      const response = await firstValueFrom(
        this.http.get<{ token: string; expiresAt: number }>(`/api/license/restore/${encodeURIComponent(code)}`)
      );
      const ok = await this.licenseService.activate(response.token);
      if (ok) {
        this._onSuccess();
      } else {
        this.codeError.set('The token returned for this code was invalid.');
      }
    } catch (err: any) {
      const msg = err?.error?.error || 'Restore code not found or expired.';
      this.codeError.set(msg);
    } finally {
      this.codeLoading.set(false);
    }
  }

  // ── QR scan tab ─────────────────────────────────────────────────────────────
  qrLoading = signal(false);
  qrError = signal('');
  qrVideoRef: HTMLVideoElement | null = null;
  private _qrAnimFrame: number | null = null;
  private _qrStream: MediaStream | null = null;

  async startQrScan(videoEl: HTMLVideoElement): Promise<void> {
    this.qrVideoRef = videoEl;
    this.qrLoading.set(true);
    this.qrError.set('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this._qrStream = stream;
      videoEl.srcObject = stream;
      await videoEl.play();
      this._scanQrFrame(videoEl);
    } catch (err: any) {
      this.qrError.set('Camera access denied. Please allow camera access and try again.');
    } finally {
      this.qrLoading.set(false);
    }
  }

  private async _scanQrFrame(video: HTMLVideoElement): Promise<void> {
    if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      this._qrAnimFrame = requestAnimationFrame(() => this._scanQrFrame(video));
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Dynamic import to keep initial bundle small
    const jsQR = (await import('jsqr')).default;
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code?.data) {
      this.stopQrScan();
      const ok = await this.licenseService.activate(code.data);
      if (ok) {
        this._onSuccess();
      } else {
        this.qrError.set('QR code scanned but the token was invalid or expired.');
      }
      return;
    }

    this._qrAnimFrame = requestAnimationFrame(() => this._scanQrFrame(video));
  }

  stopQrScan(): void {
    if (this._qrAnimFrame !== null) cancelAnimationFrame(this._qrAnimFrame);
    this._qrStream?.getTracks().forEach(t => t.stop());
    this._qrStream = null;
  }

  // ── Passkey tab ─────────────────────────────────────────────────────────────
  passkeyLoading = signal(false);
  passkeyError = signal('');

  async activateFromPasskey(): Promise<void> {
    if (!window.PublicKeyCredential) {
      this.passkeyError.set('WebAuthn is not supported in this browser.');
      return;
    }
    this.passkeyLoading.set(true);
    this.passkeyError.set('');
    try {
      // 1. Get authentication options from the license service
      const optionsResp = await firstValueFrom(
        this.http.post<any>('/api/license/passkey/authenticate/options', {})
      );
      const { challengeId, ...publicKeyOptions } = optionsResp;

      // Decode base64url challenge
      publicKeyOptions.challenge = this._base64urlToBuffer(publicKeyOptions.challenge);
      if (publicKeyOptions.allowCredentials) {
        publicKeyOptions.allowCredentials = publicKeyOptions.allowCredentials.map((c: any) => ({
          ...c,
          id: this._base64urlToBuffer(c.id),
        }));
      }

      // 2. Trigger WebAuthn
      const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions }) as PublicKeyCredential;
      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;

      // 3. Serialize and verify
      const verifyPayload = {
        challengeId,
        id: assertion.id,
        rawId: this._bufferToBase64url(assertion.rawId),
        type: assertion.type,
        response: {
          authenticatorData: this._bufferToBase64url(assertionResponse.authenticatorData),
          clientDataJSON: this._bufferToBase64url(assertionResponse.clientDataJSON),
          signature: this._bufferToBase64url(assertionResponse.signature),
          userHandle: assertionResponse.userHandle
            ? this._bufferToBase64url(assertionResponse.userHandle)
            : null,
        },
      };

      const verifyResp = await firstValueFrom(
        this.http.post<{ token: string; expiresAt: number }>('/api/license/passkey/authenticate/verify', verifyPayload)
      );

      const ok = await this.licenseService.activate(verifyResp.token);
      if (ok) {
        this._onSuccess();
      } else {
        this.passkeyError.set('Passkey authentication succeeded but the returned token was invalid.');
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        this.passkeyError.set('Passkey authentication was cancelled.');
      } else {
        const msg = err?.error?.error || 'Passkey authentication failed.';
        this.passkeyError.set(msg);
      }
    } finally {
      this.passkeyLoading.set(false);
    }
  }

  close(): void {
    this.stopQrScan();
    this.dialogRef.close(false);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _onSuccess(): void {
    this.stopQrScan();
    this.snackBar.open('✓ Premium activated!', 'Close', { duration: 4000 });
    this.dialogRef.close(true);
  }

  private _base64urlToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  private _bufferToBase64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
