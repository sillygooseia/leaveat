import { Injectable } from '@angular/core';
import { BafgoHubSync } from '@bafgo/core/browser';

export type { HubSyncResult } from '@bafgo/core/browser';

@Injectable({ providedIn: 'root' })
export class HubSyncService extends BafgoHubSync {}
