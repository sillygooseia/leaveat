import { Injectable, signal, computed } from '@angular/core';
import { EphemeDeviceController } from '@epheme/core/browser';
import type { EphemeDeviceCredential } from '@epheme/core/browser';

export type { EphemeDeviceCredential as DeviceCredential };

@Injectable({ providedIn: 'root' })
export class DeviceService {
  private readonly _core = new EphemeDeviceController();
  private readonly _rev = signal(0);
  private _bump() { this._rev.update(n => n + 1); }

  readonly isRegistered = computed(() => { this._rev(); return this._core.isRegistered; });

  constructor() {
    this._core.onChange(() => this._bump());
  }

  getDeviceId(): string | null { return this._core.deviceId; }
  getJwt(): string | null { return this._core.jwt; }
  getDisplayName(): string | null { return this._core.displayName; }

  async load(): Promise<void> {
    await this._core.load();
  }
}
