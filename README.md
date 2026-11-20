# Otaku Legal CM

Plateforme de streaming par abonnement (animes, séries, films, webtoons) avec contenus **sous licence**.
Aucune dépendance externe : Node.js ≥ 22.5 suffit (SQLite intégré).

## Démarrage

```bash
cp .env.example .env      # puis éditez .env (secret, super admin, etc.)
npm start                 # http://localhost:3000
npm test                  # 18 tests de bout en bout
```

## Fonctionnalités

- Interface sombre premium : hero, 4 onglets (Animes / Séries / Films / Webtoons), filtres Genre / Année / Statut, tri, pagination, fiches détail, Ma liste, recherche.
- **4 offres** : Jour (200 FCFA), Semaine (1 000), Mois (3 000), Année (30 000), chacune avec ses avantages (qualité, appareils, téléchargements...).
- **Essai gratuit** de 7 jours (modifiable via `TRIAL_DAYS`), une seule fois par compte.
- **Reversement de 7 %** (modifiable via `REVENUE_SHARE_PCT`) : à chaque paiement, la part est répartie entre les fournisseurs de contenu au prorata des vues des 30 derniers jours (table `revenue_shares`). L'admin voit le montant à reverser par fournisseur, effectue le virement réel puis clique « Marquer payé ».
- **Super administrateur** (`SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` dans `.env`) : connexion directe par email + mot de passe, lecture et téléchargements illimités, gestion des titres, épisodes, fournisseurs, reversements, utilisateurs, paiements, statistiques.
- Gestion des licences : un titre ne peut être publié que s'il a un fournisseur ; il disparaît automatiquement du catalogue à la date de fin de licence.
- Sécurité : mots de passe scrypt, jetons signés HMAC, limitation des tentatives, en-têtes CSP, aucune donnée sensible dans le code.

## Important avant la mise en production

1. **Contenu** : le catalogue fourni est un jeu de démonstration (titres et visuels générés, fournisseurs fictifs). Remplacez-le par des œuvres dont vous détenez les droits (contrat de licence, domaine public, Creative Commons, créations originales) via Administration → Fournisseurs / Titres / Épisodes. N'ajoutez des URL vidéo que si vous avez les droits de diffusion.
2. **Paiements** : `PAYMENT_MODE=demo` simule les paiements (aucun argent réel). Pour le réel, branchez un agrégateur (CinetPay, Flutterwave, Stripe, API MTN MoMo / Orange Money) dans `server/payments.js` et confirmez les paiements par webhook.
3. **Reversement 7 %** : le calcul et le suivi sont automatiques ; le transfert d'argent réel reste à faire (Mobile Money / virement) selon les accords signés avec chaque ayant droit.
4. **Mot de passe super admin** : changez-le dans `.env` avant la mise en ligne. Le fichier `.env` est ignoré par git.
5. Hébergement : tout serveur Node (Render, Railway, VPS). Pensez à sauvegarder le dossier `data/` (SQLite) et à servir le site en HTTPS.

## Structure

```
server/   env.js, auth.js, db.js (schéma + seed), revenue.js (7 %), payments.js, svg.js, index.js (API + statique)
public/   index.html, style.css, app.js (application monopage)
scripts/  smoke.js (tests)
```
