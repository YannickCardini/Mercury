import { Component, ChangeDetectionStrategy, OnInit, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { SeoService } from "../shared/seo.service";
import { RulesLangSwitchComponent } from "./rules-lang-switch.component";

@Component({
  selector: "app-rules-tock",
  standalone: true,
  templateUrl: "./tock.page.html",
  styleUrl: "./rules-page.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterLink, RulesLangSwitchComponent],
})
export class TockRulesPage implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.apply({
      lang: "fr",
      path: "/rules/tock",
      title: "Règles du Tock : comment jouer aux cartes et aux billes | Mercury",
      description:
        "Règles complètes du Tock (ou Toc) : mise en place, effet de chaque carte, mode équipes 2 contre 2. Jouez gratuitement en ligne sur Mercury.",
      alternates: [
        { lang: "fr", path: "/rules/tock" },
        { lang: "nl", path: "/rules/keezen" },
        { lang: "de", path: "/rules/dog" },
        { lang: "en", path: "/rules/pegs-and-jokers" },
        { lang: "x-default", path: "/rules/pegs-and-jokers" },
      ],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Combien de joueurs faut-il pour jouer au Tock ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Traditionnellement 2, 4 ou 6 joueurs selon le plateau. Sur Mercury, chaque partie réunit exactement 4 joueurs, répartis par défaut en deux équipes de 2.",
            },
          },
          {
            "@type": "Question",
            name: "Le Tock se joue-t-il obligatoirement en équipe ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Non, il existe une variante où chaque joueur joue pour lui-même. Sur Mercury, le mode par défaut est le mode équipes 2 contre 2, mais l'effet des cartes reste le même dans les deux cas.",
            },
          },
          {
            "@type": "Question",
            name: "Quelle est la différence entre le Tock et le jeu des petits chevaux ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Les deux jeux appartiennent à la même famille des jeux de parcours dérivés du Pachisi indien, mais le Tock se joue avec un jeu de 54 cartes (jokers inclus) à la place d'un dé, ce qui ouvre beaucoup plus de choix tactiques à chaque tour.",
            },
          },
          {
            "@type": "Question",
            name: "Quelles cartes permettent de faire sortir une bille ?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "L'As, le Roi et le Joker permettent de faire entrer une bille sur la case de départ.",
            },
          },
        ],
      },
    });
  }
}
