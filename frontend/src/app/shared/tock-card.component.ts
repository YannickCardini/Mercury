import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { JOKER_VALUE } from "@mercury/shared";
import { cardSvgUrl, toCardId } from "./cards/card-svg";

@Component({
  selector: "app-tock-card",
  standalone: true,
  template: `<img class="card-img" [src]="src()" [alt]="alt()" draggable="false" decoding="sync" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "tock-card.component.scss",
})
export class TockCardComponent {
  readonly value = input("");
  readonly suit = input("");

  protected readonly src = computed(() => cardSvgUrl(toCardId(this.value(), this.suit())));
  protected readonly alt = computed(() => (this.value() === JOKER_VALUE ? "Joker" : `${this.value()} of ${this.suit()}`));
}
