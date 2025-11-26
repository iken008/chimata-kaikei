'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import Header from '../components/Header'

type Member = {
  id: string
  name: string
  email: string
  created_at: string
  auth_user_id: string
}

type InviteCode = {
  id: string
  code: string
  created_at: string
  expires_at: string | null
  is_used: boolean
  used_at: string | null
  used_by_user?: {
    name: string
  } | null
}

export default function MembersPage() {
  const router = useRouter()
  const { userProfile } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // メンバー取得
      const { data: membersData, error: membersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: true })

      if (membersError) throw membersError
      setMembers(membersData || [])

      // 招待コード取得
      const { data: codesData, error: codesError } = await supabase
        .from('invite_codes')
        .select(`
          *,
          used_by_user:users!invite_codes_used_by_fkey(name)
        `)
        .order('created_at', { ascending: false })

      if (codesError) throw codesError
      
      // 有効期限が過ぎたコードを削除（使用済み・未使用問わず）
      const codesToDelete = codesData?.filter(code => {
        if (!code.expires_at) return false
        return new Date(code.expires_at) < new Date()
      }) || []

      if (codesToDelete.length > 0) {
        await supabase
          .from('invite_codes')
          .delete()
          .in('id', codesToDelete.map(c => c.id))
      }

      setInviteCodes(codesData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateInviteCode = async () => {
    if (!userProfile) return

    setGenerating(true)

    try {
      // 6桁のランダムな招待コードを生成
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()

      // 有効期限: 1時間後
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 1)

      const { data, error } = await supabase
        .from('invite_codes')
        .insert({
          code,
          created_by: userProfile.id,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      alert(`招待コードを生成しました！\n\nコード: ${code}\n\nこのコードをメンバーに共有してください。`)
      fetchData()
    } catch (error) {
      console.error('Error generating code:', error)
      alert('招待コードの生成に失敗しました')
    } finally {
      setGenerating(false)
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      alert(`コード「${code}」をコピーしました！`)
    } catch (error) {
      console.error('Error copying:', error)
      alert('コピーに失敗しました')
    }
  }

  const deleteInviteCode = async (codeId: string, code: string) => {
    if (!confirm(`招待コード「${code}」を削除しますか？`)) return

    try {
      const { error } = await supabase
        .from('invite_codes')
        .delete()
        .eq('id', codeId)

      if (error) throw error

      alert('招待コードを削除しました')
      fetchData()
    } catch (error) {
      console.error('Error deleting code:', error)
      alert('削除に失敗しました')
    }
  }

  const handleDeleteMember = async (member: Member) => {
    if (member.id === userProfile?.id) {
      alert('自分自身は削除できません')
      return
    }

    if (!confirm(
      `${member.name} をメンバーから削除しますか？\n\n` +
      `⚠️ 注意：\n` +
      `- このユーザーはログインできなくなります\n` +
      `- 過去の記録は残ります（記入者名は保持されます）\n` +
      `- この操作は取り消せません`
    )) {
      return
    }

    try {
      // まず、関連データを確認
      const { data: transactions, error: transactionsError } = await supabase
        .from('transactions')
        .select('id')
        .eq('recorded_by', member.id)
        .limit(1)

      if (transactionsError) {
        console.error('Error checking transactions:', transactionsError)
        throw new Error('関連データの確認に失敗しました')
      }

      if (transactions && transactions.length > 0) {
        alert(
          '削除できません\n\n' +
          'このユーザーが記録した取引データが存在します。\n' +
          'データの整合性を保つため、記録のあるユーザーは削除できません。'
        )
        return
      }

      // 招待コードの使用履歴を確認
      const { data: usedInvites, error: usedInvitesError } = await supabase
        .from('invite_codes')
        .select('id')
        .eq('used_by', member.id)
        .limit(1)

      if (usedInvitesError) {
        console.error('Error checking used invites:', usedInvitesError)
        throw new Error('関連データの確認に失敗しました')
      }

      // 招待コードの作成履歴を確認
      const { data: createdInvites, error: createdInvitesError } = await supabase
        .from('invite_codes')
        .select('id')
        .eq('created_by', member.id)
        .limit(1)

      if (createdInvitesError) {
        console.error('Error checking created invites:', createdInvitesError)
        throw new Error('関連データの確認に失敗しました')
      }

      if ((usedInvites && usedInvites.length > 0) || (createdInvites && createdInvites.length > 0)) {
        alert(
          '削除できません\n\n' +
          'このユーザーに関連する招待コードが存在します。\n' +
          'データの整合性を保つため、招待コードを使用したユーザーまたは作成したユーザーは削除できません。'
        )
        return
      }

      // usersテーブルから削除
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', member.id)

      if (deleteError) {
        console.error('Error deleting user:', {
          message: deleteError.message,
          code: deleteError.code,
          details: deleteError.details,
          hint: deleteError.hint,
        })
        throw new Error(deleteError.message || '削除に失敗しました')
      }

      // 認証ユーザーも削除（Admin API経由）
      try {
        const response = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ authUserId: member.auth_user_id }),
        })

        const data = await response.json()

        if (!response.ok) {
          console.error('Error deleting auth user:', data.error)
          throw new Error('認証ユーザーの削除に失敗しました: ' + data.error)
        }

        console.log('認証ユーザーを削除しました:', member.auth_user_id)
      } catch (authError: any) {
        console.error('Auth deletion error:', authError)
        // usersテーブルからは削除済みなので、警告のみ表示
        alert(`メンバーをデータベースから削除しましたが、認証ユーザーの削除に失敗しました。\n\n${authError.message}\n\nSupabase Dashboardから手動で削除してください。`)
        fetchData()
        return
      }

      alert('メンバーを完全に削除しました')
      fetchData()
    } catch (error: any) {
      console.error('Error deleting member:', error)
      alert(error.message || '削除に失敗しました')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ja-JP')
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('ja-JP')
  }

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }


  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
          <p className="text-xl text-gray-600">読み込み中...</p>
        </div>
      </ProtectedRoute>
    )
  }

  const activeInviteCodes = inviteCodes.filter(c => !c.is_used && !isExpired(c.expires_at))
  const usedInviteCodes = inviteCodes.filter(c => c.is_used)
  const expiredInviteCodes = inviteCodes.filter(c => !c.is_used && isExpired(c.expires_at))

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header
          title="メンバー管理"
          subtitle="サークルメンバーの招待・管理"
          showBack={true}
          colorFrom="indigo-500"
          colorTo="purple-500"
        />

        <main className="container mx-auto p-4 max-w-4xl">
          {/* 招待コード生成 */}
          <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6 border border-gray-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center">
                <span className="text-xl sm:text-2xl mr-2">🎫</span>
                <h2 className="text-lg sm:text-xl font-bold text-gray-800">招待コード</h2>
              </div>
              <button
                onClick={generateInviteCode}
                disabled={generating}
                className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition disabled:opacity-50 text-sm sm:text-base"
              >
                {generating ? '生成中...' : '➕ 新しいコードを生成'}
              </button>
            </div>

            {/* 有効な招待コード */}
            {activeInviteCodes.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-700 mb-2">有効なコード（{activeInviteCodes.length}）</h3>
                <div className="space-y-2">
                  {activeInviteCodes.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex justify-between items-center p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-mono font-bold text-2xl text-green-800">{invite.code}</p>
                        <p className="text-xs text-gray-600 mt-1">
                          有効期限: {formatDateTime(invite.expires_at!)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyCode(invite.code)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded font-semibold transition"
                        >
                          📋 コピー
                        </button>
                        <button
                          onClick={() => deleteInviteCode(invite.id, invite.code)}
                          className="px-3 py-1 text-red-600 hover:bg-red-50 text-sm rounded font-semibold transition"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 使用済みコード */}
            {usedInviteCodes.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-700 mb-2">使用済み（{usedInviteCodes.length}）</h3>
                <div className="space-y-2">
                  {usedInviteCodes.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex justify-between items-center p-3 bg-gray-100 border border-gray-300 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-mono font-bold text-lg text-gray-600 line-through">{invite.code}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          使用者: {invite.used_by_user?.name || '不明'} | 使用日: {formatDateTime(invite.used_at!)}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteInviteCode(invite.id, invite.code)}
                        className="px-3 py-1 text-red-600 hover:bg-red-50 text-sm rounded font-semibold transition"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 期限切れコード */}
            {expiredInviteCodes.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">期限切れ（{expiredInviteCodes.length}）</h3>
                <div className="space-y-2">
                  {expiredInviteCodes.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex justify-between items-center p-3 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-mono font-bold text-lg text-red-600 line-through">{invite.code}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          期限切れ: {formatDateTime(invite.expires_at!)}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteInviteCode(invite.id, invite.code)}
                        className="px-3 py-1 text-red-600 hover:bg-red-100 text-sm rounded font-semibold transition"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inviteCodes.length === 0 && (
              <p className="text-gray-500 text-center py-4">
                招待コードがありません。「新しいコードを生成」ボタンをクリックしてください。
              </p>
            )}
          </div>

          {/* メンバー一覧 */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-100">
            <div className="flex items-center mb-4">
              <span className="text-2xl mr-2">👥</span>
              <h2 className="text-xl font-bold text-gray-800">
                現在のメンバー（{members.length}名）
              </h2>
            </div>

            {members.length === 0 ? (
              <p className="text-gray-500 text-center py-8">メンバーがいません</p>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className={`flex justify-between items-center p-4 rounded-lg border transition ${
                      member.id === userProfile?.id
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-gray-800">{member.name}</p>
                        {member.id === userProfile?.id && (
                          <span className="text-xs bg-indigo-500 text-white px-2 py-1 rounded">
                            あなた
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{member.email}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        登録日: {formatDate(member.created_at)}
                      </p>
                    </div>

                    {member.id !== userProfile?.id && (
                      <button
                        onClick={() => handleDeleteMember(member)}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded font-semibold text-sm transition"
                      >
                        削除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 説明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-bold mb-2 text-blue-900">💡 招待の流れ</h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>「新しいコードを生成」をクリック</li>
              <li>生成された6桁のコードをコピー</li>
              <li>LINEやメールでメンバーに共有</li>
              <li>メンバーがサインアップ画面でコードを入力</li>
              <li>登録完了後、メンバー一覧に表示されます</li>
            </ol>
            <p className="text-xs text-blue-700 mt-2">
              ※ 招待コードの有効期限は1時間です<br />
              ※ 有効期限が過ぎたコードは自動削除されます（使用済み・未使用問わず）
            </p>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}