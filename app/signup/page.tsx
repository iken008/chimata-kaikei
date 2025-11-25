'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function SignupPage() {
  const [inviteCode, setInviteCode] = useState('')
  const [codeVerified, setCodeVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifiedCodeId, setVerifiedCodeId] = useState<string | null>(null)
  const { signUp } = useAuth()
  const router = useRouter()

  const verifyInviteCode = async () => {
    if (!inviteCode.trim()) {
      setError('招待コードを入力してください')
      return
    }

    setVerifying(true)
    setError('')

    try {
      // 招待コードを検証
      const { data: invite, error: inviteError } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('code', inviteCode.toUpperCase())
        .single()

      if (inviteError || !invite) {
        setError('招待コードが見つかりません')
        setVerifying(false)
        return
      }

      // 使用済みチェック
      if (invite.is_used) {
        setError('この招待コードは既に使用されています')
        setVerifying(false)
        return
      }

      // 有効期限チェック
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        setError('この招待コードは期限切れです')
        setVerifying(false)
        return
      }

      // 検証成功
      setCodeVerified(true)
      setVerifiedCodeId(invite.id)
      setError('')
    } catch (error) {
      console.error('Error verifying code:', error)
      setError('検証に失敗しました')
    } finally {
      setVerifying(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      return
    }

    if (!verifiedCodeId) {
      setError('招待コードが検証されていません')
      return
    }

    setLoading(true)

    try {
      // ユーザー登録
      await signUp(email, password, name)

      // 招待コードを使用済みにする
      const { data: authData } = await supabase.auth.getUser()
      
      if (authData.user) {
        // usersテーブルからユーザーIDを取得
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', authData.user.id)
          .single()

        if (userData) {
          await supabase
            .from('invite_codes')
            .update({
              is_used: true,
              used_by: userData.id,
              used_at: new Date().toISOString(),
            })
            .eq('id', verifiedCodeId)
        }
      }

      alert('登録が完了しました！確認メールを送信しました。メールを確認してログインしてください。')
      router.push('/login')
    } catch (error: any) {
      setError(error.message || '登録に失敗しました')
      console.error('Signup error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            新規登録
          </h1>
          <p className="text-gray-600">ちまたの会計 mini</p>
        </div>

        {!codeVerified ? (
          // 招待コード入力画面
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-blue-900 mb-2">🎫 招待コードが必要です</h3>
              <p className="text-sm text-blue-800">
                サークルのメンバーから受け取った6桁の招待コードを入力してください。
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="mb-6">
              <label className="block text-gray-700 font-bold mb-2">
                招待コード <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="w-full p-3 border border-gray-300 rounded-lg text-center font-mono text-2xl tracking-widest"
                placeholder="ABC123"
                maxLength={6}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                6桁の英数字コード
              </p>
            </div>

            <button
              onClick={verifyInviteCode}
              disabled={verifying || !inviteCode.trim()}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
            >
              {verifying ? '確認中...' : '✓ コードを確認'}
            </button>
          </div>
        ) : (
          // 登録フォーム
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-green-800 flex items-center gap-2">
                <span className="text-lg">✓</span>
                招待コード「{inviteCode}」を確認しました
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="block text-gray-700 font-bold mb-2">
                名前 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="山田太郎"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">
                メールアドレス <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="example@mail.com"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">
                パスワード（6文字以上） <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">
                パスワード（確認） <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
            >
              {loading ? '登録中...' : '登録'}
            </button>

            <button
              type="button"
              onClick={() => {
                setCodeVerified(false)
                setVerifiedCodeId(null)
                setInviteCode('')
                setError('')
              }}
              className="w-full text-gray-600 hover:text-gray-800 text-sm"
            >
              ← 招待コード入力に戻る
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            既にアカウントをお持ちの方は
            <Link href="/login" className="text-indigo-600 hover:text-indigo-800 font-semibold ml-1">
              ログイン
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}