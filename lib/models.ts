/**
 * 模型配置中心
 * 所有模型配置都在这里统一管理
 * 修改这里的模型名称即可影响所有功能，无需修改各个 API 路由文件
 * 
 * 使用说明：
 * 1. 修改下面的模型名称即可切换模型
 * 2. 例如：将 VISION_MODEL_DEFAULT 从 "Pro/zai-org/GLM-4.7" 改为 "zai-org/GLM-4.6" 即可节约成本
 * 3. 上架时再改回 "Pro/zai-org/GLM-4.7"
 */

// ==================== 聊天模型 ====================
// 陪伴模式、聊天室模式使用的模型
export const CHAT_MODEL = "deepseek-ai/DeepSeek-V3.2-Exp"

// ==================== 视觉模型 ====================
// 视觉模式使用的模型（可以通过环境变量 VISION_MODEL 覆盖）
export const VISION_MODEL_DEFAULT = "Qwen/Qwen2-VL-72B-Instruct"

/**
 * 获取视觉模型名称
 * 优先使用环境变量 VISION_MODEL，如果没有则使用默认模型
 */
export function getVisionModel(): string {
  // 在函数中访问环境变量，避免模块加载时的时序问题
  const envModel = typeof process !== "undefined" ? process.env.VISION_MODEL : undefined
  return envModel || VISION_MODEL_DEFAULT
}

// ==================== 生图模型 ====================
// 生图模式使用的模型
export const IMAGE_GENERATION_MODEL = "Qwen/Qwen-Image"
// Prompt 优化模型（用于优化生图提示词）
export const PROMPT_OPTIMIZATION_MODEL = "deepseek-ai/DeepSeek-V3.2-Exp"

// ==================== 视频生成模型 ====================
// 视频生成模式使用的模型
export const VIDEO_GENERATION_MODEL = "Wan-AI/Wan2.2-I2V-A14B"

// ==================== TTS 语音模型 ====================
// 语音合成模型
export const TTS_MODEL = "fnlp/MOSS-TTSD-v0.5"
