import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['./privacy.page.scss'],
  imports: [],
})
export class PrivacyPage {
  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
