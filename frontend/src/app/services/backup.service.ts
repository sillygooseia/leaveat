import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LicenseService } from './license.service';

const LAST_BACKUP_KEY = 'leaveat:last-backup-at';
const BACKUP_API = (jti: string) => `/api/license/backup/${encodeURIComponent(jti)}`;

/**
 * BackupService — AES-256-GCM encrypted cloud backup of all localStorage schedule data.
 *
 * Encryption key is derived from the license jti and a user-supplied PIN
 * via PBKDF2 (Web Crypto API). The server never sees the PIN or plaintext data.
 *
 * Key derivation (deterministic — no stored salt needed):
 *   salt  = UTF-8 bytes of jti
 *   key   = PBKDF2(passphrase: jti + ":" + pin, salt, 200000 iterations, SHA-256, 256-bit)
 *
 * Blob format (base64):
 *   [ IV (12 bytes) | ciphertext + GCM tag ]
 */
@Injectable({ providedIn: 'root' })
export class BackupService {

  readonly lastBackupAt = signal<number | null>(
    Number(localStorage.getItem(LAST_BACKUP_KEY)) || null
  );

  constructor(
    private http: HttpClient,
    private licenseService: LicenseService
  ) {}

  /**
   * Encrypt and upload all schedule localStorage data to the cloud.
   * @param pin  User-supplied PIN (never sent to the server)
   */
  async backup(pin: string): Promise<void> {
    const jti = this.licenseService.licenseJti();
    const token = this.licenseService.token();
    if (!jti || !token) throw new Error('No active premium license');

    const plaintext = this._collectLocalData();
    const blob = await this._encrypt(jti, pin, plaintext);

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    await firstValueFrom(
      this.http.post(BACKUP_API(jti), { blob }, { headers })
    );

    const now = Date.now();
    localStorage.setItem(LAST_BACKUP_KEY, String(now));
    this.lastBackupAt.set(now);
    console.log('[backup] Backup complete');
  }

  /**
   * Download and decrypt the cloud backup, restoring it to localStorage.
   * @param pin  The same PIN used during backup
   */
  async restore(pin: string): Promise<void> {
    const jti = this.licenseService.licenseJti();
    const token = this.licenseService.token();
    if (!jti || !token) throw new Error('No active premium license');

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const response = await firstValueFrom(
      this.http.get<{ blob: string; savedAt: number }>(BACKUP_API(jti), { headers })
    );

    const plaintext = await this._decrypt(jti, pin, response.blob);
    this._restoreLocalData(plaintext);
    console.log('[backup] Restore complete, savedAt:', new Date(response.savedAt).toISOString());
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _collectLocalData(): string {
    const data: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('leaveat:')) {
        data[key] = localStorage.getItem(key);
      }
    }
    return JSON.stringify(data);
  }

  private _restoreLocalData(plaintext: string): void {
    const data = JSON.parse(plaintext) as Record<string, string | null>;
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('leaveat:') && value !== null) {
        localStorage.setItem(key, value);
      }
    }
  }

  private async _deriveKey(jti: string, pin: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const passphrase = enc.encode(`${jti}:${pin}`);
    const salt = enc.encode(jti); // deterministic salt derived from jti

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passphrase,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async _encrypt(jti: string, pin: string, plaintext: string): Promise<string> {
    const key = await this._deriveKey(jti, pin);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    );

    // Combine IV + ciphertext into one base64 blob
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);
    return btoa(String.fromCharCode(...combined));
  }

  private async _decrypt(jti: string, pin: string, blob: string): Promise<string> {
    const key = await this._deriveKey(jti, pin);
    const combined = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(plainBuffer);
  }
}
