'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading, signOut } = useAuth()
  const router = useRouter()

  console.log('🔍 ProtectedRoute: レンダリング', { loading, user: !!user, userProfile: !!userProfile })

  useEffect(() => {
    console.log('🔍 ProtectedRoute: useEffect 実行', { loading, user: !!user, userProfile: !!userProfile })

    if (loading) return

    // ユーザーが認証されていない場合
    if (!user) {
      console.log('🔍 ProtectedRoute: /login にリダイレクト実行')
      router.push('/login')
      return
    }

    // 認証されているがusersテーブルにレコードがない場合（削除されたユーザー）
    if (user && !userProfile) {
      console.log('🔍 ProtectedRoute: ユーザープロフィールなし（削除済み）、ログアウト実行')
      alert('このアカウントは削除されました。再度ログインしてください。')
      signOut()
    }
  }, [user, userProfile, loading, router, signOut])

  if (loading) {
    console.log('🔍 ProtectedRoute: loading中のため読み込み画面を表示')
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  if (!user || !userProfile) {
    console.log('🔍 ProtectedRoute: ユーザーまたはプロフィールなし、nullを返す')
    return null
  }

  console.log('🔍 ProtectedRoute: 認証済み、childrenを表示')
  return <>{children}</>
}