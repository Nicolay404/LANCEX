import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { isApiError } from '@/api/errors'
import { ErrorAlert } from '@/components/ErrorAlert'
import { PageLoading } from '@/components/PageLoading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  adminKeys,
  createCategory,
  fetchAdminCategories,
  updateCategory,
  type AdminCategory,
} from '@/features/admin/api'
import { listingKeys } from '@/features/listings/api'

const SLUG_RE = /^[a-z0-9-]{2,60}$/

/** "Ropa y calzado" → "ropa-y-calzado" (sugerencia; el backend valida). */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** `/admin/categorias` (capacidad `admin.manage_categories`): crear, renombrar, activar/desactivar. */
export function CategoriesPage() {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: adminKeys.categories,
    queryFn: ({ signal }) => fetchAdminCategories(signal),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.categories })
    // El selector de categorías de las publicaciones usa la lista pública.
    void queryClient.invalidateQueries({ queryKey: listingKeys.categories })
  }
  return (
    <section className="space-y-6">
      <NewCategory onDone={refresh} />
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorAlert error={list.error} />
      ) : (
        <ul className="divide-y rounded-xl border">
          {list.data.map((c) => (
            <CategoryRow key={c.id} c={c} onDone={refresh} />
          ))}
        </ul>
      )}
    </section>
  )
}

function NewCategory({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const mutation = useMutation({
    mutationFn: () => createCategory(name.trim(), slug),
    onSuccess: () => {
      setName('')
      setSlug('')
      setSlugTouched(false)
      onDone()
    },
  })
  const valid = name.trim().length >= 2 && SLUG_RE.test(slug)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) mutation.mutate()
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">Nueva categoría</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cat-name">Nombre</Label>
          <Input
            id="cat-name"
            maxLength={60}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-slug">Slug</Label>
          <Input
            id="cat-slug"
            maxLength={60}
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
            aria-describedby="cat-slug-hint"
          />
        </div>
        <Button type="submit" disabled={!valid || mutation.isPending}>
          {mutation.isPending ? 'Creando…' : 'Crear'}
        </Button>
      </div>
      <p id="cat-slug-hint" className="text-xs text-muted-foreground">
        Minúsculas, números y guiones. No se puede cambiar después.
      </p>
      {mutation.isError && (
        <ErrorAlert
          error={mutation.error}
          title={
            isApiError(mutation.error) && mutation.error.code === 'SLUG_ALREADY_EXISTS'
              ? 'Ese slug ya existe'
              : undefined
          }
        />
      )}
    </form>
  )
}

function CategoryRow({ c, onDone }: { c: AdminCategory; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const mutation = useMutation({
    mutationFn: (changes: { name?: string; is_active?: boolean }) => updateCategory(c.id, changes),
    onSuccess: () => {
      setEditing(false)
      onDone()
    },
  })
  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={`cat-${c.id}`} className="sr-only">
              Nombre de {c.name}
            </Label>
            <Input
              id={`cat-${c.id}`}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-56"
            />
            <Button
              size="sm"
              disabled={name.trim().length < 2 || name.trim() === c.name || mutation.isPending}
              onClick={() => mutation.mutate({ name: name.trim() })}
            >
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <p>
            <span className={c.is_active ? 'font-medium' : 'font-medium text-muted-foreground'}>
              {c.name}
            </span>{' '}
            <span className="font-mono text-xs text-muted-foreground">{c.slug}</span>
            {!c.is_active && (
              <span className="ml-2 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                Inactiva
              </span>
            )}
          </p>
        )}
        {!editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Renombrar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ is_active: !c.is_active })}
            >
              {c.is_active ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        )}
      </div>
      {mutation.isError && <ErrorAlert error={mutation.error} />}
    </li>
  )
}
