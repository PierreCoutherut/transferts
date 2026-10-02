# GitHub → Infomaniak en SSH

Le serveur utilise GitHub pour récupérer le code ; les photos, `.env` et l’accès admin restent sur Infomaniak. Aucun mot de passe Infomaniak ou SMTP ne doit être ajouté au dépôt.

## 1. Préparer le dépôt

Dépôt choisi : [PierreCoutherut/transferts](https://github.com/PierreCoutherut/transferts). Le projet est préparé pour la branche `main`. `.env`, le stockage des photos et les secrets sont exclus de Git.

Le workflow inclus lance les tests sur GitHub ; il ne redémarre pas le serveur.

## 2. Donner au serveur un accès en lecture

Dans ton terminal SSH Infomaniak :

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "infomaniak-transferts" -f ~/.ssh/pierre-transferts-deploy
cat ~/.ssh/pierre-transferts-deploy.pub
```

Pour une récupération non interactive du code par le serveur, laisser la phrase secrète vide aux deux invites. Ne pas écraser une clé existante : choisir un nouveau nom si ce chemin existe déjà. Copier uniquement la clé **publique** affichée (`.pub`). Dans le dépôt GitHub : **Settings → Deploy keys → Add deploy key** ; laisser **Allow write access** décoché. La clé privée reste sur le serveur.

Ajouter ce bloc à `~/.ssh/config`, sans écraser les autres entrées :

```sshconfig
Host github-pierre-transferts
  HostName github.com
  User git
  IdentityFile ~/.ssh/pierre-transferts-deploy
  IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config
ssh -T github-pierre-transferts
```

Lors de la première connexion, vérifier l’empreinte présentée avec [les empreintes officielles GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) avant de l’accepter. Le message « successfully authenticated » confirme l’accès ; GitHub ne fournit pas de shell, et cette commande peut retourner le code 1 malgré la réussite.

## 3. Récupérer le projet sans remplacer les données

Le site existe déjà dans `/srv/customer/sites/transferts.pierre-coutherut.fr/`. Cloner le dépôt dans un dossier distinct, accessible en écriture avec ton compte SSH. Exemple avec ton dossier personnel :

```bash
git clone git@github-pierre-transferts:PierreCoutherut/transferts.git ~/pierre-transferts-source
cd ~/pierre-transferts-source
git status
```

Avant la copie, arrêter le processus Node.js géré par Infomaniak et sauvegarder le `.env` ainsi que le `DATA_DIR` existants. La copie suivante extrait uniquement les fichiers versionnés ; elle ne supprime pas tes données ou ton `.env`.

```bash
cd ~/pierre-transferts-source
git archive --format=tar --output=/tmp/pierre-transferts-release.tar HEAD
tar -xf /tmp/pierre-transferts-release.tar -C /srv/customer/sites/transferts.pierre-coutherut.fr/
rm /tmp/pierre-transferts-release.tar
cd /srv/customer/sites/transferts.pierre-coutherut.fr/
npm ci --omit=dev
```

Dans ton `.env` existant, ajouter/remplacer ces paramètres sans changer `DATA_DIR` :

```dotenv
ADMIN_AUTH_MODE=link
BASE_URL=https://transferts.pierre-coutherut.fr
HOST=0.0.0.0
```

Ne pas fixer `PORT` : le processus utilise celui fourni par Infomaniak. Si les variables du Manager définissent `ADMIN_AUTH_MODE`, les mettre également à `link`, car elles sont prioritaires sur `.env`.

```bash
chmod 600 .env
npm run admin-link
```

Ouvrir le lien privé affiché après le redémarrage du site.

**Redémarrage :** Infomaniak documente Start / Stop / Restart dans son tableau de bord Node.js. Si ton accès est strictement limité à SSH et que tu n’as pas accès à ce tableau de bord, il faut connaître le mécanisme de lancement fourni pour ton compte, ou demander au titulaire du Manager de redémarrer le site. Ne pas lancer un second `npm start` en parallèle ni supposer la présence de PM2/systemd. Le déploiement par SSH est possible, mais son redémarrage automatique n’est pas configuré dans ce paquet.

## 4. Les mises à jour suivantes

Après publication des changements sur GitHub et arrêt du site :

```bash
cd ~/pierre-transferts-source
git pull --ff-only origin main
git archive --format=tar --output=/tmp/pierre-transferts-release.tar HEAD
tar -xf /tmp/pierre-transferts-release.tar -C /srv/customer/sites/transferts.pierre-coutherut.fr/
rm /tmp/pierre-transferts-release.tar
cd /srv/customer/sites/transferts.pierre-coutherut.fr/
npm ci --omit=dev
```

Redémarrer le site avec le mécanisme Infomaniak, puis vérifier l’administration et un téléchargement client. Le lien admin reste identique : `npm run admin-link` permet de le retrouver. Ne jamais faire de suppression globale du dossier du site pour le remplacer par Git.

## Sources

- [Git sur Infomaniak](https://www.infomaniak.com/fr/support/faq/2463/utiliser-git-et-github-avec-un-hebergement-web)
- [Configuration et redémarrage Node.js Infomaniak](https://www.infomaniak.com/fr/support/faq/2535/modifier-la-configuration-dun-site-nodejs-infomaniak)
- [Clés de déploiement GitHub](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)

## Si l’intégration GitHub refuse l’écriture

Le paquet peut être publié depuis un ordinateur disposant de Git. L’archive inclut `pierre-transferts.bundle`, qui contient la branche `main` et les fichiers vérifiés. Pour le dépôt fourni initialement vide :

```bash
git clone pierre-transferts.bundle pierre-transferts-publication
cd pierre-transferts-publication
git remote set-url origin https://github.com/PierreCoutherut/transferts.git
git push -u origin main
```

S’authentifier par la méthode habituelle de GitHub sur cet ordinateur. Un mot de passe de compte GitHub ne sert pas de mot de passe Git ; utiliser un gestionnaire d’identifiants ou une clé SSH. Si Git refuse le push car le dépôt contient désormais d’autres commits, ne pas forcer : récupérer ces changements et les intégrer avant publication.
