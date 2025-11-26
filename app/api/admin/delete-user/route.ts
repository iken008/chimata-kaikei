import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Admin権限を持つSupabaseクライアントを作成
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: NextRequest) {
  try {
    const { authUserId } = await request.json()

    if (!authUserId) {
      return NextResponse.json(
        { error: 'authUserId is required' },
        { status: 400 }
      )
    }

    // 認証ユーザーを削除（Admin API使用）
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId)

    if (error) {
      console.error('Error deleting auth user:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
