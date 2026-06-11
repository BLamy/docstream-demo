import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api, type Page } from "@/lib/api"

export function usePages() {
  return useQuery({ queryKey: ["pages"], queryFn: api.getPages })
}

export function usePage(id: string | null) {
  return useQuery({
    queryKey: ["page", id],
    queryFn: () => api.getPage(id!),
    enabled: !!id,
  })
}

export function useCreatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string }) => api.createPage(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pages"] }),
  })
}

export function useUpdatePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Page> }) =>
      api.updatePage(id, patch),
    onSuccess: (page) => {
      qc.setQueryData(["page", page.id], page)
      qc.invalidateQueries({ queryKey: ["pages"] })
    },
  })
}

export function useDeletePage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deletePage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pages"] }),
  })
}
