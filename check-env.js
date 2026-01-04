// 临时脚本：检查环境变量配置
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('环境变量检查：')
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? `已配置 (长度: ${supabaseUrl.length})` : '❌ 未配置')
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? `已配置 (长度: ${supabaseAnonKey.length})` : '❌ 未配置')

if (supabaseUrl && supabaseAnonKey) {
  console.log('\n✅ 环境变量配置正确！')
  console.log('如果应用仍然报错，请重启开发服务器。')
} else {
  console.log('\n❌ 环境变量配置不完整')
  console.log('\n请确保 .env.local 文件包含以下内容：')
  console.log('NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co')
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key')
}

