import {
  createComponentExtension,
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef, setupRouteRef } from './routes';
import { AAPApis, AapAuthApi, PortalAdminApis } from './apis';

export const selfServicePlugin = createPlugin({
  id: 'self-service',
  apis: [AAPApis, AapAuthApi, PortalAdminApis],
  routes: {
    root: rootRouteRef,
  },
});

export const SelfServicePage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'SelfServicePage',
    component: () => import('./components/RouteView').then(m => m.RouteView),
    mountPoint: rootRouteRef,
  }),
);

/**
 * @public
 */
export const LocationListener = selfServicePlugin.provide(
  createComponentExtension({
    name: 'LocationListener',
    component: {
      lazy: () =>
        import('./components/LocationListener').then(m => m.LocationListener),
    },
  }),
);

/**
 * Setup wizard page — shown on first boot when onboarding is enabled.
 * @public
 */
export const SetupWizardPage = selfServicePlugin.provide(
  createRoutableExtension({
    name: 'SetupWizardPage',
    component: () =>
      import('./components/SetupWizard').then(m => m.SetupWizard),
    mountPoint: setupRouteRef,
  }),
);

/**
 * Setup gate — checks setup status and redirects to wizard if needed.
 * Mounted as application/listener.
 * @public
 */
export const SetupGate = selfServicePlugin.provide(
  createComponentExtension({
    name: 'SetupGate',
    component: {
      lazy: () =>
        import('./components/SetupGate').then(m => m.SetupGate),
    },
  }),
);
