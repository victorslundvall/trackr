/**
 * Public Supabase settings. The publishable key is designed to be public (RLS protects the data),
 * so it's safe as a fallback – this keeps builds working even when env vars aren't set (e.g. Vercel).
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://msdxfjfasvhqnmeurqjg.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Ild-ElB-YaDG5FtSls52Cg_43I4GIYS";
