'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Trash2, AlertTriangle, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  getConnectedRepositories,
  disconnectAllRepository,
  disconnectRepository,
  updateRepositoryBehaviorSettings,
} from '@/module/settings/actions';
import {
  REPO_REVIEW_STYLE_OPTIONS,
  type RepoReviewStyle,
} from '@/module/repository/lib/settings';
import { AI_PROVIDERS } from '@/lib/ai-providers';

type ConnectedRepository = {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  url: string;
  reviewStyle: string;
  memesEnabled: boolean;
  customPrompt: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  createdAt: Date;
};

type RepoDraft = {
  reviewStyle: RepoReviewStyle;
  memesEnabled: boolean;
  customPrompt: string;
  aiProvider: string | null;
  aiModel: string | null;
};

type RepoDraftPatch = Partial<RepoDraft>;

const STYLE_LABELS: Record<RepoReviewStyle, string> = {
  balanced: 'Balanced',
  professional: 'Professional',
  short: 'Short',
  funny: 'Funny + playful',
  diagram: 'Architecture diagrams',
};

function normalizeStyle(style: string): RepoReviewStyle {
  return REPO_REVIEW_STYLE_OPTIONS.includes(style as RepoReviewStyle)
    ? (style as RepoReviewStyle)
    : 'balanced';
}

export function RepositoryList() {
  const queryClient = useQueryClient();
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RepoDraftPatch>>({});

  const { data: repositories, isLoading } = useQuery({
    queryKey: ['connected-repositories'],
    queryFn: async () => (await getConnectedRepositories()) as ConnectedRepository[],
    staleTime: 60000,
    refetchOnWindowFocus: true,
  });

  const disconnectMutation = useMutation({
    mutationFn: async (repositoryId: string) => disconnectRepository(repositoryId),
    onMutate: (repositoryId: string) => {
      setDisconnectingId(repositoryId);
    },
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
        queryClient.invalidateQueries({ queryKey: ['repository-stats'] });
        toast.success('Repository disconnected successfully');
      } else {
        toast.error('Failed to disconnect repository');
      }
    },
    onSettled: () => {
      setDisconnectingId(null);
    },
  });

  const disconnectAllMutation = useMutation({
    mutationFn: async () => disconnectAllRepository(),
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
        queryClient.invalidateQueries({ queryKey: ['repository-stats'] });
        toast.success('All repositories disconnected successfully');
        setDisconnectAllOpen(false);
      } else {
        toast.error('Failed to disconnect repositories');
      }
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: {
      repositoryId: string;
      reviewStyle: RepoReviewStyle;
      memesEnabled: boolean;
      customPrompt: string;
      aiProvider: string | null;
      aiModel: string | null;
    }) =>
      updateRepositoryBehaviorSettings({
        repositoryId: payload.repositoryId,
        reviewStyle: payload.reviewStyle,
        memesEnabled: payload.memesEnabled,
        customPrompt: payload.customPrompt,
        aiProvider: payload.aiProvider,
        aiModel: payload.aiModel,
      }),
    onMutate: ({ repositoryId }) => {
      setSavingId(repositoryId);
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
      toast.success(`Saved behavior settings for ${variables.repositoryId}`);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to save repository settings';
      toast.error(message);
    },
    onSettled: () => {
      setSavingId(null);
    },
  });

  const repos = useMemo(() => repositories || [], [repositories]);

  const getDraftForRepo = (repo: ConnectedRepository): RepoDraft => {
    const baseDraft: RepoDraft = {
      reviewStyle: normalizeStyle(repo.reviewStyle),
      memesEnabled: Boolean(repo.memesEnabled),
      customPrompt: repo.customPrompt || '',
      aiProvider: repo.aiProvider || null,
      aiModel: repo.aiModel || null,
    };
    return {
      ...baseDraft,
      ...(drafts[repo.id] || {}),
    };
  };

  const hasChanges = (repo: ConnectedRepository): boolean => {
    const draft = getDraftForRepo(repo);

    return (
      draft.reviewStyle !== normalizeStyle(repo.reviewStyle) ||
      draft.memesEnabled !== Boolean(repo.memesEnabled) ||
      draft.customPrompt.trim() !== (repo.customPrompt || '').trim() ||
      draft.aiProvider !== (repo.aiProvider || null) ||
      draft.aiModel !== (repo.aiModel || null)
    );
  };

  if (isLoading) {
    return (
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Connected Repositories</CardTitle>
            <CardDescription>Manage repository connections and behavior settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='animate-pulse space-y-4'>
              <div className='h-32 bg-muted rounded' />
              <div className='h-32 bg-muted rounded' />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='flex flex-row justify-between items-center'>
          <div>
            <CardTitle>Connected Repositories</CardTitle>
            <CardDescription>
              Manage connections, review style, meme mode, and custom instructions per repository.
            </CardDescription>
          </div>
          {repos.length > 0 && (
            <AlertDialog open={disconnectAllOpen} onOpenChange={setDisconnectAllOpen}>
              <AlertDialogTrigger asChild>
                <Button variant='destructive' size='sm'>Disconnect All</Button>
              </AlertDialogTrigger>
              <AlertDialogPortal>
                <AlertDialogOverlay />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect All Repositories</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to disconnect all repositories? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectAllMutation.mutate()}
                      className='bg-red-600 hover:bg-red-700 focus:ring-red-600'
                    >
                      Disconnect All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialogPortal>
            </AlertDialog>
          )}
        </CardHeader>

        <CardContent className='space-y-6'>
          {repos.length > 0 ? (
            repos.map((repo) => {
              const draft = getDraftForRepo(repo);

              const dirty = hasChanges(repo);
              const isSaving = savingId === repo.id;

              return (
                <div key={repo.id} className='rounded-lg border p-4 space-y-4'>
                  <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-3'>
                    <div className='flex flex-col sm:flex-row sm:items-center sm:gap-2'>
                      <a
                        href={repo.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='font-medium text-base hover:underline flex items-center gap-1'
                      >
                        {repo.fullName} <ExternalLink size={16} />
                      </a>
                      <Badge className='bg-muted text-muted-foreground'>Connected</Badge>
                    </div>

                    <div className='flex items-center gap-2'>
                      <Button
                        size='sm'
                        onClick={() => {
                          updateSettingsMutation.mutate({
                            repositoryId: repo.id,
                            reviewStyle: draft.reviewStyle,
                            memesEnabled: draft.memesEnabled,
                            customPrompt: draft.customPrompt,
                            aiProvider: draft.aiProvider,
                            aiModel: draft.aiModel,
                          });
                        }}
                        disabled={!dirty || isSaving || disconnectingId !== null}
                      >
                        <Save size={14} className='mr-1.5' />
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        variant='destructive'
                        size='sm'
                        onClick={() => disconnectMutation.mutate(repo.id)}
                        disabled={disconnectingId !== null || isSaving}
                      >
                        {disconnectingId === repo.id ? (
                          'Disconnecting...'
                        ) : (
                          <>
                            <Trash2 size={16} className='mr-2' /> Disconnect
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className='grid gap-4 md:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label>Review style</Label>
                      <Select
                        value={draft.reviewStyle}
                        onValueChange={(value) => {
                          const next = normalizeStyle(value);
                          setDrafts((prev) => ({
                            ...prev,
                            [repo.id]: {
                              ...(prev[repo.id] || draft),
                              reviewStyle: next,
                            },
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder='Select style' />
                        </SelectTrigger>
                        <SelectContent>
                          {REPO_REVIEW_STYLE_OPTIONS.map((style) => (
                            <SelectItem key={style} value={style}>
                              {STYLE_LABELS[style]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className='space-y-2'>
                      <Label>Memes in review + mentions</Label>
                      <div className='flex items-center justify-between rounded-md border px-3 py-2'>
                        <span className='text-sm text-muted-foreground'>
                          {draft.memesEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Switch
                          checked={draft.memesEnabled}
                          onCheckedChange={(checked) => {
                            setDrafts((prev) => ({
                              ...prev,
                              [repo.id]: {
                                ...(prev[repo.id] || draft),
                                memesEnabled: checked,
                              },
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label>Custom prompt for this repository</Label>
                    <Textarea
                      value={draft.customPrompt}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDrafts((prev) => ({
                          ...prev,
                          [repo.id]: {
                            ...(prev[repo.id] || draft),
                            customPrompt: value,
                          },
                        }));
                      }}
                      placeholder='Example: prioritize security findings and include migration risks first.'
                      rows={3}
                      maxLength={2000}
                    />
                    <p className='text-xs text-muted-foreground'>
                      Appended to CodeTurtle instructions for this repository only.
                    </p>
                  </div>

                  <div className='space-y-3'>
                    <Label>AI Provider (per repository)</Label>
                    <Select
                      value={draft.aiProvider ?? '__default__'}
                      onValueChange={(value) => {
                        setDrafts((prev) => ({
                          ...prev,
                          [repo.id]: {
                            ...(prev[repo.id] || draft),
                            aiProvider: value === '__default__' ? null : value,
                            aiModel: value === '__default__' ? null : (prev[repo.id]?.aiModel || ''),
                          },
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Use account default' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='__default__'>Use account default</SelectItem>
                        {AI_PROVIDERS.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {draft.aiProvider && (
                      <div className='space-y-2'>
                        <Label>AI Model</Label>
                        <Select
                          value={draft.aiModel || ''}
                          onValueChange={(value) => {
                            setDrafts((prev) => ({
                              ...prev,
                              [repo.id]: {
                                ...(prev[repo.id] || draft),
                                aiModel: value,
                              },
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder='Select model' />
                          </SelectTrigger>
                          <SelectContent>
                            {(AI_PROVIDERS.find((p) => p.id === draft.aiProvider)?.models || []).map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className='text-center text-muted-foreground'>
              <AlertTriangle size={48} className='mx-auto mb-4' />
              <p>No connected repositories found.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
