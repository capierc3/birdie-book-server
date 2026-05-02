import { useQuery } from '@tanstack/react-query'
import { get } from '../client'

export type TagCategory = 'bring_in' | 'pull_out' | 'intention' | 'performance' | 'pattern' | 'response'

export interface Tag {
  id: number
  category: TagCategory
  sub_category: string | null
  name: string
  is_default: boolean
  is_archived: boolean
  sort_order: number
  times_used: number
}

export function useTags(category?: TagCategory) {
  const qs = category ? `?category=${category}` : ''
  return useQuery({
    queryKey: ['tags', category ?? 'all'],
    queryFn: () => get<Tag[]>(`/tags${qs}`),
    staleTime: 60 * 1000, // tags change rarely; 1 minute is plenty
    refetchOnMount: 'always',
  })
}
