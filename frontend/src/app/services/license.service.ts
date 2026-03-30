import { Injectable, signal, computed } from '@angular/core';
import { EphemeLicenseController } from '@epheme/core/browser';
import type { EphemeLicenseToken, EphemeLicenseState } from '@epheme/core/browser';
import type { PremiumFeature } from '../models';

export type LicenseToken = EphemeLicenseToken;
export type LicenseState = EphemeLicenseState;

@Injectable({ providedIn: 'root' })
export class LicenseService {
  private readonly _core = new EphemeLicenseController<PremiumFeature>({
    storageKey:         'leaveat:license',
    publicKeyUrl:       '/api/license/public-key',
    publicKeyCacheKey:  'leaveat:license-public-key',
  });

  private readonly _rev = signal(0); // increment to notify Angular of state changes
  private _bump() { this._rev.update(n => n + 1); }

  readonly isPremium    = computed(() => { this._rev(); return this._core.isPremium; });
  readonly licenseExpiry = computed(() => { this._rev(); return this._core.licenseExpiry; });
  readonly licenseJti   = computed(() => { this._rev(); return this._core.licenseJti; });
  readonly token        = computed(() => { this._rev(); return this._core.token; });

  constructor() {
    this._core.onChange(() => this._bump());
  }

  async activate(rawToken: string): Promise<boolean> {
    const ok = await this._core.activate(rawToken);
    this._bump();
    return ok;
  }

  deactivate(): void {
    this._core.deactivate();
    this._bump();
  }

  getLicense(): EphemeLicenseToken | null { return this._core.getLicense(); }
  isExpired(): boolean { return this._core.isExpired(); }
  hasFeature(feature: PremiumFeature): boolean { return this._core.hasFeature(feature); }
}
