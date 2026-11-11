# Alexa-FHEM: Wiederanlauf nach DNS-/Netzfehler beim Start

**Unverbindliche technische Hilfestellung – keine Garantie.** Dieser Nachtrag gilt ausschließlich für die in diesem Repository beschriebene lokale SHA2-Anpassung auf Basis von Alexa-FHEM 0.5.64 (`0.5.64-sha2.1`). Bei abweichender Datei oder Version nicht anwenden. Vorher sichern und den Rückweg prüfen.

## Fehlerbild und Ursache

Während eines Raspberry-Neustarts war das Netzwerk beziehungsweise DNS kurzzeitig nicht verfügbar. Der einmalige Aufruf von `User.autoConfig(...)` endete unter anderem mit `EAI_AGAIN` beziehungsweise `Proxy command timed out`. Der Fehler wurde protokolliert, aber es wurde kein neuer Konfigurationsversuch geplant. Dadurch wurde `open_ssh(...)` nicht erreicht und die bereits vorhandene Wiederverbindungslogik des laufenden Tunnels konnte nicht wirken.

Das kann ein asymmetrisches Fehlerbild erzeugen: Ausgehende Status- oder Temperaturmeldungen funktionieren wieder, während eingehende Alexa-Sprachbefehle FHEM nicht erreichen.

## Umfang der Ergänzung

Geändert wird nur `lib/server.js` des bereits umgestellten SHA2-Kandidaten. Unverändert bleiben unter anderem:

- `39_alexa.pm` und die FHEM-Konfiguration;
- Registrierungsdaten, SSH-Schlüssel und `known_hosts`;
- Shelly-/MQTT-Geräte, Hardwarezuordnungen und Heizungssteuerung;
- die bestehende native RSA/SHA2-Implementierung.

Der Wiederanlauf gilt nur für bekannte vorübergehende Fehler: `EAI_AGAIN`, `ETIMEDOUT`, `ENETUNREACH`, `EHOSTUNREACH`, `ECONNRESET`, `ECONNREFUSED` und den beobachteten Text `Proxy command timed out`. Registrierungs-, Authentifizierungs-, Host-Key-, Rechte- und Konfigurationsfehler werden weiterhin angezeigt und nicht endlos wiederholt.

Die Abstände betragen 30, 60, 120, 240 und anschließend höchstens 300 Sekunden. Es existiert höchstens ein geplanter Startversuch. Ein erfolgreicher Start setzt den Zähler zurück; bewusstes Stoppen verwirft den Timer.

## 1. Ausgangsdatei prüfen und sichern

Im tatsächlichen Alexa-FHEM-Programmordner ausführen:

```bash
test "$(sha256sum lib/server.js | cut -d' ' -f1)" = "2d8796b95be7c1da7a029a2c43dafb995debbfda33aa1f7e35a9c6b45017ee98" || {
  echo 'STOPP: lib/server.js entspricht nicht dem geprüften SHA2-Ausgangsstand.'
  exit 1
}
BACKUP="$HOME/alexa-fhem-vor-startup-retry-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$BACKUP" || exit 1
cp -p lib/server.js "$BACKUP/server.js" || exit 1
sha256sum "$BACKUP/server.js"
```

Erwartete Ausgangsprüfsumme:

```text
2d8796b95be7c1da7a029a2c43dafb995debbfda33aa1f7e35a9c6b45017ee98  lib/server.js
```

## 2. Änderung an der exakt bezeichneten Stelle einfügen

Der vollständige kleine Änderungshunk steht in [`downloads/alexa-fhem-startup-retry.patch`](../downloads/alexa-fhem-startup-retry.patch).

Wer die Änderung nicht als Patchdatei übertragen kann, findet dieselben neuen Codeblöcke zusätzlich als direkt herunterladbaren [Kopiertext mit drei nummerierten Einfügestellen](../downloads/alexa-fhem-startup-retry-einfuegetext.txt). Der Patch ist sicherer, weil `git apply --check` gleichzeitig den erwarteten Umgebungscode kontrolliert.

Die erste Einfügestelle befindet sich in `Server.prototype.startProxy` unmittelbar nach:

```javascript
this._config.sshproxy.server = server;
```

Der bisherige Block ab

```javascript
log.info ("*** SSH: checking proxy configuration");
```

bis einschließlich des zugehörigen `.catch(...)`-Blocks wird durch die zwei im Patch mit `+` markierten Startzeilen ersetzt. Direkt nach dem Ende von `Server.prototype.startProxy` werden die drei Methoden `_isTransientSshStartupError`, `_cancelSshStartupRetry` und `_startSshProxyWithRetry` eingefügt. In `Server.prototype.shutdown` kommt als erste Anweisung `this._cancelSshStartupRetry();` hinzu.

Die `+`/`-`-Markierungen und Zeilennummern des Diffs nicht in die JavaScript-Datei kopieren. Sicherer ist die maschinelle Anwendung:

```bash
git apply --check alexa-fhem-startup-retry.patch || {
  echo 'STOPP: Patch passt nicht exakt auf die vorhandene Datei.'
  exit 1
}
git apply alexa-fhem-startup-retry.patch || exit 1
node --check lib/server.js || exit 1
sha256sum lib/server.js
```

Erwartete Zielprüfsumme:

```text
cd446c875295d19df5d00cd077a70bc621f8151bbd893b63dc2a2b1669f43192  lib/server.js
```

## 3. Kontrolliert starten und prüfen

Nur den Alexa-FHEM-Prozess über das vorhandene FHEM-Gerät neu starten. FHEM, Raspberry Pi und Heizungssteuerung müssen dafür nicht neu gestartet werden. Erwartet wird:

```text
alexaFHEM.ProxyConnection = running; SSH connected
```

Danach einen unkritischen Lichtaktor per Sprache testen. Keine Heizungsaktoren für diesen Test verwenden. Zugangstoken, CSRF-Werte, Schlüssel und vollständige Alexa-Protokolle nicht veröffentlichen.

## Rückweg

Alexa-FHEM stoppen und ausschließlich die zuvor gesicherte Datei zurückkopieren:

```bash
cp -p /EXAKTER/PFAD/ZUR/SICHERUNG/server.js lib/server.js || exit 1
node --check lib/server.js || exit 1
```

Anschließend nur Alexa-FHEM wieder starten. Registrierung, Schlüssel und FHEM-Gerät nicht löschen oder neu anlegen.

## Prüfstand

Am 11.11.2026 bestanden auf einem Raspberry Pi 4 mit Node.js 20 insgesamt 29 von 29 Tests, darunter die bisherigen RSA/SHA2-, Host-Key-, Tunnel- und Netztests sowie fünf neue Wiederanlauftests. Nach der Installation meldete der reale Tunnel `running; SSH connected`; ein echter Alexa-`TurnOn`-Befehl erreichte FHEM und schaltete den gewählten Lichtaktor. Ein absichtlich herbeigeführter Ausfall des gesamten Produktivnetzes war nicht Bestandteil der Abnahme.
