import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';

@Component({
  selector: 'app-help',
  imports: [RouterModule, MatButtonModule, MatIconModule, MatExpansionModule],
  templateUrl: './help.html',
  styleUrl: './help.css',
})
export class HelpComponent {
  faqs = [
    {
      q: 'Do I need an account to use LeaveAt?',
      a: 'No. LeaveAt is completely accountless. Everything is stored in your browser — no sign-up, no email, no password.'
    },
    {
      q: 'How long do share links last?',
      a: 'Free share links last 7 days. With Premium you get 30-day links and permanent links that never expire.'
    },
    {
      q: 'Will I lose my schedule if I clear my browser?',
      a: 'Yes — without Premium, your data lives only in your browser\'s localStorage. Clearing your browser data will remove it. Premium users can create an encrypted cloud backup and restore it on any device.'
    },
    {
      q: 'Can my staff view the schedule without an account?',
      a: 'Yes. Anyone with the share link can view the schedule — no account required. With Premium\'s registered device access, staff can be given a personal invite link to register their device and always see the current schedule.'
    },
    {
      q: 'What is a Premium license?',
      a: 'A Premium license is a one-time annual purchase ($29/year) stored on your device. It unlocks longer share links, cloud backup, multiple saved schedules, and registered device access for staff. No account is ever created.'
    },
    {
      q: 'Can I move my Premium license to a new device?',
      a: 'Yes. You can transfer your license using a QR code, restore code, or a passkey — no account needed. Your license never gets locked to a single device.'
    },
    {
      q: 'What happens after 7 days when a link expires?',
      a: 'The shared snapshot is automatically deleted from our servers. Your local schedule is unaffected — it still lives in your browser. Just generate a new share link anytime.'
    },
    {
      q: 'Is my data private?',
      a: 'Your schedule lives in your browser. The only data that touches our servers is the temporary snapshot used to generate a share link, and it is deleted when the link expires. We do not collect personal information.'
    },
    {
      q: 'Can I use LeaveAt for free forever?',
      a: 'Yes. The core scheduling builder, employee management, and 7-day share links are completely free with no time limit.'
    },
  ];
}
