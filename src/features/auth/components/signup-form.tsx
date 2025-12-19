'use client'
import { authClient } from '../lib/auth-client'
import { useState } from 'react'

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
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" />
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <button type="submit">Login</button>
    </form>
  )
}