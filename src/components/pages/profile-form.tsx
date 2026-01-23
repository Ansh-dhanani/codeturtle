'use client'
import React from 'react'
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {useQuery, useMutation,useQueryClient} from '@tanstack/react-query'
import {getUserProfile,updateUserProfile} from '@/module/settings/actions'
import { toast } from 'sonner'
import { useState } from 'react'

const ProfileForm = () => {
    const QueryClient=useQueryClient();
    const {data,isLoading}=useQuery({
        queryKey:['userProfile'],
        queryFn:getUserProfile,
        staleTime:1000 * 60 * 5,
        refetchOnWindowFocus:false,
    });

    const[name,setName]=useState(data?.name || '');

    const updateMutation=useMutation({
        mutationFn:async (data:{name:string})=> await updateUserProfile(data),
        onSuccess: (result) => {
            if(result?.success){
                QueryClient.invalidateQueries({queryKey:['userProfile']});
                toast.success('Profile updated successfully');
            }
        },
        onError: () => {
            toast.error('Failed to update profile');
        }
    });

    const handleSubmit=(e:React.FormEvent)=>{
        e.preventDefault();
        updateMutation.mutate({name});
    }
  return (
    <div>
        <Card>
            <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Update your profile information</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='space-y-2'> 
                        <Label htmlFor='name'>Name</Label>
                        <Input
                            id='name'
                            type='text'
                            value={name}
                            onChange={(e)=>setName(e.target.value)}
                            disabled={isLoading || updateMutation.isPending}
                        />
                    </div>
                    <Button type='submit' disabled={isLoading || updateMutation.isPending}>
                        {updateMutation.isPending ? 'Updating...' : 'Update Profile'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    </div>
  )
}

export default ProfileForm