import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '缺少 Supabase 环境变量配置。请在 .env.local 文件中添加：\n' +
      'NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 项目 URL\n' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase Anon Key\n\n' +
      '你可以在 Supabase 项目设置中找到这些值：\n' +
      'https://supabase.com/dashboard/project/_/settings/api'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

