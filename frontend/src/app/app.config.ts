import { ApplicationConfig, provideZonelessChangeDetection, APP_INITIALIZER, inject } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { APP_BASE_HREF } from '@angular/common';
import { routes } from './app.routes';
import { apiBasePathInterceptor } from './api-base-path.interceptor';
import { DbService } from './services/db.service';
import { DeviceService } from './services/device.service';
import { createEphemeDeviceDbBootstrap } from '@epheme/core/browser';

console.log('🟢 LEAVEAT APP CONFIG LOADED - window.location:', window.location.href);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([apiBasePathInterceptor])),
    provideAnimationsAsync(),
    provideRouter(routes),
    { provide: APP_BASE_HREF, useValue: '/' },
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const db = inject(DbService);
        const device = inject(DeviceService);
        return createEphemeDeviceDbBootstrap(device, db);
      },
      multi: true,
    },
  ]
};
