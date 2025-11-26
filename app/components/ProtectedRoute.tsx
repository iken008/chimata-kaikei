'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  console.log('🔍 ProtectedRoute: レンダリング', { loading, user: !!user })

  useEffect(() => {
    console.log('🔍 ProtectedRoute: useEffect 実行', { loading, user: !!user })
    if (!loading && !user) {
      console.log('🔍 ProtectedRoute: /login にリダイレクト実行')
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) {
    console.log('🔍 ProtectedRoute: loading中のため読み込み画面を表示')
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-600">読み込み中...</p>
      </div>
    )
  }

  if (!user) {
    console.log('🔍 ProtectedRoute: ユーザーなし、nullを返す')
    return null
  }

  console.log('🔍 ProtectedRoute: 認証済み、childrenを表示')
  return <>{children}</>
}