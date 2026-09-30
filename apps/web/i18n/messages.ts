import enAuth from '../messages/en/auth.json';
import enCommon from '../messages/en/common.json';
import enDashboard from '../messages/en/dashboard.json';
import enErrors from '../messages/en/errors.json';
import enAdmin from '../messages/en/admin.json';
import enBilling from '../messages/en/billing.json';
import enFixes from '../messages/en/fixes.json';
import enNavigation from '../messages/en/navigation.json';
import enPublic from '../messages/en/public.json';
import enReadiness from '../messages/en/readiness.json';
import enReports from '../messages/en/reports.json';
import enScan from '../messages/en/scan.json';
import enSettings from '../messages/en/settings.json';
import enUsage from '../messages/en/usage.json';
import arAuth from '../messages/ar/auth.json';
import arCommon from '../messages/ar/common.json';
import arDashboard from '../messages/ar/dashboard.json';
import arErrors from '../messages/ar/errors.json';
import arAdmin from '../messages/ar/admin.json';
import arBilling from '../messages/ar/billing.json';
import arFixes from '../messages/ar/fixes.json';
import arNavigation from '../messages/ar/navigation.json';
import arPublic from '../messages/ar/public.json';
import arReadiness from '../messages/ar/readiness.json';
import arReports from '../messages/ar/reports.json';
import arScan from '../messages/ar/scan.json';
import arSettings from '../messages/ar/settings.json';
import arUsage from '../messages/ar/usage.json';

export const messagesByLocale = {
  en: {
    auth: enAuth,
    common: enCommon,
    dashboard: enDashboard,
    errors: enErrors,
    admin: enAdmin,
    billing: enBilling,
    fixes: enFixes,
    navigation: enNavigation,
    public: enPublic,
    readiness: enReadiness,
    reports: enReports,
    scan: enScan,
    settings: enSettings,
    usage: enUsage,
  },
  ar: {
    auth: arAuth,
    common: arCommon,
    dashboard: arDashboard,
    errors: arErrors,
    admin: arAdmin,
    billing: arBilling,
    fixes: arFixes,
    navigation: arNavigation,
    public: arPublic,
    readiness: arReadiness,
    reports: arReports,
    scan: arScan,
    settings: arSettings,
    usage: arUsage,
  },
} as const;
