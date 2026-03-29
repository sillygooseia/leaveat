import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-about',
  imports: [RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class AboutComponent {}
