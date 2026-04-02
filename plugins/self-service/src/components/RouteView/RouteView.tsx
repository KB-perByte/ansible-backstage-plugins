import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { RequirePermission } from '@backstage/plugin-permission-react';
import { catalogEntityCreatePermission } from '@backstage/plugin-catalog-common/alpha';
import { taskReadPermission } from '@backstage/plugin-scaffolder-common/alpha';
import { portalAdminViewPermission } from '../../hooks/adminPermissions';
import { Progress } from '@backstage/core-components';

import { HomeComponent } from '../Home';
import { CatalogImport } from '../CatalogImport';
import { CreateTask } from '../CreateTask';
import { RunTask } from '../RunTask';
import { FeedbackFooter } from '../feedback/FeedbackFooter';
import { TaskList } from '../TaskList';
import { CatalogItemsDetails } from '../CatalogItemDetails';
import { EETabs } from '../ExecutionEnvironments';
import { EEDetailsPage } from '../ExecutionEnvironments/catalog/EEDetailsPage';
import { CollectionsCatalogPage } from '../CollectionsCatalog';
import { CollectionDetailsPage } from '../CollectionsCatalog/CollectionDetailsPage';

// Lazy-loaded admin components to avoid bloating the main bundle
const SetupWizard = lazy(() =>
  import('../SetupWizard').then(m => ({ default: m.SetupWizard })),
);
const ConnectionsPage = lazy(() =>
  import('../AdminPages/ConnectionsPage').then(m => ({
    default: m.ConnectionsPage,
  })),
);
const RBACPage = lazy(() =>
  import('../AdminPages/RBACPage').then(m => ({ default: m.RBACPage })),
);

export const RouteView = () => {
  return (
    <>
      <Routes>
        <Route path="catalog" element={<HomeComponent />} />
        <Route
          path="catalog/:namespace/:templateName"
          element={<CatalogItemsDetails />}
        />
        <Route
          path="catalog-import"
          element={
            <RequirePermission permission={catalogEntityCreatePermission}>
              <CatalogImport />
            </RequirePermission>
          }
        />
        <Route path="create">
          <Route
            path="templates/:namespace/:templateName"
            element={<CreateTask />}
          />
          <Route
            path="tasks"
            element={
              <RequirePermission
                permission={taskReadPermission}
                resourceRef="scaffolder-task"
              >
                <TaskList />
              </RequirePermission>
            }
          />
          <Route
            path="tasks/:taskId"
            element={
              <RequirePermission
                permission={taskReadPermission}
                resourceRef="scaffolder-task"
              >
                <RunTask />
              </RequirePermission>
            }
          />
        </Route>
        <Route path="ee">
          <Route index element={<Navigate to="catalog" replace />} />
          <Route path="catalog" element={<EETabs />} />
          <Route path="create" element={<EETabs />} />
          <Route path="docs" element={<EETabs />} />
        </Route>
        <Route path="catalog/:templateName" element={<EEDetailsPage />} />
        <Route path="collections" element={<CollectionsCatalogPage />} />
        <Route
          path="collections/:collectionName"
          element={<CollectionDetailsPage />}
        />

        {/* Setup wizard */}
        <Route
          path="setup"
          element={
            <Suspense fallback={<Progress />}>
              <SetupWizard />
            </Suspense>
          }
        />

        {/* Admin pages — permission-gated */}
        <Route
          path="admin/connections"
          element={
            <RequirePermission permission={portalAdminViewPermission}>
              <Suspense fallback={<Progress />}>
                <ConnectionsPage />
              </Suspense>
            </RequirePermission>
          }
        />
        <Route
          path="admin/rbac"
          element={
            <RequirePermission permission={portalAdminViewPermission}>
              <Suspense fallback={<Progress />}>
                <RBACPage />
              </Suspense>
            </RequirePermission>
          }
        />

        {/* Default redirects */}
        <Route
          path="/catalog/*"
          element={<Navigate to="/self-service/catalog" />}
        />
        <Route path="*" element={<Navigate to="/self-service/catalog" />} />
      </Routes>
      <FeedbackFooter />
    </>
  );
};
