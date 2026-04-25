import { useQuery } from '@tanstack/react-query'
import { get } from '../client'
import type { PlaceCandidatesResponse, PlaceSuggestionsResponse } from '../types'

function roundCoord(v?: number | null): number | null {
  if (v == null) return null
  return Math.round(v * 100) / 100
}

export function useNearbyPlaces(lat?: number | null, lng?: number | null, radiusM = 16093) {
  const rLat = roundCoord(lat)
  const rLng = roundCoord(lng)
  return useQuery({
    queryKey: ['places-nearby', rLat, rLng, radiusM],
    queryFn: () => {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radius_m: String(radiusM),
      })
      return get<PlaceCandidatesResponse>(`/courses/places/nearby?${params}`)
    },
    enabled: lat != null && lng != null,
    staleTime: 10 * 60 * 1000,
  })
}

export function usePlacesSearch(query: string, lat?: number | null, lng?: number | null) {
  const rLat = roundCoord(lat)
  const rLng = roundCoord(lng)
  const q = query.trim()
  return useQuery({
    queryKey: ['places-search', q, rLat, rLng],
    queryFn: () => {
      const params = new URLSearchParams({ q })
      if (lat != null) params.set('lat', String(lat))
      if (lng != null) params.set('lng', String(lng))
      return get<PlaceCandidatesResponse>(`/courses/places/search?${params}`)
    },
    enabled: q.length >= 3,
    staleTime: 5 * 60 * 1000,
  })
}

export function usePlacesAutocomplete(query: string, lat?: number | null, lng?: number | null) {
  const rLat = roundCoord(lat)
  const rLng = roundCoord(lng)
  const q = query.trim()
  return useQuery({
    queryKey: ['places-autocomplete', q, rLat, rLng],
    queryFn: () => {
      const params = new URLSearchParams({ q })
      if (lat != null) params.set('lat', String(lat))
      if (lng != null) params.set('lng', String(lng))
      return get<PlaceSuggestionsResponse>(`/courses/places/autocomplete?${params}`)
    },
    enabled: q.length >= 3,
    staleTime: 5 * 60 * 1000,
  })
}
