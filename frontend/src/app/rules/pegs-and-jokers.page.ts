import { Component, ChangeDetectionStrategy, OnInit, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { SeoService } from "../shared/seo.service";
import { RulesLangSwitchComponent } from "./rules-lang-switch.component";

@Component({
  selector: "app-rules-pegs-and-jokers",
  standalone: true,
  templateUrl: "./pegs-and-jokers.page.html",
  styleUrl: "./rules-page.scss",
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterLink, RulesLangSwitchComponent],
})
export class PegsAndJokersRulesPage implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.apply({
      lang: "en",
      path: "/rules/pegs-and-jokers",
      title: "Pegs and Jokers Rules: How to Play (Cards & Marbles) | Mercury",
      description:
        "Complete Pegs and Jokers rules (aka Tock): setup, card values, 2v2 team mode. Play free online right now on Mercury, no download needed.",
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
            name: "How many players do you need for Pegs and Jokers?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Traditionally 4, 6, or 8 players depending on the board. On Mercury, every game seats exactly 4 players, split by default into two teams of 2.",
            },
          },
          {
            "@type": "Question",
            name: "What's the difference between Pegs and Jokers and Sorry! or Ludo?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "All of these trace back to the Indian race game Pachisi, but Pegs and Jokers uses a standard deck of playing cards instead of dice to move marbles, which adds a lot more tactical choice to every turn.",
            },
          },
          {
            "@type": "Question",
            name: "Which cards let you bring a marble into play?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "An Ace, a King, or a Joker lets you enter a marble onto your starting square.",
            },
          },
          {
            "@type": "Question",
            name: "What is this game called in other countries?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "The same game is called Tock in France, Keezen in the Netherlands, and Dog in Germany and Switzerland.",
            },
          },
        ],
      },
    });
  }
}
