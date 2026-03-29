import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';

/**
 * Prepends the app base path to relative API URLs when served under a path prefix.
 * 
 * Example: when APP_BASE_HREF is '/schedule/', transforms:
 *   /api/share → /schedule/api/share
 *   /api/workspace → /schedule/api/workspace
 * 
 * This ensures API requests route correctly through nginx when the app
 * is served at a subpath (e.g., localhost:8080/schedule/ instead of root).
 */
export const apiBasePathInterceptor: HttpInterceptorFn = (req, next) => {
  const baseHref = inject(APP_BASE_HREF);
  
  // Only modify relative API URLs that start with /api/
  if (req.url.startsWith('/api/') && baseHref && baseHref !== '/') {
    // Remove trailing slash from base href if present
    const base = baseHref.endsWith('/') ? baseHref.slice(0, -1) : baseHref;
    
    // Prepend base path to API URL
    const modifiedReq = req.clone({
      url: `${base}${req.url}`
    });
    
    return next(modifiedReq);
  }
  
  return next(req);
};
