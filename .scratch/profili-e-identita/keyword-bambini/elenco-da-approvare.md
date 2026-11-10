# Elenco Keyword per la Modalità Bambini — Da Revisionare e Approvare

Questo documento contiene tutti i candidati generati dall'espansione dei 62 semi nello spazio di embedding Qwen3 (distanza coseno $\le 0.20$, similarità coseno $\ge 0.80$), ripartiti in tre gruppi:
- **Gruppo (A) SICURE da mettere in lista nera**: termini espliciti e inequivocabili di violenza grafica estrema, mutilazioni, violenza sessuale, abuso su minori, droghe pesanti/overdose, suicidio, pornografia.
- **Gruppo (B) DUBBIE**: termini sfumati, droghe leggere, elementi per adulti o tropi crime/horror che richiedono una decisione umana sul bilanciamento tra protezione e ampiezza del catalogo.
- **Gruppo (C) DA SCARTARE**: parole escluse per decisione di modello (violenza generica, sangue, morte, omicidio, paura/horror) o falsi positivi semantici, essenziali per non bloccare film adatti come *Il Signore degli Anelli* e *Stranger Things*.

**Statistiche Generali**:
- Semi di partenza: **62** (descritti in `semi.md`)
- Candidati espansi (dist $\le 0.20$): **480**
- **Gruppo (A) SICURE**: **114**
- **Gruppo (B) DUBBIE**: **224**
- **Gruppo (C) DA SCARTARE**: **142**

---

## Gruppo (A) — SICURE da mettere in lista nera (114 keyword)
*Termini inequivocabilmente inadatti ai bambini. Includerli nella lista nera è imperativo.*

| # | Keyword | Seme più vicino | Distanza Coseno | Similarità Coseno | Titoli nel canone |
|---|---|---|---|---|---|
| 1 | `sex abuse` | `sexual abuse` | 0.0266 | 0.9734 | 3 |
| 2 | `rape attempt` | `attempted rape` | 0.0308 | 0.9692 | 13 |
| 3 | `beheaded` | `beheading` | 0.0312 | 0.9688 | 4 |
| 4 | `cannibal` | `cannibalism` | 0.0314 | 0.9686 | 179 |
| 5 | `childhood sexual abuse` | `child sexual abuse` | 0.0362 | 0.9638 | 20 |
| 6 | `rape of a male` | `male rape` | 0.0375 | 0.9625 | 19 |
| 7 | `suicide thoughts` | `suicidal thoughts` | 0.0413 | 0.9587 | 8 |
| 8 | `drug addict` | `drug addiction` | 0.0469 | 0.9531 | 16 |
| 9 | `paedophilia` | `pedophilia` | 0.0504 | 0.9496 | 7 |
| 10 | `overdose` | `drug overdose` | 0.0546 | 0.9454 | 31 |
| 11 | `abused child` | `child abuse` | 0.0571 | 0.9429 | 15 |
| 12 | `child sex trade` | `child prostitution` | 0.0686 | 0.9314 | 3 |
| 13 | `child sex trafficking` | `child prostitution` | 0.0707 | 0.9293 | 4 |
| 14 | `sexual violence` | `sexual assault` | 0.0753 | 0.9247 | 53 |
| 15 | `decapitated head` | `decapitation` | 0.0774 | 0.9226 | 9 |
| 16 | `mutilated body` | `body mutilation` | 0.0780 | 0.9220 | 3 |
| 17 | `child mistreatment` | `child abuse` | 0.0821 | 0.9179 | 3 |
| 18 | `torture porn` | `sexual torture` | 0.0821 | 0.9179 | 14 |
| 19 | `suicide note` | `suicide` | 0.0824 | 0.9176 | 9 |
| 20 | `crack addict` | `crack cocaine` | 0.0833 | 0.9167 | 4 |
| 21 | `contemplating suicide` | `suicide` | 0.0836 | 0.9164 | 6 |
| 22 | `suicide jumping` | `suicide` | 0.0861 | 0.9139 | 3 |
| 23 | `child molester` | `child molestation` | 0.0864 | 0.9136 | 17 |
| 24 | `driven to suicide` | `suicide` | 0.0871 | 0.9129 | 4 |
| 25 | `torture victim` | `torture` | 0.0883 | 0.9117 | 5 |
| 26 | `sex video` | `pornographic video` | 0.0928 | 0.9072 | 5 |
| 27 | `rape victim` | `rape` | 0.0934 | 0.9066 | 44 |
| 28 | `cannibal cult` | `cannibalism` | 0.0946 | 0.9054 | 6 |
| 29 | `illegal drugs` | `drug abuse` | 0.0948 | 0.9052 | 59 |
| 30 | `suicide by hanging` | `suicide` | 0.0956 | 0.9044 | 7 |
| 31 | `crystal meth` | `methamphetamine` | 0.0959 | 0.9041 | 7 |
| 32 | `suicide pact` | `suicide` | 0.0965 | 0.9035 | 9 |
| 33 | `suicide by gun` | `suicide` | 0.0975 | 0.9025 | 11 |
| 34 | `rape accusation` | `rape` | 0.0993 | 0.9007 | 8 |
| 35 | `penis mutilation` | `mutilation` | 0.1023 | 0.8977 | 3 |
| 36 | `pornographer` | `pornography` | 0.1036 | 0.8964 | 5 |
| 37 | `rape and murder` | `incest rape` | 0.1043 | 0.8957 | 25 |
| 38 | `parental abuse` | `child abuse` | 0.1044 | 0.8956 | 4 |
| 39 | `genital mutilation` | `mutilation` | 0.1052 | 0.8948 | 3 |
| 40 | `child trafficking` | `child prostitution` | 0.1052 | 0.8948 | 9 |
| 41 | `rape culture` | `rape` | 0.1060 | 0.8940 | 5 |
| 42 | `rape pregnancy` | `rape` | 0.1092 | 0.8908 | 5 |
| 43 | `prescription drug abuse` | `drug abuse` | 0.1109 | 0.8891 | 7 |
| 44 | `suicide by poison` | `suicide` | 0.1121 | 0.8879 | 3 |
| 45 | `marital rape` | `incest rape` | 0.1140 | 0.8860 | 7 |
| 46 | `disembowelment` | `decapitation` | 0.1148 | 0.8852 | 3 |
| 47 | `forced sex` | `sexual torture` | 0.1178 | 0.8822 | 4 |
| 48 | `gay pornography` | `pornography` | 0.1198 | 0.8802 | 12 |
| 49 | `roman porno` | `porno` | 0.1237 | 0.8763 | 3 |
| 50 | `opioid use disorder` | `heroin addiction` | 0.1262 | 0.8738 | 3 |
| 51 | `torturing police` | `torture` | 0.1293 | 0.8707 | 4 |
| 52 | `sexual exploitation` | `molestation` | 0.1300 | 0.8700 | 18 |
| 53 | `sexual predator` | `pedophile` | 0.1325 | 0.8675 | 22 |
| 54 | `self-inflicted injury` | `self-harm` | 0.1328 | 0.8672 | 9 |
| 55 | `child endangerment` | `child abuse` | 0.1366 | 0.8634 | 4 |
| 56 | `teenage prostitute` | `child prostitution` | 0.1374 | 0.8626 | 14 |
| 57 | `hentai` | `porno` | 0.1379 | 0.8621 | 17 |
| 58 | `zoophilia` | `pedophilia` | 0.1395 | 0.8605 | 5 |
| 59 | `rape and revenge` | `rape` | 0.1407 | 0.8593 | 89 |
| 60 | `rape revenge` | `rape` | 0.1427 | 0.8573 | 14 |
| 61 | `sexual humiliation` | `sexual torture` | 0.1434 | 0.8566 | 7 |
| 62 | `electrical torture` | `torture` | 0.1436 | 0.8564 | 8 |
| 63 | `forced prostitution` | `child prostitution` | 0.1448 | 0.8552 | 23 |
| 64 | `teenage rape` | `rape` | 0.1460 | 0.8540 | 6 |
| 65 | `pornography addiction` | `pornography` | 0.1464 | 0.8536 | 4 |
| 66 | `self-cannibalism` | `self mutilation` | 0.1474 | 0.8526 | 4 |
| 67 | `severed head` | `beheading` | 0.1506 | 0.8494 | 27 |
| 68 | `baby trafficking` | `child prostitution` | 0.1527 | 0.8473 | 3 |
| 69 | `child neglect` | `child abuse` | 0.1535 | 0.8465 | 11 |
| 70 | `suicide bomber` | `suicide` | 0.1537 | 0.8463 | 7 |
| 71 | `soft porn` | `porno` | 0.1538 | 0.8462 | 3 |
| 72 | `ritual suicide` | `suicide` | 0.1543 | 0.8457 | 6 |
| 73 | `young prostitute` | `child prostitution` | 0.1559 | 0.8441 | 10 |
| 74 | `public sex` | `pornography` | 0.1560 | 0.8440 | 8 |
| 75 | `statutory rape` | `rape` | 0.1567 | 0.8433 | 11 |
| 76 | `underage prostitution ring` | `child prostitution` | 0.1586 | 0.8414 | 4 |
| 77 | `meth lab` | `methamphetamine` | 0.1609 | 0.8391 | 8 |
| 78 | `teen suicide` | `suicide` | 0.1627 | 0.8373 | 19 |
| 79 | `pregnancy from rape` | `rape` | 0.1650 | 0.8350 | 4 |
| 80 | `sexual blackmail` | `molestation` | 0.1663 | 0.8337 | 8 |
| 81 | `castration` | `mutilation` | 0.1674 | 0.8326 | 17 |
| 82 | `sexploitation` | `pornography` | 0.1676 | 0.8324 | 75 |
| 83 | `suicide by gas` | `suicide` | 0.1677 | 0.8323 | 3 |
| 84 | `internet porn` | `pornography` | 0.1681 | 0.8319 | 6 |
| 85 | `porn industry` | `pornography` | 0.1694 | 0.8306 | 37 |
| 86 | `sex crime` | `sexual assault` | 0.1724 | 0.8276 | 14 |
| 87 | `brother sister incest` | `incest rape` | 0.1729 | 0.8271 | 29 |
| 88 | `eaten alive` | `cannibalism` | 0.1760 | 0.8240 | 12 |
| 89 | `shocksploitation` | `splatter horror` | 0.1762 | 0.8238 | 9 |
| 90 | `underage sex` | `child pornography` | 0.1777 | 0.8223 | 20 |
| 91 | `flesh eating` | `cannibalism` | 0.1790 | 0.8210 | 16 |
| 92 | `opioid crisis` | `heroin addiction` | 0.1791 | 0.8209 | 3 |
| 93 | `suicide of mother` | `suicide` | 0.1804 | 0.8196 | 5 |
| 94 | `self immolation` | `self mutilation` | 0.1811 | 0.8189 | 3 |
| 95 | `suicide of husband` | `suicide` | 0.1813 | 0.8187 | 4 |
| 96 | `father daughter incest` | `incest rape` | 0.1836 | 0.8164 | 4 |
| 97 | `harakiri` | `decapitation` | 0.1837 | 0.8163 | 4 |
| 98 | `groping` | `molestation` | 0.1837 | 0.8163 | 3 |
| 99 | `sexual oppression` | `sexual assault` | 0.1838 | 0.8162 | 3 |
| 100 | `mother son incest` | `incest rape` | 0.1842 | 0.8158 | 5 |
| 101 | `female child abuser` | `child abuse` | 0.1870 | 0.8130 | 7 |
| 102 | `sex tape` | `pornography` | 0.1876 | 0.8124 | 16 |
| 103 | `necrophilia` | `pedophilia` | 0.1888 | 0.8112 | 42 |
| 104 | `fake suicide` | `suicide` | 0.1891 | 0.8109 | 8 |
| 105 | `porn actor` | `porno` | 0.1912 | 0.8088 | 16 |
| 106 | `drugging someone` | `drug abuse` | 0.1916 | 0.8084 | 8 |
| 107 | `bestiality` | `pedophilia` | 0.1940 | 0.8060 | 15 |
| 108 | `skinning` | `mutilation` | 0.1947 | 0.8053 | 8 |
| 109 | `sexual harassment` | `sexual assault` | 0.1949 | 0.8051 | 52 |
| 110 | `porn director` | `porno` | 0.1964 | 0.8036 | 6 |
| 111 | `abusive parent` | `child abuse` | 0.1982 | 0.8018 | 11 |
| 112 | `seppuku` | `decapitation` | 0.1985 | 0.8015 | 13 |
| 113 | `porn star` | `porno` | 0.1989 | 0.8011 | 27 |
| 114 | `dildo` | `erotica` | 0.1994 | 0.8006 | 11 |

---

## Gruppo (B) — DUBBIE (Richiedono decisione umana) (224 keyword)
*Termini ambigui, contestuali o intermedi. L'umano può approvarne alcuni o lasciarli fuori.*

| # | Keyword | Seme più vicino | Distanza Coseno | Similarità Coseno | Titoli nel canone |
|---|---|---|---|---|---|
| 1 | `erotic` | `erotica` | 0.0323 | 0.9677 | 97 |
| 2 | `drug use` | `drug abuse` | 0.0384 | 0.9616 | 83 |
| 3 | `eroticism` | `erotica` | 0.0483 | 0.9517 | 189 |
| 4 | `erotic movie` | `erotica` | 0.0553 | 0.9447 | 242 |
| 5 | `drug usage` | `drug abuse` | 0.0651 | 0.9349 | 13 |
| 6 | `sadism` | `extreme sadism` | 0.0656 | 0.9344 | 157 |
| 7 | `drugs` | `drug abuse` | 0.0681 | 0.9319 | 629 |
| 8 | `drug` | `drug abuse` | 0.0742 | 0.9258 | 26 |
| 9 | `drug culture` | `drug abuse` | 0.0781 | 0.9219 | 4 |
| 10 | `addiction` | `drug addiction` | 0.0783 | 0.9217 | 115 |
| 11 | `narcotics` | `heroin` | 0.0786 | 0.9214 | 20 |
| 12 | `sadistic` | `extreme sadism` | 0.0800 | 0.9200 | 32 |
| 13 | `sexy` | `erotica` | 0.0818 | 0.9182 | 3 |
| 14 | `incest` | `incest rape` | 0.0868 | 0.9132 | 229 |
| 15 | `erotic vignettes` | `erotica` | 0.0876 | 0.9124 | 4 |
| 16 | `erotic fantasy` | `erotica` | 0.0887 | 0.9113 | 4 |
| 17 | `mass killing` | `mass suicide` | 0.0925 | 0.9075 | 4 |
| 18 | `illegal drug` | `drug abuse` | 0.0994 | 0.9006 | 4 |
| 19 | `alcoholism` | `substance abuse` | 0.0999 | 0.9001 | 207 |
| 20 | `sexual pleasure` | `erotica` | 0.1005 | 0.8995 | 7 |
| 21 | `amphetamine` | `methamphetamine` | 0.1012 | 0.8988 | 4 |
| 22 | `sexual sadism` | `extreme sadism` | 0.1022 | 0.8978 | 11 |
| 23 | `gruesome` | `extreme gore` | 0.1032 | 0.8968 | 6 |
| 24 | `erotic drama` | `erotica` | 0.1032 | 0.8968 | 7 |
| 25 | `erotic thriller` | `erotica` | 0.1033 | 0.8967 | 71 |
| 26 | `erotic romance` | `erotica` | 0.1034 | 0.8966 | 8 |
| 27 | `sadist` | `extreme sadism` | 0.1035 | 0.8965 | 38 |
| 28 | `erotism` | `erotica` | 0.1044 | 0.8956 | 6 |
| 29 | `abuse` | `sexual abuse` | 0.1044 | 0.8956 | 87 |
| 30 | `rapist` | `rape` | 0.1051 | 0.8949 | 23 |
| 31 | `drug dealing` | `drug abuse` | 0.1052 | 0.8948 | 53 |
| 32 | `sex` | `erotica` | 0.1061 | 0.8939 | 89 |
| 33 | `terrifying` | `gore` | 0.1065 | 0.8935 | 3 |
| 34 | `drug trip` | `drug abuse` | 0.1078 | 0.8922 | 16 |
| 35 | `alcohol abuse` | `substance abuse` | 0.1079 | 0.8921 | 44 |
| 36 | `drug crime` | `drug abuse` | 0.1103 | 0.8897 | 34 |
| 37 | `recreational drug use` | `drug abuse` | 0.1117 | 0.8883 | 9 |
| 38 | `kinky sex` | `erotica` | 0.1117 | 0.8883 | 4 |
| 39 | `euthanasia` | `assisted suicide` | 0.1152 | 0.8848 | 19 |
| 40 | `incest overtones` | `incest rape` | 0.1154 | 0.8846 | 11 |
| 41 | `horny female` | `erotica` | 0.1158 | 0.8842 | 4 |
| 42 | `sexual content` | `erotica` | 0.1181 | 0.8819 | 6 |
| 43 | `drug dealer` | `heroin addict` | 0.1191 | 0.8809 | 216 |
| 44 | `drugged` | `drug abuse` | 0.1205 | 0.8795 | 9 |
| 45 | `sexual fetish` | `erotica` | 0.1217 | 0.8783 | 10 |
| 46 | `crack` | `crack cocaine` | 0.1227 | 0.8773 | 6 |
| 47 | `sensuality` | `erotica` | 0.1240 | 0.8760 | 20 |
| 48 | `sexuality` | `erotica` | 0.1244 | 0.8756 | 171 |
| 49 | `sadistic psychopath` | `extreme sadism` | 0.1244 | 0.8756 | 15 |
| 50 | `morphine` | `heroin` | 0.1249 | 0.8751 | 13 |
| 51 | `perversion` | `pornography` | 0.1250 | 0.8750 | 18 |
| 52 | `fetish` | `erotica` | 0.1257 | 0.8743 | 34 |
| 53 | `gay erotica` | `erotica` | 0.1263 | 0.8737 | 9 |
| 54 | `mass slaughter` | `mass suicide` | 0.1264 | 0.8736 | 3 |
| 55 | `sadistic killer` | `sadistic torture` | 0.1264 | 0.8736 | 9 |
| 56 | `sex scene` | `erotica` | 0.1270 | 0.8730 | 7 |
| 57 | `self-destructive behavior` | `self-harm` | 0.1273 | 0.8727 | 3 |
| 58 | `sexual exploration` | `erotica` | 0.1279 | 0.8721 | 10 |
| 59 | `narco` | `cocaine` | 0.1285 | 0.8715 | 6 |
| 60 | `sexual arousal` | `erotica` | 0.1291 | 0.8709 | 5 |
| 61 | `guillotine` | `beheading` | 0.1293 | 0.8707 | 34 |
| 62 | `drug scene` | `drug abuse` | 0.1302 | 0.8698 | 13 |
| 63 | `fetishism` | `erotica` | 0.1306 | 0.8694 | 19 |
| 64 | `female sexuality` | `erotica` | 0.1309 | 0.8691 | 25 |
| 65 | `sexual fantasy` | `erotica` | 0.1322 | 0.8678 | 46 |
| 66 | `prostitution` | `child prostitution` | 0.1326 | 0.8674 | 260 |
| 67 | `fellatio` | `erotica` | 0.1328 | 0.8672 | 3 |
| 68 | `marijuana use` | `drug abuse` | 0.1333 | 0.8667 | 5 |
| 69 | `erotic massage` | `erotica` | 0.1339 | 0.8661 | 4 |
| 70 | `sexual perversion` | `pornography` | 0.1347 | 0.8653 | 11 |
| 71 | `mass shooting` | `mass suicide` | 0.1347 | 0.8653 | 14 |
| 72 | `drug lord` | `heroin addict` | 0.1355 | 0.8645 | 74 |
| 73 | `drug kingpin` | `heroin addict` | 0.1363 | 0.8637 | 7 |
| 74 | `drugged drink` | `drug abuse` | 0.1366 | 0.8634 | 7 |
| 75 | `sexual encounter` | `erotica` | 0.1380 | 0.8620 | 8 |
| 76 | `sexual desire` | `erotica` | 0.1388 | 0.8612 | 34 |
| 77 | `drug stealing` | `drug abuse` | 0.1388 | 0.8612 | 5 |
| 78 | `drug withdrawal` | `drug addiction` | 0.1391 | 0.8609 | 3 |
| 79 | `marijuana` | `methamphetamine` | 0.1392 | 0.8608 | 175 |
| 80 | `masturbation` | `pornography` | 0.1396 | 0.8604 | 68 |
| 81 | `sexual intercourse` | `erotica` | 0.1400 | 0.8600 | 3 |
| 82 | `kinky` | `erotica` | 0.1405 | 0.8595 | 6 |
| 83 | `savage` | `gore` | 0.1406 | 0.8594 | 3 |
| 84 | `orgy` | `erotica` | 0.1408 | 0.8592 | 50 |
| 85 | `drug trafficker` | `heroin addict` | 0.1434 | 0.8566 | 6 |
| 86 | `domestic abuse` | `child abuse` | 0.1435 | 0.8565 | 69 |
| 87 | `war on drugs` | `drug abuse` | 0.1442 | 0.8558 | 28 |
| 88 | `sexy woman` | `erotica` | 0.1458 | 0.8542 | 13 |
| 89 | `self-destruction` | `self mutilation` | 0.1467 | 0.8533 | 50 |
| 90 | `physical abuse` | `sexual abuse` | 0.1472 | 0.8528 | 32 |
| 91 | `torment` | `torture` | 0.1475 | 0.8525 | 15 |
| 92 | `drug deal` | `drug abuse` | 0.1477 | 0.8523 | 20 |
| 93 | `cruelty` | `sadistic torture` | 0.1480 | 0.8520 | 69 |
| 94 | `perverse sex` | `erotica` | 0.1496 | 0.8504 | 3 |
| 95 | `mass execution` | `mass suicide` | 0.1497 | 0.8503 | 4 |
| 96 | `ganja` | `heroin` | 0.1503 | 0.8497 | 3 |
| 97 | `drug trafficking` | `cocaine` | 0.1504 | 0.8496 | 110 |
| 98 | `sexual behavior` | `erotica` | 0.1518 | 0.8482 | 5 |
| 99 | `drug war` | `drug abuse` | 0.1518 | 0.8482 | 13 |
| 100 | `drug pusher` | `drug abuse` | 0.1524 | 0.8476 | 4 |
| 101 | `alcoholic` | `substance abuse` | 0.1525 | 0.8475 | 204 |
| 102 | `cannabis` | `cocaine` | 0.1526 | 0.8474 | 31 |
| 103 | `narcos` | `cocaine` | 0.1529 | 0.8471 | 5 |
| 104 | `killing` | `beheading` | 0.1529 | 0.8471 | 92 |
| 105 | `sexual relationship` | `erotica` | 0.1531 | 0.8469 | 10 |
| 106 | `sex life` | `erotica` | 0.1541 | 0.8459 | 8 |
| 107 | `self destructiveness` | `self-harm` | 0.1544 | 0.8456 | 18 |
| 108 | `orgasm` | `erotica` | 0.1547 | 0.8453 | 24 |
| 109 | `self hatred` | `self-harm` | 0.1552 | 0.8448 | 5 |
| 110 | `drug cartel` | `cocaine` | 0.1553 | 0.8447 | 70 |
| 111 | `nudity` | `pornography` | 0.1555 | 0.8445 | 68 |
| 112 | `brutal` | `gore` | 0.1556 | 0.8444 | 3 |
| 113 | `lechery` | `erotica` | 0.1558 | 0.8442 | 6 |
| 114 | `obscenity` | `pornography` | 0.1570 | 0.8430 | 4 |
| 115 | `psychosexual` | `erotica` | 0.1570 | 0.8430 | 4 |
| 116 | `drug trade` | `drug abuse` | 0.1573 | 0.8427 | 17 |
| 117 | `sexappeal` | `erotica` | 0.1576 | 0.8424 | 5 |
| 118 | `psycho-sexual` | `erotica` | 0.1577 | 0.8423 | 5 |
| 119 | `rough sex` | `erotica` | 0.1586 | 0.8414 | 5 |
| 120 | `sex show` | `erotica` | 0.1587 | 0.8413 | 4 |
| 121 | `alcohol problems` | `substance abuse` | 0.1588 | 0.8412 | 20 |
| 122 | `coke` | `cocaine` | 0.1592 | 0.8408 | 3 |
| 123 | `killer` | `gore` | 0.1601 | 0.8399 | 260 |
| 124 | `prison brutality` | `prison rape` | 0.1604 | 0.8396 | 13 |
| 125 | `prisoner abuse` | `prison rape` | 0.1609 | 0.8391 | 11 |
| 126 | `marijuana joint` | `heroin` | 0.1610 | 0.8390 | 5 |
| 127 | `hashish` | `heroin` | 0.1617 | 0.8383 | 3 |
| 128 | `savagery` | `gore` | 0.1619 | 0.8381 | 3 |
| 129 | `lust` | `erotica` | 0.1624 | 0.8376 | 78 |
| 130 | `sadomasochism` | `sadistic torture` | 0.1638 | 0.8362 | 50 |
| 131 | `massacre` | `mass suicide` | 0.1643 | 0.8357 | 107 |
| 132 | `milf` | `erotica` | 0.1655 | 0.8345 | 6 |
| 133 | `sexual obsession` | `erotica` | 0.1658 | 0.8342 | 53 |
| 134 | `decomposition` | `dismemberment` | 0.1665 | 0.8335 | 3 |
| 135 | `drug smuggling` | `cocaine` | 0.1666 | 0.8334 | 79 |
| 136 | `slasher` | `gore` | 0.1666 | 0.8334 | 543 |
| 137 | `brutality` | `gore` | 0.1677 | 0.8323 | 131 |
| 138 | `killer child` | `child abuse` | 0.1677 | 0.8323 | 13 |
| 139 | `alcohol` | `substance abuse` | 0.1677 | 0.8323 | 176 |
| 140 | `exploring sexuality` | `erotica` | 0.1692 | 0.8308 | 33 |
| 141 | `illegal prostitution` | `child prostitution` | 0.1698 | 0.8302 | 43 |
| 142 | `erotic dance` | `erotica` | 0.1699 | 0.8301 | 3 |
| 143 | `street prostitution` | `child prostitution` | 0.1700 | 0.8300 | 4 |
| 144 | `pervert` | `pedophile` | 0.1703 | 0.8297 | 10 |
| 145 | `intoxication` | `substance abuse` | 0.1704 | 0.8296 | 11 |
| 146 | `oral sex` | `erotica` | 0.1708 | 0.8292 | 9 |
| 147 | `opium` | `heroin` | 0.1713 | 0.8287 | 21 |
| 148 | `psychological abuse` | `sexual abuse` | 0.1721 | 0.8279 | 17 |
| 149 | `sexual attraction` | `erotica` | 0.1722 | 0.8278 | 34 |
| 150 | `sex slavery` | `sexual torture` | 0.1722 | 0.8278 | 9 |
| 151 | `sex trafficking` | `child prostitution` | 0.1723 | 0.8277 | 31 |
| 152 | `psychotropic drugs` | `drug addiction` | 0.1725 | 0.8275 | 5 |
| 153 | `killer children` | `child abuse` | 0.1731 | 0.8269 | 6 |
| 154 | `gas chamber` | `torture chamber` | 0.1736 | 0.8264 | 4 |
| 155 | `disfigurement` | `mutilation` | 0.1741 | 0.8259 | 42 |
| 156 | `break-up` | `dismemberment` | 0.1753 | 0.8247 | 129 |
| 157 | `nude` | `pornography` | 0.1759 | 0.8241 | 4 |
| 158 | `debauchery` | `pornography` | 0.1767 | 0.8233 | 18 |
| 159 | `circumcision` | `mutilation` | 0.1773 | 0.8227 | 8 |
| 160 | `sexual tension` | `erotica` | 0.1773 | 0.8227 | 28 |
| 161 | `erotic photography` | `erotica` | 0.1773 | 0.8227 | 4 |
| 162 | `drug syndicate` | `drug abuse` | 0.1778 | 0.8222 | 3 |
| 163 | `inebriation` | `substance abuse` | 0.1780 | 0.8220 | 4 |
| 164 | `addicted` | `drug addiction` | 0.1782 | 0.8218 | 6 |
| 165 | `drug ring` | `drug abuse` | 0.1784 | 0.8216 | 5 |
| 166 | `drug money` | `drug abuse` | 0.1785 | 0.8215 | 3 |
| 167 | `amputation` | `mutilation` | 0.1790 | 0.8210 | 18 |
| 168 | `lesbian sex` | `erotica` | 0.1792 | 0.8208 | 49 |
| 169 | `depravity` | `extreme sadism` | 0.1800 | 0.8200 | 14 |
| 170 | `seduction` | `erotica` | 0.1803 | 0.8197 | 197 |
| 171 | `abuse survivor` | `sexual abuse` | 0.1808 | 0.8192 | 3 |
| 172 | `mass hanging` | `mass suicide` | 0.1809 | 0.8191 | 3 |
| 173 | `psychosexual thriller` | `erotica` | 0.1816 | 0.8184 | 4 |
| 174 | `sex slave` | `molestation` | 0.1816 | 0.8184 | 8 |
| 175 | `stolen child` | `child exploitation` | 0.1822 | 0.8178 | 3 |
| 176 | `pervertion` | `pedophile` | 0.1824 | 0.8176 | 5 |
| 177 | `electric chair` | `torture chamber` | 0.1825 | 0.8175 | 20 |
| 178 | `cunnilingus` | `pornography` | 0.1827 | 0.8173 | 5 |
| 179 | `firing squad` | `beheading` | 0.1829 | 0.8171 | 14 |
| 180 | `hallucinogenic drug` | `methamphetamine` | 0.1830 | 0.8170 | 16 |
| 181 | `sexual deviants` | `pedophile` | 0.1831 | 0.8169 | 4 |
| 182 | `child kidnapping` | `child exploitation` | 0.1833 | 0.8167 | 120 |
| 183 | `sex offender` | `pedophile` | 0.1835 | 0.8165 | 5 |
| 184 | `lethal injection` | `beheading` | 0.1836 | 0.8164 | 6 |
| 185 | `drug runner` | `drug abuse` | 0.1838 | 0.8162 | 8 |
| 186 | `extreme cinema` | `extreme gore` | 0.1840 | 0.8160 | 4 |
| 187 | `drug gang` | `drug abuse` | 0.1846 | 0.8154 | 4 |
| 188 | `premarital sex` | `pornography` | 0.1847 | 0.8153 | 4 |
| 189 | `sodomy` | `pornography` | 0.1853 | 0.8147 | 10 |
| 190 | `sexual awakening` | `erotica` | 0.1857 | 0.8143 | 60 |
| 191 | `bdsm` | `erotica` | 0.1861 | 0.8139 | 98 |
| 192 | `pimps` | `porno` | 0.1862 | 0.8138 | 3 |
| 193 | `body modification` | `body mutilation` | 0.1863 | 0.8137 | 7 |
| 194 | `emotional abuse` | `sexual abuse` | 0.1867 | 0.8133 | 11 |
| 195 | `female masturbation` | `erotica` | 0.1868 | 0.8132 | 4 |
| 196 | `abused woman` | `sexual abuse` | 0.1869 | 0.8131 | 13 |
| 197 | `forbidden sexuality` | `erotica` | 0.1871 | 0.8129 | 5 |
| 198 | `accidental killing` | `murder-suicide` | 0.1877 | 0.8123 | 23 |
| 199 | `execution` | `beheading` | 0.1882 | 0.8118 | 65 |
| 200 | `self-sabotage` | `self-harm` | 0.1883 | 0.8117 | 3 |
| 201 | `prostitute` | `child prostitution` | 0.1896 | 0.8104 | 400 |
| 202 | `child abduction` | `child exploitation` | 0.1898 | 0.8102 | 30 |
| 203 | `masochism` | `sadistic torture` | 0.1903 | 0.8097 | 21 |
| 204 | `mind altering drug` | `methamphetamine` | 0.1903 | 0.8097 | 4 |
| 205 | `sexual promiscuity` | `erotica` | 0.1904 | 0.8096 | 21 |
| 206 | `male prostitution` | `male rape` | 0.1905 | 0.8095 | 62 |
| 207 | `addict` | `drug addiction` | 0.1911 | 0.8089 | 24 |
| 208 | `male sexuality` | `erotica` | 0.1925 | 0.8075 | 4 |
| 209 | `burned at the stake` | `tortured to death` | 0.1929 | 0.8071 | 4 |
| 210 | `mental abuse` | `sexual abuse` | 0.1934 | 0.8066 | 4 |
| 211 | `sex industry` | `pornography` | 0.1935 | 0.8065 | 11 |
| 212 | `drug mule` | `drug abuse` | 0.1936 | 0.8064 | 14 |
| 213 | `honor killing` | `beheading` | 0.1938 | 0.8062 | 8 |
| 214 | `alcoholic drink` | `substance abuse` | 0.1946 | 0.8054 | 7 |
| 215 | `psychedelic drug` | `drug abuse` | 0.1948 | 0.8052 | 13 |
| 216 | `execution by hanging` | `tortured to death` | 0.1948 | 0.8052 | 3 |
| 217 | `ex prostitute` | `child prostitution` | 0.1950 | 0.8050 | 5 |
| 218 | `ketamine` | `methamphetamine` | 0.1957 | 0.8043 | 3 |
| 219 | `prisoner` | `torture chamber` | 0.1957 | 0.8043 | 133 |
| 220 | `mass grave` | `mass suicide` | 0.1960 | 0.8040 | 4 |
| 221 | `sadistic husband` | `extreme sadism` | 0.1971 | 0.8029 | 3 |
| 222 | `sex trade` | `child prostitution` | 0.1979 | 0.8021 | 10 |
| 223 | `synthetic drug` | `methamphetamine` | 0.1991 | 0.8009 | 4 |
| 224 | `strangulation` | `tortured to death` | 0.1991 | 0.8009 | 34 |

---

## Gruppo (C) — DA SCARTARE (142 keyword)
*Termini che NON devono entrare nella lista nera (violenza generica, morte, paura, o falsi positivi semantici).*

| # | Keyword | Seme più vicino | Distanza Coseno | Similarità Coseno | Titoli nel canone |
|---|---|---|---|---|---|
| 1 | `bloody` | `blood and gore` | 0.0870 | 0.9130 | 12 |
| 2 | `sadistic horror` | `sadistic torture` | 0.0924 | 0.9076 | 26 |
| 3 | `mass murder` | `mass suicide` | 0.1028 | 0.8972 | 76 |
| 4 | `horror` | `gore` | 0.1102 | 0.8898 | 434 |
| 5 | `drug rehabilitation` | `drug addiction` | 0.1130 | 0.8870 | 22 |
| 6 | `extreme violence` | `extreme gore` | 0.1157 | 0.8843 | 26 |
| 7 | `stabbed to death` | `beheading` | 0.1166 | 0.8834 | 15 |
| 8 | `death sentence` | `tortured to death` | 0.1179 | 0.8821 | 28 |
| 9 | `horor` | `gore` | 0.1207 | 0.8793 | 3 |
| 10 | `suicide mission` | `suicide` | 0.1217 | 0.8783 | 17 |
| 11 | `murdered` | `murder-suicide` | 0.1227 | 0.8773 | 38 |
| 12 | `bloody death` | `blood and gore` | 0.1262 | 0.8738 | 7 |
| 13 | `brutal death` | `tortured to death` | 0.1278 | 0.8722 | 6 |
| 14 | `beaten to death` | `tortured to death` | 0.1290 | 0.8710 | 13 |
| 15 | `murder` | `murder-suicide` | 0.1304 | 0.8696 | 3100 |
| 16 | `deadly` | `gore` | 0.1312 | 0.8688 | 11 |
| 17 | `recovering addict` | `drug addiction` | 0.1333 | 0.8667 | 23 |
| 18 | `disintegration` | `dismemberment` | 0.1346 | 0.8654 | 4 |
| 19 | `violent death` | `tortured to death` | 0.1358 | 0.8642 | 28 |
| 20 | `addiction recovery` | `drug addiction` | 0.1360 | 0.8640 | 12 |
| 21 | `violent` | `gore` | 0.1370 | 0.8630 | 15 |
| 22 | `child protection` | `child abuse` | 0.1370 | 0.8630 | 8 |
| 23 | `action horror` | `gore` | 0.1377 | 0.8623 | 6 |
| 24 | `terror` | `gore` | 0.1407 | 0.8593 | 24 |
| 25 | `brutal violence` | `extreme gore` | 0.1421 | 0.8579 | 23 |
| 26 | `matricide` | `murder-suicide` | 0.1425 | 0.8575 | 4 |
| 27 | `gang violence` | `gang rape` | 0.1426 | 0.8574 | 22 |
| 28 | `death by hanging` | `tortured to death` | 0.1433 | 0.8567 | 9 |
| 29 | `forced to kill` | `tortured to death` | 0.1460 | 0.8540 | 10 |
| 30 | `erotic horror` | `erotica` | 0.1477 | 0.8523 | 6 |
| 31 | `sexual murder` | `incest rape` | 0.1482 | 0.8518 | 7 |
| 32 | `stabbing` | `beheading` | 0.1483 | 0.8517 | 39 |
| 33 | `scare` | `gore` | 0.1485 | 0.8515 | 5 |
| 34 | `bloodbath` | `blood and gore` | 0.1485 | 0.8515 | 11 |
| 35 | `brutal deaths` | `extreme gore` | 0.1512 | 0.8488 | 3 |
| 36 | `lynching` | `beheading` | 0.1518 | 0.8482 | 16 |
| 37 | `death` | `suicide` | 0.1519 | 0.8481 | 608 |
| 38 | `stabbed` | `beheading` | 0.1535 | 0.8465 | 6 |
| 39 | `suicide prevention` | `suicide` | 0.1543 | 0.8457 | 4 |
| 40 | `violence` | `gore` | 0.1577 | 0.8423 | 197 |
| 41 | `dread` | `gore` | 0.1582 | 0.8418 | 5 |
| 42 | `cruel` | `sadistic torture` | 0.1584 | 0.8416 | 79 |
| 43 | `deaths` | `suicide` | 0.1592 | 0.8408 | 4 |
| 44 | `macabre` | `gore` | 0.1597 | 0.8403 | 114 |
| 45 | `bloody fight` | `blood and gore` | 0.1599 | 0.8401 | 7 |
| 46 | `crime horror` | `gore` | 0.1602 | 0.8398 | 7 |
| 47 | `menace` | `gore` | 0.1602 | 0.8398 | 16 |
| 48 | `slasher horror` | `gore` | 0.1611 | 0.8389 | 16 |
| 49 | `brutal murder` | `murder-suicide` | 0.1620 | 0.8380 | 11 |
| 50 | `meurtre` | `murder-suicide` | 0.1623 | 0.8377 | 3 |
| 51 | `death by poisoning` | `drug overdose` | 0.1627 | 0.8373 | 9 |
| 52 | `breakdown` | `dismemberment` | 0.1635 | 0.8365 | 6 |
| 53 | `killed` | `decapitation` | 0.1640 | 0.8360 | 16 |
| 54 | `dissection` | `dismemberment` | 0.1652 | 0.8348 | 6 |
| 55 | `danger` | `gore` | 0.1662 | 0.8338 | 9 |
| 56 | `dying` | `suicide` | 0.1670 | 0.8330 | 9 |
| 57 | `child abandonment` | `child abuse` | 0.1687 | 0.8313 | 24 |
| 58 | `child welfare` | `child abuse` | 0.1700 | 0.8300 | 3 |
| 59 | `deadly creature` | `gore` | 0.1718 | 0.8282 | 8 |
| 60 | `shot to death` | `tortured to death` | 0.1719 | 0.8281 | 10 |
| 61 | `patricide` | `murder-suicide` | 0.1725 | 0.8275 | 15 |
| 62 | `death row` | `tortured to death` | 0.1727 | 0.8273 | 34 |
| 63 | `homicidal` | `gore` | 0.1735 | 0.8265 | 3 |
| 64 | `explosive` | `gore` | 0.1743 | 0.8257 | 35 |
| 65 | `attempted murder` | `attempted rape` | 0.1745 | 0.8255 | 69 |
| 66 | `indecent proposal` | `pornography` | 0.1748 | 0.8252 | 5 |
| 67 | `traumatized child` | `child abuse` | 0.1750 | 0.8250 | 13 |
| 68 | `violence action` | `blood and gore` | 0.1750 | 0.8250 | 4 |
| 69 | `child murder` | `child abuse` | 0.1753 | 0.8247 | 99 |
| 70 | `chilling` | `gore` | 0.1754 | 0.8246 | 8 |
| 71 | `gang` | `gang rape` | 0.1759 | 0.8241 | 260 |
| 72 | `provocative` | `erotica` | 0.1761 | 0.8239 | 152 |
| 73 | `mass destruction` | `mass suicide` | 0.1763 | 0.8237 | 7 |
| 74 | `violent fantasies` | `extreme gore` | 0.1764 | 0.8236 | 3 |
| 75 | `blood` | `blood and gore` | 0.1764 | 0.8236 | 53 |
| 76 | `crucifixion` | `decapitation` | 0.1765 | 0.8235 | 30 |
| 77 | `child labour` | `child exploitation` | 0.1768 | 0.8232 | 8 |
| 78 | `kill` | `decapitation` | 0.1770 | 0.8230 | 24 |
| 79 | `seducer` | `pedophile` | 0.1773 | 0.8227 | 13 |
| 80 | `death wish` | `suicide` | 0.1775 | 0.8225 | 9 |
| 81 | `suicide investigation` | `suicide` | 0.1776 | 0.8224 | 7 |
| 82 | `murder victim` | `murder-suicide` | 0.1780 | 0.8220 | 15 |
| 83 | `sudden death` | `suicide` | 0.1784 | 0.8216 | 10 |
| 84 | `vulgar` | `pornography` | 0.1787 | 0.8213 | 9 |
| 85 | `violence against women` | `sexual assault` | 0.1792 | 0.8208 | 26 |
| 86 | `separation` | `dismemberment` | 0.1797 | 0.8203 | 18 |
| 87 | `illegitimate child` | `child exploitation` | 0.1804 | 0.8196 | 19 |
| 88 | `escape attempt` | `suicide attempt` | 0.1806 | 0.8194 | 20 |
| 89 | `imprisonment` | `torture chamber` | 0.1810 | 0.8190 | 32 |
| 90 | `breakup` | `dismemberment` | 0.1811 | 0.8189 | 3 |
| 91 | `mortality` | `suicide` | 0.1819 | 0.8181 | 14 |
| 92 | `ritual murder` | `beheading` | 0.1822 | 0.8178 | 20 |
| 93 | `assassination attempt` | `suicide attempt` | 0.1828 | 0.8172 | 46 |
| 94 | `bloodthirsty` | `blood and gore` | 0.1829 | 0.8171 | 3 |
| 95 | `drugstore` | `drug abuse` | 0.1833 | 0.8167 | 6 |
| 96 | `blood lust` | `blood and gore` | 0.1839 | 0.8161 | 7 |
| 97 | `broken` | `dismemberment` | 0.1852 | 0.8148 | 3 |
| 98 | `horror fans` | `gore` | 0.1852 | 0.8148 | 3 |
| 99 | `sci-fi horror` | `gore` | 0.1855 | 0.8145 | 39 |
| 100 | `horror western` | `gore` | 0.1857 | 0.8143 | 7 |
| 101 | `fear` | `gore` | 0.1864 | 0.8136 | 125 |
| 102 | `deathbed` | `suicide` | 0.1868 | 0.8132 | 9 |
| 103 | `disturbed child` | `child abuse` | 0.1872 | 0.8128 | 3 |
| 104 | `aphrodisiac` | `erotica` | 0.1872 | 0.8128 | 4 |
| 105 | `carnage` | `gore` | 0.1874 | 0.8126 | 4 |
| 106 | `unwanted child` | `child exploitation` | 0.1875 | 0.8125 | 5 |
| 107 | `nicotine` | `heroin` | 0.1876 | 0.8124 | 3 |
| 108 | `death incarnate` | `tortured to death` | 0.1879 | 0.8121 | 3 |
| 109 | `explosive action` | `gore` | 0.1880 | 0.8120 | 5 |
| 110 | `thrill kill` | `gore` | 0.1880 | 0.8120 | 4 |
| 111 | `mass evacuation` | `mass suicide` | 0.1890 | 0.8110 | 6 |
| 112 | `slaughter` | `beheading` | 0.1897 | 0.8103 | 34 |
| 113 | `child labor` | `child exploitation` | 0.1898 | 0.8102 | 8 |
| 114 | `broke` | `dismemberment` | 0.1901 | 0.8099 | 3 |
| 115 | `attempted robbery` | `attempted rape` | 0.1907 | 0.8093 | 12 |
| 116 | `childhood trauma` | `child abuse` | 0.1917 | 0.8083 | 117 |
| 117 | `murderer` | `murder-suicide` | 0.1923 | 0.8077 | 90 |
| 118 | `scalpel` | `mutilation` | 0.1923 | 0.8077 | 6 |
| 119 | `intense` | `gore` | 0.1924 | 0.8076 | 349 |
| 120 | `gang warfare` | `gang rape` | 0.1931 | 0.8069 | 15 |
| 121 | `grim` | `gore` | 0.1931 | 0.8069 | 94 |
| 122 | `murder of husband` | `murder-suicide` | 0.1953 | 0.8047 | 3 |
| 123 | `accidental death` | `suicide` | 0.1953 | 0.8047 | 52 |
| 124 | `bloodthirstiness` | `blood and gore` | 0.1956 | 0.8044 | 7 |
| 125 | `murdered wife` | `murder-suicide` | 0.1957 | 0.8043 | 13 |
| 126 | `blood bath` | `blood and gore` | 0.1957 | 0.8043 | 8 |
| 127 | `criminal gang` | `gang rape` | 0.1957 | 0.8043 | 62 |
| 128 | `body horror` | `body mutilation` | 0.1960 | 0.8040 | 120 |
| 129 | `thrilling` | `gore` | 0.1966 | 0.8034 | 3 |
| 130 | `corpse` | `decapitation` | 0.1967 | 0.8033 | 92 |
| 131 | `catholic priest` | `pedophile priest` | 0.1968 | 0.8032 | 56 |
| 132 | `scary stories` | `gore` | 0.1971 | 0.8029 | 6 |
| 133 | `drug trial` | `drug abuse` | 0.1972 | 0.8028 | 4 |
| 134 | `dripping blood` | `blood and gore` | 0.1975 | 0.8025 | 3 |
| 135 | `hell` | `gore` | 0.1975 | 0.8025 | 91 |
| 136 | `aggression` | `gore` | 0.1986 | 0.8014 | 13 |
| 137 | `assassination` | `beheading` | 0.1987 | 0.8013 | 138 |
| 138 | `martyrdom` | `tortured to death` | 0.1990 | 0.8010 | 5 |
| 139 | `prison` | `prison rape` | 0.1990 | 0.8010 | 573 |
| 140 | `zombie horror` | `gore` | 0.1992 | 0.8008 | 6 |
| 141 | `vicious killings` | `extreme gore` | 0.1993 | 0.8007 | 5 |
| 142 | `survival horror` | `gore` | 0.1993 | 0.8007 | 124 |

---
