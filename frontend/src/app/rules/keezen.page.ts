import { Component, ChangeDetectionStrategy, OnInit, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { SeoService } from "../shared/seo.service";
import { RulesLangSwitchComponent } from "./rules-lang-switch.component";

@Component({
  selector: "app-rules-keezen",
  standalone: true,
  templateUrl: "./keezen.page.html",
  styleUrl: "./rules-page.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterLink, RulesLangSwitchComponent],
})
export class KeezenRulesPage implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.apply({
      lang: "nl",
      path: "/rules/keezen",
      title: "Keezen spelregels: hoe speel je Keezenspel? | Mercury",
      description:
        "Alle Keezen spelregels op een rij: opstelling, kaartwaarden, teamvariant 2 tegen 2. Speel Keezen nu gratis online op Mercury.",
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
            name: "Met hoeveel spelers speel je Keezen?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Van oudsher tussen 2 en 8 spelers, afhankelijk van het bord. Op Mercury speel je altijd met precies 4 spelers, standaard verdeeld in twee teams van 2.",
            },
          },
          {
            "@type": "Question",
            name: "Wat is het verschil tussen Keezen en Mens erger je niet?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Beide spellen zijn afgeleid van het Indiase bordspel Pachisi, maar bij Keezen gebruik je speelkaarten in plaats van een dobbelsteen om je pionnen vooruit te zetten, wat veel meer tactische keuzes geeft.",
            },
          },
          {
            "@type": "Question",
            name: "Welke kaarten mag je gebruiken om een pion in te zetten?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Met een Aas, een Heer of een Joker mag je een pion vanaf je startvak inzetten.",
            },
          },
          {
            "@type": "Question",
            name: "Hoe heet Keezen in andere landen?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Hetzelfde spel heet Tock in Frankrijk en in het Engels, en Dog in Duitsland en Zwitserland.",
            },
          },
        ],
      },
    });
  }
}
