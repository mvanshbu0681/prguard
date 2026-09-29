// Server-safe (no 'use client'): the dashboard's pre-paint script, inlined in
// the ROOT layout's <head> so it runs before first paint on a hard load of any
// dashboard route — and is never re-rendered by React on a client navigation
// (an inline <script> inside a route layout is, and React warns about it).
// It only touches <html> on dashboard paths, so the landing stays untouched;
// on a client navigation into the dashboard, AppShell applies the same state
// in a layout effect before paint.
import { CONTRAST_ATTR, CONTRAST_STORAGE_KEY, DASHBOARD_PATH_RE, DENSITY_ATTR, DENSITY_STORAGE_KEY, RAIL_ATTR, SIDEBAR_STORAGE_KEY } from '@/components/app-shell/pref-keys';
import { DASH_THEME_INIT_JS } from './theme-init';

const j = JSON.stringify;

export const DASH_PREPAINT_JS = `(function(){try{if(!new RegExp(${j(DASHBOARD_PATH_RE)}).test(location.pathname))return;}catch(e){return;}${DASH_THEME_INIT_JS}try{var d=document.documentElement,l=localStorage;if(l.getItem(${j(CONTRAST_STORAGE_KEY)})==='1')d.setAttribute(${j(CONTRAST_ATTR)},'high');if(l.getItem(${j(DENSITY_STORAGE_KEY)})==='1')d.setAttribute(${j(DENSITY_ATTR)},'compact');if(l.getItem(${j(SIDEBAR_STORAGE_KEY)})==='1')d.setAttribute(${j(RAIL_ATTR)},'');}catch(e){}})();`;
