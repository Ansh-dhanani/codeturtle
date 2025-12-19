'use client'
import { Input } from '@/components/ui/input'
import { authClient } from '../lib/auth-client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function SigninForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  const handleSignin = async () => {
    // Login from the browser
    const { data, error } = await authClient.signIn.email({
      email,
      password
    })
    
    if (error) {
      alert('Login failed')
    } else {
      alert('Login successful!')
      // Redirect to dashboard
    }
  }
  
  return (
    <form onSubmit={handleSignin}>
      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <Button type="submit">Login</Button>
    </form>
  )
}