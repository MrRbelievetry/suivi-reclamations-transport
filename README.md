# Suivi Réclamations Transport

Application web multi-appareils pour suivre les réclamations transport d’Oriental Discount depuis une URL GitHub Pages.

## Architecture

- **Application publique** : fichiers statiques sur GitHub Pages, sans donnée client ni secret.
- **Données privées** : un unique fichier `data.json` dans le dépôt privé `MrRbelievetry/orientaldiscount-suivi-data`.
- **Accès** : l’application appelle directement l’API GitHub avec une clé fine-grained limitée à ce seul dépôt.
- **Stockage local** : aucun dossier n’est enregistré dans IndexedDB, localStorage, sessionStorage ou un cookie. La clé GitHub reste seulement dans la mémoire de l’onglet et est oubliée à sa fermeture.

Tous les ordinateurs, tablettes et smartphones chargent donc la même source. Le bouton **Synchroniser** recharge les modifications réalisées depuis un autre appareil.

## Fonctions

- création et modification des dossiers transport ;
- statuts **En cours**, **À relancer** et **Résolu** ;
- historique daté des actions ;
- liens de suivi et modèles de messages personnalisables ;
- recherche et filtres ;
- suppression dans les données actives uniquement lorsqu’un dossier est résolu depuis **strictement plus de dix jours** ;
- import de l’ancienne base SQLite `reclamations_transport.db` ;
- export manuel d’une copie JSON.

## Première connexion sur un appareil

1. Ouvrir l’URL de l’application.
2. Saisir le compte `MrRbelievetry`, le dépôt `orientaldiscount-suivi-data` et la clé d’accès GitHub fournie.
3. Cliquer sur **Charger les données**.

La clé doit être une clé fine-grained ayant accès uniquement au dépôt privé de données, avec la permission **Contents: Read and write**. Elle n’est jamais incluse dans le code et n’est jamais enregistrée par l’application.

## Reprendre les données de l’application Windows

1. Se connecter aux données GitHub, puis ouvrir **Sauvegarde → Reprendre l’ancienne base .db**.
2. Sélectionner `Documents\Suivi Reclamations Transport\reclamations_transport.db`.
3. Confirmer : le contenu est converti puis enregistré dans le dépôt privé.

Pour les anciens dossiers déjà résolus, la dernière date de modification devient la date de clôture.

## Règle de suppression

La date et l’heure du passage au statut **Résolu** sont enregistrées. Le bouton **Supprimer** apparaît après plus de dix jours complets. La fiche et son historique disparaissent alors du fichier actif `data.json`.

GitHub conserve l’historique des versions du fichier. Une suppression depuis l’application retire le dossier de la base active, mais une ancienne version peut encore exister dans l’historique privé du dépôt. Une purge de l’historique Git est nécessaire pour un effacement irréversible.

## Concurrence entre appareils

Chaque écriture contrôle la version GitHub chargée. Si un autre appareil a modifié les données entre-temps, l’application refuse d’écraser ces changements et demande une synchronisation. Il faut alors cliquer sur **Synchroniser**, puis refaire la modification.

## Développement

Prérequis : Node.js 22.

```bash
npm install --ignore-scripts
npm test
npm run build
```

La dépendance [sql.js 1.13.0](https://github.com/sql-js/sql.js) sert uniquement à convertir l’ancienne base SQLite dans le navigateur.

## Déploiement

Le workflow `.github/workflows/pages.yml` exécute les tests, construit `dist/` puis déploie le site sur GitHub Pages à chaque mise à jour de `main`.
