# [À COMPLÉTER : nom du projet]

[![CI](https://github.com/bjark9/projetdev1/actions/workflows/ci.yml/badge.svg)](https://github.com/bjark9/projetdev1/actions/workflows/ci.yml)

[À COMPLÉTER : 2 à 3 phrases qui expliquent ce que fait l'application, pour qui, et quel problème elle résout.]

Projet 1 du cours *Projet d'intégration de développement*.

**Application en ligne :** [À COMPLÉTER : URL de production]

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

- [À COMPLÉTER : fonctionnalité 1, par exemple « envoyer et lire des messages dans une conversation »]
- [À COMPLÉTER : fonctionnalité 2, par exemple « gestion des membres et des permissions »]
- [À COMPLÉTER : fonctionnalité 3]

## Stack technique

| Couche | Technologie |
| --- | --- |
| Backend | [À COMPLÉTER : framework et langage] |
| Frontend | [À COMPLÉTER : framework] |
| Base de données | [À COMPLÉTER : SQLite / MySQL / PostgreSQL] |
| Tests | [À COMPLÉTER : Pest / pytest / Vitest…] |
| Lint / style | [À COMPLÉTER : Pint / ruff / ESLint…] |
| CI/CD | GitHub Actions |
| Hébergement | [À COMPLÉTER : hébergeur] |

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

- Git
- [À COMPLÉTER : version de Python / PHP / Node requise]
- [À COMPLÉTER : autres outils, par exemple Composer, npm…]

### 1. Cloner le dépôt

```bash
git clone https://github.com/bjark9/projetdev1.git
cd projetdev1
```

### 2. Lancer le backend

```bash
cd backend
# [À COMPLÉTER : créer l'environnement et installer les dépendances]
# [À COMPLÉTER : copier .env.example vers .env et le remplir]
# [À COMPLÉTER : appliquer les migrations]
# [À COMPLÉTER : démarrer le serveur]
```

Le backend est disponible sur [À COMPLÉTER : http://localhost:PORT].

### 3. Lancer le frontend

```bash
cd frontend
# [À COMPLÉTER : installer les dépendances]
# [À COMPLÉTER : démarrer le serveur de développement]
```

Le frontend est disponible sur [À COMPLÉTER : http://localhost:PORT].

## Variables d'environnement

Le fichier `.env.example` liste toutes les variables nécessaires. Copiez-le en `.env` et adaptez les valeurs. Le fichier `.env` n'est **jamais** commité.

| Variable | Rôle | Exemple |
| --- | --- | --- |
| [À COMPLÉTER] | [À COMPLÉTER] | [À COMPLÉTER] |

## Tests et qualité du code

```bash
# Tests
# [À COMPLÉTER : commande, par exemple php artisan test / pytest / npm test]

# Lint et formatage
# [À COMPLÉTER : commande, par exemple vendor/bin/pint --test / ruff check . / npm run lint]
```

Les tests couvrent le cœur de l'application : [À COMPLÉTER : par exemple envoi et lecture de messages, permissions d'accès, validation des entrées].

## CI/CD et déploiement

Le pipeline GitHub Actions (`.github/workflows/ci.yml`) se lance sur chaque pull request et sur chaque push vers `main`.

| Job | Rôle |
| --- | --- |
| Tests | Lance la suite de tests sur une base de test |
| Style | Vérifie le lint et le formatage, en parallèle des tests |

- **`main` est protégée** : pas de push direct, une pull request est obligatoire et les checks doivent être verts avant le merge.
- **Déploiement continu** : chaque merge sur `main` déclenche le déploiement chez [À COMPLÉTER : hébergeur].
- Aucun secret n'est stocké dans le dépôt : les valeurs sensibles sont dans *Settings → Secrets and variables → Actions*.

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
| Niels ([@bjark9](https://github.com/bjark9)) | [À COMPLÉTER] |
| Lorian | [À COMPLÉTER] |

## Licence

Projet réalisé dans un cadre académique. [À COMPLÉTER : licence éventuelle]
