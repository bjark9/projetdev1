# [Projet: Chat App]

[![CI](https://github.com/bjark9/projetdev1/actions/workflows/ci.yml/badge.svg)](https://github.com/bjark9/projetdev1/actions/workflows/ci.yml)

[Une application de chat temps réel pour équipes (B2B) — pensez Slack, Teams ou Discord, version professionnelle.]

Projet 1 du cours *Projet d'intégration de développement*.

**Application en ligne :** https://projetdev1-dusky.vercel.app/

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Structure du dépôt](#structure-du-dépôt)
- [Installation en local](#installation-en-local)
- [Variables d'environnement](#variables-denvironnement)
- [Tests et qualité du code](#tests-et-qualité-du-code)
- [CI/CD et déploiement](#cicd-et-déploiement)
- [Workflow Git](#workflow-git)
- [Équipe](#équipe)

## Fonctionnalités

- envoyer, recevoir et lire des messages dans une conversation ;
- recevoir les nouveaux messages et notifications en temps réel ;
- modifier ou supprimer ses propres messages ;
- rechercher un mot dans les messages ;
- réagir aux messages avec des emojis ;
- voir quand un membre est en train d'écrire ;
- épingler un message important ;
- voir le nombre de messages non lus par conversation ;
- gérer les membres d'un groupe et leurs rôles ;
- protéger l'accès aux conversations avec Clerk.
- joindre plusieurs fichiers à un message; les fichiers sont stockés en base PostgreSQL (Neon en production), jusqu'à 10 Mio par fichier et 25 Mio par envoi.
-

## Stack technique

| Couche | Technologie |
| --- | --- |
| Backend | Django, Django REST Framework et Django Channels |
| Frontend | React, TypeScript et Vite |
| Authentification | Clerk |
| Base de données | PostgreSQL avec Neon |
| Temps réel | WebSockets avec Django Channels et Redis |
| Tests | Tests Django |
| Lint / style | Ruff, mypy, Oxlint et Prettier |
| CI/CD | GitHub Actions |
| Hébergement | Vercel |

## Structure du dépôt

```text
.
├── backend/     # API et logique métier
├── frontend/    # Interface utilisateur
├── .github/
│   └── workflows/   # Pipelines GitHub Actions
└── README.md
```

## Installation en local

### Prérequis

- Git ;
- Python 3.12 ou plus récent ;
- Node.js 22 ou plus récent ;
- npm ;
- une base PostgreSQL pour un déploiement complet ;
- Redis pour le temps réel en production.

### 1. Cloner le dépôt

```bash
git clone https://github.com/bjark9/projetdev1.git
cd projetdev1
```

### 2. Lancer le backend

Depuis le dossier `backend` :

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver 8000
```

### 3. Lancer le frontend

Depuis le dossier `frontend` :

```powershell
npm install
npm run dev
```

Le frontend est disponible sur `http://localhost:5173`.

## Variables d'environnement

Créez un fichier `.env` dans `backend/` et adaptez les valeurs. Ce fichier
n'est **jamais** commité.

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `DATABASE_URL` | Connexion à PostgreSQL | `postgresql://...` |
| `DJANGO_SECRET_KEY` | Clé secrète Django | valeur secrète |
| `DJANGO_DEBUG` | Active le mode debug local | `True` |
| `CLERK_SECRET_KEY` | Authentification du backend avec Clerk | valeur secrète |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Vérification des webhooks Clerk | `whsec_...` |
| `REDIS_URL` | Connexion Redis pour les WebSockets | URL Redis |
| `DEBUG_DB_TOKEN` | Protection de la route de diagnostic | valeur secrète |

En production, `REDIS_URL` doit pointer vers une instance Redis partagée.
La couche mémoire est suffisante uniquement pour le développement local et les
tests.

### Synchronisation des utilisateurs Clerk vers Neon

Django utilise `DATABASE_URL` pour se connecter à Neon et
`accounts.User` comme modèle utilisateur. Appliquez les migrations sur la
base Neon après le déploiement :

```powershell
python manage.py migrate
```

Dans le tableau de bord Clerk, créez un webhook vers
`https://<votre-backend>/api/webhooks/clerk/` pour les événements
`user.created`, `user.updated` et `session.created`. Ajoutez sa clé de
signature à `CLERK_WEBHOOK_SIGNING_SECRET`.

## Tests et qualité du code

Depuis le dossier `backend` :

```powershell
python manage.py test accounts chat
ruff check .
ruff format --check .
mypy .
```

Depuis le dossier `frontend` :

```powershell
npm run lint
npm run format:check
npm run build
```

Les tests couvrent notamment l'authentification, les permissions des groupes,
l'envoi de messages, la gestion des membres et les WebSockets.

## CI/CD et déploiement

Le workflow GitHub Actions
[`CI-checks.yml`](.github/workflows/CI-checks.yml) se lance sur chaque Pull
Request et sur chaque push vers `main`.

| Job | Vérifications |
| --- | --- |
| Backend | Ruff, formatage Ruff et mypy |
| Frontend | Installation npm, Prettier, Oxlint et build Vite |

`main` doit être protégée : les changements passent par une Pull Request et
les vérifications doivent être vertes avant le merge. Le frontend est préparé
pour un déploiement sur Vercel. L'URL publique et le déploiement du backend
seront ajoutés lorsqu'ils seront configurés.

## Workflow Git

1. Créer une branche depuis `main` : `git switch -c feature/nom-de-la-fonctionnalité`
2. Commiter par petites étapes avec des messages clairs.
3. Pousser la branche : `git push -u origin feature/nom-de-la-fonctionnalité`
4. Ouvrir une pull request vers `main`.
5. Attendre que la CI soit verte et qu'un autre membre de l'équipe relise la PR.
6. Merger, puis supprimer la branche.

## Équipe

| Membre | Rôle / parties réalisées |
| --- | --- |
| Niels ([@bjark9](https://github.com/bjark9)) | Backend, WebSockets et interface |
| Lorian | Qualité du frontend, CI et contribution au backend |

## Licence

Projet réalisé dans un cadre académique.