# Installer Pierre Transferts sur Infomaniak Node.js

Ce guide concerne l’offre **Hébergement Web / site Node.js**, avec lancement géré dans le Manager. Il ne nécessite pas l’installation personnelle de Nginx ou systemd. Le projet reste à déployer ; aucun accès au compte Infomaniak ni aucun mot de passe mail n’a été utilisé.

## 1. Utiliser l’adresse mail existante

Votre adresse mail hébergée chez Infomaniak peut envoyer les notifications de transfert par SMTP. Les adresses ci-dessous sont des exemples ; renseigner votre identité réelle uniquement dans `.env` sur le serveur :

| Paramètre | Valeur |
| --- | --- |
| Serveur SMTP | Le serveur fourni par votre messagerie |
| Port | `587` |
| Sécurité | STARTTLS (`SMTP_SECURE=false` dans cette application) |
| Identifiant | `contact@example.com` |
| Mot de passe | Mot de passe IMAP/SMTP créé pour cette adresse |
| Expéditeur | `Pierre Coutherut <contact@example.com>` |
| Adresse de réponse | `contact@example.com` |

Dans le Service Mail du Manager, créer un mot de passe IMAP/SMTP dédié à l’application, ou utiliser [l’assistant de configuration mail](https://config.infomaniak.com/). Ce mot de passe est distinct de celui du compte Infomaniak. Le fichier `.env.infomaniak.example` laisse les paramètres de messagerie vides. Renseigner `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` et `MAIL_REPLY_TO` dans `.env` uniquement, avec les valeurs de votre compte.

Une adresse dédiée, par exemple `transferts@example.com` ou `noreply@example.com`, peut être créée dans le Service Mail si l’offre le permet. Utiliser alors **cette même adresse** dans `SMTP_USER` et `MAIL_FROM`, avec son propre mot de passe IMAP/SMTP. Garder `MAIL_REPLY_TO=contact@example.com` pour recevoir les réponses. Le nom « noreply » n’est pas requis pour l’envoi automatique et ne bloque pas, à lui seul, les réponses.

Le domaine du site (`pierre-coutherut.fr`) et celui de l’expéditeur (celui de votre messagerie) peuvent être différents. L’identité d’envoi reste celle de la boîte mail utilisée pour l’authentification SMTP.

## 2. Créer le site

Dans le [Manager Infomaniak](https://manager.infomaniak.com/), ouvrir l’hébergement concerné :

1. Cliquer sur **Ajouter**.
2. Choisir **Projet avec technologies avancées**, puis **Node.js**.
3. Choisir **Node 24 si proposé**, ou **Node 22.13 minimum**. SQLite intégré à Node est utilisé par le projet ; une ancienne version ne convient pas.
4. Associer `transferts.pierre-coutherut.fr` au nouveau site. Si le DNS du domaine est géré ailleurs, appliquer les valeurs demandées par Infomaniak.
5. Choisir la **méthode personnalisée**, puis l’importation par **archive ZIP**.
6. Importer `pierre-transferts.zip`.

Le ZIP contient un dossier `pierre-transferts/`. Le dossier d’exécution doit être celui qui contient `package.json` et `server.mjs` : sélectionner `./pierre-transferts` si le dossier a été conservé lors de l’extraction, ou `./` si Infomaniak en a importé directement le contenu. Vérifier ce point dans les fichiers du site.

## 3. Régler la construction et le lancement

Dans les paramètres avancés du site, onglet Node.js :

| Champ | Valeur pour ce projet |
| --- | --- |
| Dossier d’exécution | Le dossier contenant `package.json` |
| Commande de construction | `npm ci --omit=dev` |
| Commande de lancement | `npm start` |
| Port | Celui attribué par le Manager, transmis automatiquement dans `PORT` |

L’application respecte `process.env.PORT`. Le profil Infomaniak utilise `HOST=0.0.0.0` pour permettre au proxy de joindre le processus. Ne pas recopier une valeur fixe `PORT=3000` dans les variables du site à la place du port attribué.

La version de base conserve une écoute locale `127.0.0.1` pour un VPS derrière Nginx. Le paramètre `HOST` de ce paquet permet d’adapter le lancement au service Node.js managé sans modifier le code.

## 4. Préparer le stockage et les secrets

Avant le premier démarrage, arrêter l’application depuis le tableau de bord pendant cette préparation.

Avec SSH/SFTP ou le gestionnaire de fichiers :

1. Créer un dossier **privé et persistant** pour les transferts, hors `public/` et hors du répertoire remplacé lors des imports ZIP. Choisir un emplacement autorisé par l’hébergement et relever son chemin absolu. Ne pas placer les données dans un dossier temporaire. Les droits doivent permettre l’écriture par le processus Node uniquement.
2. Dans le dossier d’exécution, copier `.env.infomaniak.example` vers `.env`.
3. Remplacer `DATA_DIR=/REMPLACER_PAR_LE_CHEMIN_PRIVE/transferts-data` par le chemin réel.
4. Garder `ADMIN_AUTH_MODE=link`. Le lien et le secret de session seront générés automatiquement dans `DATA_DIR`.
5. Renseigner les paramètres SMTP et l’identité d’envoi avec ceux de votre adresse mail ; les exemples ne sont pas des identifiants valides.
6. Vérifier `BASE_URL=https://transferts.pierre-coutherut.fr` et `HOST=0.0.0.0`.

Depuis un terminal SSH dans le dossier d’exécution, après installation des dépendances :

```bash
cp .env.infomaniak.example .env
chmod 600 .env
# Modifier DATA_DIR et les paramètres SMTP dans .env avant la commande suivante.
npm run admin-link
```

La commande `admin-link` affiche un lien privé de la forme `https://transferts.pierre-coutherut.fr/admin#access=…`. Aucun mot de passe admin ni hash n’est requis. Conserver le lien complet fourni en SSH dans un favori privé. Les secrets restent dans `DATA_DIR/admin-access.json` et sont conservés lors des redémarrages. Pour remplacer un lien perdu ou divulgué : `npm run admin-link -- --rotate` ; les anciennes sessions sont immédiatement révoquées.

Le fichier `.env` peut être remplacé par des variables d’environnement privées de l’hébergement si cette fonction est proposée. Les variables fournies au processus ont priorité sur `.env`. Les valeurs secrètes ne doivent pas être ajoutées à l’archive ni placées dans `public/`.

## 5. Activer HTTPS et démarrer

1. Vérifier que le sous-domaine pointe vers le site Node.js.
2. Activer le certificat SSL dans le tableau de bord Infomaniak et attendre qu’il soit valide.
3. Exécuter la commande de construction `npm ci --omit=dev`.
4. Démarrer l’application avec `npm start` via les commandes du Manager.
5. Ouvrir le lien privé affiché par `npm run admin-link`. Une visite de `/admin` seule ne donne pas accès à l’administration.

Le processus est maintenu par Infomaniak. Ne pas lancer en plus un second processus SSH permanent pour ce même site et cette même base de données. Les modèles Nginx/systemd présents dans `deploy/` concernent uniquement un serveur administré personnellement.

## 6. Vérifier avant les premiers envois clients

Créer un petit transfert vers une adresse de test que tu contrôles. Vérifier la réception du mail, l’ouverture du lien et le téléchargement individuel/ZIP. Redémarrer le site, puis vérifier que le transfert reste présent : cela confirme que `DATA_DIR` pointe vers le stockage persistant choisi.

Les limites du projet (2 Go par fichier, 20 Go par transfert) sont **des plafonds applicatifs, pas une garantie de la plateforme Infomaniak**. Le proxy peut imposer une taille de requête ou un délai plus bas. Essayer ensuite un fichier représentatif de tes livraisons habituelles et confirmer ces limites auprès d’Infomaniak avant les gros transferts. La reprise au milieu d’un fichier n’est pas implémentée dans cette première version.

En cas de `502`/`503`, consulter la console Node.js et vérifier d’abord le dossier d’exécution, la commande `npm start`, la version Node, le port transmis par le Manager, `HOST`, le chemin `DATA_DIR` et les variables obligatoires. Un statut mail « Échec » nécessite de vérifier le mot de passe IMAP/SMTP et la correspondance entre `SMTP_USER` et `MAIL_FROM`.

## Guides officiels

- [Créer un site Node.js](https://www.infomaniak.com/fr/support/faq/2537/creer-un-site-nodejs-chez-infomaniak)
- [Configurer un site Node.js](https://www.infomaniak.com/fr/support/faq/2535/modifier-la-configuration-dun-site-nodejs-infomaniak)
- [Paramètres mail et mots de passe IMAP/SMTP](https://www.infomaniak.com/fr/support/faq/2427/synchroniser-les-e-mails-sur-tous-vos-equipements)
- [Correspondance entre expéditeur et authentification SMTP](https://www.infomaniak.com/fr/support/faq/576/utiliser-phpmailer-sur-infomaniak)

## Mise à jour de la version déjà installée

Préserver le fichier `.env` et le dossier `DATA_DIR` existants. Après remplacement du code, ajouter `ADMIN_AUTH_MODE=link` dans `.env` (et dans les variables du Manager si elles définissent ce paramètre). Les anciennes valeurs `ADMIN_PASSWORD_HASH` et `SESSION_SECRET` sont ignorées en mode lien. Lancer `npm ci --omit=dev`, puis `npm run admin-link` en SSH dans `/srv/customer/sites/transferts.pierre-coutherut.fr/`. Redémarrer le processus géré par Infomaniak. Les transferts existants sont conservés si `DATA_DIR` reste identique.

Pour passer par un dépôt GitHub privé sans réimporter un ZIP, suivre [DEPLOIEMENT-GITHUB.md](DEPLOIEMENT-GITHUB.md).
