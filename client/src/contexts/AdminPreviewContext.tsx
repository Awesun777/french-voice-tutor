import type { ReviewTarget } from "@/types";
import { createContext, useContext } from "react";

// Only the server-authenticated role enables the preview; never a URL or storage flag.
export function canUseAdminPreview(user: { role?: string | null } | null | undefined) {
  return user?.role === "admin";
}
export const AdminPreviewContext = createContext(false);
export const useAdminPreview = () => useContext(AdminPreviewContext);

export const AdminReviewContext = createContext<((target: ReviewTarget) => void) | null>(null);
