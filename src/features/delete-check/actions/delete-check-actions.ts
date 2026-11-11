"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/shared/server/auth/session";
import { deleteUserCheck } from "@/entities/check/server/delete-user-check";
import { deleteUserChecks } from "@/entities/check/server/delete-user-checks";

type DeleteResponse = { ok: true; deletedCount: number } | { ok: false; error: string };
const unavailable = "This saved check is unavailable.";

export async function deleteCheckAction(checkId: unknown): Promise<DeleteResponse> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Sign in to manage your saved checks." };
    if (typeof checkId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(checkId)) return { ok: false, error: unavailable };
    const deletedCount = await deleteUserCheck(session.user.id, checkId);
    if (!deletedCount) return { ok: false, error: unavailable };
    revalidatePath("/history");
    revalidatePath("/account/privacy");
    revalidatePath(`/check/${checkId}`);
    return { ok: true, deletedCount };
  } catch {
    return { ok: false, error: "Unable to delete saved checks. Please try again." };
  }
}

export async function clearHistoryAction(): Promise<DeleteResponse> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Sign in to manage your saved checks." };
    const deletedCount = await deleteUserChecks(session.user.id);
    revalidatePath("/history");
    revalidatePath("/account/privacy");
    revalidatePath("/check/[id]", "page");
    return { ok: true, deletedCount };
  } catch {
    return { ok: false, error: "Unable to delete saved checks. Please try again." };
  }
}
