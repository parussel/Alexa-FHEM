# Alexa-FHEM – lokale Umstellung auf SSH RSA/SHA-2

Diese deutschsprachige Anleitung beschreibt, wie erfahrene FHEM-Anwender eine vorhandene `alexa-fhem`-Installation **0.5.64** lokal für SSH mit RSA/SHA-2 anpassen können. Die Änderungen werden von Anwendern selbst an der eigenen Installation vorgenommen; hier wird kein fertiges Ersatzpaket der Upstream-Anwendung verteilt.

> Dies ist eine unabhängige Community-Anleitung, keine offizielle Veröffentlichung oder Unterstützung durch FHEM oder das Upstream-Projekt `alexa-fhem`.

## Einstieg

- [Schritt-für-Schritt-Anleitung](docs/ANLEITUNG-LOKALE-ALEXA-FHEM-SHA2-UMSTELLUNG.md)
- [Hilfsdatei `native-ssh.js` herunterladen](downloads/native-ssh.js)
- [Herkunft und Zuordnung](ATTRIBUTION.md)
- [153er-netz.de – Entwicklung](https://153er-netz.de/seiten/entwicklung.html)

Die Anleitung setzt eine bestehende Installation auf Basis von Version 0.5.64 und Node.js 20 oder neuer voraus. Sie verlangt vor Änderungen Sicherungen und Prüfsummenvergleiche. Bei abweichenden Dateien oder Versionen soll abgebrochen werden. Änderungen erfolgen auf eigene Verantwortung; für fremde Installationen oder abweichende Umgebungen wird keine Funktionsgarantie gegeben.

## Umfang

Veröffentlicht werden die Anleitung und die eigens erstellte Hilfsdatei. Die vollständigen Upstream-Dateien, private Testdaten und interne Entwicklungsunterlagen sind nicht Bestandteil dieses Repositorys. Die Anleitung enthält die erforderlichen Änderungsblöcke, damit Nutzer die Anpassung lokal selbst vornehmen können.

## Nachtrag: Veraltete Temperaturwerte in Alexa (22.10.2026)

Wenn FHEM aktuelle Temperaturen liefert, Alexa aber ältere Werte nennt oder in der App anzeigt, können fehlende aktive Statusmeldungen die Ursache sein. Bei zwei Temperatursensoren wurde dieses Verhalten durch die folgende **Konfiguration** behoben. Dies ist kein weiterer SSH-/SHA-2-Codefix und benötigt keine neue Programmversion.

### Aktive Meldungen gezielt einschalten

Zunächst den bisherigen Wert des Attributs `alexaProactiveEvents` am betroffenen Gerät notieren. Dann **in der FHEM-Befehlszeile, nicht in PuTTY**, ausführen:

```text
attr GERÄTENAME alexaProactiveEvents 1
```

`GERÄTENAME` durch den internen FHEM-Gerätenamen ersetzen, nicht durch den Alexa-Namen oder Alias. Die Einstellung ist für die an Alexa angebundenen Temperatursensoren gedacht, nicht pauschal für alle FHEM-Geräte. Sie aktiviert Änderungsmeldungen (`ChangeReport`) an Alexa; Messwerte und Heizungsregelung werden dadurch nicht geändert.

### Voraussetzungen und Kontrolle

- Der Alexa-Dienst muss laufen, das Gerät muss bereits an Alexa angebunden sein, und ein gültiges Ereignis-Token muss vorliegen. Hinweise im alexa-fhem-Protokoll sind `got .eventToken` und `got fresh token`.
- Eine ausdrücklich gesetzte globale Sperre `alexaProactiveEvents 0` am Alexa-Gerät kann aktive Meldungen weiterhin verhindern. In diesem Fall zuerst die Konfiguration prüfen, statt weitere Geräte pauschal umzustellen.
- Auf die nächste reguläre Änderung des Temperatur-Readings warten. Keine künstlichen Messwerte setzen und keine Heizungsaktoren für diesen Test schalten.
- `posted skill event: 202` im alexa-fhem-Protokoll bestätigt die Annahme einer Meldung durch Amazon. Es beweist allein noch nicht, dass die Sprachabfrage den richtigen aktuellen Wert nennt: App und Sprachausgabe anschließend zeitnah mit dem betreffenden FHEM-Reading vergleichen.
- Nach erfolgreicher Prüfung die FHEM-Konfiguration mit **Save / Speichern** sichern. Im geprüften Fall war weder ein Alexa- noch ein Raspberry-Neustart nötig.

Falls Token-Fehler auftreten oder die Meldungen nicht angenommen werden, zuerst das Protokoll prüfen. Keine Geräte, Schlüssel oder Skill-Verknüpfungen vorschnell löschen. Beim Teilen von Protokollen Zugangstoken und andere Anmeldedaten schwärzen.

### Rückweg

War das Attribut vorher nicht gesetzt, lässt sich die Änderung in der FHEM-Befehlszeile zurücknehmen:

```text
deleteattr GERÄTENAME alexaProactiveEvents
```

War zuvor ein Wert gesetzt, diesen stattdessen wiederherstellen. Danach erneut speichern.

Hintergrund: [Amazon-Dokumentation zu Status- und Änderungsmeldungen](https://developer.amazon.com/docs/alexaplus/smarthome/state-reporting-for-smart-home-addons.html) und [Entwicklerhinweise zu proaktiven Meldungen in alexa-fhem](https://forum.fhem.de/index.php?topic=108455.0). Andere Ursachen für veraltete Werte, etwa falsche Gerätezuordnungen, werden durch diese Einstellung nicht automatisch behoben.
