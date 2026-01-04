import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
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

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

