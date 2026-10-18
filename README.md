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
