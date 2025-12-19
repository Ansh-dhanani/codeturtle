'use client'
import { Button } from '@/components/ui/button'
import { authClient } from '../lib/auth-client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  
  const handleSignup = async () => {
    const { data, error } = await authClient.signUp.email({
      email,
      password,
      name
    })
    
    if (error) {
      alert('Login failed')
    } else {
      alert('Login successful!')
      // Redirect to dashboard
    }
  }
  
  return (
    <form onSubmit={handleSignup}>
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" />
      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <Button type="submit">Sign Up</Button>
    </form>
  )
}