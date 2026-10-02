# Pierre Transferts

Une application autonome à installer sur le serveur Node.js de Pierre Coutherut, pour le domaine `transferts.pierre-coutherut.fr`.

**Pour l’hébergement Web / Node.js Infomaniak : suivre [INSTALLATION-INFOMANIAK.md](INSTALLATION-INFOMANIAK.md) et utiliser `.env.infomaniak.example`.** Ce profil utilise les paramètres de messagerie renseignés sur le serveur et le port transmis par le Manager. Les exemples Nginx/systemd ci-dessous concernent un serveur administré personnellement.

## Inclus

- `/admin` : connexion privée, dépôt par glisser-déposer, progression, création de transferts, copie des liens, suivi des téléchargements, renvoi des e-mails et suppression.
- `/t/<lien-secret>` : réception client sans compte, téléchargement de chaque fichier ou de tout le transfert en ZIP.
- `/` : ouverture d’un lien reçu.
- `/demo` : aperçu client explicitement marqué, avec une photographie d’exemple réellement téléchargeable.
- Conservation pendant **un mois calendaire après publication**. Les fins de mois sont ajustées au dernier jour du mois suivant. L’expiration est contrôlée par le serveur avant chaque téléchargement. Le nettoyage physique fonctionne au démarrage et toutes les heures. Un téléchargement déjà commencé peut se terminer.
- Brouillons et fichiers orphelins nettoyés après 24 heures.
- E-mail automatique **après la réussite de tous les uploads**, si une adresse a été renseignée et le SMTP configuré. Les échecs restent visibles et le transfert reste disponible. La réussite indique que le serveur SMTP a accepté l’envoi, sans garantir la réception en boîte de réception.
- Photos aléatoires de BESTS au chargement et toutes les 60 secondes, sans répétition immédiate. La galerie est rafraîchie toutes les 5 minutes. Pause et changement manuel ; pause automatique du diaporama pour la préférence de réduction des animations.
- Logo et orange `#ff6900` repris de la galerie actuelle.

## Architecture

Node.js **22.13 minimum** (Node 24 conseillé), Express, base SQLite et fichiers sur le disque du serveur. SQLite est fourni par Node ; aucun serveur de base de données supplémentaire n’est requis. Les ZIP sont produits en flux sans charger les fichiers en mémoire et sans créer une seconde copie de l’ensemble.

L’API photo existante sert uniquement à lire les photos publiques de BESTS :

```text
GET https://api.pierre-coutherut.fr/gallery/8c5ae7e1-e5b3-4738-adde-4d4041f99405?randomPhotosCount=30
```

Elle n’expose pas actuellement de service de téléchargement temporaire avec expiration. Cette application possède donc son propre stockage et son propre compte admin. **Aucun mot de passe ni jeton de ton API photo n’est livré dans le projet ou envoyé au navigateur.** Trois photographies de secours issues de BESTS assurent la rotation si l’API est indisponible. L’API est chargée en arrière-plan et ses images prennent le relais aux changements suivants.

## Essai local

```bash
npm ci
cp .env.example .env
```

Pour cet essai local, régler `.env` avant de générer le lien :

```dotenv
NODE_ENV=development
BASE_URL=http://localhost:3000
TRUST_PROXY=0
```

Puis lancer `npm run admin-link`, conserver le lien affiché et démarrer `npm start`. Ouvrir le lien privé pour se connecter sans mot de passe. `http://localhost:3000/demo` présente l’espace client sans créer de transfert.

## Installation sur le domaine

1. Vérifier que l’hébergeur accepte un processus Node.js permanent, un disque persistant et les connexions SMTP sortantes. Sur un serveur mutualisé géré, utiliser son gestionnaire Node.js. Sur un VPS Linux, un exemple systemd est fourni dans `deploy/`.
2. Copier le projet sur le serveur, puis exécuter `npm ci --omit=dev` dans ce répertoire.
3. Créer `.env` à partir de `.env.example`, choisir `ADMIN_AUTH_MODE=link`, puis renseigner `BASE_URL=https://transferts.pierre-coutherut.fr`, `NODE_ENV=production` et un `DATA_DIR` persistant **hors du dossier public**.
4. Raccorder le sous-domaine au serveur (A/AAAA ou configuration de domaine de l’hébergeur), puis activer HTTPS. Le certificat doit être opérationnel avant d’utiliser l’administration.
5. Placer le processus derrière le proxy de l’hébergeur ou Nginx. Node écoute uniquement sur `127.0.0.1:3000`. Ajuster `TRUST_PROXY` au nombre réel de proxys de confiance. L’exemple Nginx suppose un proxy local unique.
6. Configurer la taille et les délais autorisés par le proxy en cohérence avec les limites `.env`. Les uploads sont séquentiels, un fichier par requête. Par défaut : 2 Go par fichier, 20 Go par transfert, 1000 fichiers. Certaines offres d’hébergement ou proxys peuvent imposer des plafonds plus bas.
7. Configurer le SMTP et l’identité d’envoi, puis essayer un vrai envoi vers une adresse de test que tu contrôles. Les configurations DKIM/SPF de ton fournisseur doivent autoriser l’expéditeur choisi.
8. Démarrer et maintenir l’application avec le gestionnaire Node de ton hébergeur ou systemd. Garder un seul processus pour ce stockage local ; cette version n’est pas prévue pour plusieurs serveurs ni un cluster PM2.

### Exemple SMTP

```dotenv
SMTP_HOST=smtp.ton-fournisseur.fr
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=transferts@pierre-coutherut.fr
SMTP_PASSWORD=mot_de_passe_smtp
MAIL_FROM=Pierre Coutherut <transferts@pierre-coutherut.fr>
MAIL_REPLY_TO=ton_adresse_de_contact
```

Le port 587 utilise STARTTLS obligatoire. Pour le port 465, mettre `SMTP_SECURE=true`. Si aucun SMTP n’est renseigné, l’interface indique que l’e-mail n’a pas été envoyé ; le lien reste utilisable.

### Disque et nettoyage

Prévoir le volume cumulé des transferts actifs. SQLite et les fichiers sont dans `DATA_DIR` ; ne jamais publier ce dossier par Nginx/Apache. Les liens sont des secrets de partage : toute personne possédant un lien peut télécharger les fichiers de ce transfert.

Le blocage des téléchargements est immédiat à l’expiration. La suppression sur disque suit au prochain nettoyage (au plus une heure lorsque le service tourne). Pour un nettoyage indépendant du service, `npm run cleanup` peut être lancé par une tâche cron, sous le même utilisateur et avec le même `.env`, **une fois par heure**. Les métadonnées des transferts expirés restent visibles dans l’administration jusqu’à leur suppression manuelle ; les fichiers, eux, sont supprimés. Les sauvegardes restent soumises à la rétention choisie auprès de l’hébergeur.

## Validation

```bash
npm test
npm audit --omit=dev
```

Les tests couvrent les fins de mois, l’authentification, le contrôle d’origine, les brouillons privés, les fichiers UTF-8, le ZIP et les doublons de noms, la reprise sans doublon, la notification et l’erreur SMTP, les limites de taille, l’expiration avant téléchargement et la suppression physique.

Les interfaces ordinateur et mobile sont vérifiées avec un navigateur sur un transfert réel de test. Les e-mails sont vérifiés avec un transport de test ; l’envoi sur ton SMTP et le déploiement sur ton hébergeur restent à effectuer avec tes paramètres.

## Limites de cette première version

- Reprise après erreur dans la même page : les fichiers déjà déposés ne sont pas envoyés une seconde fois. La reprise au milieu d’un très gros fichier et la reprise d’une sélection après fermeture du navigateur ne sont pas implémentées. Les brouillons après fermeture sont visibles dans l’administration et se nettoient sous 24 heures.
- Aucun lien public de liste des transferts, aucun compte client et aucun import automatique de fichiers depuis tes galeries.
- Les originaux envoyés restent intacts ; le service ne fabrique pas de vignettes des fichiers clients.
- Les liens privés ne remplacent pas un mot de passe client individuel si tu en souhaites un à l’avenir.

La publication du code sur GitHub ne confirme pas son déploiement sur `transferts.pierre-coutherut.fr`. Le lancement du site, les paramètres SMTP et le téléchargement réel restent à vérifier sur Infomaniak.

## Accès administrateur par lien privé

Le mode par défaut est `ADMIN_AUTH_MODE=link`. Aucun `ADMIN_PASSWORD_HASH` ni `SESSION_SECRET` n’est nécessaire dans ce mode. Les secrets sont générés automatiquement dans le fichier privé `DATA_DIR/admin-access.json` (droits 600). Le même dossier doit être conservé à chaque déploiement et sauvegardé avec les transferts.

- `npm run admin-link` affiche le lien existant ou le crée au premier lancement.
- `npm run admin-link -- --rotate` remplace le lien et révoque immédiatement les sessions ouvertes.
- Le lien contient le secret dans le fragment `#access=…`, retiré de la barre d’adresse par la page puis échangé contre une session de huit heures. Il n’est pas enregistré dans le stockage du navigateur. Conserver le lien original fourni en SSH dans un gestionnaire de mots de passe ou un favori privé. Toute personne possédant ce lien dispose de l’administration.
- Les secrets ne sont jamais affichés dans les logs de démarrage ni servis par l’application.

L’ancien mode reste disponible avec `ADMIN_AUTH_MODE=password`, un hash généré par `npm run password` et un `SESSION_SECRET` de 48 caractères minimum.

## GitHub et SSH Infomaniak

Voir [DEPLOIEMENT-GITHUB.md](DEPLOIEMENT-GITHUB.md). Le code est destiné au dépôt [PierreCoutherut/transferts](https://github.com/PierreCoutherut/transferts). `.env`, les secrets et les fichiers clients restent sur le serveur. Un workflow GitHub vérifie les tests à chaque push ; la mise en ligne exige encore la copie du code et le redémarrage Infomaniak.
