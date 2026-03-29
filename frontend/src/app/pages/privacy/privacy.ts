import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-privacy',
  imports: [RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './privacy.html',
  styleUrl: './privacy.css',
})
export class PrivacyComponent {
  lastUpdated = 'March 2026';
}
