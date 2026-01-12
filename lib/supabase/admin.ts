import { createClient } from '@supabase/supabase-js'

/**
 * 创建 Supabase Admin 客户端（使用 Service Role Key）
 * 这个客户端绕过 RLS 策略，用于服务端操作（如 webhook）
 * 
 * ⚠️ 警告：Service Role Key 有完整的数据库访问权限，只能在服务端使用，绝不能暴露到客户端！
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // 如果没有配置 Service Role Key，返回 null（使用 fallback 方案）
  if (!supabaseServiceRoleKey) {
    console.warn('[v0] ⚠️ SUPABASE_SERVICE_ROLE_KEY 未配置')
    console.warn('[v0] ⚠️ 请检查 .env.local 文件中是否添加了 SUPABASE_SERVICE_ROLE_KEY')
    console.warn('[v0] ⚠️ 当前环境变量:', {
      hasUrl: !!supabaseUrl,
      hasServiceRoleKey: !!supabaseServiceRoleKey,
      serviceRoleKeyLength: supabaseServiceRoleKey?.length || 0,
    })
    return null
  }
  
  console.log('[v0] ✅ Service Role Key 已配置，长度:', supabaseServiceRoleKey.length)

  if (!supabaseUrl) {
    throw new Error(
      '缺少 Supabase URL 配置。请在 .env.local 文件中添加：\n' +
      'NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 项目 URL'
    )
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

