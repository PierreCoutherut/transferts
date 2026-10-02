import { scryptSync, randomBytes } from 'node:crypto';
// Saisie masquée sur un terminal. Aucun mot de passe passé dans les arguments.
if (!process.stdin.isTTY) { console.error('Lance cette commande dans un terminal interactif.'); process.exit(1); }
process.stdout.write('Nouveau mot de passe admin (12 caractères minimum) : ');
process.stdin.setRawMode(true);
let password = '';
process.stdin.on('data', data => {
  for (const c of data.toString()) {
    if (c === '\u0003') process.exit(130);
    if (c === '\r' || c === '\n') {
      process.stdin.setRawMode(false);
      if (password.length < 12) { console.error('\nMot de passe trop court.'); process.exit(1); }
      const salt = randomBytes(16).toString('hex');
      console.log('\nADMIN_PASSWORD_HASH=' + salt + ':' + scryptSync(password, salt, 64).toString('hex'));
      process.exit(0);
    } else if (c === '\u007f') password = password.slice(0,-1);
    else if (c >= ' ') password += c;
  }
});
