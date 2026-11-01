import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isValidAdminCookie } from "@/lib/admin-auth";
import { leadsToCsv, listCrmLeads } from "@/lib/crm";

// Gated the same way as the admin page itself — a direct GET here without
// the admin cookie must not leak CRM data just because it skips the page.
export async function GET() {
  const cookieStore = await cookies();
  const authed = isValidAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value);

  if (!authed) {
    return new Response("Unauthorized", { status: 401 });
  }

  const leads = await listCrmLeads();
  const csv = leadsToCsv(leads);
  const filename = `health-checker-crm-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
