/** Vistas personales: `/me/summary/`, `/me/participations/`, `/me/activity/`, `/auth/sessions/`. */
import type { IsoDateTime, Money, Uuid } from '@/api/types'
import type { AuctionStatus, ClosingPolicy, Mechanism } from '@/features/auctions/types'

export interface MySummary {
  server_time: IsoDateTime
  participations: { leading: number; outbid: number; sealed_offers: number; won: number }
  my_auctions: { draft: number; scheduled_or_active: number; sold: number; unsold: number }
  unread_notifications: number
  /** Informativo: LANCEX no procesa pagos ni guarda saldos (mostrar `notice`). */
  operations: {
    notice: string
    bought_total: Money
    sold_total: Money
    settled_as_buyer: Money
    settled_as_seller: Money
    pending_settlements: number
  }
}

export type ParticipationTab = 'active' | 'won' | 'lost'

export type MyStatus =
  | 'leading'
  | 'outbid'
  | 'offer_submitted'
  | 'offer_withdrawn'
  | 'pending_result'
  | 'won'
  | 'lost'
  | 'cancelled'

/** Fila de `/mis-pujas`: solo datos PROPIOS (mi última puja, mi máximo, mi oferta sellada). */
export interface Participation {
  auction_id: Uuid
  title: string | null
  mechanism: Mechanism
  closing_policy: ClosingPolicy
  status: AuctionStatus
  ends_at: IsoDateTime | null
  my_status: MyStatus
  current_price: Money | null
  my_last_bid: Money | null
  my_proxy_max: Money | null
  my_sealed_offer: Money | null
}

export interface ActivityEvent {
  id: number
  occurred_at: IsoDateTime
  action: string
  entity_type: string
  auction_id: Uuid | null
  auction_title: string | null
  details: Record<string, unknown>
}

export interface UserSessionInfo {
  /** Id derivado (hash): nunca la clave de sesión. */
  id: string
  is_current: boolean
  expires_at: IsoDateTime
}

export const MY_STATUS_LABEL: Record<MyStatus, string> = {
  leading: 'Vas ganando',
  outbid: 'Te superaron',
  offer_submitted: 'Oferta enviada',
  offer_withdrawn: 'Oferta retirada',
  pending_result: 'Calculando resultado',
  won: 'Ganaste',
  lost: 'No ganaste',
  cancelled: 'Cancelada',
}

export const MY_STATUS_TONE: Record<MyStatus, string> = {
  leading: 'bg-emerald-500/15 text-emerald-300',
  outbid: 'bg-red-500/15 text-red-300',
  offer_submitted: 'bg-primary/20 text-link',
  offer_withdrawn: 'bg-muted text-muted-foreground',
  pending_result: 'bg-amber-500/15 text-amber-300',
  won: 'bg-emerald-500/15 text-emerald-300',
  lost: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
}

/** Acciones del registro de actividad (lista blanca del backend). Las nuevas usan un texto genérico. */
export const ACTIVITY_LABEL: Record<string, string> = {
  bid_accepted: 'Pujaste',
  auction_created: 'Creaste una subasta',
  auction_draft_updated: 'Editaste un borrador',
  auction_published: 'Publicaste una subasta',
  auction_text_corrected: 'Corregiste el texto de una subasta',
  auction_cancelled: 'Cancelaste una subasta',
  settlement_updated: 'Actualizaste la liquidación',
  rating_submitted: 'Calificaste a la contraparte',
  report_created: 'Enviaste un reporte',
  organization_created: 'Registraste una organización',
  organization_updated: 'Editaste una organización',
  participant_registered: 'Inscribiste a tu organización',
  sealed_offer_submitted: 'Enviaste una oferta sellada',
  sealed_offer_updated: 'Reemplazaste tu oferta sellada',
  sealed_offer_withdrawn: 'Retiraste tu oferta sellada',
  proxy_limit_set: 'Configuraste la puja automática',
  proxy_limit_raised: 'Subiste tu máximo automático',
  security_password_changed: 'Cambiaste tu contraseña',
  security_sessions_revoked: 'Cerraste las demás sesiones',
  security_mfa_enabled: 'Activaste la verificación en dos pasos',
  security_mfa_disabled: 'Desactivaste la verificación en dos pasos',
  security_mfa_recovery_codes_regenerated: 'Generaste nuevos códigos de respaldo',
  security_mfa_recovery_code_used: 'Entraste con un código de respaldo',
  security_mfa_reset_by_admin: 'Quitaste la verificación en dos pasos de un usuario',
  security_password_reset_issued: 'Generaste un enlace de restablecimiento',
  security_password_reset_completed: 'Restableciste tu contraseña',
  user_profile_updated: 'Actualizaste tu perfil',
  user_registered: 'Creaste tu cuenta',
}
