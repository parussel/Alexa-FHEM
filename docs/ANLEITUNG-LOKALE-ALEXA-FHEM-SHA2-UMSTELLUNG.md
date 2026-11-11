# Alexa-FHEM lokal auf SHA-2-SSH umstellen

**Unverbindliche technische Hilfestellung – keine Garantie.** Die Anleitung ist für fortgeschrittene FHEM-Nutzer gedacht, die Änderungen ausschließlich in ihrer eigenen Installation vornehmen. Umsetzung und Folgen liegen in der Verantwortung des jeweiligen Anlagenbetreibers. Vorher zwingend sichern. Bei abweichenden Versionen, Prüfsummen, Pfaden oder Abhängigkeiten abbrechen und nicht versuchen, Dateien aus unterschiedlichen Ständen zu mischen.

Diese Anleitung liefert kein Installationspaket und richtet keinen automatischen Updatekanal ein. Sie beschreibt lokale Änderungen am installierten Alexa-FHEM-Programm. `39_alexa.pm`, FHEM-Konfiguration, Registrierungsdaten, SSH-Schlüssel und `known_hosts` werden nicht ersetzt. Herkunft und Lizenz des zugrunde liegenden Programms bleiben dessen jeweiliger Quelle zugeordnet; dieser technische Text trifft keine rechtliche Aussage.

## Was wird geändert?

Die hier geprüfte Ausgangsbasis ist **Alexa-FHEM 0.5.64**. Die Änderung ist größer als ein einzelner Befehl:

- drei vorhandene Alexa-FHEM-Dateien werden gezielt geändert: `lib/server.js`, `lib/user.js` und `package.json`. Die Anwender übertragen nur die unten beschriebenen Änderungen, keine vollständigen Ersatzdateien;
- eine neue, von Frank Parussel geschriebene Datei kommt hinzu: `lib/native-ssh.js`. Sie trägt einen getrennten Copyright-Hinweis und wird separat als einzelne Datei angeboten;
- benötigt wird `ssh2` 1.17.0. Im geprüften Baum waren außerdem `asn1` 0.2.6, `bcrypt-pbkdf` 1.0.2, `safer-buffer` 2.1.2 und `tweetnacl` 0.14.5 vorhanden;
- die Laufzeit setzt Node.js ab Version 20 voraus.

Die Anleitung stellt keine vollständigen Ersatzdateien für die drei geänderten Upstream-Dateien bereit. Sie enthält stattdessen die erforderlichen, begrenzten Änderungshunks, die lokal auf den geprüften Ausgangsstand angewendet werden. Die neu geschriebene Datei `lib/native-ssh.js` wird separat angeboten. Ein Copyright-Hinweis benennt die Urheberschaftszuordnung für diese neue Datei, ersetzt aber keine Lizenzangabe. Die bestehende Paket-Lizenzdeklaration bleibt unverändert.

## 1. Vorab-Checkliste – noch nichts ändern

1. Zugriff auf die FHEM-Oberfläche und SSH-Zugang als tatsächlicher Alexa-/FHEM-Dienstbenutzer sicherstellen.
2. In FHEM beim Alexa-Gerät die aktuellen Werte von `alexaFHEM-cmd` und `alexaFHEM-config` notieren. `alexaFHEM-cmd` ist der bisherige Rückweg. Den Inhalt von `alexaFHEM-config`, Tokens oder Schlüssel niemals öffentlich zeigen.
3. Ermitteln, wo das gestartete Alexa-Programm tatsächlich liegt. Nicht annehmen, es liege unter `/opt/fhem` oder `/home/fhem`.
4. Prüfen, dass die Alexa-Anwendung exakt Version 0.5.64 ist. Bei anderer Version: **hier abbrechen**.
5. `package.json` muss vor Änderung exakt die unten genannte Ausgangsprüfsumme haben. `lib/server.js` und `lib/user.js` müssen ebenfalls exakt ihren Ausgangsprüfsummen entsprechen. Diese beiden JavaScript-Dateien haben keine eigene Versionsnummer; ihre Prüfsummen identifizieren den geprüften Datei-Stand. Bei einer Abweichung: **hier abbrechen**.
6. Genügend freien Speicherplatz für eine vollständige Sicherheitskopie und eine zweite Programmdatei-Version sicherstellen.
7. Originaldateien und bisherigen Startpfad sichern. Erst nach geprüftem Rückweg fortfahren.
8. Sicherstellen, dass das System Node.js 20 oder neuer hat und die benötigten Bibliotheken ohne Überschreiben abweichender Versionen verfügbar sind.

### Leserechte und Schreibrechte prüfen

```bash
id -un
stat -c '%U %G %a %n' package.json lib/server.js lib/user.js lib
test -r package.json && test -r lib/server.js && test -r lib/user.js && echo DATEIEN_LESBAR
test -w . && test -w lib && echo ZIELORDNER_SCHREIBBAR
```

Wenn die Schreibprüfung fehlschlägt, nicht mit `sudo` wiederholen und keine pauschalen Eigentümer- oder Rechteänderungen wie `chmod -R` oder `chown -R` verwenden. Anhalten und den Administrator bitten, die vier genau benannten Dateien mit den vorhandenen passenden Eigentümern/Rechten zu übertragen. Unbekannte Verzeichnisrechte nicht ändern.

### Programmversion und Ausgangsdateien prüfen

In PuTTY als tatsächlicher Dienstbenutzer zum Alexa-FHEM-Programmordner wechseln. `APP_DIR` ist hier nur eine Platzhalterbeschreibung: durch den wirklichen Ordner ersetzen, nicht wörtlich kopieren.

```bash
cd /TATSAECHLICHER/PFAD/ZU/node_modules/alexa-fhem || exit 1
git --version || { echo 'STOPP: git fehlt; Patch nicht anwenden'; exit 1; }
node --version
node -e 'const v=require("./package.json").version; console.log("Alexa-FHEM-Version:",v); if(v!=="0.5.64") process.exit(1)' || { echo 'STOPP: falsche Alexa-FHEM-Version'; exit 1; }
if ! sha256sum -c <<'SHA256'
f7af77fef5ac64fdc613126e01ce904430b659370b8ef5825485ab3c628ae229  package.json
f12570912e6e81a6d77b4b9fdfdbe8b4baf32bf544768ceca35f972c20d619b4  lib/server.js
f37a24c469ace64693ab2bdcb0e87a04f9d9ba5708937db75ef5b985915b986d  lib/user.js
SHA256
then
  echo 'STOPP: mindestens eine Ausgangsprüfsumme weicht ab; Änderung nicht durchführen.'
  exit 1
fi
```

Erwartet: Node.js `v20` oder neuer, Paketversion `0.5.64` und exakt diese drei SHA-256-Prüfsummen:

```text
f7af77fef5ac64fdc613126e01ce904430b659370b8ef5825485ab3c628ae229  package.json
f12570912e6e81a6d77b4b9fdfdbe8b4baf32bf544768ceca35f972c20d619b4  lib/server.js
f37a24c469ace64693ab2bdcb0e87a04f9d9ba5708937db75ef5b985915b986d  lib/user.js
```

Prüfsummen prüfen nur, ob Dateien bytegenau mit diesem bekannten Ausgangsstand übereinstimmen. Sie beweisen weder eine vertrauenswürdige Herkunft noch die Sicherheit oder Lizenzierbarkeit eines Programms. Bei abweichender Ausgabe nicht fortfahren.

### Abhängigkeiten prüfen und Versionen abgleichen

```bash
node -e 'const expected={ssh2:"1.17.0",asn1:"0.2.6","bcrypt-pbkdf":"1.0.2","safer-buffer":"2.1.2",tweetnacl:"0.14.5"}; let bad=false; for(const [n,want] of Object.entries(expected)){try{const p=require.resolve(n+"/package.json",{paths:[process.cwd()]});const got=require(p).version;console.log(`${n}: ${got} (erwartet ${want}) — ${p}`);if(got!==want)bad=true;}catch(e){console.log(`${n}: FEHLT (erwartet ${want})`);bad=true;}} if(bad){console.error("STOPP: Abhängigkeiten fehlen oder weichen ab.");process.exit(1)}'
```

Der Befehl gleicht die tatsächlich aufgelösten Paketversionen mit den geprüften Voraussetzungen ab und gibt bei jeder fehlenden oder abweichenden Version einen Fehlerstatus zurück. Die Pfade zeigen, aus welchem `node_modules`-Baum Node.js die Pakete lädt. Wenn Versionen fehlen oder abweichen, **nicht blind installieren oder überschreiben**. Der Paketbaum ist für fremde Installationen nicht vollständig gesperrt; die konkrete Ergänzung muss zuerst an einer getrennten Kopie geprüft werden.

## 2. Sicherheitskopie erstellen

Als Dienstbenutzer im Alexa-FHEM-Programmordner ausführen. Das Beispiel erzeugt einen neuen, privaten Sicherungsordner und überschreibt keine vorhandene Sicherung:

```bash
BACKUP="$HOME/alexa-fhem-vor-sha2-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$BACKUP" || exit 1
cp -a package.json lib/server.js lib/user.js "$BACKUP/" || exit 1
if [ -e lib/native-ssh.js ]; then
  cp -a lib/native-ssh.js "$BACKUP/" || exit 1
fi
printf 'Sicherung: %s\n' "$BACKUP"
sha256sum "$BACKUP"/package.json "$BACKUP"/server.js "$BACKUP"/user.js
```

Die Sicherung liegt so im Home-Verzeichnis des angemeldeten Dienstbenutzers und nicht im Programmpaket. Vor dem Fortfahren prüfen, dass der angezeigte Pfad stimmt und die Sicherungsdateien vorhanden sind. `alexaFHEM-config`, die in FHEM konfigurierte Nutzkonfiguration und SSH-Dateien nicht in die Programmdateien hineinkopieren oder verändern.

## 3. Geprüfte Programmdateien übertragen

WinSCP ist eine mögliche Übertragungsmethode; die Dateien müssen in den bereits ermittelten Programmordner und exakt in diese Zielpfade gelangen. FHEM muss dafür nicht beendet werden. In der FHEM-Oberfläche nur den Alexa-Prozess stoppen und warten, bis er wirklich beendet ist:

```text
set <Alexa-Gerätename> stop
```

Dann sicherstellen, dass kein Alexa-Prozess mehr läuft. Nicht `39_alexa.pm` austauschen. Nach erfolgreicher Dateiprüfung in Schritt 5 den Alexa-Prozess wieder starten:

```text
set <Alexa-Gerätename> start
```

Vor dem Patch muss `git apply --check` ohne Fehler durchlaufen. Danach den Patch auf die lokal gesicherten Dateien anwenden und `git diff --check` ausführen. Bei einem Fehler oder einem nicht passenden Kontext nichts erzwingen; abbrechen und Sicherung wiederherstellen. Die neue Datei `lib/native-ssh.js` muss im Zielordner `lib/` liegen. Ihr Code ist unten vollständig enthalten; ein optionaler Datei-Download muss exakt denselben SHA-256-Wert haben.

### Gezielte Änderungen an den drei vorhandenen Dateien

Die folgenden Diffs stammen aus dem geprüften Vergleich zwischen Alexa-FHEM 0.5.64 und dem Kandidaten. Sie ändern nur `package.json`, `lib/server.js` und `lib/user.js`; es sind keine vollständigen Ersatzdateien. Speichere den gesamten Block als `alexa-fhem-sha2.patch` im Alexa-FHEM-Programmordner. Erst nach erfolgreicher Ausgangsprüfung und Sicherung fortfahren.

```diff
--- a/lib/server.js
+++ b/lib/server.js
@@ -9,6 +9,7 @@
 var version = require('./version');

 var User = require('./user').User;
+var NativeSSH = require('./native-ssh');

 var log = require("./logger")._system;
 var Logger = require('./logger').Logger;
@@ -453,10 +454,12 @@
   else
     this.setreading( SSHSTATUS_NAME, state +";; "+ txt );
 }
-Server.prototype.unregister_ssh = function() {
+Server.prototype.unregister_ssh = async function() {
   const proxy_config = this._config.sshproxy;
   const execSync = require('child_process').spawnSync;
-  const prc = execSync( proxy_config.ssh, proxy_config.options.concat(['unregister']));
+  let prc;
+  try { prc = await User.proxyCommand(this._config,'unregister'); }
+  catch(error) { log.warn('Unable to unregister SSH proxy'); return; }
   if (prc.error) {
     log.warn ("Error executing unregister: " + prc.error.message);
     return;
@@ -491,8 +494,17 @@
     const args = ['-R', '1234:' + proxy_config['bind-ip']+ ':' + proxy_config.server.address().port,
           '-oServerAliveInterval=90'].concat(proxy_config.options);
     log.info ("Starting SSH with " + args.join(' '));
-    ssh_client = exec( proxy_config.ssh, args);
-
+    try {
+      ssh_client = NativeSSH.enabled(proxy_config) ?
+        NativeSSH.tunnel(NativeSSH.fromConfig(proxy_config,User.sshKeyPath()),
+          proxy_config['bind-ip'],proxy_config.server.address().port) : exec(proxy_config.ssh,args);
+    } catch(error) {
+      this.set_ssh_state('error','Native SSH configuration failed');
+      log.error('Unable to initialize SSH proxy: '+error.message);
+      return;
+    }
+
+    ssh_client.on('retry',seconds=>{ ssh_client_reconnectdelay = seconds*1000; });
     ssh_client.stdout.on('data', (data) => {
       const delayReconnectRegex = /\(retry: (\d+) seconds\)/m;
       const str = data.toString();
@@ -524,7 +536,9 @@
     });

     ssh_client.on('close', (code) => {
-      if( ssh_client_state !== 'running' ) {
+      const mayRetry = ssh_client && ssh_client.retryable;
+      ssh_client = undefined;
+      if( ssh_client_state === 'stopping' || (ssh_client_state !== 'running' && !mayRetry) ) {
         this.set_ssh_state( 'stopped', ssh_client_laststderr);
         log.warn ("*** SSH: exited with " + (ssh_client_laststderr ? ssh_client_laststderr : code));
         return;
@@ -763,7 +777,7 @@
         if (this._config.sshproxy) {
           getProxyToken(fhem);
           if (fhem === this.connections[0]) {
-            if( this._config.sshproxy.ssh === '-' )
+            if( !NativeSSH.enabled(this._config.sshproxy) && this._config.sshproxy.ssh === '-' )
               this.startProxy2(fhem, n);
             else
               this.startProxy(fhem, n);
--- a/lib/user.js
+++ b/lib/user.js
@@ -5,6 +5,7 @@
 var FHEM = require('./fhem').FHEM;
 var Logger = require('./logger').Logger;
 var version = require('./version');
+var NativeSSH = require('./native-ssh');

 'use strict';

@@ -83,6 +84,15 @@
 User.setConfigFile = function(file) {
   customConfigFile = file;
 }
+
+User.proxyCommand = async function(config,command) {
+  if (NativeSSH.enabled(config.sshproxy)) {
+    const result = await NativeSSH.execute(NativeSSH.fromConfig(config.sshproxy,User.sshKeyPath()),command);
+    return {status:result.status,output:[null,Buffer.from(result.stdout),Buffer.from(result.stderr)]};
+  }
+  return require('child_process').spawnSync(config.sshproxy.ssh,
+    ['-o','StrictHostKeyChecking=yes'].concat(config.sshproxy.options,command.split(' ')),{stdio:'pipe'});
+};

 /*
     The following block is copied from the FHEMlazy trial of gvzdus
@@ -401,6 +411,8 @@
     let pubkey_path = path.join(User.sshKeyPath(), 'id_rsa');
     //let pubkey_path = path.join(User.sshKeyPath(), 'id_ed25519');
     if (!fs.existsSync(pubkey_path)) {
+      if (NativeSSH.enabled(config.sshproxy) && !interactive)
+        return 'Existing SSH identity required; automatic key generation disabled';
       if (fs.existsSync(config.sshproxy.ssh + '-keygen')) {
         writeout('No SSH public key found, we have to generate one.');
         goon = readline.question("Okay to generate SSH-Key in " + User.sshKeyPath() + "? [Hit Enter for okay, 'n' else] ");
@@ -436,10 +448,7 @@
       const execSync = require('child_process').spawnSync;

       // Most likely initial SSH call: Avoid prompt for adding HostKey
-      const prcStatus = execSync(config.sshproxy.ssh,
-        [ '-o', 'StrictHostKeyChecking=no'].concat(config.sshproxy.options).concat(
-          [ 'status', 'version='+version ]
-        ),  {stdio: 'pipe'});
+      const prcStatus = await User.proxyCommand(config,'status version='+version);
       if (prcStatus.error) {
         return "Error on executing ssh: " + prcStatus.error.message;
       }
@@ -471,6 +480,8 @@
         return "Trying to fetch alexadevice failed with " + e;
       }
       let alexaDevice = s_json.Results[0];
+      if (NativeSSH.enabled(config.sshproxy) && !interactive)
+        NativeSSH.requireExistingRegistration(sshKeyIsRegistered,alexaDevice.Readings);
       const alexaDevHasStart = !!(alexaDevice.PossibleSets &&
         alexaDevice.PossibleSets.indexOf("start:") >= 0 &&
         alexaDevice.PossibleAttrs &&
@@ -525,9 +536,7 @@
             let bearerTokenRandomBytes = crypto.randomBytes(8);
             bearerToken = bearerTokenRandomBytes.toString('hex').toUpperCase();

-            const prc = execSync(config.sshproxy.ssh,
-              ['-oStrictHostKeyChecking=no'].concat(config.sshproxy.options).concat(
-              ['register', 'keyhash=' + registrationRandomHash]), {stdio: 'pipe'});
+            const prc = await User.proxyCommand(config,'register keyhash='+registrationRandomHash);
             let registrationResult = prc.output[1].toString();
             //writeout(registrationStatus);
             const regexp = /\s+([0-9A-F]+)-\.\./m;
@@ -552,7 +561,7 @@
           } finally {
             if (rollback && registrationKey) {
               // Writing the key went wrong, unregister...
-              const prc = execSync(config.sshproxy.ssh, ['-p', 58824, '-i', '~/.ssh/id_rsa', 'fhem-va.fhem.de', 'unregister'], {stdio: 'pipe'});
+              const prc = await User.proxyCommand(config,'unregister');
             }
           }
           if (interactive)
@@ -597,7 +606,8 @@
     }
   } catch (e) {
     writeout(e);
-    return e;
+    // autoConfig distinguishes failure strings from successful result objects.
+    return e && typeof e.message === 'string' ? e.message : String(e);
   }
 }

--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "alexa-fhem",
-  "version": "0.5.64",
+  "version": "0.5.64-sha2.1",
   "description": "a fhem skill for amazon alexa",
   "author": "justme-1968",
   "license": "ISC",
@@ -17,13 +17,14 @@
     "url": "https://github.com/justme-1968/alexa-fhem.git"
   },
   "engines": {
-    "node": ">=8.0.0"
+    "node": ">=20.0.0"
   },
   "dependencies": {
     "chalk": "^2.4.2",
     "commander": "^2.20.3",
     "postman-request": "^2.88.1-postman.31",
-    "readline-sync": "^1.4.10"
+    "readline-sync": "^1.4.10",
+    "ssh2": "1.17.0"
   },
   "optionalDependencies": {
     "ws": "^6.1.2"
```

Vor dem Anwenden kontrolliert Git, ob jeder Block exakt auf den vorhandenen 0.5.64-Dateistand passt:

```bash
git apply --check alexa-fhem-sha2.patch || { echo 'STOPP: Patch passt nicht exakt'; exit 1; }
git apply alexa-fhem-sha2.patch || { echo 'STOPP: Patch nicht angewendet'; exit 1; }
git diff --check || { echo 'STOPP: Patch enthält Formatfehler'; exit 1; }
```

Bei einem Konflikt nicht mit `--reject`, `--3way` oder manuellen Teilanwendungen fortfahren. Die Prüfsummen nach der Änderung müssen in Schritt 5 exakt stimmen.

### Neue Datei `lib/native-ssh.js`

Diese neu geschriebene Komponente ist separat mit `Copyright (c) 2026 Frank Parussel` gekennzeichnet; dieser Vermerk ersetzt keine Lizenzangabe. Der geprüfte Quelltext ist als einzelne Datei verfügbar: [native-ssh.js herunterladen](../downloads/native-ssh.js). Lege sie unverändert im Unterordner `lib/` der Alexa-FHEM-Installation ab. Vor dem Start muss ihre Prüfsumme mit Schritt 5 übereinstimmen.
## 4. Abhängigkeit nur nach separater Prüfung ergänzen

`package.json` nennt danach `ssh2` exakt in Version `1.17.0`. Die vier genannten Unterabhängigkeiten dürfen nur weiterverwendet werden, wenn sie im vorherigen Prüfschritt exakt in den erwarteten Versionen gefunden wurden **und alle aus demselben auflösbaren `node_modules`-Verzeichnis stammen**. Optionale native Pakete wie `cpu-features` oder `nan` sind für den geprüften Laufzeitpfad nicht erforderlich; keine Build-Skripte oder systemweiten Installationen starten.

Für den getesteten Raspberry-Pi-Stand wurde `ssh2` aus dem offiziellen npm-Tarball isoliert ergänzt. Das ist **nicht** als allgemeiner Installationsbefehl für alle Alexa-Installationen freigegeben. Vor Verwendung auf einem anderen System muss der Paketbaum in einer getrennten Kopie überprüft werden. Niemals ein schon vorhandenes `ssh2`-Verzeichnis überschreiben.

```text
https://registry.npmjs.org/ssh2/-/ssh2-1.17.0.tgz
SHA-256: 8bf2fff9c148973ed24a95087c0b4cea9b8f07a61621c8ab3ded453e3cbcd7d7
```

WinSCP kann den Tarball vom eigenen Rechner nach `/tmp/ssh2-1.17.0.tgz` übertragen. Die SHA-256-Prüfung muss vor dem Entpacken erfolgreich sein. Die folgenden Befehle nur ausführen, wenn die vier Unterabhängigkeiten im vorherigen Schritt in den erwarteten Versionen und gemeinsam im selben `node_modules`-Ordner gefunden wurden. `NODE_MODULES` durch diesen exakten Ordnerpfad ersetzen. Existiert `ssh2` bereits, abbrechen und nicht überschreiben.

```bash
cd /TATSAECHLICHER/PFAD/ZU/node_modules/alexa-fhem || exit 1
NODE_MODULES="/TATSAECHLICHER/PFAD/ZU/node_modules"
printf '%s  %s\n' '8bf2fff9c148973ed24a95087c0b4cea9b8f07a61621c8ab3ded453e3cbcd7d7' '/tmp/ssh2-1.17.0.tgz' | sha256sum -c - || exit 1
tar -tzf /tmp/ssh2-1.17.0.tgz | head
test -d "$NODE_MODULES" || exit 1
test ! -e "$NODE_MODULES/ssh2" && test ! -L "$NODE_MODULES/ssh2" || exit 1
mkdir "$NODE_MODULES/ssh2" || exit 1
tar -xzf /tmp/ssh2-1.17.0.tgz --strip-components=1 -C "$NODE_MODULES/ssh2" || exit 1
```

Bei Fehlern nicht mit `sudo` wiederholen und keine vorhandenen Abhängigkeiten löschen. Den neu angelegten Ordner nur dann zurücknehmen, wenn genau dieser Versuch ihn neu erzeugt hat und Alexa noch gestoppt ist.

Nach ergänzter Bibliothek muss die Auflösung der Abhängigkeit funktionieren:

```bash
node -e 'console.log(require("ssh2/package.json").version); console.log(typeof require("ssh2").Client)'
```

Erwartet: `1.17.0` und `function`. Bei anderem Ergebnis stoppen und die Sicherung wiederherstellen.

## 5. Dateien und Modulsyntax nach dem Kopieren prüfen

```bash
node -p "require('./package.json').version"
if ! sha256sum -c <<'SHA256'
72af82575cdaf06411ecd9f46408722e08e81aee30dc879ebb840f092cdeec31  package.json
2d8796b95be7c1da7a029a2c43dafb995debbfda33aa1f7e35a9c6b45017ee98  lib/server.js
130c5381b4e33194f12e50bde55bfe15664962e74256d881417372dc85231ae9  lib/user.js
c4a2fb7fb94a1ad67f3ead6d7baea318fb910caeb95501590401fbc0e3a92a45  lib/native-ssh.js
SHA256
then
  echo 'STOPP: mindestens eine Zieldatei weicht ab; Alexa nicht starten, Sicherung wiederherstellen.'
  exit 1
fi
node --check lib/server.js
node --check lib/user.js
node --check lib/native-ssh.js
node -e 'require("./lib/native-ssh"); console.log("native-ssh geladen")'
```

Erwartete Paketversion: `0.5.64-sha2.1`. Erwartete Prüfsummen der vier Zieldateien:

```text
72af82575cdaf06411ecd9f46408722e08e81aee30dc879ebb840f092cdeec31  package.json
2d8796b95be7c1da7a029a2c43dafb995debbfda33aa1f7e35a9c6b45017ee98  lib/server.js
130c5381b4e33194f12e50bde55bfe15664962e74256d881417372dc85231ae9  lib/user.js
c4a2fb7fb94a1ad67f3ead6d7baea318fb910caeb95501590401fbc0e3a92a45  lib/native-ssh.js
```

Prüfsummen müssen genau übereinstimmen. Die Originaldateien enthalten an mehreren Stellen notwendige Änderungen; nur einzelne Zeilen manuell auszutauschen ist nicht Teil dieser geprüften Anleitung.

### 5a. Änderungsstand 2: automatischen Startup-Wiederanlauf ergänzen

Bis hierhin ist **Änderungsstand 1** hergestellt: die lokale RSA/SHA2-Umstellung mit der Paketkennung `0.5.64-sha2.1`. Der aktuell auf dem Referenzsystem laufende **Änderungsstand 2** ergänzt darauf aufbauend den begrenzten Wiederanlauf nach einem vorübergehenden DNS-/Netzfehler während der ersten Proxy-Konfigurationsprüfung.

Die Paketkennung bleibt `0.5.64-sha2.1`, weil diese zweite Änderung ausschließlich `lib/server.js` betrifft und `package.json` nicht verändert. Vor der Ergänzung muss `lib/server.js` exakt die am Ende von Änderungsstand 1 erwartete Prüfsumme besitzen:

```text
2d8796b95be7c1da7a029a2c43dafb995debbfda33aa1f7e35a9c6b45017ee98  lib/server.js
```

Für die zweite Änderung stehen zwei gleichwertige Darstellungen bereit:

- [`alexa-fhem-startup-retry.patch`](../downloads/alexa-fhem-startup-retry.patch) für die geprüfte Anwendung mit `git apply`;
- [`alexa-fhem-startup-retry-einfuegetext.txt`](../downloads/alexa-fhem-startup-retry-einfuegetext.txt) mit den drei exakt bezeichneten Einfügestellen und den kopierbaren Codeblöcken.

Die genaue Fehlerursache, Sicherheitsgrenzen, Sicherung, Prüfung und der Rückweg sind im [Nachtrag zum Startup-Wiederanlauf](NACHTRAG-STARTUP-WIEDERANLAUF.md) beschrieben. Diese Schritte vollständig ausführen und nicht nur einzelne Zeilen aus dem Zusammenhang kopieren. Danach muss die Zielprüfsumme lauten:

```text
cd446c875295d19df5d00cd077a70bc621f8151bbd893b63dc2a2b1669f43192  lib/server.js
```

Erst mit dieser Prüfsumme ist der hier dokumentierte aktuelle Gesamtstand hergestellt. Danach mit Schritt 6 fortfahren.

## 6. Alexa-Startpfad setzen und kontrolliert starten

Der FHEM-Befehl `alexaFHEM-cmd` muss weiterhin auf den vorhandenen ausführbaren Starter im Installationsbaum zeigen. Diese Anleitung ändert den FHEM-Startpfad nicht automatisch. Prüfen, dass er auf die bestehende `node_modules/.bin/alexa-fhem`-Datei zeigt und diese ausführbar ist:

```bash
test -x /TATSAECHLICHER/PFAD/node_modules/.bin/alexa-fhem && echo STARTER_AUSFUEHRBAR
```

Den in FHEM vorhandenen Wert von `alexaFHEM-cmd` nur ändern, wenn der echte Pfad abweicht und der Rückweg notiert ist. `alexaFHEM-config` unverändert lassen. Danach Alexa starten und ausschließlich Status prüfen. Erwartet wird `alexaFHEM.ProxyConnection = running` beziehungsweise ein erfolgreicher Proxy-Status. Bei Fehlern keine Registrierung löschen, keine Schlüssel neu erzeugen und keine Hostschlüsselprüfung abschalten.

## 7. Rückweg

Alexa zuerst über FHEM stoppen. Dann als Dienstbenutzer aus dem Programmordner die gesicherten Dateien zurückkopieren. `BACKUP` durch den unter Schritt 2 angezeigten exakten Pfad ersetzen:

```bash
cd /TATSAECHLICHER/PFAD/ZU/node_modules/alexa-fhem || exit 1
BACKUP="/EXAKTER/PFAD/ZUR/SICHERUNG"
test -f "$BACKUP/package.json" && test -f "$BACKUP/server.js" && test -f "$BACKUP/user.js" || exit 1
cp -a "$BACKUP/package.json" ./package.json
cp -a "$BACKUP/server.js" ./lib/server.js
cp -a "$BACKUP/user.js" ./lib/user.js
if [ -f "$BACKUP/native-ssh.js" ]; then
  cp -a "$BACKUP/native-ssh.js" ./lib/native-ssh.js
else
  printf '%s\n' 'Die neue lib/native-ssh.js bleibt unbenutzt; nicht automatisch löschen.'
fi
```

Den früher notierten `alexaFHEM-cmd`-Wert wiederherstellen, `alexaFHEM-config` unverändert lassen und Alexa erneut starten. Die Rücksicherung der drei bekannten Dateien lässt die neu hinzugefügte Abhängigkeit und neue Datei gegebenenfalls liegen; diese nicht pauschal löschen, weil andere lokale Programme sie verwenden könnten.

## Was hier geprüft wurde und was nicht

Die SHA2-Änderungen wurden mit automatisierten Tests und auf einer Raspberry-Pi-4-Testinstallation gegen den konkreten Kandidaten geprüft. Daraus folgt keine Zusage, dass die Anleitung auf abweichenden Alexa-Versionen, Installationsarten oder Systemen funktioniert. Eine saubere Neuinstallation, sämtliche Paketbäume und jeder individuelle FHEM-Startpfad sind damit nicht automatisch abgedeckt. Vor Nutzung muss die Anleitung die vollständigen, geprüften Änderungsblöcke enthalten; die Änderungsblöcke selbst müssen nochmals auf einer getrennten frischen Kopie durchgespielt werden. Die Paketversionsnummer allein reicht nicht zum Abgleich der drei Dateien: bei `server.js` und `user.js` sind die SHA-256-Ausgangs- und Zielwerte der maßgebliche Datei-Identifikator.
