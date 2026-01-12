# 如何找到 Supabase Service Role Key

## 步骤

1. **登录 Supabase Dashboard**
   - 访问 https://supabase.com/dashboard
   - 选择你的项目

2. **进入 API 设置**
   - 点击左侧菜单的 **Settings**（设置）
   - 点击 **API**

3. **找到 Service Role Key**
   - 在 **Project API keys** 部分
   - 你会看到两个 key：
     - **Publishable key** (anon key) - 这就是 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - **Secret keys** - 这里有一个 **service_role** key

4. **识别 Service Role Key**
   - Service Role Key 通常显示为：
     - 名称：`service_role`
     - 描述：`service_role` key (has full access)
     - 格式：以 `eyJ...` 开头（和 anon key 类似）
   - 点击 **Reveal** 或 **Show** 按钮查看完整 key

5. **复制 Key**
   - 复制完整的 Service Role Key
   - 添加到 `.env.local` 文件：
     ```env
     SUPABASE_SERVICE_ROLE_KEY=你的_service_role_key
     ```

## 如果找不到 Service Role Key

如果你在 Secret keys 部分只看到可以"新建 key"的选项，但没有看到现有的 service_role key，可能是：

1. **需要滚动查看** - Service Role Key 可能在页面下方
2. **权限问题** - 确保你是项目的 Owner 或 Admin
3. **使用方案 2** - 修复 RLS 策略（见 `supabase-fix-rls.sql`）

## 重要提示

⚠️ **Service Role Key 有完整的数据库访问权限**
- 只能在服务端使用
- 不要暴露到客户端代码
- 不要提交到代码仓库
- 妥善保管







