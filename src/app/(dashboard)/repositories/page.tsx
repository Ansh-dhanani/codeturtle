'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Search,
  Star,
  Code2,
  ExternalLink,
  Plug,
  PlugZap,
  Save,
  Settings2,
  Unplug,
  Loader2,
} from 'lucide-react'
import { useRepositories } from '@/module/repository/hooks/use-repositories'
import { useConnectRepository } from '@/module/repository/hooks/use-connect-repositorys'
import { disconnectRepository, updateRepositoryBehaviorSettings } from '@/module/repository/actions'
import {
  REPO_REVIEW_STYLE_OPTIONS,
  normalizeRepoReviewModes,
  type RepoReviewStyle,
} from '@/module/repository/lib/settings'

interface Repository {
  id: number
  name: string
  full_name: string
  fullName: string
  description: string | null
  html_url: string
  stargazers_count: number
  language: string | null
  topics: string[]
  isConnected: boolean
  connectedRepositoryId?: string | null
  reviewStyle?: string
  reviewModes?: string[]
  memesEnabled?: boolean
  customPrompt?: string | null
  [key: string]: unknown
}

type RepoDraft = {
  reviewModes: RepoReviewStyle[]
  memesEnabled: boolean
  customPrompt: string
}

type RepoDraftPatch = Partial<RepoDraft>

const STYLE_LABELS: Record<RepoReviewStyle, string> = {
  balanced: 'Balanced',
  professional: 'Professional',
  short: 'Short',
  funny: 'Funny + playful',
  diagram: 'Architecture diagrams',
}

function areModesEqual(a: RepoReviewStyle[], b: RepoReviewStyle[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

const Page = () => {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRepositories()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, RepoDraftPatch>>({})
  const [openSettings, setOpenSettings] = useState<Record<string, boolean>>({})
  const [connectingRepoId, setConnectingRepoId] = useState<number | null>(null)
  const [savingRepoId, setSavingRepoId] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const connectRepoMutation = useConnectRepository()

  const disconnectMutation = useMutation({
    mutationFn: async (repositoryId: string) => disconnectRepository(repositoryId),
    onSuccess: () => {
      toast.success('Repository removed')
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['connected-repositories'] })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to remove repository'
      toast.error(message)
    },
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: { repositoryId: string; draft: RepoDraft }) =>
      updateRepositoryBehaviorSettings({
        repositoryId: payload.repositoryId,
        reviewModes: payload.draft.reviewModes,
        memesEnabled: payload.draft.memesEnabled,
        customPrompt: payload.draft.customPrompt,
      }),
    onSuccess: () => {
      toast.success('Repository settings saved')
      queryClient.invalidateQueries({ queryKey: ['repositories'] })
      queryClient.invalidateQueries({ queryKey: ['connected-repositories'] })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to save repository settings'
      toast.error(message)
    },
  })

  const getLanguageColor = (language: string | null) => {
    if (!language) return 'bg-gray-400'
    const colors: Record<string, string> = {
      JavaScript: 'bg-yellow-500',
      TypeScript: 'bg-blue-500',
      Python: 'bg-green-500',
      Java: 'bg-red-500',
      'C++': 'bg-purple-500',
      C: 'bg-blue-600',
      'C#': 'bg-green-600',
      PHP: 'bg-indigo-500',
      Ruby: 'bg-red-600',
      Go: 'bg-cyan-500',
      Rust: 'bg-orange-500',
      Swift: 'bg-pink-500',
      Kotlin: 'bg-purple-600',
      Dart: 'bg-blue-400',
      HTML: 'bg-orange-400',
      CSS: 'bg-blue-300',
      Shell: 'bg-gray-600',
    }
    return colors[language] || 'bg-gray-400'
  }

  const RepositorySkeleton = () => (
    <Card>
      <CardContent className="flex items-center justify-between px-9 py-0">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-3 w-48 mt-1" />
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-3.5 w-3.5" />
            <Skeleton className="h-3 w-6" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  )

  const repositories =
    data?.pages
      .flat()
      .filter((repo) =>
        (repo as Repository).name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (repo as Repository).description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (repo as Repository).language?.toLowerCase().includes(searchQuery.toLowerCase())
      ).map((repo) => repo as Repository) ?? []

  const getDraftKey = (repo: Repository): string => repo.connectedRepositoryId || String(repo.id)

  const getDraft = (repo: Repository): RepoDraft => {
    const key = getDraftKey(repo)
    const base: RepoDraft = {
      reviewModes: normalizeRepoReviewModes(repo.reviewModes || repo.reviewStyle),
      memesEnabled: repo.memesEnabled ?? true,
      customPrompt: repo.customPrompt || '',
    }
    return {
      ...base,
      ...(drafts[key] || {}),
    }
  }

  const hasSettingsChanges = (repo: Repository): boolean => {
    if (!repo.connectedRepositoryId) return false
    const draft = getDraft(repo)
    const currentModes = normalizeRepoReviewModes(repo.reviewModes || repo.reviewStyle)

    return (
      !areModesEqual(draft.reviewModes, currentModes) ||
      draft.memesEnabled !== (repo.memesEnabled ?? true) ||
      draft.customPrompt.trim() !== (repo.customPrompt || '').trim()
    )
  }

  /* Infinite Scroll */
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage()
      },
      { rootMargin: '200px' }
    )

    if (loadMoreRef.current) observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground">
          Connect, configure, and remove repositories from one place.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <RepositorySkeleton key={index} />
            ))}
          </div>
        )}

        {isError && (
          <div className="py-10 text-center text-destructive">
            Failed to load repositories
          </div>
        )}

        {repositories.map((repo: Repository) => {
          const draft = getDraft(repo)
          const dirty = hasSettingsChanges(repo)
          const repoSettingsKey = getDraftKey(repo)
          const isSettingsOpen = Boolean(openSettings[repoSettingsKey])
          const isConnecting = connectingRepoId === repo.id
          const isRemoving = disconnectMutation.isPending && disconnectMutation.variables === repo.connectedRepositoryId
          const isSaving = savingRepoId === repo.connectedRepositoryId

          return (
            <Card
              key={repo.id}
              className="border hover:bg-muted/40 transition-colors"
            >
              <CardContent className="px-6 py-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-muted-foreground" />

                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium truncate hover:underline"
                      >
                        {repo.name}
                      </a>

                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />

                      {repo.isConnected && (
                        <Badge variant="secondary" className="text-xs">
                          Connected
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground truncate">
                      {repo.description || 'No description'}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {repo.language && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${getLanguageColor(repo.language)}`} />
                        {repo.language}
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3.5 w-3.5" />
                      {repo.stargazers_count}
                    </div>

                    {!repo.isConnected ? (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8"
                        onClick={() => {
                          const [owner, repoName] = repo.fullName.split('/')
                          setConnectingRepoId(repo.id)
                          connectRepoMutation.mutate(
                            { owner, repo: repoName, githubId: repo.id },
                            {
                              onSettled: () => {
                                setConnectingRepoId((prev) => (prev === repo.id ? null : prev))
                              },
                            },
                          )
                        }}
                        disabled={connectRepoMutation.isPending}
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Plug className="h-4 w-4 mr-1" />
                            Connect
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            setOpenSettings((prev) => ({
                              ...prev,
                              [repoSettingsKey]: !prev[repoSettingsKey],
                            }))
                          }}
                          disabled={isRemoving}
                        >
                          <Settings2 className="h-4 w-4 mr-1" />
                          {isSettingsOpen ? 'Close settings' : 'Settings'}
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8"
                          onClick={() => {
                            if (!repo.connectedRepositoryId) return
                            disconnectMutation.mutate(repo.connectedRepositoryId)
                          }}
                          disabled={isRemoving || isSaving}
                        >
                          <Unplug className="h-4 w-4 mr-1" />
                          {isRemoving ? 'Removing...' : 'Remove'}
                        </Button>

                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8"
                          disabled
                        >
                          <PlugZap className="h-4 w-4 mr-1" />
                          Connected
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {repo.isConnected && repo.connectedRepositoryId && isSettingsOpen && (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label>Review behavior</Label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {REPO_REVIEW_STYLE_OPTIONS.map((style) => (
                          <label
                            key={style}
                            className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer"
                          >
                            <Checkbox
                              checked={draft.reviewModes.includes(style)}
                              onCheckedChange={(checked) => {
                                const key = getDraftKey(repo)
                                setDrafts((prev) => {
                                  const currentModes = normalizeRepoReviewModes(
                                    (prev[key]?.reviewModes as RepoReviewStyle[] | undefined) || draft.reviewModes,
                                  )
                                  let nextModes: RepoReviewStyle[]

                                  if (style === 'balanced') {
                                    nextModes = checked ? ['balanced'] : currentModes
                                  } else if (checked) {
                                    nextModes = [...currentModes.filter((mode) => mode !== 'balanced'), style]
                                  } else {
                                    const filtered = currentModes.filter((mode) => mode !== style)
                                    nextModes = filtered.length > 0 ? filtered : ['balanced']
                                  }

                                  return {
                                    ...prev,
                                    [key]: {
                                      ...(prev[key] || {}),
                                      reviewModes: normalizeRepoReviewModes(nextModes),
                                    },
                                  }
                                })
                              }}
                            />
                            <span className="text-sm">{STYLE_LABELS[style]}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Memes in review + mention</Label>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm text-muted-foreground">
                          {draft.memesEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Switch
                          checked={draft.memesEnabled}
                          onCheckedChange={(checked) => {
                            const key = getDraftKey(repo)
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: {
                                ...(prev[key] || {}),
                                memesEnabled: checked,
                              },
                            }))
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Custom prompt</Label>
                      <Textarea
                        value={draft.customPrompt}
                        onChange={(e) => {
                          const key = getDraftKey(repo)
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: {
                              ...(prev[key] || {}),
                              customPrompt: e.target.value,
                            },
                          }))
                        }}
                        rows={3}
                        maxLength={2000}
                        placeholder="Example: prioritize security and migration risks for this repository."
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!repo.connectedRepositoryId) return
                          setSavingRepoId(repo.connectedRepositoryId)
                          saveSettingsMutation.mutate(
                            {
                              repositoryId: repo.connectedRepositoryId,
                              draft,
                            },
                            {
                              onSettled: () => {
                                setSavingRepoId((prev) => (prev === repo.connectedRepositoryId ? null : prev))
                              },
                            },
                          )
                        }}
                        disabled={!dirty || isSaving || isRemoving}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-1" />
                            Save settings
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        <div ref={loadMoreRef}>
          {isFetchingNextPage && (
            <div className="flex flex-col gap-2 mt-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <RepositorySkeleton key={`loading-${index}`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Page
