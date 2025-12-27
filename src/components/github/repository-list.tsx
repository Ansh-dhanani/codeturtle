'use client';
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '@/components/ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useQuery,useQueryClient,useMutation } from '@tanstack/react-query'
import { getConnectedRepositories,disconnectAllRepository,disconnectRepository } from '@/module/settings/actions'
import { toast } from 'sonner'
import { ExternalLink,Trash2,AlertTriangle } from 'lucide-react'
import {
    AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,AlertDialogOverlay,AlertDialogPortal,AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { useState } from 'react'

export function RepositoryList(){
    const queryClient = useQueryClient();
    const [disconnectAllOpen,setDisconnectAllOpen] = useState(false);
    const {data:Repositories,isLoading} = useQuery({
        queryKey: ['connected-repositories'],
        queryFn: async () => await getConnectedRepositories(),
        staleTime: 60000, // 1 minute
        refetchOnWindowFocus: true,
    });
    const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
    const disconnectMutation = useMutation({
        mutationFn: async (repositoryId: string) => disconnectRepository(repositoryId),
        onMutate: (repositoryId: string) => {
            setDisconnectingId(repositoryId);
        },
        onSuccess: (result) => {
            if(result?.success){
                queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
                queryClient.invalidateQueries({ queryKey: ['repository-stats'] });
                toast.success("Repository disconnected successfully");
            } else {
                toast.error("Failed to disconnect repository");
            }
        },
        onSettled: () => {
            setDisconnectingId(null);
        }
    });

    const disconnectAllMutation = useMutation({
        mutationFn: async () => disconnectAllRepository(),
        onSuccess: (result) => {
            if(result?.success){
                queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
                queryClient.invalidateQueries({ queryKey: ['repository-stats'] });
                toast.success("Repository disconnected successfully");
                setDisconnectAllOpen(false);
            } else {
                toast.error("Failed to disconnect repository");
            }
        }
    });
        if(isLoading){
        return <div>
            <Card>
                <CardHeader>
                    <CardTitle>Connected Repositories</CardTitle>
                    <CardDescription>Manage your connected GitHub repositories</CardDescription>
                </CardHeader>
                <CardContent>
                        <div className='animate-pulse space-y-4'>
                        <div className='h-20 bg-muted rounded'></div>
                        <div className='h-20 bg-muted rounded'></div>
                    </div>
                </CardContent>
            </Card>
        </div>;
    }
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className='flex flex-row justify-between items-center'>
                    <div>
                        <CardTitle>Connected Repositories</CardTitle>
                        <CardDescription>Manage your connected GitHub repositories</CardDescription>
                    </div>
                    {Repositories && Repositories.length > 0 && (
                        <AlertDialog open={disconnectAllOpen} onOpenChange={setDisconnectAllOpen}>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">Disconnect All</Button>
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
                                        <AlertDialogAction onClick={() => disconnectAllMutation.mutate()} className='bg-red-600 hover:bg-red-700 focus:ring-red-600'>Disconnect All</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialogPortal>
                        </AlertDialog>
                    )}
                </CardHeader>
                <CardContent className='space-y-4'>
                    {Repositories && Repositories.length > 0 ? Repositories.map((repo) => (
                        <div key={repo.id} className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                            <div className='flex flex-col sm:flex-row sm:items-center sm:gap-2'>
                                <a href={repo.url} target="_blank" rel="noopener noreferrer" className='font-medium text-lg hover:underline flex items-center gap-1'>
                                    {repo.name} <ExternalLink size={16} />
                                </a>
                                <Badge className='bg-muted text-muted-foreground'>{new URL(repo.url).hostname}</Badge>
                            </div>
                                <Button variant="destructive" size="sm" onClick={() => disconnectMutation.mutate(repo.id)} disabled={disconnectingId !== null && disconnectingId !== repo.id}>
                                    {disconnectingId === repo.id ? 'Disconnecting...' : (<>
                                        <Trash2 size={16} className='mr-2' /> Disconnect
                                    </>)}
                            </Button>
                        </div>
                    )) : (
                        <div className='text-center text-muted-foreground'>
                            <AlertTriangle size={48} className='mx-auto mb-4' />
                            <p>No connected repositories found.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
