import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function monthLater(date) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1);
  const last = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last));
  return d.toISOString();
}
export function openStore(directory) {
  const root = path.resolve(directory);
  mkdirSync(root,{recursive:true,mode:0o700});
  const filesDir = path.join(root,'files');
  mkdirSync(filesDir,{recursive:true,mode:0o700});
  const db = new DatabaseSync(path.join(root,'transfers.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
      recipient TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, expires_at TEXT, status TEXT NOT NULL DEFAULT 'draft',
      email_status TEXT NOT NULL DEFAULT 'none', downloads INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, transfer_id TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
      name TEXT NOT NULL, size INTEGER NOT NULL, disk_name TEXT NOT NULL UNIQUE,
      upload_key TEXT NOT NULL, UNIQUE(transfer_id,upload_key)
    );`);
  const transfer = id => db.prepare('SELECT * FROM transfers WHERE id=?').get(id);
  const files = id => db.prepare('SELECT * FROM files WHERE transfer_id=? ORDER BY rowid').all(id);
  function purge(id, status='deleted') {
    // Invalidation immédiate avant le retrait sur disque.
    db.prepare('UPDATE transfers SET status=? WHERE id=?').run(status,id);
    for (const f of files(id)) rmSync(path.join(filesDir,f.disk_name),{force:true});
    db.prepare('DELETE FROM files WHERE transfer_id=?').run(id);
  }
  function cleanup(now=new Date()) {
    const iso = now.toISOString();
    const stale = new Date(now.getTime()-86400000).toISOString();
    const expired = db.prepare("SELECT id FROM transfers WHERE status='active' AND expires_at<=?").all(iso);
    for (const t of expired) purge(t.id,'expired');
    const drafts = db.prepare("SELECT id FROM transfers WHERE status='draft' AND created_at<=?").all(stale);
    for (const t of drafts) purge(t.id,'deleted');
    // Un upload interrompu ou un crash ne doit pas laisser de fichiers orphelins.
    const referenced = new Set(db.prepare('SELECT disk_name FROM files').all().map(f=>f.disk_name));
    for (const name of readdirSync(filesDir)) {
      const p=path.join(filesDir,name);
      if (!referenced.has(name) && statSync(p).mtimeMs < now.getTime()-86400000) rmSync(p,{force:true});
    }
    return {expired:expired.length,drafts:drafts.length};
  }
  return {db,root,filesDir,transfer,files,purge,cleanup};
}
