# Tribos Landing Page

Landing page marketing de Tribos orientée conversion vers l’inscription bêta.

## Lancer localement

Ouvrir `./index.html` dans un navigateur.

## Inscription e-mail (Vercel + Resend)

Le formulaire bêta appelle la fonction serverless `api/signup.js`.

### Variables d’environnement (Vercel)

- `RESEND_API_KEY` : clé API Resend
- `RESEND_AUDIENCE_ID` : ID de l’audience Resend qui reçoit les contacts

### Configuration Resend

1. Créer une audience dans Resend.
2. Renseigner son ID dans `RESEND_AUDIENCE_ID`.
3. Définir `RESEND_API_KEY` et `RESEND_AUDIENCE_ID` dans les variables d’environnement Vercel.
