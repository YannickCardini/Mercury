import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import {
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from "@angular/router";
import { provideHttpClient, withXhr } from "@angular/common/http";
import { provideIonicAngular } from "@ionic/angular/standalone";

import { routes } from "./app/app.routes";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    provideIonicAngular(),
    provideHttpClient(withXhr()),
    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
});
