const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUDIENCE_URL = (audienceId) =>
  `https://api.resend.com/audiences/${audienceId}/contacts`;

async function addToAudience(apiKey, audienceId, email) {
  return fetch(AUDIENCE_URL(audienceId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
}

async function sendWelcome(apiKey, from, email) {
  const html = [
    "<!DOCTYPE html>",
    '<html lang="fr">',
    "<body style=\"margin:0;padding:0;background:#f6f4ef;font-family:Georgia,serif;\">",
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ef;">',
    "<tr><td style=\"padding:40px 16px;\">",
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fffdf8;border-top:4px solid #1f7a4d;border-radius:8px;overflow:hidden;\">',
    '<tr><td style="padding:32px 28px;">',
    '<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8577;">Tribos</p>',
    '<h1 style="margin:0 0 16px;font-size:22px;color:#1a1a17;">Bienvenue dans la bêta</h1>',
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3a3a35;">On a bien reçu ta demande. Ta place est reservée dans la bêta privée de Tribos.</p>',
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3a3a35;">Tu recevras un message ici, et seulement ici, quand ton accès sera prêt. Rien d’autre, pas de spam.</p>',
    '<p style="margin:0;font-size:15px;line-height:1.6;color:#3a3a35;">D’ici là, entraîne tes voisins : le groupe qui arrive complet lance la vague.</p>',
    "</td></tr>",
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Bienvenue dans la bêta Tribos",
      html,
    }),
  });
}

module.exports = async (ctx) => {
  const { req, res, log, error } = ctx || {};
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const audienceId = (process.env.RESEND_AUDIENCE_ID || "").trim();
  const from = (process.env.EMAIL_FROM || "Tribos <tribos@evey.run>").trim();

  if (!apiKey || !audienceId) {
    error("Resend configuration missing");
    return res.json({ success: false, error: "Configuration email absente." }, 500);
  }

  let params;
  try {
    params = new URLSearchParams(req.body || "");
  } catch (e) {
    return res.json({ success: false, error: "Requête invalide." }, 400);
  }

  const email = String(params.get("email") || "").trim().toLowerCase();
  const botField = String(params.get("bot-field") || params.get("telephone") || "").trim();

  if (botField) {
    return res.json({ success: true, bot: true });
  }

  if (!EMAIL_RE.test(email)) {
    return res.json({ success: false, error: "Adresse email invalide." }, 400);
  }

  const formName = String(params.get("form-name") || "");

  if (formName !== "beta-signup") {
    return res.json({ success: true, recorded: true });
  }

  let registered = false;
  try {
    const contactRes = await addToAudience(apiKey, audienceId, email);
    if (contactRes.ok) {
      registered = true;
    } else if (contactRes.status === 409) {
      log(`already-registered: ${email}`);
    } else {
      error(`audience-add ${contactRes.status}`);
      return res.json({ success: false, error: "Enregistrement impossible pour le moment." }, 502);
    }
  } catch (e) {
    error(`audience-add exception: ${e.message}`);
    return res.json({ success: false, error: "Enregistrement impossible pour le moment." }, 502);
  }

  if (registered) {
    try {
      const mailRes = await sendWelcome(apiKey, from, email);
      if (!mailRes.ok) error(`welcome-mail ${mailRes.status}`);
    } catch (e) {
      error(`welcome-mail exception: ${e.message}`);
    }
  }

  return res.json({ success: true, alreadyRegistered: !registered });
};