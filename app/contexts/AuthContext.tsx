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
  signUp: (email: string, password: string, name: string, inviteCodeId?: string) => Promise<void>
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

  const signUp = async (email: string, password: string, name: string, inviteCodeId?: string) => {
    console.log('🔍 signUp: 開始', { email, name, inviteCodeId })

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/login`,
        data: {
          name,
        },
      },
    })
    if (error) {
      console.error('❌ signUp: auth.signUp失敗', error)
      throw error
    }

    console.log('✅ signUp: auth.signUp成功', { userId: data.user?.id })

    // ユーザー登録成功後、usersテーブルにレコードを作成
    if (data.user) {
      console.log('🔍 signUp: usersテーブルにレコード作成開始')

      let userData = null

      const { data: insertData, error: insertError } = await supabase
        .from('users')
        .insert({
          auth_user_id: data.user.id,
          email: email,
          name: name,
        })
        .select('id')
        .single()

      if (insertError) {
        // 重複エラー（23505）の場合は、既存のレコードを取得
        if (insertError.code === '23505') {
          console.log('⚠️ signUp: usersレコードは既に存在（トリガーによる自動作成の可能性）、既存レコードを取得')

          const { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', data.user.id)
            .single()

          if (fetchError || !existingUser) {
            console.error('❌ signUp: 既存ユーザーの取得失敗', fetchError)
            throw new Error('ユーザープロフィールの取得に失敗しました')
          }

          userData = existingUser
          console.log('✅ signUp: 既存usersレコード取得成功', { userDataId: userData.id })
        } else {
          // その他のエラー
          console.error('❌ signUp: usersテーブル作成失敗', {
            error: insertError,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code,
          })
          throw new Error('ユーザープロフィールの作成に失敗しました: ' + insertError.message)
        }
      } else {
        userData = insertData
        console.log('✅ signUp: usersテーブル作成成功', { userDataId: userData?.id })
      }

      // 招待コードを使用済みにする
      if (inviteCodeId && userData) {
        console.log('🔍 signUp: 招待コード更新開始', { inviteCodeId, userId: userData.id })

        const { error: updateError } = await supabase
          .from('invite_codes')
          .update({
            is_used: true,
            used_by: userData.id,
            used_at: new Date().toISOString(),
          })
          .eq('id', inviteCodeId)

        if (updateError) {
          console.error('❌ signUp: 招待コード更新失敗', updateError)
          // 招待コードの更新失敗はエラーとしない（ユーザー登録は成功しているため）
        } else {
          console.log('✅ signUp: 招待コード更新成功')
        }
      } else {
        console.warn('⚠️ signUp: 招待コードIDまたはuserDataがありません', { inviteCodeId, userData })
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