'use client'
import { authClient } from '../lib/auth-client'
import { useState } from 'react'

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
      <input value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  )
}