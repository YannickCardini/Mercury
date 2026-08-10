import { Injectable, inject } from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { Meta, Title } from "@angular/platform-browser";

const SITE_URL = "https://www.mercury-game.online";

export interface SeoAlternate {
  /** Code de langue ('fr', 'nl', 'de', 'en') ou 'x-default'. */
  lang: string;
  path: string;
}

export interface SeoPage {
  lang: string;
  path: string;
  title: string;
  description: string;
  alternates: SeoAlternate[];
  jsonLd?: Record<string, unknown>;
}

/**
 * Injecte les balises SEO (title, meta, canonical, hreflang, JSON-LD) d'une page
 * dans le <head> au chargement de la route. Nécessaire en l'absence de SSR/prerendering :
 * ce sont les seules balises par-route dont dispose l'app (index.html reste statique).
 */
@Injectable({ providedIn: "root" })
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  apply(page: SeoPage): void {
    this.title.setTitle(page.title);
    this.meta.updateTag({ name: "description", content: page.description });
    this.meta.updateTag({ property: "og:title", content: page.title });
    this.meta.updateTag({ property: "og:description", content: page.description });
    this.meta.updateTag({ property: "og:type", content: "article" });
    this.meta.updateTag({ property: "og:url", content: `${SITE_URL}${page.path}` });
    this.meta.updateTag({ property: "og:locale", content: this.ogLocale(page.lang) });
    this.meta.updateTag({ name: "twitter:card", content: "summary" });
    this.meta.updateTag({ name: "twitter:title", content: page.title });
    this.meta.updateTag({ name: "twitter:description", content: page.description });

    this.document.documentElement.lang = page.lang;

    this.setCanonical(`${SITE_URL}${page.path}`);
    this.setHreflangs(page.alternates);
    this.setJsonLd(page.jsonLd);
  }

  private setCanonical(href: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement("link");
      link.setAttribute("rel", "canonical");
      this.document.head.appendChild(link);
    }
    link.setAttribute("href", href);
  }

  private setHreflangs(alternates: SeoAlternate[]): void {
    this.document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
    for (const alt of alternates) {
      const link = this.document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("hreflang", alt.lang);
      link.setAttribute("href", `${SITE_URL}${alt.path}`);
      this.document.head.appendChild(link);
    }
  }

  private setJsonLd(data: Record<string, unknown> | undefined): void {
    this.document.getElementById("seo-jsonld")?.remove();
    if (!data) return;
    const script = this.document.createElement("script");
    script.id = "seo-jsonld";
    script.type = "application/ld+json";
    script.text = JSON.stringify(data);
    this.document.head.appendChild(script);
  }

  private ogLocale(lang: string): string {
    switch (lang) {
      case "fr": return "fr_FR";
      case "nl": return "nl_NL";
      case "de": return "de_DE";
      default: return "en_US";
    }
  }
}
