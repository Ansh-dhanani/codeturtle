'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Star,
  Code2,
  ExternalLink,
  Plug,
  PlugZap,
} from 'lucide-react'
import { useRepositories } from '@/module/repository/hooks/use-repositories'
import { connectRepository } from '@/module/repository/actions'
import { useConnectRepository } from '@/module/repository/hooks/use-connect-repositorys'

interface Repository {
  id: number
  name: string
  fullName: string
  description: string | null
  html_url: string
  stargazers_count: number
  language: string | null
  topics: string[]
  isConnected: boolean
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
  const [localConnectingId, setLocalConnectingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('')
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const connectRepoMutation = useConnectRepository()
  const {mutate:connectRepo} = useConnectRepository();
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
      .filter((repo: Repository) =>
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.language?.toLowerCase().includes(searchQuery.toLowerCase())
      ) ?? []

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

  const handleConnect = (repo: Repository) => {
    setLocalConnectingId(repo.id);
    connectRepo({owner: repo.fullName.split('/')[0],
      repo: repo.name,
      githubId: repo.id},
      {
      onSettled: () => {
        setLocalConnectingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground">
          Connect and manage your repositories
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Repository List */}
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

        {repositories.map((repo: Repository) => (
          <Card
            key={repo.id}
            className="border hover:bg-muted/40 transition-colors"
          >
            <CardContent className="flex items-center justify-between px-9 py-0">
              {/* Left */}
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

              {/* Right */}
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

                <Button
                  size="sm"
                  variant={repo.isConnected ? 'secondary' : 'default'}
                  className="h-8"
                  onClick={() => {
                    if (!repo.isConnected) {
                      const [owner, repoName] = repo.fullName.split('/')
                      connectRepoMutation.mutate({ owner, repo: repoName, githubId: repo.id })
                    }
                  }}
                  disabled={connectRepoMutation.isPending}
                >
                  {repo.isConnected ? (
                    <>
                      <PlugZap className="h-4 w-4 mr-1" />
                      Connected
                    </>
                  ) : (
                    <>
                      <Plug className="h-4 w-4 mr-1" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Infinite Scroll Trigger */}
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
