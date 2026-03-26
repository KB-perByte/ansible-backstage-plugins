import { useEffect, useState } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { apiDocsPlugin, ApiExplorerPage } from '@backstage/plugin-api-docs';
import {
  CatalogEntityPage,
  CatalogIndexPage,
  catalogPlugin,
} from '@backstage/plugin-catalog';
import {
  CatalogImportPage,
  catalogImportPlugin,
} from '@backstage/plugin-catalog-import';
import { ScaffolderPage, scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { ScaffolderFieldExtensions } from '@backstage/plugin-scaffolder-react';
import { orgPlugin } from '@backstage/plugin-org';
import { SearchPage } from '@backstage/plugin-search';
import {
  TechDocsIndexPage,
  techdocsPlugin,
  TechDocsReaderPage,
} from '@backstage/plugin-techdocs';
import { TechDocsAddons } from '@backstage/plugin-techdocs-react';
import { ReportIssue } from '@backstage/plugin-techdocs-module-addons-contrib';
import { UserSettingsPage } from '@backstage/plugin-user-settings';
import { apis } from './apis';
import { entityPage } from './components/catalog/EntityPage';
import { searchPage } from './components/search/SearchPage';
import { Root } from './components/Root';
import { GlobalHeader } from './components/GlobalHeader';
import { getThemes } from '@red-hat-developer-hub/backstage-plugin-theme';

import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { SignInPage } from '@ansible/plugin-backstage-self-service';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { CatalogGraphPage } from '@backstage/plugin-catalog-graph';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import { AnsiblePage } from '@ansible/plugin-backstage-rhaap';
import { DelayingComponentFieldExtension } from './components/scaffolder/customScaffolderExtensions';
import {
  AAPTokenFieldExtension,
  AAPResourcePickerExtension,
  BaseImagePickerFieldExtension,
  CollectionsPickerFieldExtension,
  EEFileNamePickerFieldExtension,
  FileUploadPickerFieldExtension,
  PackagesPickerFieldExtension,
  MCPServersPickerFieldExtension,
  AdditionalBuildStepsPickerFieldExtension,
  SelfServicePage,
} from '@ansible/plugin-backstage-self-service';
import { RbacPage } from '@backstage-community/plugin-rbac';

const app = createApp({
  apis,
  bindRoutes({ bind }) {
    bind(catalogPlugin.externalRoutes, {
      createComponent: scaffolderPlugin.routes.root,
      viewTechDoc: techdocsPlugin.routes.docRoot,
      createFromTemplate: scaffolderPlugin.routes.selectedTemplate,
    });
    bind(apiDocsPlugin.externalRoutes, {
      registerApi: catalogImportPlugin.routes.importPage,
    });
    bind(scaffolderPlugin.externalRoutes, {
      registerComponent: catalogImportPlugin.routes.importPage,
      viewTechDoc: techdocsPlugin.routes.docRoot,
    });
    bind(orgPlugin.externalRoutes, {
      catalogIndex: catalogPlugin.routes.catalogIndex,
    });
  },
  components: {
    SignInPage: props => <SignInPage {...props} />,
  },
  themes: getThemes(),
});

/**
 * Smart root redirect: checks setup status and redirects to setup wizard
 * if onboarding is enabled and not complete, otherwise to catalog.
 */
function RootRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const baseUrl =
      window.location.port === '3000'
        ? 'http://localhost:7007'
        : '';
    fetch(`${baseUrl}/api/rhaap-backend/setup/status`)
      .then(res => res.json())
      .then(data => {
        if (data?.data?.onboardingEnabled && !data?.data?.setupComplete) {
          setTarget('/self-service/setup');
        } else {
          setTarget('/self-service/catalog');
        }
      })
      .catch(() => setTarget('/self-service/catalog'));
  }, []);

  if (!target) return null;
  return <Navigate to={target} replace />;
}

const routes = (
  <FlatRoutes>
    <Route path="/" element={<RootRedirect />} />
    <Route path="/catalog" element={<CatalogIndexPage />} />
    <Route
      path="/catalog/:namespace/:kind/:name"
      element={<CatalogEntityPage />}
    >
      {entityPage}
    </Route>
    <Route path="/docs" element={<TechDocsIndexPage />} />
    <Route
      path="/docs/:namespace/:kind/:name/*"
      element={<TechDocsReaderPage />}
    >
      <TechDocsAddons>
        <ReportIssue />
      </TechDocsAddons>
    </Route>
    <Route path="/create" element={<ScaffolderPage />}>
      <ScaffolderFieldExtensions>
        <DelayingComponentFieldExtension />
        <AAPTokenFieldExtension />
        <AAPResourcePickerExtension />
        <BaseImagePickerFieldExtension />
        <CollectionsPickerFieldExtension />
        <EEFileNamePickerFieldExtension />
        <FileUploadPickerFieldExtension />
        <PackagesPickerFieldExtension />
        <MCPServersPickerFieldExtension />
        <AdditionalBuildStepsPickerFieldExtension />
      </ScaffolderFieldExtensions>
    </Route>
    <Route path="/api-docs" element={<ApiExplorerPage />} />
    <Route
      path="/catalog-import"
      element={
        <RequirePermission permission={catalogEntityCreatePermission}>
          <CatalogImportPage />
        </RequirePermission>
      }
    />
    <Route path="/search" element={<SearchPage />}>
      {searchPage}
    </Route>
    <Route path="/rbac" element={<RbacPage />} />
    <Route path="/settings" element={<UserSettingsPage />} />
    <Route path="/catalog-graph" element={<CatalogGraphPage />} />
    <Route path="/ansible" element={<AnsiblePage />} />
    <Route path="/self-service" element={<SelfServicePage />} />
  </FlatRoutes>
);

export default app.createRoot(
  <>
    <AlertDisplay />
    <OAuthRequestDialog />
    <AppRouter>
      <GlobalHeader />
      <Root>{routes}</Root>
    </AppRouter>
  </>,
);
