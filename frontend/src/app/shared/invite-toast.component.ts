import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { GameInviteMessage } from '@mercury/shared';

/**
 * Bottom-right toast that appears when a `gameInvite` is pushed to the user.
 * Stays visible until the user explicitly clicks Join / Decline, or until the
 * server cancels the invitation (room closed, expired, creator disconnected).
 */
@Component({
  selector: 'app-invite-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invite-toast.component.html',
  styleUrls: ['./invite-toast.component.scss'],
})
export class InviteToastComponent {
  @Input() invite: GameInviteMessage | null = null;
  @Output() join = new EventEmitter<GameInviteMessage>();
  @Output() decline = new EventEmitter<GameInviteMessage>();

  onJoin(): void {
    if (!this.invite) return;
    this.join.emit(this.invite);
  }

  onDecline(): void {
    if (!this.invite) return;
    this.decline.emit(this.invite);
  }
}
