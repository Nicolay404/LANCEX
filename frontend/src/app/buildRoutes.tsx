import { lazy, Suspense, type ReactNode } from 'react'
import { type RouteObject } from 'react-router'

import type { UserMe } from '@/api/types'
import { PageLoading } from '@/components/PageLoading'
import {
  ADMIN_CAPS,
  Cap,
  hasAnyCapability,
  hasCapability,
  MODERATION_CAPS,
} from '@/features/auth/capabilities'
import { GuestOnly } from '@/features/auth/GuestOnly'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'

import { CatalogPage } from '@/features/auctions/CatalogPage'

import { AppLayout } from './AppLayout'
import { NotFoundPage } from './pages/NotFoundPage'

/*
 * Paquetes por rol (ADR-0006). Cada `import()` genera un chunk aparte y solo se ejecuta si la
 * ruta está registrada, es decir, si `/auth/me` trajo la capacidad. Un usuario sin la capacidad
 * no descarga ese código y la ruta responde 404.
 */
const AuctionDetailPage = lazy(() => import('@/packages/auction/AuctionDetailPage'))
const NewAuctionPage = lazy(() => import('@/packages/auction-create/NewAuctionPage'))
const AuctionResultPage = lazy(() => import('@/packages/auction/AuctionResultPage'))
const RatePage = lazy(() => import('@/packages/auction/RatePage'))
const MyAuctionsPage = lazy(() => import('@/packages/my-auctions/MyAuctionsPage'))
const MyBidsPage = lazy(() => import('@/packages/my-auctions/MyBidsPage'))
const NotificationsPage = lazy(() => import('@/packages/notifications/NotificationsPage'))
const WatchingPage = lazy(() => import('@/packages/my-auctions/WatchingPage'))
const CandleVerifyPage = lazy(() => import('@/packages/candle/CandleVerifyPage'))
const PublicProfilePage = lazy(() => import('@/packages/profile/PublicProfilePage'))
const AccountPage = lazy(() => import('@/packages/account/AccountPage'))
const UserPanelPage = lazy(() => import('@/packages/user/UserPanelPage'))
const ModerationHomePage = lazy(() => import('@/packages/moderation/ModerationHomePage'))
const AdminHomePage = lazy(() => import('@/packages/admin/AdminHomePage'))
const OrgHomePage = lazy(() => import('@/packages/org/OrgHomePage'))
const OrganizationsPage = lazy(() => import('@/packages/org/OrganizationsPage'))
const MyListingsPage = lazy(() => import('@/packages/listings/MyListingsPage'))
const NewListingPage = lazy(() => import('@/packages/listings/NewListingPage'))
const EditListingPage = lazy(() => import('@/packages/listings/EditListingPage'))

const withSuspense = (node: ReactNode) => <Suspense fallback={<PageLoading />}>{node}</Suspense>

/** Rutas visibles para este usuario. Lo que no esté aquí no existe (404). */
export function buildRoutes(me: UserMe | null): RouteObject[] {
  // Públicas: catálogo y detalle de subasta (el detalle se descarga solo al abrirlo).
  const children: RouteObject[] = [
    { index: true, element: <CatalogPage /> },
    { path: 'subastas/:id', element: withSuspense(<AuctionDetailPage />) },
    { path: 'subastas/:id/resultado', element: withSuspense(<AuctionResultPage />) },
    { path: 'subastas/:id/verificar-vela', element: withSuspense(<CandleVerifyPage />) },
    { path: 'usuarios/:id', element: withSuspense(<PublicProfilePage />) },
    // Pública y sin GuestOnly: el enlace del admin debe funcionar aunque haya otra sesión abierta.
    { path: 'restablecer-contrasena', element: <ResetPasswordPage /> },
  ]

  // Solo visitantes: con sesión, /ingresar y /registro llevan a ?next o al inicio.
  children.push(
    {
      path: 'ingresar',
      element: (
        <GuestOnly>
          <LoginPage />
        </GuestOnly>
      ),
    },
    {
      path: 'registro',
      element: (
        <GuestOnly>
          <RegisterPage />
        </GuestOnly>
      ),
    },
  )

  if (hasCapability(me, Cap.ACCOUNT_MANAGE_OWN)) {
    children.push({ path: 'cuenta', element: withSuspense(<AccountPage />) })
  }
  if (hasCapability(me, Cap.LISTING_MANAGE_OWN)) {
    children.push(
      { path: 'mis-publicaciones', element: withSuspense(<MyListingsPage />) },
      { path: 'mis-publicaciones/nueva', element: withSuspense(<NewListingPage />) },
      { path: 'mis-publicaciones/:id/editar', element: withSuspense(<EditListingPage />) },
    )
  }
  if (hasCapability(me, Cap.RATING_SUBMIT)) {
    children.push({ path: 'calificar/:auctionId', element: withSuspense(<RatePage />) })
  }
  if (hasCapability(me, Cap.NOTIFICATION_READ_OWN)) {
    children.push({ path: 'notificaciones', element: withSuspense(<NotificationsPage />) })
  }
  if (hasCapability(me, Cap.WATCHLIST_MANAGE_OWN)) {
    children.push({ path: 'seguimiento', element: withSuspense(<WatchingPage />) })
  }
  if (hasCapability(me, Cap.AUCTION_MANAGE_OWN)) {
    children.push({ path: 'mis-subastas', element: withSuspense(<MyAuctionsPage />) })
  }
  if (hasCapability(me, Cap.AUCTION_CREATE_PERSONAL)) {
    children.push({ path: 'mis-subastas/nueva', element: withSuspense(<NewAuctionPage />) })
  }
  if (hasCapability(me, Cap.BID_PLACE)) {
    children.push(
      { path: 'panel', element: withSuspense(<UserPanelPage />) },
      { path: 'mis-pujas', element: withSuspense(<MyBidsPage />) },
    )
  }
  if (hasAnyCapability(me, MODERATION_CAPS)) {
    children.push({ path: 'moderacion/*', element: withSuspense(<ModerationHomePage />) })
  }
  if (hasAnyCapability(me, ADMIN_CAPS)) {
    children.push({ path: 'admin/*', element: withSuspense(<AdminHomePage />) })
  }
  if (hasCapability(me, Cap.ORGANIZATION_CREATE)) {
    children.push({ path: 'organizaciones', element: withSuspense(<OrganizationsPage />) })
  }
  if (me && me.organizations.length > 0) {
    children.push({ path: 'org/:orgId/*', element: withSuspense(<OrgHomePage />) })
  }

  children.push({ path: '*', element: <NotFoundPage /> })
  return [{ path: '/', element: <AppLayout />, children }]
}
