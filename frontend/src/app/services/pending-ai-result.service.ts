import { Injectable, signal } from '@angular/core';
import type { AiSchedulerDialogResult } from '../components/ai-scheduler/ai-scheduler';

/**
 * Carries an accepted AI-scheduler result across the navigation boundary
 * from the /ai page back to /schedule.  The schedule component reads and
 * clears the result during its initialisation.
 */
@Injectable({ providedIn: 'root' })
export class PendingAiResultService {
  readonly result = signal<AiSchedulerDialogResult | null>(null);

  /** Return the pending result and immediately clear it. */
  take(): AiSchedulerDialogResult | null {
    const r = this.result();
    if (r !== null) this.result.set(null);
    return r;
  }
}
