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

// Liens de la bêta. TestFlight est public ; côté Android, le test fermé
// n'accepte que les membres du groupe de testeurs (Google Group), d'où le
// lien de groupe, réglable sans redéployer le code.
const TESTFLIGHT_URL = "https://testflight.apple.com/join/Zx22tcmJ";
const PLAY_OPT_IN_URL = "https://play.google.com/apps/testing/run.evey.tribos";
const REPLY_TO = "contact@evey.run";

function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#F3730A;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 22px;border-radius:999px;">${label}</a>`;
}

function steps(items) {
  return items
    .map(
      (item, i) =>
        `<tr><td style="vertical-align:top;padding:0 12px 14px 0;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:13px;background:#FDF4EA;color:#F3730A;font-weight:bold;font-size:14px;">${i + 1}</span></td><td style="padding:2px 0 14px;font-size:15px;line-height:1.55;color:#2C3A43;">${item}</td></tr>`
    )
    .join("");
}

/** Contenu du mail de bienvenue selon le téléphone choisi à l'inscription. */
function welcomeContent(telephone, groupUrl) {
  if (telephone === "iphone") {
    return {
      subject: "Ta bêta Tribos sur iPhone est prête",
      intro: "Bonne nouvelle : sur iPhone, la bêta est déjà ouverte. Deux minutes et c'est installé.",
      body: steps([
        `Installe <strong>TestFlight</strong>, l'app gratuite d'Apple pour les bêtas, depuis l'App Store.`,
        `Ouvre ce mail <strong>sur ton iPhone</strong> et appuie sur le bouton : Tribos s'installe dans TestFlight.`,
      ]) ,
      cta: button(TESTFLIGHT_URL, "Installer la bêta iPhone"),
      after: "Les mises à jour arrivent ensuite toutes seules dans TestFlight.",
    };
  }
  if (telephone === "android") {
    const first = groupUrl
      ? `Rejoins le <a href="${groupUrl}" style="color:#F3730A;font-weight:bold;">groupe des testeurs</a> avec ton compte Google (celui de ton téléphone).`
      : `On t'ajoute à la liste des testeurs : tu reçois un message dès que c'est fait.`;
    return {
      subject: "Ta bêta Tribos sur Android",
      intro: "Sur Android, la bêta passe par le Play Store, en test fermé. Trois étapes :",
      body: steps([
        first,
        `Accepte l'invitation au test sur la page Google Play ci-dessous.`,
        `Installe Tribos depuis le Play Store : les mises à jour arriveront comme pour n'importe quelle app.`,
      ]),
      cta: button(PLAY_OPT_IN_URL, "Rejoindre le test Android"),
      after: "Le bouton ne marche qu'une fois ton compte Google dans le groupe des testeurs.",
    };
  }
  return {
    subject: "Bienvenue dans la bêta Tribos",
    intro: "On a bien reçu ta demande : ta place est réservée dans la bêta de Tribos.",
    body: "",
    cta: [button(TESTFLIGHT_URL, "J'ai un iPhone"), button(PLAY_OPT_IN_URL, "J'ai un Android")].join("&nbsp;&nbsp;"),
    after: "Sur Android, le test est réservé aux membres du groupe de testeurs : on t'y ajoute à l'ouverture de ta vague.",
  };
}

async function sendWelcome(apiKey, from, email, telephone) {
  const groupUrl = (process.env.ANDROID_TESTERS_GROUP_URL || "").trim();
  const c = welcomeContent(telephone, groupUrl);
  const html = [
    "<!DOCTYPE html>",
    '<html lang="fr">',
    '<body style="margin:0;padding:0;background:#FDF4EA;font-family:Helvetica,Arial,sans-serif;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF4EA;">',
    '<tr><td style="padding:36px 16px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">',
    '<tr><td style="background:#F3730A;padding:22px 28px;"><img src="https://tribos.evey.run/assets/brand/tribos-icon-64.png" width="36" height="36" alt="" style="vertical-align:middle;border-radius:8px;"> <span style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:bold;margin-left:8px;">Tribos</span></td></tr>',
    '<tr><td style="padding:28px 28px 8px;">',
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#2C3A43;">${c.subject}</h1>`,
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#2C3A43;">${c.intro}</p>`,
    c.body ? `<table role="presentation" cellpadding="0" cellspacing="0">${c.body}</table>` : "",
    `<p style="margin:8px 0 22px;">${c.cta}</p>`,
    `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#5E6A72;">${c.after}</p>`,
    '<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5E6A72;">Une question, un bug ? Réponds simplement à ce mail.</p>',
    "</td></tr>",
    '<tr><td style="padding:16px 28px;background:#FDF4EA;font-size:12px;line-height:1.5;color:#8A8577;">Le sport, mais avec tes potes. — Tu reçois ce mail parce que tu t\'es inscrit·e à la bêta sur tribos.evey.run.</td></tr>',
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
    body: JSON.stringify({ from, to: [email], reply_to: REPLY_TO, subject: c.subject, html }),
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
  // Seul `bot-field` est un piège : `telephone` est le choix Android / iPhone
  // du formulaire. Le traiter comme un piège jetait toute inscription qui
  // l'indiquait, en répondant « succès ».
  const botField = String(params.get("bot-field") || "").trim();

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
      const telephone = String(params.get("telephone") || "").trim().toLowerCase();
      const mailRes = await sendWelcome(apiKey, from, email, telephone);
      if (!mailRes.ok) error(`welcome-mail ${mailRes.status}`);
    } catch (e) {
      error(`welcome-mail exception: ${e.message}`);
    }
  }

  return res.json({ success: true, alreadyRegistered: !registered });
};