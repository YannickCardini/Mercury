import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { RouterLink } from "@angular/router";

export type RuleLang = "tock" | "keezen" | "dog" | "pegs";

interface LangLink {
  key: RuleLang;
  path: string;
  label: string;
  flag: string;
}

const LINKS: LangLink[] = [
  { key: "tock", path: "/rules/tock", label: "Français", flag: "🇫🇷" },
  { key: "keezen", path: "/rules/keezen", label: "Nederlands", flag: "🇳🇱" },
  { key: "dog", path: "/rules/dog", label: "Deutsch", flag: "🇩🇪" },
  { key: "pegs", path: "/rules/pegs-and-jokers", label: "English", flag: "🇬🇧" },
];

@Component({
  selector: "app-rules-lang-switch",
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./rules-lang-switch.component.scss",
  template: `
    <nav class="rls-switch" aria-label="Choix de la langue">
      @for (link of links; track link.key) {
        <a [routerLink]="link.path" class="rls-link" [class.active]="link.key === current">
          <span class="rls-flag" aria-hidden="true">{{ link.flag }}</span>{{ link.label }}
        </a>
      }
    </nav>
  `,
})
export class RulesLangSwitchComponent {
  @Input({ required: true }) current!: RuleLang;
  readonly links = LINKS;
}
