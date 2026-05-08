import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

interface LeaderboardEntry {
  id: string;
  name: string;
  picture: string;
  points: number;
  ranking: number;
}

@Component({
  selector: 'app-leaderboard',
  templateUrl: './leaderboard.page.html',
  styleUrls: ['./leaderboard.page.scss'],
  imports: [CommonModule],
})
export class LeaderboardPage implements OnInit {
  private http = inject(HttpClient);
  private location = inject(Location);
  private router = inject(Router);

  entries = signal<LeaderboardEntry[]>([]);
  loading = signal(true);
  error = signal('');
  searchQuery = signal('');

  filteredEntries = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.entries();
    return this.entries().filter(e => e.name.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    firstValueFrom(
      this.http.get<LeaderboardEntry[]>(`${environment.apiUrl}/api/auth/leaderboard`)
    ).then(data => {
      this.entries.set(data);
      this.loading.set(false);
    }).catch(() => {
      this.error.set('Could not load leaderboard.');
      this.loading.set(false);
    });
  }

  goBack(): void {
    this.location.back();
  }

  openProfile(id: string): void {
    if (!id) return;
    void this.router.navigate(['/profile', id]);
  }
}
