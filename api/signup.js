const isEmailValid = (email) => {
  const basicFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const [, domain = ""] = email.split("@");
  const hasConsecutiveDots = email.includes("..");
  const tld = domain.split(".").pop() || "";

  return basicFormat && !hasConsecutiveDots && tld.length >= 2;
};

module.exports = async (req, res) => {

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;

  if (!apiKey || !audienceId) {
    return res.status(500).json({ error: "Missing Resend configuration" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const email = String(body.email || "").trim().toLowerCase();
  const botField = String(body.botField || "").trim();

  if (botField) {
    return res.status(200).json({ success: true });
  }

  if (!isEmailValid(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  let resendResponse;
  try {
    resendResponse = await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Resend request error:", error);
    }
    return res.status(502).json({ error: "Unable to reach Resend" });
  }

  if (resendResponse.ok) {
    return res.status(200).json({ success: true });
  }

  if (resendResponse.status === 409) {
    return res.status(200).json({ success: true, alreadyRegistered: true });
  }

  return res.status(502).json({ error: "Resend request failed" });
};
