import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { householdId, monthStr, resendApiKey } = await req.json();

    if (!householdId || !monthStr || !resendApiKey) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Supabase URL from env
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeaders = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    // ── 1. Fetch settings (report_email, budget) ───────────────────
    const settingsRes = await fetch(
      `${supabaseUrl}/rest/v1/household_settings?household_token=eq.${householdId}`,
      { headers: authHeaders }
    );
    const settingsData = await settingsRes.json();
    const settings = settingsData[0] ?? {};
    const reportEmail = settings.report_email;
    const budget = parseFloat(settings.monthly_budget) ?? 0;
    const savingsGoal = parseFloat(settings.savings_goal) ?? 0;

    if (!reportEmail) {
      return new Response(JSON.stringify({ error: "No report email configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Fetch month's expenses ──────────────────────────────────
    const [year, month] = monthStr.split("-");
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split("T")[0];
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split("T")[0];

    const expRes = await fetch(
      `${supabaseUrl}/rest/v1/expenses?household_token=eq.${householdId}&date=gte.${startDate}&date=lte.${endDate}&select=title,amount,category,date&order=amount.desc`,
      { headers: authHeaders }
    );
    const expenses = await expRes.json();

    // ── 3. Compute stats ───────────────────────────────────────────
    const totalSpent = expenses.reduce((s: number, e: any) => s + parseFloat(e.amount), 0);
    const saved = Math.max(0, budget - totalSpent);
    const budgetPerc = budget > 0 ? ((totalSpent / budget) * 100).toFixed(1) : "N/A";

    // Category breakdown
    const breakdown: Record<string, number> = {};
    expenses.forEach((e: any) => {
      breakdown[e.category] = (breakdown[e.category] ?? 0) + parseFloat(e.amount);
    });
    const breakdownRows = Object.entries(breakdown)
      .sort(([, a], [, b]) => b - a)
      .map(
        ([cat, amt]) =>
          `<tr><td style="padding:6px 12px;">${cat}</td><td style="padding:6px 12px; text-align:right; font-weight:700;">₹${amt.toFixed(0)}</td></tr>`
      )
      .join("");

    const biggestExpense = expenses[0]
      ? `${expenses[0].title} — ₹${parseFloat(expenses[0].amount).toFixed(0)}`
      : "None";

    // Month label
    const monthLabel = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    // ── 4. Build HTML email ────────────────────────────────────────
    const progressColor = parseFloat(budgetPerc) >= 100 ? "#ef4444" : parseFloat(budgetPerc) >= 80 ? "#f97316" : "#4ade80";
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',sans-serif;color:#f8fafc;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <div style="background:#1e293b;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:32px 28px;">
        <div style="font-size:2rem;margin-bottom:8px;">💰</div>
        <h1 style="margin:0;font-size:1.5rem;font-weight:800;">Monthly Report</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:0.95rem;">${monthLabel}</p>
      </div>
      <!-- Stats row -->
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="flex:1;padding:20px 24px;border-right:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;font-weight:700;">Total Spent</div>
          <div style="font-size:1.6rem;font-weight:800;margin-top:4px;">₹${totalSpent.toFixed(0)}</div>
          <div style="font-size:0.75rem;color:${progressColor};margin-top:2px;">${budgetPerc}% of budget</div>
        </div>
        <div style="flex:1;padding:20px 24px;border-right:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;font-weight:700;">Budget</div>
          <div style="font-size:1.6rem;font-weight:800;margin-top:4px;">₹${budget.toFixed(0)}</div>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px;">Monthly limit</div>
        </div>
        <div style="flex:1;padding:20px 24px;">
          <div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;font-weight:700;">Saved</div>
          <div style="font-size:1.6rem;font-weight:800;margin-top:4px;color:#4ade80;">₹${saved.toFixed(0)}</div>
          ${savingsGoal > 0 ? `<div style="font-size:0.75rem;color:#94a3b8;margin-top:2px;">Goal: ₹${savingsGoal.toFixed(0)}</div>` : ''}
        </div>
      </div>
      <!-- Category breakdown -->
      <div style="padding:24px 28px;">
        <h2 style="margin:0 0 16px;font-size:1rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Category Breakdown</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${breakdownRows}
        </table>
      </div>
      <!-- Biggest expense -->
      <div style="padding:0 28px 24px;">
        <div style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.25);border-radius:12px;padding:16px;">
          <div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;font-weight:700;margin-bottom:6px;">Biggest Single Expense</div>
          <div style="font-weight:700;font-size:1rem;">${biggestExpense}</div>
        </div>
      </div>
      <!-- Footer -->
      <div style="padding:16px 28px 24px;font-size:0.75rem;color:#64748b;text-align:center;">
        Sent from your Expense Tracker &bull; ${new Date().toLocaleDateString()}
      </div>
    </div>
  </div>
</body>
</html>`;

    // ── 5. Send via Resend ─────────────────────────────────────────
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Expense Tracker <reports@resend.dev>",
        to: [reportEmail],
        subject: `📊 Your ${monthLabel} Expense Report`,
        html,
      }),
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      throw new Error(emailResult.message ?? "Resend API error");
    }

    return new Response(JSON.stringify({ success: true, id: emailResult.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
