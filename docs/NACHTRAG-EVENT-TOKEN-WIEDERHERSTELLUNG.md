# Alexa-FHEM: Wiederherstellung bei ungültigem Ereignis-Token

**Unverbindliche technische Hilfestellung – keine Garantie.** Dieser Nachtrag gilt ausschließlich für den in diesem Repository beschriebenen Änderungsstand 2 auf Basis von Alexa-FHEM 0.5.64 (`0.5.64-sha2.1`). Bei abweichender Datei oder Prüfsumme nicht anwenden. Vorher sichern und den Rückweg prüfen.

## Fehlerbild und Ursache

Alexa konnte weiterhin Werte aus FHEM abfragen, Schaltaktoren reagierten jedoch zeitweise nicht. Im Protokoll erschienen abgewiesene aktive Statusmeldungen mit HTTP 401 und `INVALID_ACCESS_TOKEN_EXCEPTION`. Ein manueller Neustart von Alexa-FHEM stellte den Betrieb wieder her, weil dabei der Ereignis-Token neu eingelesen beziehungsweise erneuert wurde.

Der bisherige Code protokollierte die abgewiesene Antwort, erneuerte den Token in diesem Fehlerweg aber nicht sofort und wiederholte das fehlgeschlagene Ereignis nicht. Dadurch blieb die Störung bis zu einem manuellen Eingriff oder einer späteren regulären Erneuerung bestehen.

Die HTTP-401-Antwort belegt einen ungültigen Token für ausgehende aktive Ereignismeldungen. Sie belegt nicht für sich allein, dass derselbe Token die zeitgleiche Nichterreichbarkeit eingehender Sprachbefehle verursacht hat. Diese Ergänzung repariert deshalb gezielt den nachgewiesenen Ereignisfehler; sie ersetzt nicht die getrennte Diagnose der Proxy- und Tunnelverbindung.

## Umfang und Sicherheitsgrenzen

Geändert wird ausschließlich `lib/server.js` des bereits aufgebauten Änderungsstands 2. Unverändert bleiben insbesondere FHEM-Module, Gerätezuordnungen, SSH-Schlüssel, Registrierung, Shelly-/MQTT-Geräte und Heizungssteuerung.

Die Ergänzung:

- erkennt nur HTTP 401 mit `INVALID_ACCESS_TOKEN_EXCEPTION` als diesen Fehlerfall;
- verwirft den abgewiesenen Ereignis-Token und fordert sofort einen neuen an;
- aktualisiert den Token im Autorisierungs-Header und im Ereignisinhalt;
- wiederholt ausschließlich das betroffene Ereignis genau einmal;
- führt gleichzeitig auftretende Wiederherstellungen zusammen;
- sperrt weitere Wiederherstellungsstarts fünf Minuten lang;
- startet den SSH-Tunnel höchstens einmal neu, wenn die Token-Erneuerung scheitert oder der Wiederholungsversuch erneut HTTP 401 liefert;
- behält Diagnoseinformationen als FHEM-Readings;
- protokolliert weder den vollständigen Ereignisinhalt noch Token oder Antwortkörper.

Andere Netzwerk-, Geräte- oder Konfigurationsfehler werden dadurch nicht automatisch als Tokenfehler behandelt.

## Diagnose-Readings

Am FHEM-Gerät `alexa` werden folgende Readings gesetzt:

| Reading | Bedeutung |
| --- | --- |
| `alexaFHEM.LastEventError` | zuletzt erkannter Ereignisfehler |
| `alexaFHEM.LastRecoveryReason` | Auslöser, hier `token_invalid` |
| `alexaFHEM.LastRecoveryAt` | Zeitpunkt im ISO-8601-Format (UTC) |
| `alexaFHEM.LastRecoveryResult` | etwa `refreshing_token`, `retrying_event`, `successful`, `cooldown_active` oder `tunnel_restart_requested` |
| `alexaFHEM.RecoveryCount` | Anzahl der Wiederherstellungssequenzen seit dem letzten Alexa-FHEM-Start |

Zum sicheren Auslesen jeweils ein einzelnes Reading anfordern. Nicht den vollständigen Geräteinhalt veröffentlichen, weil versteckte Readings Token enthalten können:

```text
list alexa alexaFHEM.LastRecoveryResult
```

## 1. Ausgangsdatei prüfen und sichern

Im tatsächlichen Alexa-FHEM-Programmordner ausführen:

```bash
test "$(sha256sum lib/server.js | cut -d' ' -f1)" = "cd446c875295d19df5d00cd077a70bc621f8151bbd893b63dc2a2b1669f43192" || {
  echo 'STOPP: lib/server.js entspricht nicht dem geprüften Änderungsstand 2.'
  exit 1
}
BACKUP="$HOME/alexa-fhem-vor-event-token-recovery-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$BACKUP" || exit 1
cp -p lib/server.js "$BACKUP/server.js" || exit 1
sha256sum "$BACKUP/server.js"
```

Erwartete Ausgangsprüfsumme:

```text
cd446c875295d19df5d00cd077a70bc621f8151bbd893b63dc2a2b1669f43192  lib/server.js
```

## 2. Änderung anwenden

Der vollständige Änderungshunk steht in [`downloads/alexa-fhem-event-token-recovery.patch`](../downloads/alexa-fhem-event-token-recovery.patch). Die gleichen Blöcke sind zusätzlich als [Kopiertext mit bezeichneten Einfüge- und Ersetzungsstellen](../downloads/alexa-fhem-event-token-recovery-einfuegetext.txt) verfügbar. Der Patch ist vorzuziehen, weil die Kontextprüfung abweichende Dateien erkennt.

```bash
git apply --check alexa-fhem-event-token-recovery.patch || {
  echo 'STOPP: Patch passt nicht exakt auf Änderungsstand 2.'
  exit 1
}
git apply alexa-fhem-event-token-recovery.patch || exit 1
node --check lib/server.js || exit 1
sha256sum lib/server.js
```

Erwartete Zielprüfsumme:

```text
12ade3e2241bdb1f9fd4024ee8d76c7c05a46c33fa810860f3b391d14fb67a5  lib/server.js
```

## 3. Kontrolliert starten und prüfen

Nur Alexa-FHEM über das vorhandene FHEM-Gerät neu starten. FHEM, Raspberry Pi und Heizungssteuerung müssen dafür nicht neu gestartet werden:

```text
set alexa restart
```

Zuerst den normalen Betrieb mit einem unkritischen Lichtaktor prüfen. Keine Heizungsaktoren verwenden. Ein erfolgreicher normaler Sprachtest beweist, dass der neue Code startet; der automatische Fehlerweg ist damit allein noch nicht nachgewiesen.

## 4. Nachgewiesener Fehlerweg

Auf dem Referenzsystem wurde der gespeicherte Ereignis-Token gesichert, ausschließlich dessen Zugriffstoken kontrolliert ungültig gesetzt und Alexa-FHEM neu gestartet. Ein realer Lichtbefehl löste daraufhin den erwarteten HTTP-401-Fehlerweg aus. Der Code erneuerte den Token und wiederholte das Ereignis einmal.

Beobachtetes Ergebnis am 15.11.2026:

```text
alexaFHEM.LastRecoveryReason = token_invalid
alexaFHEM.LastRecoveryResult = successful
alexaFHEM.RecoveryCount = 1
```

Der Lichtbefehl wurde ausgeführt. Der ursprüngliche gespeicherte Token wurde anschließend wiederhergestellt und die Testsicherung gelöscht. Der Tunnel-Neustart wurde richtigerweise nicht ausgelöst, weil bereits die Token-Erneuerung erfolgreich war. Da die Schaltfunktion schon vor Installation der Änderung durch einen manuellen Neustart wiederhergestellt worden war, weist dieser Test die Ereignis-Token-Reparatur nach, nicht aber eine alleinige Ursache der früheren Schaltstörung.

Die absichtliche Token-Manipulation ist kein regulärer Installationsschritt und wird hier nicht als allgemeiner Testbefehl empfohlen. Sie darf nur mit vorheriger Sicherung, direktem Rückweg und ohne Veröffentlichung des Tokeninhalts erfolgen.

## Rückweg

Alexa-FHEM stoppen und ausschließlich die zuvor gesicherte Datei zurückkopieren:

```bash
cp -p /EXAKTER/PFAD/ZUR/SICHERUNG/server.js lib/server.js || exit 1
node --check lib/server.js || exit 1
sha256sum lib/server.js
```

Erwartet wird wieder die Ausgangsprüfsumme `cd446c875295d19df5d00cd077a70bc621f8151bbd893b63dc2a2b1669f43192`. Anschließend nur Alexa-FHEM starten. Registrierung, Schlüssel und FHEM-Gerät nicht löschen oder neu anlegen.

## Prüfstand

Der Gesamtstand bestand 40 von 40 automatisierten Tests einschließlich Token-Aktualisierung in Header und Ereignisinhalt, Zusammenführung paralleler Fehler, einmaliger Wiederholung, zweitem HTTP 401, fehlgeschlagener Erneuerung, Sperrzeit, Diagnose und Protokollbereinigung. Die JavaScript-Syntaxprüfung war erfolgreich. Zusätzlich bestand der oben beschriebene kontrollierte reale Fehlerfall auf einem Raspberry Pi 4 mit Node.js 20.
