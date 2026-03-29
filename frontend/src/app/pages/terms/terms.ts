import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-terms',
  imports: [RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './terms.html',
  styleUrl: './terms.css',
})
export class TermsComponent {
  lastUpdated = 'March 2026';
}
