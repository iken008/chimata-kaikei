'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type AuthContextType = {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
}

type UserProfile = {
  id: string
  name: string
  email: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    console.log('🔍 AuthContext: useEffect 開始')

    // 現在のセッションを確認
    console.log('🔍 AuthContext: getSession 呼び出し')
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        console.log('🔍 AuthContext: getSession 完了', session ? 'ユーザーあり' : 'ユーザーなし')
        setUser(session?.user ?? null)
        if (session?.user) {
          console.log('🔍 AuthContext: fetchUserProfile 呼び出し')
          fetchUserProfile(session.user.id)
        } else {
          console.log('🔍 AuthContext: loading = false (セッションなし)')
          setLoading(false)
        }
      })
      .catch((error) => {
        console.error('❌ Error getting session:', error)
        setLoading(false)
      })

    // 認証状態の変化を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserProfile(session.user.id)
      } else {
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (authUserId: string) => {
    console.log('🔍 fetchUserProfile 開始:', authUserId)
    try {
      console.log('🔍 fetchUserProfile: データベース問い合わせ開始')
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('auth_user_id', authUserId)
        .single()

      console.log('🔍 fetchUserProfile: データベース問い合わせ完了', { data, error })

      if (error) {
        // PGRST116: ユーザープロフィールが見つからない場合
        if (error.code === 'PGRST116') {
          console.warn('⚠️ User profile not found in database for auth_user_id:', authUserId)

          // 認証ユーザー情報からプロフィールを自動作成
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const newProfile = {
              auth_user_id: user.id,
              email: user.email || '',
              name: user.user_metadata?.name || user.email?.split('@')[0] || 'ユーザー',
            }

            const { data: createdProfile, error: insertError } = await supabase
              .from('users')
              .insert(newProfile)
              .select('id, name, email')
              .single()

            if (insertError) {
              console.error('Error creating user profile:', insertError)
              setUserProfile(null)
            } else {
              console.log('User profile created successfully:', createdProfile)
              setUserProfile(createdProfile)
            }
          } else {
            setUserProfile(null)
          }
        } else {
          console.error('Error fetching user profile:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          })
          setUserProfile(null)
        }
      } else {
        setUserProfile(data)
      }
    } catch (error) {
      console.error('Unexpected error fetching user profile:', error)
      setUserProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    })
    if (error) throw error

    // ユーザー登録成功後、usersテーブルにレコードを作成
    if (data.user) {
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          auth_user_id: data.user.id,
          email: email,
          name: name,
        })

      if (insertError) {
        console.error('Error creating user profile:', insertError)
        // エラーが発生してもサインアップ自体は成功しているので、
        // エラーを投げずに警告のみ表示
        console.warn('User profile creation failed, but authentication succeeded')
      }
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    router.push('/login')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}