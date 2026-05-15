import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AsyncPipe, NgIf } from '@angular/common';
import { AuthService } from '../services/auth.service';

type PageState = 'confirm' | 'deleting' | 'done' | 'error' | 'not-logged-in';

@Component({
  selector: 'app-delete-account',
  templateUrl: './delete-account.page.html',
  styleUrls: ['./delete-account.page.scss'],
  imports: [FormsModule, AsyncPipe, NgIf],
})
export class DeleteAccountPage {
  private router = inject(Router);
  readonly auth = inject(AuthService);

  confirmText = '';
  state: PageState = 'confirm';
  errorMessage = '';

  get canSubmit(): boolean {
    return this.confirmText === 'DELETE';
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) return;
    const user = this.auth.user$.getValue();
    if (!user) {
      this.state = 'not-logged-in';
      return;
    }
    this.state = 'deleting';
    try {
      await this.auth.deleteAccount();
      this.state = 'done';
    } catch {
      this.state = 'error';
      this.errorMessage = 'Something went wrong. Please try again or contact support.';
    }
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
