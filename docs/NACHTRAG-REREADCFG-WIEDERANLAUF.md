# Alexa-FHEM: einmaliger Wiederanlauf nach `rereadcfg`

**Unverbindliche technische Hilfestellung – keine Garantie.** Dieser Nachtrag ergänzt die vorhandenen Anleitungen um einen getrennten FHEM-seitigen Fehlerweg. Er ändert weder `lib/server.js` noch Registrierung, SSH-Schlüssel, Token, Gerätezuordnungen oder Hardwareausgänge.

## Beobachtetes Fehlerbild

Am 15.11.2026 konnte Alexa weiterhin Temperaturen nennen, während mehrere Lichtaktoren mit „reagiert gerade nicht“ beantwortet wurden. Auf dem Raspberry lief zu diesem Zeitpunkt kein `alexa-fhem`-Prozess mehr.

Die Protokolle zeigten den zeitlichen Zusammenhang eindeutig:

- Um 18:17 Uhr wurde ein Lichtaktor noch erfolgreich geschaltet.
- Um 18:27 Uhr wurde `rereadcfg` ausgeführt, um 18:29 Uhr erneut.
- `39_alexa.pm` verzögerte das Beenden beziehungsweise Löschen der bisherigen Instanz um bis zu fünf Sekunden.
- Währenddessen wurde `60_alexa.cfg` bereits wieder eingelesen.
- Danach blieb das FHEM-Gerät `alexa` vorhanden, der zugehörige Prozess startete jedoch nicht erneut.
- Das eigene Alexa-FHEM-Protokoll endete genau zu diesem Zeitpunkt.

Temperaturantworten sind in diesem Zustand kein Beweis für eine aktive Verbindung zum Raspberry: Alexa kann zuvor übertragene Zustände weiterhin kennen. Eingehende Schaltbefehle benötigen dagegen die laufende Proxyverbindung.

## Abgrenzung zu den bisherigen Änderungen

Dieser Fehler ist weder der bereits dokumentierte DNS-/Netzfehler während des Starts noch `INVALID_ACCESS_TOKEN_EXCEPTION`. Die vorhandenen Änderungen in `lib/server.js` bleiben unverändert. Da `server.js` bei einem fehlenden Prozess nicht ausgeführt wird, liegt die Sicherung bewusst auf der FHEM-Seite.

## Funktionsweise und Sicherheitsgrenzen

Die neue Hilfsdatei [`99_myUtils_AlexaRecovery.pm`](../downloads/99_myUtils_AlexaRecovery.pm) stellt eine kleine Zustandsprüfung bereit. Das zusätzliche Notify-Device `alexaRecoveryAfterReread` reagiert ausschließlich auf das globale Ereignis `REREADCFG`:

1. Es wartet 15 Sekunden, damit der verzögerte Stopp abgeschlossen ist.
2. Es prüft, ob das FHEM-Gerät `alexa` existiert und dessen lokaler Prozess tatsächlich läuft.
3. Fehlt der Prozess, wird genau einmal `set alexa start` angefordert.
4. Weitere 15 Sekunden später wird nur noch Erfolg oder Fehlschlag festgestellt.
5. Ist der Prozess weiterhin nicht vorhanden, bleibt der Fehler sichtbar; es entsteht keine Startschleife.

Ein bewusstes `set alexa stop` außerhalb dieses kurzen, durch `REREADCFG` ausgelösten Prüfzeitfensters wird nicht rückgängig gemacht. Die Hilfsdatei schaltet keine FHEM-Aktoren und verändert keine Heizungssteuerung.

## Diagnose-Readings am Gerät `alexa`

| Reading | Bedeutung |
| --- | --- |
| `alexaRecoveryState` | `armed_after_rereadcfg`, `restart_requested`, `healthy` oder `failed` |
| `alexaRecoveryReason` | Auslöser, insbesondere `rereadcfg` oder `process_missing` |
| `alexaRecoveryLastAttempt` | Zeitpunkt des letzten kontrollierten Startversuchs |
| `alexaRecoveryLastResult` | `start_requested`, `successful`, `healthy`, `process_still_missing` oder `start_command_failed` |
| `alexaRecoveryCount` | Anzahl der tatsächlich angeforderten Wiederanläufe |
| `alexaRecoveryAttempted` | interne Einmal-Sperre des aktuellen Fehlerfalls |

## Installation

### 1. Bestehenden Stand sichern

Vor Änderungen mindestens die eigene Alexa-Konfiguration sichern. Existiert bereits eine gleichnamige Hilfsdatei, auch diese sichern:

```bash
BACKUP="$HOME/alexa-rereadcfg-recovery-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$BACKUP" || exit 1
cp -p /opt/fhem/mycfg/60_alexa.cfg "$BACKUP/60_alexa.cfg" || exit 1
test ! -e /opt/fhem/FHEM/99_myUtils_AlexaRecovery.pm || \
  cp -p /opt/fhem/FHEM/99_myUtils_AlexaRecovery.pm "$BACKUP/99_myUtils_AlexaRecovery.pm" || exit 1
```

Pfade an die eigene Installation anpassen. Nicht fortfahren, wenn Sicherung oder Pfadprüfung fehlschlägt.

### 2. Hilfsdatei ablegen

Die heruntergeladene Datei [`downloads/99_myUtils_AlexaRecovery.pm`](../downloads/99_myUtils_AlexaRecovery.pm) nach folgendem Ziel kopieren:

```text
/opt/fhem/FHEM/99_myUtils_AlexaRecovery.pm
```

Danach Eigentümer, Gruppe und Rechte mit den übrigen lokalen FHEM-Hilfsdateien vergleichen. Vor dem Laden lässt sich die Perl-Syntax prüfen:

```bash
perl -c /opt/fhem/FHEM/99_myUtils_AlexaRecovery.pm
```

### 3. Zusätzliches Notify-Device einfügen

Im Referenzsystem werden die Alexa-Definitionen in `/opt/fhem/mycfg/60_alexa.cfg` verwaltet. Am Ende dieser Datei steht zusätzlich:

```text
# Lokale Wiederanlaufsicherung: 15 Sekunden nach rereadcfg einmalig pruefen.
define alexaRecoveryAfterReread notify global:REREADCFG {AlexaRecovery_AfterReread("alexa")}
attr alexaRecoveryAfterReread room System
```

Der interne Gerätename `alexa` muss zur eigenen Installation passen. Der vollständige Block ist zusätzlich als [`Kopiertext`](../downloads/alexa-fhem-rereadcfg-recovery-einfuegetext.txt) verfügbar.

### 4. Ohne vollständigen Neustart aktivieren

In der FHEM-Befehlszeile:

```text
reload 99_myUtils_AlexaRecovery.pm
```

Danach das zusätzliche Device einmalig anlegen:

```text
define alexaRecoveryAfterReread notify global:REREADCFG {AlexaRecovery_AfterReread("alexa")}
attr alexaRecoveryAfterReread room System
```

Existiert das Device bereits, nicht erneut definieren. Kein `rereadcfg` nur zur Installation provozieren. Nach erfolgreicher Prüfung die eigene Konfiguration auf dem üblichen Weg sichern.

## Prüfung auf dem Referenzsystem

Die reine Entscheidungslogik bestand fünf automatisierte Tests: gesunder Prozess bleibt unverändert; fehlender Prozess erlaubt den ersten Start; derselbe Fehlerfall erlaubt keinen zweiten Start; ein wieder gesunder Zustand hebt die Sperre auf; ein fehlendes FHEM-Gerät wird nur diagnostiziert. Die Hilfsdatei bestand zusätzlich `perl -c`.

Im kontrollierten Systemtest wurde der Prozess gestoppt und die Wiederanlaufprüfung eingeplant. Die Sicherung erkannte den fehlenden Prozess und forderte genau einen Start an. Der neue Prozess baute die Proxyverbindung erfolgreich bis `running; SSH connected` auf; aktive Statusmeldungen wurden wieder mit HTTP 202 angenommen. Ein realer Lichtbefehl wurde anschließend ausgeführt.

Ein zweiter Test löste das tatsächliche globale Ereignis `REREADCFG` aus, ohne die gesamte Heizungs- und FHEM-Konfiguration neu einzulesen. Die Prüfung wurde mit `scheduled` eingeplant. Da die vorhandene ALEXA-FHEM-Startlogik den absichtlich gestoppten Prozess bereits vor Ablauf der 15 Sekunden wiederhergestellt hatte, erkannte die neue Sicherung den gesunden Zustand und löste richtigerweise keinen zweiten Start aus.

## Rückweg

In FHEM das zusätzliche Device entfernen:

```text
delete alexaRecoveryAfterReread
```

Den eingefügten Block aus der eigenen Alexa-Konfigurationsdatei entfernen. Anschließend die Hilfsdatei erst nach einer Sicherung löschen oder aus `/opt/fhem/FHEM` verschieben. Die vorhandenen Änderungen in `server.js` werden dabei nicht zurückgenommen.

## Wichtiger Hinweis zu `rereadcfg`

Auf dem Referenzsystem meldet auch `CUL_HM`, dass es `rereadcfg` nicht mehr zuverlässig unterstützt. Für umfangreiche Konfigurationsänderungen bleibt daher ein kontrollierter FHEM-Neustart der bevorzugte Weg. Diese Ergänzung ist eine begrenzte Ausfallsicherung und macht ein problematisches vollständiges Neueinlesen nicht allgemein risikofrei.
