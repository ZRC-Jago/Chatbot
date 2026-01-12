import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // 检查环境变量是否配置
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 如果环境变量未配置，直接返回，不初始化 Supabase
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 刷新用户会话（如果已过期）
  // 使用 getSession 而不是 getUser，因为 getSession 不会在没有 session 时抛出错误
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) {
      // 静默处理错误，不记录到控制台（避免 AuthSessionMissingError 污染日志）
      // 这是正常情况，用户可能未登录
    }
    // 如果有 session，尝试刷新（这会自动处理过期 session）
    if (session) {
      await supabase.auth.getUser()
    }
  } catch (error: any) {
    // 静默处理所有错误，不记录到控制台
    // AuthSessionMissingError 是正常情况，不应该显示为错误
    if (error?.message && !error.message.includes('session missing') && !error.message.includes('Auth session missing')) {
      // 只记录非 session 缺失的错误
      console.error('Supabase auth error in middleware:', error)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static (静态文件)
     * - _next/image (图片优化文件)
     * - favicon.ico (favicon文件)
     * - public 文件夹
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

