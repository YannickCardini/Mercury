import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule, FormsModule],
})
export class HomePage implements OnInit {
  readonly titleLetters = ['K', 'E', 'E', 'N', 'Z', 'E', 'N'];

  showLogin = false;
  showSettings = false;
  loginMode: 'login' | 'signup' = 'login';

  constructor() {}
  ngOnInit() {}

  openLogin() { this.showLogin = true; }
  closeLogin() { this.showLogin = false; }
  switchMode(mode: 'login' | 'signup') { this.loginMode = mode; }

  openSettings() { this.showSettings = true; }
  closeSettings() { this.showSettings = false; }
}
