import { Injectable } from '@angular/core';
import { EphemeHubSync } from '@epheme/core/browser';

export type { HubSyncResult } from '@epheme/core/browser';

@Injectable({ providedIn: 'root' })
export class HubSyncService extends EphemeHubSync {}
