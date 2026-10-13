import { formatMoney } from '@/lib/money'

import { formatDate, formatQuantity } from './format'
import type { Requirement } from './types'

/** Ficha de una necesidad B2B (pública). Texto plano: nunca HTML del usuario. */
export function NeedSummary({
  need,
  budget,
  minDecrement,
}: {
  need: {
    buyer_organization: { legal_name: string }
    specifications: string
    quantity: string
    unit: string
    mandatory_requirements: Requirement[]
    delivery_deadline: string
    delivery_location: string
  }
  budget?: string
  minDecrement?: string
}) {
  const rows: [string, string][] = [
    ['Compradora', need.buyer_organization.legal_name],
    ['Cantidad', `${formatQuantity(need.quantity)} ${need.unit}`],
    ['Entrega hasta', formatDate(need.delivery_deadline)],
    ['Lugar de entrega', need.delivery_location],
  ]
  if (budget) rows.push(['Presupuesto referencial', formatMoney(budget)])
  if (minDecrement) rows.push(['Decremento mínimo', formatMoney(minDecrement)])
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Necesidad</h2>
      <p className="text-sm leading-relaxed whitespace-pre-line">{need.specifications}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {need.mandatory_requirements.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Requisitos obligatorios</h3>
          <ul className="space-y-1 text-sm">
            {need.mandatory_requirements.map((r) => (
              <li key={r.code}>
                <span className="mr-2 rounded bg-muted px-1.5 font-mono text-xs">{r.code}</span>
                {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
