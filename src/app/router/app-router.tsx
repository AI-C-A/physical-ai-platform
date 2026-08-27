import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { APP_ROUTES } from './app-routes';

const router = createBrowserRouter(APP_ROUTES);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
