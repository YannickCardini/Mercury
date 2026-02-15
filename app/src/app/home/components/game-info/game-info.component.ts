import { GameStateService } from './../../services/game-state.service';
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';


@Component({
    selector: 'app-game-info',
    templateUrl: 'game-info.component.html',
    styleUrl: 'game-info.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [CommonModule]
})
export class GameInfoComponent {
    constructor(public gameStateService: GameStateService) { }


}
