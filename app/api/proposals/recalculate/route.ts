import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Service Role Keyを使用してSupabaseクライアントを作成
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export async function POST() {
  try {
    console.log('📊 提案の必要承認数を再計算します')

    // recalculate_proposals() 関数を呼び出し
    const { error } = await supabaseAdmin.rpc('recalculate_proposals')

    if (error) {
      console.error('❌ 再計算エラー:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    console.log('✅ 再計算成功')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('❌ 再計算APIエラー:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
