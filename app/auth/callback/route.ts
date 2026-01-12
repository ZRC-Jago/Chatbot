import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('[v0] 登录回调错误:', error)
        // 即使出错也重定向，让前端处理
        return NextResponse.redirect(`${origin}/?error=auth_failed`)
      }
      
      console.log('[v0] 登录回调成功，session 已建立')
    } catch (error) {
      console.error('[v0] 登录回调异常:', error)
      return NextResponse.redirect(`${origin}/?error=auth_exception`)
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/`)
}

