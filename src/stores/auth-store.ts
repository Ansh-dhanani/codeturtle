import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
interface User {
  id: string
  email: string
  name: string
  image?: string | null
  emailVerified: boolean
}
interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User | null) => void
  clearUser: () => void
}
export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        isAuthenticated: false,
        setUser: (user) => set({ user, isAuthenticated: !!user }),
        clearUser: () => set({ user: null, isAuthenticated: false }),
      }),
      {
        name: 'auth-storage',
      }
    )
  )
)
