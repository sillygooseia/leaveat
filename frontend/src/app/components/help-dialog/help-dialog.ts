import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-help-dialog',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule
  ],
  templateUrl: './help-dialog.html',
  styleUrls: ['./help-dialog.css']
})
export class HelpDialogComponent {
  constructor(private dialogRef: MatDialogRef<HelpDialogComponent>) {}

  close(): void {
    this.dialogRef.close();
  }
}
