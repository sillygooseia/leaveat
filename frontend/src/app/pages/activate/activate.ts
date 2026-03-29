import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LicenseService } from '../../services/license.service';

type State = 'loading' | 'success' | 'error' | 'already';

@Component({
  selector: 'app-activate',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './activate.html',
  styleUrls: ['./activate.css'],
})
export class ActivateComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private licenseService = inject(LicenseService);

  state = signal<State>('loading');
  errorMessage = signal('');

  async ngOnInit(): Promise<void> {
    if (this.licenseService.isPremium()) {
      this.state.set('already');
      return;
    }

    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.errorMessage.set('No token found in the URL. Please check your activation link.');
      this.state.set('error');
      return;
    }

    const ok = await this.licenseService.activate(token);
    this.state.set(ok ? 'success' : 'error');
    if (!ok) {
      this.errorMessage.set('The activation token is invalid or has already expired. Please contact support.');
    }
  }

  goToSchedule(): void {
    this.router.navigate(['/']);
  }
}
