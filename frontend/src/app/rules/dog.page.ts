import { Component, ChangeDetectionStrategy, OnInit, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { SeoService } from "../shared/seo.service";
import { RulesLangSwitchComponent } from "./rules-lang-switch.component";

@Component({
  selector: "app-rules-dog",
  standalone: true,
  templateUrl: "./dog.page.html",
  styleUrl: "./rules-page.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterLink, RulesLangSwitchComponent],
})
export class DogRulesPage implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.apply({
      lang: "de",
      path: "/rules/dog",
      title: "Dog Spielregeln: Murmeln & Karten einfach erklärt | Mercury",
      description:
        "Die kompletten Dog-Spielregeln: Vorbereitung, Kartenwerte, 2-gegen-2-Teammodus. Jetzt kostenlos online Dog spielen auf Mercury.",
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
            name: "Wie viele Spieler braucht man für Dog?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Traditionell 4, 6 oder 8 Spieler je nach Spielbrett. Auf Mercury spielt ihr immer zu genau 4 Spielern, standardmäßig in zwei 2er-Teams.",
            },
          },
          {
            "@type": "Question",
            name: "Was ist der Unterschied zwischen Dog und Mensch ärgere dich nicht?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Beide Spiele gehen auf das indische Brettspiel Pachisi zurück, aber bei Dog werden die Murmeln nicht mit einem Würfel, sondern mit Spielkarten bewegt, was deutlich mehr taktische Entscheidungen ermöglicht.",
            },
          },
          {
            "@type": "Question",
            name: "Mit welchen Karten kann man eine Murmel einsetzen?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Mit einem Ass, einem König oder einem Joker darf eine Murmel auf das Startfeld gesetzt werden.",
            },
          },
          {
            "@type": "Question",
            name: "Wie heißt Dog in anderen Ländern?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Dasselbe Spiel heißt Tock in Frankreich und im Englischen, und Keezen in den Niederlanden.",
            },
          },
        ],
      },
    });
  }
}
